/* ============================================================
   مولّد بطاقات Apple Wallet (.pkpass) — بطاقة عمل من نوع generic
   ------------------------------------------------------------
   الحزمة = أرشيف ZIP يحوي:
     pass.json      وصف البطاقة وحقولها
     *.png          الشعار والأيقونة والصورة المصغّرة
     manifest.json  بصمة SHA‑1 لكل ملف داخل الحزمة
     signature      توقيع PKCS#7 منفصل لملف manifest.json
   التوقيع يتطلّب شهادة Pass Type ID من حساب مطوّر Apple
   + الشهادة الوسيطة Apple WWDR. راجع: docs/APPLE_WALLET_AR.md
   ============================================================ */
import { createHash } from 'node:crypto';
import forge from 'node-forge';
import { zipStore } from './zip.mjs';
import { CONTACT } from './contact.mjs';

/* ألوان هوية الدريس */
export const BRAND = {
  background: 'rgb(0,157,222)',
  foreground: 'rgb(255,255,255)',
  label: 'rgb(214,240,253)',
};

const isAscii = (s) => /^[\x00-\x7F]*$/.test(s);

/**
 * يبني محتوى pass.json لبطاقة العمل.
 * @param {object} o
 * @param {string} o.passTypeIdentifier  معرّف نوع البطاقة (pass.com.example.card)
 * @param {string} o.teamIdentifier      معرّف فريق المطوّر (10 خانات)
 * @param {string} [o.serialNumber]      رقم تسلسلي ثابت لكل شخص
 * @param {string} [o.barcodeMessage]    محتوى رمز QR (رابط ملف vCard عادةً)
 * @param {object} [o.contact]           بيانات جهة الاتصال
 * @param {string} [o.webServiceURL]     خدمة تحديث البطاقة (اختياري)
 * @param {string} [o.authenticationToken]
 */
export function buildPassJson(o) {
  const c = o.contact || CONTACT;
  const message = o.barcodeMessage || `${c.website}`;
  const barcode = {
    format: 'PKBarcodeFormatQR',
    message,
    messageEncoding: isAscii(message) ? 'iso-8859-1' : 'utf-8',
    altText: 'امسح لحفظ جهة الاتصال',
  };

  const pass = {
    formatVersion: 1,
    passTypeIdentifier: o.passTypeIdentifier,
    teamIdentifier: o.teamIdentifier,
    serialNumber: o.serialNumber || 'business-card-001',
    organizationName: c.orgAr,
    description: `بطاقة عمل — ${c.fullNameAr}`,
    logoText: '',
    backgroundColor: BRAND.background,
    foregroundColor: BRAND.foreground,
    labelColor: BRAND.label,
    sharingProhibited: false,
    barcode,
    barcodes: [barcode],
    generic: {
      headerFields: [],
      primaryFields: [
        { key: 'name', label: 'الاسم', value: c.fullNameAr },
      ],
      secondaryFields: [
        { key: 'title', label: 'المسمّى الوظيفي', value: c.titleAr },
        { key: 'org', label: 'جهة العمل', value: c.orgAr },
      ],
      auxiliaryFields: [
        { key: 'phone', label: 'الجوال', value: c.phoneDisplay, textAlignment: 'PKTextAlignmentLeft' },
        { key: 'email', label: 'البريد الإلكتروني', value: c.email, textAlignment: 'PKTextAlignmentLeft' },
      ],
      backFields: [
        { key: 'name-en', label: 'Name', value: `${c.fullNameEn} — ${c.titleEn}` },
        {
          key: 'phone-back',
          label: 'الجوال',
          value: c.phone,
          attributedValue: `<a href="tel:${c.phone}">${c.phone}</a>`,
        },
        {
          key: 'email-back',
          label: 'البريد الإلكتروني',
          value: c.email,
          attributedValue: `<a href="mailto:${c.email}">${c.email}</a>`,
        },
        {
          key: 'website-back',
          label: 'الموقع',
          value: c.website,
          attributedValue: `<a href="${c.website}">${c.website}</a>`,
        },
        ...(o.vcardURL
          ? [{
              key: 'vcard',
              label: 'حفظ في جهات الاتصال',
              value: o.vcardURL,
              attributedValue: `<a href="${o.vcardURL}">اضغط هنا لحفظ جهة الاتصال</a>`,
            }]
          : []),
        { key: 'hint', label: 'ملاحظة', value: 'اعرض رمز QR ليمسحه الطرف الآخر فتُحفظ بياناتك في جواله مباشرة.' },
      ],
    },
  };

  if (o.webServiceURL && o.authenticationToken) {
    pass.webServiceURL = o.webServiceURL;
    pass.authenticationToken = o.authenticationToken;
  }
  return pass;
}

/* ---------------- الشهادات ---------------- */

function decodePem(value, what) {
  const text = String(value || '').trim();
  if (!text.includes('-----BEGIN')) {
    // مسموح تمريرها بترميز base64 (أسهل في متغيّرات بيئة Netlify)
    try {
      const decoded = Buffer.from(text, 'base64').toString('utf8');
      if (decoded.includes('-----BEGIN')) return decoded;
    } catch { /* تجاهل */ }
    throw new Error(`${what}: صيغة غير صالحة — المتوقّع PEM أو PEM مُرمّز base64.`);
  }
  return text;
}

