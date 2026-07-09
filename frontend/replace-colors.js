const fs = require('fs');
const path = require('path');

const replacements = [
  { from: /amber-500/g, to: 'teal-500' },
  { from: /amber-400/g, to: 'teal-400' },
  { from: /amber-300/g, to: 'teal-300' },
  { from: /yellow-400/g, to: 'teal-400' },
  { from: /yellow-500/g, to: 'teal-500' },
  { from: /#f59e0b/g, to: '#14b8a6' },
  { from: /#fbbf24/g, to: '#06b6d4' },
  { from: /f59e0b/g, to: '14b8a6' },
  { from: /fbbf24/g, to: '06b6d4' },
  { from: /text-black/g, to: 'text-white' }, // Change button text from black to white for teal
];

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  replacements.forEach(({ from, to }) => {
    if (from.test(content)) {
      content = content.replace(from, to);
      modified = true;
    }
  });
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory() && !filePath.includes('node_modules')) {
      walkDir(filePath);
    } else if (file.endsWith('.jsx') || file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.ts')) {
      replaceInFile(filePath);
    }
  });
}

walkDir('./src');
console.log('Color replacement complete!');
