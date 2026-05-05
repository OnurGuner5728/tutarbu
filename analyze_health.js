const fs = require('fs');
const path = require('path');
const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    try {
      if (fs.statSync(dirFile).isDirectory()) {
        if (!['node_modules', '.git', 'dist'].includes(file)) filelist = walkSync(dirFile, filelist);
      } else if (dirFile.endsWith('.js') || dirFile.endsWith('.jsx')) filelist.push(dirFile);
    } catch (err) {}
  });
  return filelist;
};

const files = walkSync('./src');
let logs = 0;
let emptyCatches = 0;
let hardcodedUrls = 0;

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  logs += (content.match(/console\.(log|warn|error|info|debug)/g) || []).length;
  emptyCatches += (content.match(/catch\s*\([^)]*\)\s*\{\s*\}/g) || []).length;
  hardcodedUrls += (content.match(/https?:\/\/[^\s'"]+/g) || []).length;
});

console.log('Total files checked:', files.length);
console.log('console.* calls:', logs);
console.log('Empty catch blocks:', emptyCatches);
console.log('Hardcoded HTTP(S) URLs:', hardcodedUrls);
