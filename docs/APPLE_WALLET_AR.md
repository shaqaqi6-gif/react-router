# بطاقة العمل في Apple Wallet — دليل التشغيل

تطبيق ويب صغير يُصدر **بطاقة عمل رقمية** يضيفها المستخدم إلى تطبيق Wallet على iPhone
و Apple Watch، مع حفظ جهة الاتصال (vCard) ورمز QR للمشاركة.

- الصفحة: `https://<موقعك>/wallet/` (أو الاختصار `/card`)
- خدمة الإصدار: `https://<موقعك>/.netlify/functions/wallet-pass`
- فحص الجاهزية: `https://<موقعك>/.netlify/functions/wallet-pass?check=1`

---

## 1) ملفات المشروع

| الملف | الدور |
| --- | --- |
| `public/wallet/index.html` | واجهة البطاقة: معاينة، زر Apple Wallet، حفظ جهة الاتصال، QR |
| `public/wallet/assets/*` | التنسيقات، منطق الصفحة، الشعار، ملف vCard، مكتبة QR (MIT) |
| `lib/contact.mjs` | بيانات البطاقة ومولّد vCard — **مصدر واحد للحقيقة** |
| `lib/pkpass.mjs` | بناء `pass.json` + `manifest.json` + توقيع PKCS#7 وتحزيم `.pkpass` |
| `lib/zip.mjs` | كاتب ZIP مبسّط بلا مكتبات خارجية |
| `lib/providers.mjs` | وسيط خدمات التوقيع الخارجية (Pass2U أو أي خدمة عامة) |
| `lib/pass-assets.mjs` | صور البطاقة مضمّنة base64 (مُولّد من `assets/pass/`) |
| `netlify/functions/wallet-pass.js` | يُصدر البطاقة الموقّعة عند الطلب |
| `scripts/make-pkpass.mjs` | بناء ملف `.pkpass` محليًا (اختبار أو استضافة ثابتة) |
| `scripts/build-pass-assets.mjs` | إعادة توليد `lib/pass-assets.mjs` بعد تغيير الصور |

---

## 2) وضعان للتوقيع — اختر واحدًا

Wallet لا يقبل أي بطاقة إلا إذا كان ملف `manifest.json` بداخلها موقّعًا بتوقيع PKCS#7
صادر عن شهادة **Pass Type ID**. الدالة تدعم مصدرين لهذا التوقيع، وتختار الأول المتوفّر:

| الوضع | يتطلّب | جهة الإصدار داخل Wallet | الخصوصية |
| --- | --- | --- | --- |
| **أ. خدمة توقيع خارجية** | مفتاح API مجاني فقط | اسم الخدمة غالبًا | بيانات البطاقة تمرّ بخادم الخدمة |
| **ب. شهادة Apple الخاصة** | حساب مطوّر Apple (99 $/سنة) | «شركة الدريس» | كل شيء داخل خادمك |

الوضع (أ) في القسم التالي، والوضع (ب) في الأقسام 4–5.
فحص الوضع الفعّال حاليًا: `‎/.netlify/functions/wallet-pass?check=1` يعيد حقل `mode`.

> **بلا أي منهما:** الصفحة تبقى مفيدة عبر زر «حفظ جهة الاتصال» ورمز QR،
> وهما يعملان على iPhone وAndroid دون أي شهادة.

---

## 2.1) إصدار البطاقة بدون حساب مطوّر (خدمة توقيع خارجية)

الخدمة توقّع الحزمة **بشهادتها هي**، فلا تحتاج أي شيء من Apple.

### Pass2U (مدعوم مباشرة)

1. سجّل في <https://www.pass2u.net> واحصل على **API Key** من لوحة المطوّرين.
2. أنشئ **نموذج بطاقة (Model)** من نوع *Generic* في اللوحة:
   - لون الخلفية `#009DDE`، النص أبيض.
   - ارفع صور البطاقة من مجلد `assets/pass/` (الأيقونة والشعار والصورة المصغّرة).
   - أنشئ الحقول بنفس المفاتيح التي تُرسلها الدالة:
     `name`, `title`, `org`, `phone`, `email`, `name-en`, `phone-back`, `email-back`,
     `website-back`, `vcard`, `hint`.
   - فعّل رمز **QR** في النموذج (تملأ الدالة محتواه تلقائيًا).
3. انسخ **Model ID** من رابط النموذج.
4. أضف في Netlify:

   | المتغيّر | القيمة |
   | --- | --- |
   | `PASS_PROVIDER` | `pass2u` |
   | `PASS2U_API_KEY` | مفتاح API |
   | `PASS2U_MODEL_ID` | معرّف النموذج |
   | `PASS2U_API_BASE` | اختياري — الافتراضي `https://api.pass2u.net/v2` |

كيف تعمل الدالة: تُنشئ بطاقة عبر `POST /models/{modelId}/passes`، ثم تجلب ملف
`.pkpass` عبر `GET /models/{modelId}/passes/{passId}` وتسلّمه من نطاق موقعك؛
وإن تعذّر جلب الملف تُحوّل المستخدم إلى رابط التنزيل لدى الخدمة.

