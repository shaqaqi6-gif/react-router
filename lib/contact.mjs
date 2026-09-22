/* ============================================================
   بيانات بطاقة العمل — مصدر واحد للحقيقة
   تُستخدم في: بطاقة Apple Wallet، ملف vCard، صفحة /wallet
   يمكن تجاوز أي حقل عبر متغيّرات البيئة (CARD_*) دون تعديل الكود.
   ============================================================ */

const env = (key, fallback) => {
  const v = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  return v && String(v).trim() ? String(v).trim() : fallback;
};

export const CONTACT = {
  firstNameAr: env('CARD_FIRST_AR', 'سامح'),
  lastNameAr: env('CARD_LAST_AR', 'زين'),
  fullNameAr: env('CARD_NAME_AR', 'سامح زين'),
  fullNameEn: env('CARD_NAME_EN', 'Sameh Zein'),
  titleAr: env('CARD_TITLE_AR', 'مساعد مدير التشغيل'),
  titleEn: env('CARD_TITLE_EN', 'Assistant Operations Manager'),
  orgAr: env('CARD_ORG_AR', 'شركة الدريس'),
  orgEn: env('CARD_ORG_EN', 'Aldrees'),
  phone: env('CARD_PHONE', '+966541419835'),
  phoneDisplay: env('CARD_PHONE_DISPLAY', '0541419835'),
  email: env('CARD_EMAIL', 'samehz@aldrees.com'),
  website: env('CARD_WEBSITE', 'https://www.aldrees.com/'),
};

/* اسم ملف vCard المنشور على الموقع (يُستخدم داخل رمز QR للبطاقة) */
export const VCARD_PATH = '/wallet/assets/sameh-zein.vcf';

/** يبني نص vCard 3.0 بالترميز UTF-8 (أسطر CRLF كما يتطلب المعيار). */
export function buildVCard(c = CONTACT) {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${c.lastNameAr};${c.firstNameAr};;;`,
    `FN:${c.fullNameAr}`,
    `ORG:${c.orgAr}`,
    `TITLE:${c.titleAr}`,
    `TEL;TYPE=CELL:${c.phone}`,
    `EMAIL;TYPE=WORK:${c.email}`,
    `URL:${c.website}`,
    'END:VCARD',
    '',
  ].join('\r\n');
}
