#!/usr/bin/env node
/* ============================================================
   بناء ملف .pkpass محليًا (بدون نشر) — مفيد للاختبار أو للاستضافة
   كملف ثابت بدل استدعاء دالة Netlify.

   الاستخدام:
     npm run pass                      # يقرأ الشهادات من مجلد certs/ أو من البيئة
     npm run pass -- --url https://example.com   # يضبط رابط vCard داخل رمز QR
     npm run pass -- --demo            # شهادة تجريبية ذاتية التوقيع (للاختبار فقط)

   ملفات الشهادات المتوقّعة (إن لم تُضبط متغيّرات البيئة):
     certs/pass.p12   شهادة Pass Type ID + مفتاحها  (كلمة المرور: PASS_P12_PASSWORD)
     certs/wwdr.pem   شهادة Apple WWDR الوسيطة
   مجلد certs/ مستثنى من Git — لا تُرفع الشهادات إلى المستودع.
   ============================================================ */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';
import { buildPassJson, createPkPass, loadCertificates, inspectCertificate } from '../lib/pkpass.mjs';
import { PASS_IMAGES } from '../lib/pass-assets.mjs';
import { CONTACT, VCARD_PATH, buildVCard } from '../lib/contact.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : fallback;
};

const demo = !!flag('demo', false);
const siteURL = String(flag('url', process.env.SITE_URL || '') || '').replace(/\/+$/, '');
const outPath = resolve(root, String(flag('out', 'dist-pass/Aldrees-BusinessCard.pkpass')));

/** شهادة ذاتية التوقيع للاختبار — لا يقبلها iPhone، لكنها تتحقّق من سلامة التحزيم. */
function demoCertificates() {
  const make = (cn, ou, uid) => {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
    const attrs = [{ name: 'commonName', value: cn }, { name: 'organizationalUnitName', value: ou }];
    if (uid) attrs.push({ type: '0.9.2342.19200300.100.1.1', value: uid });
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    return { cert, key: keys.privateKey };
  };
  const signer = make('DEMO Pass Type ID', process.env.TEAM_IDENTIFIER || 'DEMOTEAM01', process.env.PASS_TYPE_IDENTIFIER || 'pass.demo.card');
  const wwdr = make('DEMO WWDR', 'DEMO', null);
  return { signerCert: signer.cert, privateKey: signer.key, wwdrCert: wwdr.cert };
}

/** يكمل متغيّرات البيئة من مجلد certs/ إن وُجد. */
function certificatesFromDisk() {
  const env = { ...process.env };
  const p12 = join(root, 'certs', 'pass.p12');
  const wwdr = join(root, 'certs', 'wwdr.pem');
  if (!env.APPLE_PASS_P12_BASE64 && existsSync(p12)) {
    env.APPLE_PASS_P12_BASE64 = readFileSync(p12).toString('base64');
    env.APPLE_PASS_P12_PASSWORD = env.APPLE_PASS_P12_PASSWORD || env.PASS_P12_PASSWORD || '';
  }
  if (!env.APPLE_WWDR_PEM && existsSync(wwdr)) env.APPLE_WWDR_PEM = readFileSync(wwdr, 'utf8');
  return env;
}

function main() {
  const passTypeIdentifier = process.env.PASS_TYPE_IDENTIFIER || (demo ? 'pass.demo.card' : null);
  const teamIdentifier = process.env.TEAM_IDENTIFIER || (demo ? 'DEMOTEAM01' : null);
  if (!passTypeIdentifier || !teamIdentifier) {
    console.error('✗ عيّن PASS_TYPE_IDENTIFIER و TEAM_IDENTIFIER (أو استخدم --demo للاختبار).');
    process.exit(1);
  }

  let certificates;
  if (demo) {
    console.log('⚠  وضع الاختبار: شهادة ذاتية التوقيع — البطاقة لن تُضاف إلى Wallet على iPhone.');
    certificates = demoCertificates();
  } else {
    certificates = loadCertificates(certificatesFromDisk());
    const info = inspectCertificate(certificates.signerCert);
    console.log(`• الشهادة: ${info.commonName} — تنتهي ${info.notAfter.toISOString().slice(0, 10)}`);
    if (info.expired) console.warn('⚠  الشهادة منتهية الصلاحية.');
    if (info.passTypeIdentifier && info.passTypeIdentifier !== passTypeIdentifier) {
      console.warn(`⚠  PASS_TYPE_IDENTIFIER لا يطابق الشهادة (${info.passTypeIdentifier}).`);
    }
  }

  const vcardURL = siteURL ? `${siteURL}${VCARD_PATH}` : '';
  const passJson = buildPassJson({
    passTypeIdentifier,
    teamIdentifier,
    serialNumber: process.env.PASS_SERIAL_NUMBER || 'aldrees-sameh-zein-001',
    barcodeMessage: process.env.PASS_QR_MESSAGE || vcardURL || CONTACT.website,
    vcardURL,
    contact: CONTACT,
  });

  const buffer = createPkPass({ passJson, images: PASS_IMAGES, certificates });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buffer);
  writeFileSync(join(dirname(outPath), 'contact.vcf'), buildVCard(), 'utf8');

  console.log(`✓ ${outPath} — ${(buffer.length / 1024).toFixed(1)} كيلوبايت`);
  if (!siteURL) console.log('ℹ  بلا --url: رمز QR داخل البطاقة يشير إلى الموقع العام للشركة.');
}

main();
