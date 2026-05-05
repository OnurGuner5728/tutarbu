'use strict';
/**
 * scripts/audit-statics.js
 *
 * Engine kod tabanını tarayıp şunları listeler:
 *   1. Sayısal sabit literal'lar (özellikle 0/1, π, e dışındaki)
 *   2. Karar veren karşılaştırmalar (threshold gibi görünen)
 *   3. Çarpan/ağırlık şüphesi taşıyan sayılar (0.x, x.y biçimleri)
 *
 * Çıktı: tools/static-inventory.md
 *
 * Amaç: "Tam dinamik" iddiasını doğrulamak; her sayısal literal için
 *   - Matematiksel kural mı (örn. 1/2, 1, 0)
 *   - Lig/veri sınırından türetilebilir mi (öğrenilebilir / hesaplanabilir)
 *   - Elle yazılmış davranışsal sabit mi (statik veri — temizlenmeli)
 * tasnifini insana bırakmak.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['src/engine', 'src/metrics', 'src/services'];

// İzin listesi: matematiksel olarak kabul edilen sabitler
const MATH_OK = new Set([
  '0', '1', '-1', '2', '0.5', '0.0', '1.0',
  '100', '90', '60', '45', '30', '15', // dakika/yüzde sınırları (futbolun fiziği)
  '1e-9', '1e-12', '1e-6', '1e-3', // numerik epsilon
]);

// Bu sayıları gördüğümüzde davranışsal sabit şüphesi yüksek
const SUSPECT_PATTERNS = [
  /\b0\.[0-9]+\b/g,    // 0.xx
  /\b[1-9]\.[0-9]+\b/g, // x.yy (1.0 hariç önce filtrelenmesi gerekir)
];

const MAGIC_PATTERN = /(?<![\w.])-?\d+(?:\.\d+)?(?:e-?\d+)?(?![\w.])/g;

function scanFile(filePath) {
  const findings = [];
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Yorum satırlarını atla
    const codeOnly = line.replace(/\/\/.*$/, '').replace(/\/\*[^*]*\*\//g, '');
    if (!codeOnly.trim()) continue;
    // String literal'leri çıkar
    const cleaned = codeOnly
      .replace(/'(?:\\'|[^'])*'/g, "''")
      .replace(/"(?:\\"|[^"])*"/g, '""')
      .replace(/`[^`]*`/g, '``');

    const matches = cleaned.match(MAGIC_PATTERN);
    if (!matches) continue;

    for (const m of matches) {
      if (MATH_OK.has(m)) continue;
      // Tek başına 0 1 2 vb. dizi index'i çoğu zaman OK — kabaca atla
      if (/^-?\d+$/.test(m)) {
        const n = parseInt(m, 10);
        if (Math.abs(n) <= 2) continue;
      }
      findings.push({
        file: path.relative(ROOT, filePath),
        line: i + 1,
        value: m,
        snippet: line.trim().slice(0, 120),
      });
    }
  }
  return findings;
}

function walk(dir) {
  const out = [];
  const queue = [dir];
  while (queue.length) {
    const cur = queue.shift();
    if (!fs.existsSync(cur)) continue;
    for (const name of fs.readdirSync(cur)) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const full = path.join(cur, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) queue.push(full);
      else if (/\.js$/.test(name) && !/test|\.test\.js$/i.test(name)) out.push(full);
    }
  }
  return out;
}

const files = SCAN_DIRS.flatMap(d => walk(path.join(ROOT, d)));
const all = [];
for (const f of files) {
  for (const finding of scanFile(f)) all.push(finding);
}

// Dosya bazlı grupla, en sık geçen değerleri öne çıkar
const byFile = new Map();
const valueFreq = new Map();
for (const f of all) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
  valueFreq.set(f.value, (valueFreq.get(f.value) || 0) + 1);
}

const topValues = [...valueFreq.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30);

// Output markdown
let md = '# Statik Sabit Envanteri (Otomatik)\n\n';
md += `Tarama kökü: \`${SCAN_DIRS.join(', ')}\`  \n`;
md += `Toplam şüpheli literal: **${all.length}**  \n`;
md += `Etkilenen dosya: **${byFile.size}**  \n\n`;
md += `> Bu rapor heuristic'tir. \`MATH_OK\` listesindeki literal'ler (0,1,2,0.5,100,90,60,45,30,15 vs.) dahil edilmez.\n`;
md += `> Yine de bazı satırlar matematiksel kural olabilir (örn. \`/2\`, \`+0.5\` smoothing).\n`;
md += `> Her satır insan tarafından şu üç kategoriye ayrılmalıdır:\n`;
md += `>  - **MATH**: matematiksel kural (kalır)\n`;
md += `>  - **DERIVABLE**: lig/veri istatistiğinden türetilebilir (dinamikleştirilmeli)\n`;
md += `>  - **STATIC**: elle yazılmış davranışsal sabit (öğrenilmeli veya kaldırılmalı)\n\n`;

md += '## Sıkça Görülen Literal Değerler\n\n';
md += '| Literal | Geçiş Sayısı |\n|---|---|\n';
for (const [v, c] of topValues) md += `| \`${v}\` | ${c} |\n`;
md += '\n';

md += '## Dosya Bazlı Detay\n\n';
const filesSorted = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [file, items] of filesSorted) {
  md += `### \`${file}\` — ${items.length} şüpheli literal\n\n`;
  md += '| Satır | Değer | Bağlam | Tasnif (manuel) |\n|---|---|---|---|\n';
  for (const it of items.slice(0, 80)) {
    const snip = it.snippet.replace(/\|/g, '\\|').slice(0, 100);
    md += `| ${it.line} | \`${it.value}\` | \`${snip}\` |  |\n`;
  }
  if (items.length > 80) md += `\n_(+${items.length - 80} kayıt kısaltıldı)_\n`;
  md += '\n';
}

const outDir = path.join(ROOT, 'tools');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'static-inventory.md');
fs.writeFileSync(outPath, md, 'utf8');
console.log(`[Audit] ${all.length} şüpheli literal, ${byFile.size} dosya`);
console.log(`[Audit] Rapor: ${path.relative(ROOT, outPath)}`);
console.log(`[Audit] En sık 5 değer:`, topValues.slice(0, 5));
