/* =====================================================================
   Lang.gs — V9.5.0: تعدد اللغات (العربية / English / اردو)
   القاموس الأساسي مضمّن في الواجهة (Lang.html). هذا الملف يخدم تعديلات مدير النظام
   من ورقة TRANSLATIONS (الأعمدة: AR, EN, UR, NOTE) فتُدمج فوق القاموس دون تعديل الشيفرة،
   ويترجم عناوين تقرير التصدير حسب لغة المستخدم.
   ===================================================================== */

/* يُنشئ ورقة TRANSLATIONS إن لم توجد (تُستدعى من upgradeSystemV4) */
function ensureTranslationsSheet_(ss) {
  const name = (APP.SHEETS && APP.SHEETS.TRANSLATIONS) || 'TRANSLATIONS';
  const sh = ensureSheet_(ss, name, ['AR', 'EN', 'UR', 'NOTE']);
  if (sh && sh.getLastRow() < 2) {
    sh.getRange(2, 1, 1, 4).setValues([[
      'نص عربي كما يظهر في المنصة', 'English text', 'اردو متن',
      'اكتب في العمود AR النص العربي كما يظهر حرفيًا في المنصة، وفي EN/UR ترجمته. الصف يُطبَّق فورًا بعد تحديث الصفحة (خلال 10 دقائق كحد أقصى). احذف هذا الصف المثال.'
    ]]);
  }
  return sh;
}

/* عام — بلا جلسة، لأن شاشة الدخول تحتاجه. يعيد [[ar,en,ur],...] من ورقة TRANSLATIONS. */
function getTranslations() {
  const cache = CacheService.getScriptCache();
  try { const c = cache.get('TR_OVERRIDES_V1'); if (c) return JSON.parse(c); } catch (e) {}
  let rows = [];
  try {
    const ss = getDb_();
    const sh = ss.getSheetByName((APP.SHEETS && APP.SHEETS.TRANSLATIONS) || 'TRANSLATIONS');
    if (sh && sh.getLastRow() >= 2) {
      rows = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues()
        .map(function(r){ return [String(r[0] || '').trim(), String(r[1] || '').trim(), String(r[2] || '').trim()]; })
        .filter(function(r){ return r[0] && r[0] !== 'نص عربي كما يظهر في المنصة' && (r[1] || r[2]); });
    }
  } catch (e) { rows = []; }
  try { cache.put('TR_OVERRIDES_V1', JSON.stringify(rows), 600); } catch (e) {}
  return rows;
}

/* مدير النظام: إدراج/تحديث صفوف ترجمة دفعة واحدة ([[ar,en,ur],...]) — المفتاح هو النص العربي */
function importTranslations(token, rows) {
  const session = requireSession_(token);
  if (session.roleId !== 'SYSTEM_ADMIN') throw new Error('هذه العملية لمدير النظام فقط.');
  rows = Array.isArray(rows) ? rows : [];
  return withDbLock_(function() {
    const ss = getDb_();
    const sh = ensureTranslationsSheet_(ss);
    const last = sh.getLastRow();
    const existing = last >= 2 ? sh.getRange(2, 1, last - 1, 3).getValues() : [];
    const index = {};
    existing.forEach(function(r, i){ const k = String(r[0] || '').trim(); if (k) index[k] = i + 2; });
    let added = 0, updated = 0;
    const toAppend = [];
    rows.forEach(function(r){
      const ar = String(r[0] || '').trim(); if (!ar) return;
      const en = String(r[1] || '').trim(), ur = String(r[2] || '').trim();
      if (index[ar]) { sh.getRange(index[ar], 2, 1, 2).setValues([[en, ur]]); updated++; }
      else { toAppend.push([ar, en, ur, '']); added++; }
    });
    if (toAppend.length) sh.getRange(sh.getLastRow() + 1, 1, toAppend.length, 4).setValues(toAppend);
    try { CacheService.getScriptCache().remove('TR_OVERRIDES_V1'); } catch (e) {}
    audit_(session.computerNo, 'TRANSLATIONS_IMPORTED', '', 'added=' + added + ' updated=' + updated);
    return { ok: true, added: added, updated: updated };
  });
}

/* عناوين تقرير التصدير: يختار النص حسب اللغة، مع تعديلات ورقة TRANSLATIONS إن وُجدت */
function xl_(lang, ar, en, ur) {
  lang = String(lang || 'ar');
  if (lang !== 'en' && lang !== 'ur') return ar;
  try {
    const over = getTranslations();
    for (let i = 0; i < over.length; i++) if (over[i][0] === ar) { const v = lang === 'en' ? over[i][1] : over[i][2]; if (v) return v; }
  } catch (e) {}
  return (lang === 'en' ? en : ur) || ar;
}