### أي خدمة أخرى (WalletWallet، PassSource، خدمة داخلية…)

الوضع العام يرسل `pass.json` كاملًا إلى رابط تحدّده أنت، ويقبل ردًّا بملف `.pkpass`
أو بـ JSON يحوي رابط تنزيل (`url` أو `downloadUrl` أو `passUrl` …):

| المتغيّر | القيمة |
| --- | --- |
| `PASS_PROVIDER` | `custom` |
| `PASS_PROVIDER_URL` | رابط واجهة الخدمة |
| `PASS_PROVIDER_TOKEN` | مفتاح الخدمة (اختياري) |
| `PASS_PROVIDER_AUTH_HEADER` | اسم ترويسة المصادقة — الافتراضي `Authorization` |
| `PASS_PROVIDER_AUTH_SCHEME` | بادئة المفتاح — الافتراضي `Bearer` (اتركها فارغة لإرسال المفتاح وحده) |

ملاحظة: في الوضع العام تُرسل الدالة `pass.json` بمعرّفات بديلة
(`passTypeIdentifier` و`teamIdentifier`) لأن الخدمة تستبدلها بمعرّفاتها هي عند التوقيع.

مثال لخدمة تستخدم ترويسة مفتاح مباشرة:

```
PASS_PROVIDER=custom
PASS_PROVIDER_URL=https://api.example.com/v1/passes
PASS_PROVIDER_TOKEN=abc123
PASS_PROVIDER_AUTH_HEADER=x-api-key
PASS_PROVIDER_AUTH_SCHEME=
```

### ملاحظات مهمّة قبل الاعتماد على خدمة خارجية

- **الخصوصية:** اسمك ورقمك وبريدك تمرّ عبر خادم الطرف الثالث وتُخزَّن لديه.
- **جهة الإصدار:** قد يظهر اسم الخدمة داخل البطاقة بدل اسم الشركة.
- **الاستمرارية:** توقّف الخدمة أو انتهاء الباقة المجانية يوقف إصدار بطاقات جديدة
  (البطاقات المُضافة مسبقًا تبقى في جوالات أصحابها).
- **الحدود المجانية** تتغيّر — راجع شروط الخدمة الحالية قبل التوسّع.

للانتقال لاحقًا إلى شهادة الشركة: احذف متغيّرات `PASS_*` الخاصة بالخدمة وأضف
شهادة Apple، والدالة تنتقل للوضع (ب) تلقائيًا بلا أي تعديل في الكود.

---

## 3) استخراج الشهادات (على جهاز Mac)

### أ. إنشاء طلب توقيع (CSR)

1. افتح **Keychain Access** ← القائمة `Certificate Assistant` ←
   `Request a Certificate From a Certificate Authority…`
2. اكتب بريدك الإلكتروني والاسم، اختر **Saved to disk**، ثم احفظ الملف `CertificateSigningRequest.certSigningRequest`.

### ب. إنشاء Pass Type ID وشهادته

1. ادخل <https://developer.apple.com/account> ← `Certificates, Identifiers & Profiles`.
2. `Identifiers` ← `+` ← **Pass Type IDs** ← اكتب معرّفًا مثل
   `pass.com.aldrees.businesscard` ← `Continue` ← `Register`.
3. `Certificates` ← `+` ← **Pass Type ID Certificate** ← اختر المعرّف الذي أنشأته ←
   ارفع ملف الـ CSR ← نزّل الشهادة `pass.cer`.
4. **Team ID** (10 خانات) تجده في `Membership details` أعلى صفحة الحساب.

### ج. تصدير ملف `.p12`

1. انقر مرّتين على `pass.cer` ليُضاف إلى Keychain.
2. في تبويب `My Certificates` ابحث عن `Pass Type ID: pass.com.…`
3. زر يمين ← `Export…` ← صيغة `.p12` ← اختر كلمة مرور قوية واحفظها ← احفظه باسم `pass.p12`.

### د. شهادة Apple WWDR الوسيطة

نزّل **Worldwide Developer Relations — G4** من
<https://www.apple.com/certificateauthority/> ثم حوّلها إلى PEM:

```bash
openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr.pem
```

---

## 4) الإعداد على Netlify (وضع شهادة Apple)

حوّل ملف `.p12` إلى نص base64:

```bash
base64 -i pass.p12 | tr -d '\n' | pbcopy      # macOS
base64 -w0 pass.p12                            # Linux
```

ثم من `Site settings → Environment variables` أضف:

| المتغيّر | القيمة |
| --- | --- |
| `PASS_TYPE_IDENTIFIER` | `pass.com.aldrees.businesscard` |
| `TEAM_IDENTIFIER` | معرّف الفريق (10 خانات) |
| `APPLE_PASS_P12_BASE64` | ناتج أمر base64 أعلاه |
| `APPLE_PASS_P12_PASSWORD` | كلمة مرور ملف `.p12` |
| `APPLE_WWDR_PEM` | محتوى `wwdr.pem` كاملًا (أو نسخته base64) |
| `PASS_SERIAL_NUMBER` | اختياري — رقم ثابت لكل شخص |
| `PASS_QR_MESSAGE` | اختياري — محتوى رمز QR (الافتراضي: رابط ملف vCard) |

