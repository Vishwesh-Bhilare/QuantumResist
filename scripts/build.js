import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/src/demos', { recursive: true });
mkdirSync('dist/src/ui', { recursive: true });

cpSync('index.html', 'dist/index.html');
cpSync('src/app.js', 'dist/src/app.js');
cpSync('src/crypto.js', 'dist/src/crypto.js');
cpSync('src/session.js', 'dist/src/session.js');
cpSync('src/styles.css', 'dist/src/styles.css');
cpSync('src/demos/demo1.js', 'dist/src/demos/demo1.js');
cpSync('src/demos/demo2.js', 'dist/src/demos/demo2.js');
cpSync('src/demos/demo3.js', 'dist/src/demos/demo3.js');
cpSync('src/demos/demo4.js', 'dist/src/demos/demo4.js');
cpSync('src/demos/demo5.js', 'dist/src/demos/demo5.js');
cpSync('src/ui/eve-console.js', 'dist/src/ui/eve-console.js');
cpSync('src/ui/pipeline.js', 'dist/src/ui/pipeline.js');
cpSync('src/ui/diagrams.js', 'dist/src/ui/diagrams.js');

console.log('Built to dist/');
