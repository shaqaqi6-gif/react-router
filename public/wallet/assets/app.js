/* ============================================================
   بطاقة العمل الرقمية — منطق الصفحة
   • يتحقّق من جاهزية دالة إصدار .pkpass قبل تفعيل زر Apple Wallet
   • يرسم رمز QR (لملف vCard المنشور) على البطاقة
   • حفظ جهة الاتصال ومشاركتها
   ============================================================ */
(function () {
  'use strict';

  var PASS_ENDPOINT = '/.netlify/functions/wallet-pass';
  var VCARD = 'assets/sameh-zein.vcf';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- رمز QR ---------- */
  function drawQR(canvas, text, scale) {
    if (!window.AldreesQR) return false;
    var model;
    try { model = window.AldreesQR(text); } catch (e) { return false; }
    var n = model.getModuleCount();
    var quiet = 4;
    var px = scale || Math.max(2, Math.floor(180 / (n + quiet * 2)));
    var size = (n + quiet * 2) * px;
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#0d1b24';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (model.isDark(r, c)) ctx.fillRect((c + quiet) * px, (r + quiet) * px, px, px);
      }
    }
    return true;
  }

  var vcardURL = new URL(VCARD, location.href).href;
  var qrOK = drawQR($('pass-qr'), vcardURL);
  if (!qrOK) {
    $('pass-qr').closest('.pass-code').hidden = true;
  }

  /* ---------- التحقّق من جاهزية خدمة Apple Wallet ---------- */
  var btn = $('add-wallet');
  var status = $('status');

  function fail(message, detail) {
    btn.setAttribute('aria-disabled', 'true');
    status.textContent = message;
    status.className = 'status error';
    $('setup').hidden = false;
    if (detail) {
      var d = $('setup-detail');
      d.hidden = false;
      d.textContent = 'تفاصيل تقنية: ' + detail;
    }
  }

  fetch(PASS_ENDPOINT + '?check=1', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (info) {
      if (info && info.ready) {
        status.textContent = 'البطاقة جاهزة. على iPhone: اضغط الزر ثم «إضافة» في أعلى شاشة Wallet.';
        status.className = 'status ok';
        return;
      }
      if (info && info.missing && info.missing.length) {
        fail('زر Apple Wallet غير مفعّل بعد — ينقص الإعداد على الاستضافة.', 'متغيّرات ناقصة: ' + info.missing.join('، '));
        return;
      }
      fail('زر Apple Wallet غير مفعّل بعد.', (info && (info.detail || (info.warnings || []).join('، '))) || '');
    })
    .catch(function () {
      fail('تعذّر الوصول إلى خدمة إصدار البطاقة (هل الموقع منشور على Netlify؟).', '');
    });

  /* على غير iPhone: تنبيه أن الملف سيُنزَّل فقط */
  var isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  btn.addEventListener('click', function () {
    if (btn.getAttribute('aria-disabled') === 'true') return;
    if (!isApple) {
      status.textContent = 'سيُنزَّل ملف .pkpass — افتحه على iPhone أو Mac لإضافته إلى Wallet.';
      status.className = 'status';
    }
  });

  /* ---------- المشاركة ---------- */
  $('share').addEventListener('click', function () {
    var data = { title: 'سامح زين — شركة الدريس', text: 'بطاقة العمل الرقمية', url: location.href };
    if (navigator.share) {
      navigator.share(data).catch(function () { /* أُلغيت المشاركة */ });
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(location.href).then(function () {
        status.textContent = 'نُسخ رابط البطاقة إلى الحافظة.';
        status.className = 'status ok';
      });
    }
  });

  /* ---------- حفظ رمز QR صورة ---------- */
  $('qr-save').addEventListener('click', function () {
    var canvas = $('pass-qr');
    if (!qrOK) return;
    var big = document.createElement('canvas');
    drawQR(big, vcardURL, 12);
    big.toBlob(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Sameh_Zein_QR.png';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, 'image/png');
    void canvas;
  });
})();