بديل الـ `.p12`: `APPLE_PASS_CERT_PEM` + `APPLE_PASS_KEY_PEM`
(+ `APPLE_PASS_KEY_PASSWORD` إذا كان المفتاح مشفّرًا).

أعد النشر (`Deploys → Trigger deploy`) ثم افتح:

```
https://<موقعك>/.netlify/functions/wallet-pass?check=1
```

يجب أن تعود `{"ready": true, "mode": "apple-certificate", ...}`.
(في وضع الخدمة الخارجية تعود `"mode": "provider:pass2u"`.)
بعدها يصبح زر Apple Wallet في الصفحة مفعّلًا.

---

## 5) الاختبار

```bash
# اختبار خط الإنتاج كاملًا بشهادة ذاتية التوقيع (لا يقبلها iPhone — للتحقق فقط)
npm run pass -- --demo --out dist-pass/test.pkpass

# بناء بطاقة حقيقية من مجلد certs/ (certs/pass.p12 + certs/wwdr.pem)
PASS_TYPE_IDENTIFIER=pass.com.aldrees.businesscard \
TEAM_IDENTIFIER=ABCDE12345 \
APPLE_PASS_P12_PASSWORD='كلمة-المرور' \
npm run pass -- --url https://<موقعك>

# فحص محتوى الحزمة
unzip -l dist-pass/Aldrees-BusinessCard.pkpass
```

على iPhone: أرسل ملف `.pkpass` عبر البريد أو iMessage، أو افتح رابط الصفحة واضغط الزر
← تظهر البطاقة ← `إضافة`. تظهر البطاقة في Wallet، ويظهر رمز QR داخلها بحجم كبير
ليمسحه الطرف الآخر فتُحفظ بياناتك في جواله.

> مجلد `certs/` و`dist-pass/` وأي ملف `.p12` مستثناة من Git — لا ترفع الشهادات إلى المستودع.

---

## 6) الاستضافة كملف ثابت (بلا دوال)

إن لم ترغب في استخدام دالة Netlify، ابنِ الملف محليًا وانسخه إلى مجلد النشر:

```bash
npm run pass -- --url https://<موقعك>
cp dist-pass/Aldrees-BusinessCard.pkpass public/wallet/assets/
```

ثم عدّل رابط الزر في `public/wallet/index.html` إلى
`assets/Aldrees-BusinessCard.pkpass`. ترويسة نوع المحتوى مضبوطة مسبقًا في
`public/_headers`. عيب هذه الطريقة: تجديد الشهادة سنويًا يتطلّب إعادة البناء يدويًا.

---

## 7) تخصيص البطاقة

- **بيانات الشخص:** عدّل `lib/contact.mjs`، أو اضبط متغيّرات البيئة
  `CARD_NAME_AR`, `CARD_TITLE_AR`, `CARD_ORG_AR`, `CARD_PHONE`, `CARD_EMAIL`, `CARD_WEBSITE` …
  ثم حدّث `public/wallet/assets/sameh-zein.vcf` والنصوص الظاهرة في `index.html`.
- **الحقول داخل Wallet:** `buildPassJson` في `lib/pkpass.mjs`
  (`primaryFields`, `secondaryFields`, `auxiliaryFields`, `backFields`).
- **الألوان:** ثابت `BRAND` في `lib/pkpass.mjs` (خلفية البطاقة داخل Wallet)
  و`--brand` في `public/wallet/assets/style.css` (الصفحة).
- **الصور:** استبدل ملفات `assets/pass/*.png` بنفس المقاسات ثم:

  ```bash
  npm run pass:assets
  ```

  المقاسات: `icon` ‎29/58/87 بكسل، `logo` ‎104×50 و208×100 و312×150،
  `thumbnail` ‎90/180/270.

---

## 8) بطاقة لأكثر من موظّف

كرّر `lib/contact.mjs` كقائمة، ومرّر `?id=` إلى الدالة لاختيار الموظّف،
مع `serialNumber` مختلف لكل شخص حتى لا تحلّ بطاقة محلّ أخرى داخل Wallet.
الشهادة نفسها تكفي لعدد غير محدود من البطاقات.

---

## 9) ملاحظات أمنية

- الشهادة ومفتاحها أسرار: احفظها في متغيّرات بيئة Netlify فقط.
- صلاحية شهادة Pass Type ID سنة واحدة؛ بعد انتهائها تتوقف الدالة عن الإصدار
  (`?check=1` يعرض تحذيرًا قبلها). البطاقات المُضافة سابقًا تبقى في Wallet.
- الصفحة لا تحتوي أي أدوات تتبّع، ولا ترسل البيانات لأي طرف ثالث.
- نشر الصفحة يجعل بيانات الاتصال متاحة لمن يملك الرابط (وهو الغرض من بطاقة العمل).
