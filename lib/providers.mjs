/* ============================================================
   وسطاء التوقيع الخارجي لبطاقة Apple Wallet
   ------------------------------------------------------------
   يسمحان بإصدار البطاقة **بدون حساب مطوّر Apple**: الخدمة الخارجية
   توقّع الحزمة بشهادتها هي وتعيد ملف .pkpass (أو رابطه).

   مزوّدان مدعومان:
     PASS_PROVIDER=pass2u   → واجهة Pass2U (api.pass2u.net/v2)
     PASS_PROVIDER=custom   → أي خدمة تستقبل pass.json وتعيد .pkpass
                              (WalletWallet، PassSource، خدمة داخلية…)

   ملاحظة خصوصية: في هذا الوضع تمرّ بيانات البطاقة عبر خادم الطرف الثالث،
   وقد يظهر اسمه كجهة إصدار داخل Wallet. للحصول على بطاقة باسم الشركة
   بالكامل استخدم شهادة Pass Type ID (راجع docs/APPLE_WALLET_AR.md).
   ============================================================ */

const PKPASS_TYPE = 'application/vnd.apple.pkpass';

/** هل المحتوى المُعاد ملف .pkpass فعلًا؟ (نوع المحتوى أو بصمة ZIP) */
function looksLikePkPass(contentType, buffer) {
  if (String(contentType || '').toLowerCase().includes('pkpass')) return true;
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK"
}

/** يلتقط رابط التنزيل من رد JSON مهما اختلفت تسميته بين الخدمات. */
function pickURL(data) {
  if (!data || typeof data !== 'object') return null;
  const keys = ['url', 'passUrl', 'downloadUrl', 'download_url', 'pkpassUrl', 'link', 'shortUrl'];
  for (const k of keys) if (typeof data[k] === 'string' && data[k].startsWith('http')) return data[k];
  return null;
}

async function readError(res) {
  const text = await res.text().catch(() => '');
  return `${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 300)}` : ''}`;
}

/* ---------------- Pass2U ---------------- */

/**
 * يحوّل حقول pass.json إلى قائمة حقول Pass2U (مفتاح/قيمة/تسمية).
 * تصميم البطاقة (الألوان والشعار والتخطيط) يُضبط مرّة واحدة في لوحة Pass2U،
 * وهذه الدالة تملأ القيم فقط.
 */
function pass2uFields(passJson) {
  const style = passJson.generic || passJson.storeCard || passJson.coupon || {};
  const groups = ['headerFields', 'primaryFields', 'secondaryFields', 'auxiliaryFields', 'backFields'];
  const fields = [];
  for (const group of groups) {
    for (const f of style[group] || []) {
      fields.push({ key: f.key, label: f.label || '', value: String(f.value ?? '') });
    }
  }
  return fields;
}

function pass2uProvider(env) {
  const apiKey = env.PASS2U_API_KEY;
  const modelId = env.PASS2U_MODEL_ID;
  const base = (env.PASS2U_API_BASE || 'https://api.pass2u.net/v2').replace(/\/+$/, '');
  if (!apiKey || !modelId) {
    return { name: 'pass2u', ready: false, missing: [!apiKey && 'PASS2U_API_KEY', !modelId && 'PASS2U_MODEL_ID'].filter(Boolean) };
  }

  return {
    name: 'pass2u',
    ready: true,
    missing: [],
    async issue(passJson) {
      const body = {
        fields: pass2uFields(passJson),
        barcode: passJson.barcode
          ? {
              message: passJson.barcode.message,
              messageEncoding: passJson.barcode.messageEncoding,
              altText: passJson.barcode.altText || '',
            }
          : undefined,
      };

      const created = await fetch(`${base}/models/${encodeURIComponent(modelId)}/passes`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (!created.ok) throw new Error(`Pass2U — تعذّر إنشاء البطاقة: ${await readError(created)}`);

      const data = await created.json().catch(() => ({}));
      const passId = data.id || data.passId;
      if (!passId) throw new Error('Pass2U — الرد لا يحتوي على معرّف البطاقة.');

      // محاولة جلب ملف .pkpass مباشرة لتسليمه من نطاق موقعك
      const file = await fetch(`${base}/models/${encodeURIComponent(modelId)}/passes/${encodeURIComponent(passId)}`, {
        headers: { 'x-api-key': apiKey, Accept: PKPASS_TYPE },
      });
      if (file.ok) {
        const buffer = Buffer.from(await file.arrayBuffer());
        if (looksLikePkPass(file.headers.get('content-type'), buffer)) return { buffer };
      }

      // بديل: إعادة التوجيه إلى رابط التنزيل لدى الخدمة
      return { redirect: pickURL(data) || `https://www.pass2u.net/d/${passId}` };
    },
  };
}

/* ---------------- خدمة عامة (custom) ---------------- */

function customProvider(env) {
  const url = env.PASS_PROVIDER_URL;
  const token = env.PASS_PROVIDER_TOKEN;
  if (!url) return { name: 'custom', ready: false, missing: ['PASS_PROVIDER_URL'] };

  const headerName = env.PASS_PROVIDER_AUTH_HEADER || 'Authorization';
  const scheme = env.PASS_PROVIDER_AUTH_SCHEME ?? 'Bearer';

  return {
    name: 'custom',
    ready: true,
    missing: [],
    async issue(passJson) {
      const headers = { 'Content-Type': 'application/json', Accept: `${PKPASS_TYPE}, application/json` };
      if (token) headers[headerName] = scheme ? `${scheme} ${token}` : token;

      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(passJson) });
      if (!res.ok) throw new Error(`خدمة التوقيع الخارجية ردّت بخطأ: ${await readError(res)}`);

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json().catch(() => ({}));
        const link = pickURL(data);
        if (link) return { redirect: link };
        throw new Error('خدمة التوقيع الخارجية لم تُعد ملف .pkpass ولا رابط تنزيل.');
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      if (!looksLikePkPass(contentType, buffer)) throw new Error('رد خدمة التوقيع الخارجية ليس ملف .pkpass.');
      return { buffer };
    },
  };
}

/**
 * يعيد المزوّد المُعدّ في البيئة، أو null إذا لم يُطلب أي مزوّد خارجي.
 * النتيجة: { name, ready, missing, issue(passJson) }
 *   issue() تُعيد { buffer } أو { redirect }.
 */
export function getProvider(env = process.env) {
  const name = String(env.PASS_PROVIDER || '').trim().toLowerCase();
  if (!name) return null;
  if (name === 'pass2u') return pass2uProvider(env);
  if (name === 'custom') return customProvider(env);
  return { name, ready: false, missing: [], error: `مزوّد غير معروف: ${name} (المدعوم: pass2u أو custom)` };
}