/**
 * يحمّل شهادة التوقيع ومفتاحها الخاص + شهادة Apple الوسيطة.
 * يقبل إمّا ملف .p12 بترميز base64، أو زوج PEM (شهادة + مفتاح).
 */
export function loadCertificates(env = process.env) {
  const wwdrRaw = env.APPLE_WWDR_PEM;
  if (!wwdrRaw) throw new Error('APPLE_WWDR_PEM مفقود — شهادة Apple WWDR الوسيطة مطلوبة للتوقيع.');
  const wwdrCert = forge.pki.certificateFromPem(decodePem(wwdrRaw, 'APPLE_WWDR_PEM'));

  if (env.APPLE_PASS_P12_BASE64) {
    const der = Buffer.from(env.APPLE_PASS_P12_BASE64, 'base64').toString('binary');
    let p12;
    try {
      p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), env.APPLE_PASS_P12_PASSWORD || '');
    } catch (e) {
      throw new Error(`تعذّر فتح ملف .p12 — تحقّق من APPLE_PASS_P12_PASSWORD ومن سلامة الترميز base64. (${e.message})`);
    }
    const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
    const keyBags = [
      ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
      ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
    ];
    // شهادة التوقيع هي التي تحمل مفتاحًا خاصًا مطابقًا (وليست شهادة Apple الوسيطة)
    const privateKey = keyBags[0]?.key;
    if (!privateKey) throw new Error('ملف .p12 لا يحتوي على مفتاح خاص.');
    const signerCert = certBag
      .map((b) => b.cert)
      .find((cert) => cert && cert.publicKey.n && cert.publicKey.n.equals(privateKey.n));
    if (!signerCert) throw new Error('ملف .p12 لا يحتوي على شهادة مطابقة للمفتاح الخاص.');
    return { signerCert, privateKey, wwdrCert };
  }

  if (env.APPLE_PASS_CERT_PEM && env.APPLE_PASS_KEY_PEM) {
    const signerCert = forge.pki.certificateFromPem(decodePem(env.APPLE_PASS_CERT_PEM, 'APPLE_PASS_CERT_PEM'));
    const keyPem = decodePem(env.APPLE_PASS_KEY_PEM, 'APPLE_PASS_KEY_PEM');
    const privateKey = env.APPLE_PASS_KEY_PASSWORD
      ? forge.pki.decryptRsaPrivateKey(keyPem, env.APPLE_PASS_KEY_PASSWORD)
      : forge.pki.privateKeyFromPem(keyPem);
    if (!privateKey) throw new Error('تعذّر قراءة المفتاح الخاص — تحقّق من APPLE_PASS_KEY_PASSWORD.');
    return { signerCert, privateKey, wwdrCert };
  }

  throw new Error('شهادة التوقيع مفقودة — عيّن APPLE_PASS_P12_BASE64 أو (APPLE_PASS_CERT_PEM + APPLE_PASS_KEY_PEM).');
}

/** يقرأ حقلًا من اسم الشهادة (مثل UID أو OU). */
function subjectField(cert, name) {
  const f = cert.subject.getField(name);
  return f ? f.value : null;
}

/** يتحقّق أن الشهادة تطابق معرّفات البطاقة، ويعيد تحذيرات غير قاتلة. */
export function inspectCertificate(cert) {
  return {
    passTypeIdentifier: subjectField(cert, 'UID') || subjectField(cert, { type: '0.9.2342.19200300.100.1.1' }),
    teamIdentifier: subjectField(cert, 'OU'),
    commonName: subjectField(cert, 'CN'),
    notAfter: cert.validity.notAfter,
    expired: cert.validity.notAfter.getTime() < Date.now(),
  };
}

/* ---------------- التوقيع والتحزيم ---------------- */

/** توقيع PKCS#7 منفصل (detached) لمحتوى manifest.json. */
function signManifest(manifestBuffer, { signerCert, privateKey, wwdrCert }) {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifestBuffer.toString('binary'));
  p7.addCertificate(signerCert);
  p7.addCertificate(wwdrCert);
  p7.addSigner({
    key: privateKey,
    certificate: signerCert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
}

/**
 * يبني حزمة .pkpass موقّعة.
 * @param {object} o
 * @param {object} o.passJson   ناتج buildPassJson
 * @param {Record<string, Buffer>} o.images  صور الحزمة (icon.png ... )
 * @param {object} o.certificates ناتج loadCertificates
 * @returns {Buffer} محتوى ملف .pkpass
 */
export function createPkPass({ passJson, images, certificates }) {
  const required = ['icon.png', 'icon@2x.png'];
  for (const name of required) {
    if (!images[name]) throw new Error(`صورة مطلوبة مفقودة داخل الحزمة: ${name}`);
  }

  const files = [
    { name: 'pass.json', data: Buffer.from(JSON.stringify(passJson, null, 2), 'utf8') },
    ...Object.entries(images).map(([name, data]) => ({ name, data })),
  ];

  // manifest.json — بصمة SHA‑1 لكل ملف (كما تتطلّب مواصفة Apple)
  const manifest = {};
  for (const f of files) manifest[f.name] = createHash('sha1').update(f.data).digest('hex');
  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');

  const signature = signManifest(manifestBuffer, certificates);

  return zipStore([
    ...files,
    { name: 'manifest.json', data: manifestBuffer },
    { name: 'signature', data: signature },
  ]);
}
