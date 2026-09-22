/* ============================================================
   دالة Netlify: تسليم بطاقة العمل بصيغة Apple Wallet (.pkpass)
   ------------------------------------------------------------
   GET /.netlify/functions/wallet-pass          → ملف .pkpass موقّع
   GET /.netlify/functions/wallet-pass?check=1  → حالة الإعداد (JSON، بلا أسرار)

   وضعان للتوقيع (يُختار الأول المتوفّر):

   1) شهادة Apple الخاصة بك — بطاقة باسم الشركة بالكامل:
      PASS_TYPE_IDENTIFIER, TEAM_IDENTIFIER, APPLE_WWDR_PEM,
      APPLE_PASS_P12_BASE64 + APPLE_PASS_P12_PASSWORD
      (أو APPLE_PASS_CERT_PEM + APPLE_PASS_KEY_PEM)

   2) خدمة توقيع خارجية — بدون أي حساب مطوّر Apple:
      PASS_PROVIDER=pass2u  + PASS2U_API_KEY + PASS2U_MODEL_ID
      PASS_PROVIDER=custom  + PASS_PROVIDER_URL (+ PASS_PROVIDER_TOKEN)

   التفاصيل خطوة بخطوة: docs/APPLE_WALLET_AR.md
   ============================================================ */
import { buildPassJson, createPkPass, loadCertificates, inspectCertificate } from '../../lib/pkpass.mjs';
import { PASS_IMAGES } from '../../lib/pass-assets.mjs';
import { CONTACT, VCARD_PATH } from '../../lib/contact.mjs';
import { getProvider } from '../../lib/providers.mjs';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body, null, 2),
});

const pkpassResponse = (buffer) => ({
  statusCode: 200,
  headers: {
    'Content-Type': 'application/vnd.apple.pkpass',
    'Content-Disposition': 'attachment; filename="Aldrees-BusinessCard.pkpass"',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
  body: buffer.toString('base64'),
  isBase64Encoded: true,
});

/** أصل الموقع كما وصل الطلب (للروابط داخل البطاقة ورمز QR). */
function originOf(event) {
  const h = event.headers || {};
  const host = h['x-forwarded-host'] || h.host || '';
  const proto = h['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https');
  return host ? `${proto}://${host}` : '';
}

/** المتغيّرات الناقصة لوضع شهادة Apple الخاصة. */
function appleMissing(env) {
  const hasSigner = !!env.APPLE_PASS_P12_BASE64 || (!!env.APPLE_PASS_CERT_PEM && !!env.APPLE_PASS_KEY_PEM);
  return [
    !env.PASS_TYPE_IDENTIFIER && 'PASS_TYPE_IDENTIFIER',
    !env.TEAM_IDENTIFIER && 'TEAM_IDENTIFIER',
    !env.APPLE_WWDR_PEM && 'APPLE_WWDR_PEM',
    !hasSigner && 'APPLE_PASS_P12_BASE64 (أو APPLE_PASS_CERT_PEM + APPLE_PASS_KEY_PEM)',
  ].filter(Boolean);
}

/** يبني محتوى pass.json المشترك بين الوضعين. */
function passFor(event, env) {
  const origin = originOf(event);
  const vcardURL = origin ? `${origin}${VCARD_PATH}` : '';
  return buildPassJson({
    passTypeIdentifier: env.PASS_TYPE_IDENTIFIER || 'pass.external.provider',
    teamIdentifier: env.TEAM_IDENTIFIER || 'EXTERNAL',
    serialNumber: env.PASS_SERIAL_NUMBER || 'aldrees-sameh-zein-001',
    barcodeMessage: env.PASS_QR_MESSAGE || vcardURL || CONTACT.website,
    vcardURL,
    contact: CONTACT,
  });
}

export async function handler(event) {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    return json(405, { error: 'method not allowed' });
  }

  const env = process.env;
  const wantsCheck = (event.queryStringParameters || {}).check === '1';
  const missing = appleMissing(env);
  const provider = getProvider(env);

  /* ---------- الوضع 1: شهادة Apple الخاصة ---------- */
  if (!missing.length) {
    try {
      const certificates = loadCertificates(env);
      const info = inspectCertificate(certificates.signerCert);

      const warnings = [];
      if (info.expired) warnings.push('شهادة التوقيع منتهية الصلاحية — جدّدها من حساب مطوّر Apple.');
      if (info.passTypeIdentifier && info.passTypeIdentifier !== env.PASS_TYPE_IDENTIFIER) {
        warnings.push(`PASS_TYPE_IDENTIFIER لا يطابق الشهادة (${info.passTypeIdentifier}).`);
      }
      if (info.teamIdentifier && info.teamIdentifier !== env.TEAM_IDENTIFIER) {
        warnings.push(`TEAM_IDENTIFIER لا يطابق الشهادة (${info.teamIdentifier}).`);
      }

      if (wantsCheck) {
        return json(200, {
          ready: warnings.length === 0,
          mode: 'apple-certificate',
          passTypeIdentifier: env.PASS_TYPE_IDENTIFIER,
          certificate: { commonName: info.commonName, notAfter: info.notAfter },
          warnings,
        });
      }

      return pkpassResponse(createPkPass({ passJson: passFor(event, env), images: PASS_IMAGES, certificates }));
    } catch (e) {
      return json(wantsCheck ? 200 : 500, {
        ready: false,
        mode: 'apple-certificate',
        error: 'تعذّر إصدار البطاقة بشهادة Apple.',
        detail: e.message,
        help: 'راجع docs/APPLE_WALLET_AR.md — غالبًا الشهادة أو كلمة المرور غير صحيحة.',
      });
    }
  }

  /* ---------- الوضع 2: خدمة توقيع خارجية ---------- */
  if (provider) {
    if (!provider.ready) {
      return json(wantsCheck ? 200 : 503, {
        ready: false,
        mode: `provider:${provider.name}`,
        error: provider.error || 'خدمة التوقيع الخارجية غير مكتملة الإعداد.',
        missing: provider.missing,
        help: 'راجع docs/APPLE_WALLET_AR.md — قسم «إصدار البطاقة بدون حساب مطوّر».',
      });
    }

    if (wantsCheck) {
      return json(200, { ready: true, mode: `provider:${provider.name}`, warnings: [] });
    }

    try {
      const result = await provider.issue(passFor(event, env));
      if (result.buffer) return pkpassResponse(result.buffer);
      return { statusCode: 302, headers: { Location: result.redirect, 'Cache-Control': 'no-store' }, body: '' };
    } catch (e) {
      return json(500, {
        ready: false,
        mode: `provider:${provider.name}`,
        error: 'تعذّر إصدار البطاقة عبر خدمة التوقيع الخارجية.',
        detail: e.message,
      });
    }
  }

  /* ---------- لا وضع مهيّأ ---------- */
  return json(wantsCheck ? 200 : 503, {
    ready: false,
    mode: 'none',
    error: 'الخادم غير مهيّأ لإصدار بطاقة Apple Wallet.',
    missing,
    alternative: 'أو فعّل خدمة توقيع خارجية: PASS_PROVIDER=pass2u مع PASS2U_API_KEY و PASS2U_MODEL_ID.',
    help: 'راجع docs/APPLE_WALLET_AR.md',
  });
}
