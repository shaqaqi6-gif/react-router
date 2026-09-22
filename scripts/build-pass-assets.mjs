#!/usr/bin/env node
/* ============================================================
   يحوّل صور البطاقة في assets/pass/*.png إلى وحدة JS بترميز base64
   حتى تُحزَم مع دالة Netlify دون الاعتماد على نظام الملفات.
   التشغيل:  npm run pass:assets
   ============================================================ */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'assets', 'pass');
const outFile = join(root, 'lib', 'pass-assets.mjs');

const files = readdirSync(srcDir).filter((f) => f.endsWith('.png')).sort();
if (!files.length) throw new Error(`لا توجد صور PNG في ${srcDir}`);

const entries = files
  .map((name) => `  '${name}': '${readFileSync(join(srcDir, name)).toString('base64')}',`)
  .join('\n');

writeFileSync(
  outFile,
  `/* ملف مُولّد — لا يُحرّر يدويًا. المصدر: assets/pass/*.png — أعد التوليد بـ: npm run pass:assets */\n` +
    `const BASE64 = {\n${entries}\n};\n\n` +
    `/** صور بطاقة Apple Wallet جاهزة كـ Buffer: { 'icon.png': Buffer, ... } */\n` +
    `export const PASS_IMAGES = Object.fromEntries(\n` +
    `  Object.entries(BASE64).map(([name, b64]) => [name, Buffer.from(b64, 'base64')]),\n` +
    `);\n`,
  'utf8',
);

console.log(`✓ ${outFile} — ${files.length} صورة`);
