'use strict';
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');
const files = [];
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) walk(fp);
    else if (f.endsWith('.js')) files.push(fp);
  }
}
walk(srcDir);

const findings = [];

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  const lines = code.split('\n');
  const shortFile = path.relative(srcDir, file).replace(/\\/g, '/');

  lines.forEach((line, i) => {
    const lineNum = i + 1;
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    if (line.includes('require(') || line.includes('console.')) return;

    // Remove string literals and comments
    const stripped = line.replace(/\/\/.*/, '').replace(/'[^']*'|"[^"]*"/g, '""');

    // 1. clamp() calls
    const clampRe = /clamp\(([^)]+)\)/g;
    let m;
    while ((m = clampRe.exec(stripped)) !== null) {
      const args = m[1];
      const nums = (args.match(/[\d]+\.[\d]+/g) || []).map(Number).filter(n => n > 0);
      if (nums.length > 0) {
        findings.push({ file: shortFile, line: lineNum, type: 'CLAMP', code: trimmed.substring(0, 130), values: nums });
      }
    }

    // 2. Bare multiplier/divisor: * X.XX or / X.XX
    const multRe = /[*/]\s*(\d+\.\d+)/g;
    while ((m = multRe.exec(stripped)) !== null) {
      const val = parseFloat(m[1]);
      if (val > 0 && val !== 1.0 && val !== 100.0 && val !== 90.0 && val !== 0.5 && val !== 0.01) {
        // Skip if it's inside a clamp (already caught)
        if (!stripped.substring(Math.max(0, m.index - 20), m.index).includes('clamp')) {
          findings.push({ file: shortFile, line: lineNum, type: 'MULT', code: trimmed.substring(0, 130), values: [val] });
        }
      }
    }

    // 3. Math.max/min with hardcoded bounds
    const mathRe = /Math\.(max|min)\(([^)]+)\)/g;
    while ((m = mathRe.exec(stripped)) !== null) {
      const nums = (m[2].match(/\d+\.\d+/g) || []).map(Number).filter(n => n !== 0.01 && n !== 1.0 && n > 0);
      if (nums.length > 0 && !stripped.substring(Math.max(0, m.index - 10), m.index).includes('clamp')) {
        findings.push({ file: shortFile, line: lineNum, type: 'MATH', code: trimmed.substring(0, 130), values: nums });
      }
    }

    // 4. Standalone numeric assignment: const X = 0.XX (potential tuning param)
    const constRe = /const\s+\w+\s*=\s*(\d+\.\d+)\s*[;,]/;
    const cm = stripped.match(constRe);
    if (cm) {
      const val = parseFloat(cm[1]);
      if (val > 0 && val !== 1.0 && val !== 0.5 && val < 100) {
        findings.push({ file: shortFile, line: lineNum, type: 'CONST', code: trimmed.substring(0, 130), values: [val] });
      }
    }
  });
}

// Deduplicate by file+line
const seen = new Set();
const unique = findings.filter(f => {
  const key = f.file + ':' + f.line + ':' + f.type;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

// Group by file
const byFile = {};
unique.forEach(f => {
  if (!byFile[f.file]) byFile[f.file] = [];
  byFile[f.file].push(f);
});

let total = 0;
const engineFiles = ['engine/match-simulator.js', 'engine/simulatorEngine.js', 'engine/dynamic-baseline.js',
  'engine/prediction-generator.js', 'engine/sim-config.js', 'engine/quality-factors.js',
  'engine/calibration.js', 'engine/league-averages.js',
  'metrics/advanced-derived.js', 'metrics/contextual.js', 'metrics/referee-impact.js',
  'metrics/player-performance.js', 'metrics/team-attack.js', 'metrics/team-defense.js',
  'metrics/team-form.js', 'metrics/goalkeeper.js', 'metrics/h2h-analysis.js', 'metrics/momentum.js'];

for (const file of engineFiles) {
  const items = byFile[file];
  if (!items || items.length === 0) continue;
  console.log('\n=== ' + file + ' (' + items.length + ' bulgu) ===');
  items.forEach(f => {
    console.log('  L' + f.line + ' [' + f.type + '] ' + f.values.join(', '));
    console.log('    ' + f.code);
    total++;
  });
}
console.log('\n═══════════════════════════════════════════');
console.log('TOPLAM: ' + total + ' statik değer bulgusu');
