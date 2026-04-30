const fs = require('fs');
const files = [
  'src/engine/dynamic-baseline.js',
  'src/engine/sim-config.js',
  'src/engine/match-simulator.js',
  'src/engine/prediction-generator.js'
];

const suspicious = [];

files.forEach(f => {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const fname = f.split('/').pop();
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    // Skip comments, console, traces, toFixed
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/**')) return;
    if (/console\.|traces\.push|\.toFixed|round2/.test(line)) return;
    // Skip pure-comment lines after code
    const codePart = line.split('//')[0];
    
    // Find decimal literals in CODE portion only
    const matches = [...codePart.matchAll(/(?<![a-zA-Z_\d\.])(\d+\.\d+)(?![a-zA-Z_\d])/g)];
    for (const m of matches) {
      const val = parseFloat(m[1]);
      const raw = m[1];
      
      // 1.0 = identity, skip
      if (val === 1.0 || val === 0.0) continue;
      
      // Check if API-driven (has baseline/dynamic reference on same line)
      const isDynamic = /baseline|dynamicAvgs|dynamicLimits|DYN_LIMITS|lgCV|normMin|normMax|lgData|tData|_cv|_ou|_btts|_seEdge|_lgCor|_press|leagueFingerprint|_compIdx|_lgDrawRate|_highThreshold/.test(codePart);
      if (isDynamic) continue;
      
      // Check if it's a null-safe identity fallback
      const isIdentityFallback = /\?\?\s*\{.*1\.0/.test(codePart) || /\?\?\s*1\.0/.test(codePart);
      if (isIdentityFallback) continue;
      
      // Known math/physics
      const KNOWN = {
        '0.50': 'simetri (1/2)',
        '0.05': 'Brier varyansı / EPS',
        '0.01': 'EPS',
        '0.001': 'EPS',
        '0.0001': 'EPS (kart min)',
        '0.002': 'EPS (kırmızı kart max)',
        '2.5': 'Over 2.5 gol çizgisi (bahis standardı)',
        '6.67': 'Geometri sabiti',
      };
      if (KNOWN[raw]) continue;
      
      // Collect suspicious
      suspicious.push({
        file: fname,
        line: i + 1,
        val: raw,
        code: trimmed.substring(0, 130)
      });
    }
  });
});

// De-duplicate by line
const seen = new Set();
const unique = suspicious.filter(s => {
  const key = s.file + ':' + s.line;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

console.log('=== KALAN ŞÜPHELİ ONDALIK SAYILAR ===\n');
console.log('Toplam:', unique.length, '\n');

// Manually categorize each
unique.forEach(s => {
  let category = 'UNKNOWN';
  const code = s.code;
  
  // FIFA/futbol kuralı
  if (/minute.*46|46.*minute|subStart.*46/.test(code)) category = 'FIFA_RULE (2.yarı=46dk)';
  else if (/minute.*75|75.*phase|lateBase.*75/.test(code)) category = 'FIFA_RULE (geç faz=75dk)';
  else if (/slice.*11|filter.*11|floor.*11/.test(code)) category = 'FIFA_RULE (11 oyuncu)';
  // UI display thresholds
  else if (/confidence|MAX_UI_PROB|highlights|FORM_HIGH|SURPRISE/.test(code)) category = 'UI_DISPLAY';
  else if (/source:.*0\.7/.test(code)) category = 'UI_LABEL (blend kaynak etiketi)';
  else if (/Math\.max\(20|Math\.min\(20/.test(code)) category = 'UI_DISPLAY (olasılık alt tavan)';
  // Math constants
  else if (/avgHome.*0\.5|avgAway.*0\.5|std.*0\.5/.test(code)) category = 'MATH (std fallback = avg/2)';
  else if (/completeness.*0\.5/.test(code)) category = 'MATH (0.5 = orta nokta)';
  else if (/possession.*50|50.*possession|fpBase.*50/.test(code)) category = 'MATH (%50 simetri)';
  else if (/homeScoresFirst.*50|awayScoresFirst.*50/.test(code)) category = 'MATH (%50 simetri)';
  // Label/key
  else if (/['"].*\d.*['"]/.test(code)) category = 'LABEL/KEY (string etiket)';
  else if (/status.*code|EDGE_DB_TTL/.test(code)) category = 'OPERATIONAL (TTL/status)';
  // Scale factors
  else if (/\* 500|\* 300/.test(code)) category = 'SCALE (Brier→Confidence dönüşüm)';
  else if (/% 50/.test(code)) category = 'PERFORMANCE (sampling)';
  // Static data
  else if (/0\.35/.test(code)) category = '⚠️ STATIC (nötr win prob fallback)';
  else if (/0\.5.*Volatil|eşiği.*0\.5/.test(code)) category = '⚠️ STATIC (sakatlık eşiği)';
  else if (/\* 20,/.test(code) && /TOPLA_OYNAMA/.test(code)) category = '⚠️ STATIC (possession unit çarpanı)';
  else if (/\* 10 \*/.test(code)) category = 'DERIVED (leagueAvgGoals × 10)';
  else if (/slice.*10\)/.test(code)) category = 'UI_DISPLAY (top 10)';
  
  console.log(`[${category}] ${s.file}:${s.line} → ${s.val}`);
  if (category.startsWith('⚠️') || category === 'UNKNOWN') {
    console.log(`   ${s.code}`);
  }
});
