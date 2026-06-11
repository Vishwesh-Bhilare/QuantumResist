import { cpSync, mkdirSync, rmSync } from 'node:fs';
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/src', { recursive: true });
cpSync('index.html', 'dist/index.html');
cpSync('src/app.js', 'dist/src/app.js');
cpSync('src/crypto.js', 'dist/src/crypto.js');
cpSync('src/styles.css', 'dist/src/styles.css');
console.log('Built static demo in dist/');
