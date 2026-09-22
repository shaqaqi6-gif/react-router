/* ============================================================
   دالة Netlify: تسليم بطاقة العمل بصيغة Apple Wallet (.pkpass)
   ------------------------------------------------------------
   GET /.netlify/functions/wallet-pass          → ملف .pkpass موقّع
   GET /.netlify/functions/wallet-pass?check=1  → حالة الإعداد (JSON، بلا أسرار)

   متغيّرات البيئة المطلوبة على Netlify:
     PASS_TYPE_IDENTIFIER     مثل pass.com.aldrees.businesscard
     TEAM_IDENTIFIER          معرّف فريق المطوّر (10 خانات)
     APPLE_WWDR_PEM           شهادة Apple WWDR الوسيطة (PEM أو base64)
     APPLE_PASS_P12_BASE64    شهادة التوقيع + مفتاحها (.p12 بترميز base64)
     APPLE_PASS_P12_PASSWORD  كلمة مرور ملف .p12
   بديل الـ p12: APPLE_PASS_CERT_PEM + APPLE_PASS_KEY_PEM (+ APPLE_PASS_KEY_PASSWORD)
   التفاصيل خطوة بخطوة: docs/APPLE_WALLET_AR.md
   ============================================================ */
import { buildPassJson, createPkPass, loadCertificates, inspectCertificate } from '../../lib/pkpass.mjs';
import { PASS_IMAGES } from '../../lib/pass-assets.mjs';
import { CONTACT, VCARD_PATH } from '../../lib/contact.mjs';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body, null, 2),
});

/** أصل الموقع كما وصل الطلب (للروابط داخل البطاقة ورمز QR). */
function originOf(event) {
  const h = event.headers || {};
  const host = h['x-forwarded-host'] || h.host || '';
  const proto = h['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https');
  return host ? `${proto}://${host}` : '';
}

function missingConfig() {
  const { PASS_TYPE_IDENTIFIER, TEAM_IDENTIFIER, APPLE_WWDR_PEM } = process.env;
  const hasSigner =
    !!process.env.APPLE_PASS_P12_BASE64 ||
    (!!process.env.APPLE_PASS_CERT_PEM && !!process.env.APPLE_PASS_KEY_PEM);
  const missing = [];
  if (!PASS_TYPE_IDENTIFIER) missing.push('PASS_TYPE_IDENTIFIER');
  if (!TEAM_IDENTIFIER) missing.push('TEAM_IDENTIFIER');
  if (!APPLE_WWDR_PEM) missing.push('APPLE_WWDR_PEM');
  if (!hasSigner) missing.push('APPLE_PASS_P12_BASE64 (أو APPLE_PASS_CERT_PEM + APPLE_PASS_KEY_PEM)');
  return missing;
}

export async function handler(event) {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    return json(405, { error: 'method not allowed' });
  }

  const wantsCheck = (event.queryStringParameters || {}).check === '1';
  const missing = missingConfig();

  if (missing.length) {
    const payload = {
      ready: false,
      error: 'الخادم غير مهيّأ لإصدار بطاقة Apple Wallet.',
      missing,
      help: 'راجع docs/APPLE_WALLET_AR.md — تحتاج شهادة Pass Type ID من حساب مطوّر Apple.',
    };
    return json(wantsCheck ? 200 : 503, payload);
  }

  try {
    const certificates = loadCertificates(process.env);
    const info = inspectCertificate(certificates.signerCert);
    const origin = originOf(event);

    const warnings = [];
    if (info.expired) warnings.push('شهادة التوقيع منتهية الصلاحية — جدّدها من حساب مطوّر Apple.');
    if (info.passTypeIdentifier && info.passTypeIdentifier !== process.env.PASS_TYPE_IDENTIFIER) {
      warnings.push(`PASS_TYPE_IDENTIFIER لا يطابق الشهادة (${info.passTypeIdentifier}).`);
    }
    if (info.teamIdentifier && info.teamIdentifier !== process.env.TEAM_IDENTIFIER) {
      warnings.push(`TEAM_IDENTIFIER لا يطابق الشهادة (${info.teamIdentifier}).`);
    }

    if (wantsCheck) {
      return json(200, {
        ready: warnings.length === 0,
        passTypeIdentifier: process.env.PASS_TYPE_IDENTIFIER,
        certificate: { commonName: info.commonName, notAfter: info.notAfter },
        warnings,
      });
    }

    const vcardURL = origin ? `${origin}${VCARD_PATH}` : '';
    const passJson = buildPassJson({
      passTypeIdentifier: process.env.PASS_TYPE_IDENTIFIER,
      teamIdentifier: process.env.TEAM_IDENTIFIER,
      serialNumber: process.env.PASS_SERIAL_NUMBER || 'aldrees-sameh-zein-001',
      barcodeMessage: process.env.PASS_QR_MESSAGE || vcardURL || CONTACT.website,
      vcardURL,
      contact: CONTACT,
    });

    const buffer = createPkPass({ passJson, images: PASS_IMAGES, certificates });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': 'attachment; filename="Aldrees-BusinessCard.pkpass"',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (e) {
    return json(wantsCheck ? 200 : 500, {
      ready: false,
      error: 'تعذّر إصدار البطاقة.',
      detail: e.message,
      help: 'راجع docs/APPLE_WALLET_AR.md — غالبًا سبب المشكلة شهادة أو كلمة مرور غير صحيحة.',
    });
  }
}
