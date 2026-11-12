// Сборка без Vite: esbuild бандлит React-приложение в один index.html (открывается двойным кликом).
import { build } from '/opt/npm-tools/node_modules/esbuild/lib/main.js';
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const G = execSync('npm root -g').toString().trim();
const prod = !process.argv.includes('--dev');
const r = await build({
  entryPoints: ['src/main.tsx'], bundle: true, write: false, minify: prod, format: 'iife', target: 'es2020',
  jsx: 'automatic', nodePaths: [G], outdir: 'dist', loader: { '.css': 'css' }, legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"', __SB_URL__: JSON.stringify(process.env.SB_URL ?? ''), __SB_KEY__: JSON.stringify(process.env.SB_KEY ?? '') }, logLevel: 'warning',
});
let js = '', css = '';
for (const f of r.outputFiles) (f.path.endsWith('.css') ? (css += f.text) : (js += f.text));
const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F7F8F5" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#111311" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="MiniCRM"><meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="format-detection" content="telephone=no">
<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icon-180.png"><title>MiniCRM</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%23A8D977'/%3E%3Cpath d='M9 22V10l14 12V10' fill='none' stroke='%2320301a' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<style>${css}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
cpSync('public', 'dist', { recursive: true });
console.log(`dist/index.html — ${(html.length / 1024).toFixed(0)} КБ`);
void readFileSync;
