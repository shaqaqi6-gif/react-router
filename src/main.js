/* نظام تدقيق نقليات الدريس — منطق التطبيق (وحدة ES) */
import './styles/app.css';
import 'leaflet/dist/leaflet.css';
import * as L from 'leaflet';
import * as XLSX from 'xlsx';
import { AldreesAudit } from './engine.js';
import { initialAGG, initialStations, GEO, CENTERS, RM, REF } from './data.js';
import auth from './auth.js';

window.L = L;            // حارس waitL() القديم يفحص window.L
let AGG = initialAGG;    // قابلان لإعادة الإسناد عند رفع فاتورة
let STATIONS = initialStations;

/* ============================================================
   نظام تدقيق نقليات الدريس — منطق التطبيق (نسخة نظيفة)
   البيانات مُعرّفة مسبقاً كثوابت متزامنة: AGG, STATIONS, GEO, CENTERS, RM
   ============================================================ */

/* ---------- أدوات مساعدة ---------- */
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const num = n => Math.round(Number(n) || 0).toLocaleString('en-US');     // رقم بفواصل
const ltr = s => `<span class="ltr">${s}</span>`;                         // رقم باتجاه LTR
const sar = n => ltr(num(n));                                             // مبلغ
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;

/* ---------- رقم الإصدار ---------- */
const APP_VERSION = '1.7.0';

/* ---------- حالة التطبيق ---------- */
let PAGE = 'overview';

const META = {
  overview:   { t: 'لوحة التحكم',        s: 'الفعلي مقابل الواجب · نموذج التكلفة الواجبة من أقرب مركز' },
  alerts:     { t: 'تنبيهات المخالفات',  s: 'مسارات تجاوزت شريحة أقرب مركز — مرتّبة بالهدر' },
  stations:   { t: 'بيان المحطات',       s: 'سجل كل المحطات المخدومة — بحث وتصفية وتفاصيل' },
  map:        { t: 'خريطة المسارات',     s: 'مسافة الطريق المعتمدة لكل مركز ورسم المسار' },
  trips:      { t: 'تحليل النقليات',     s: 'توزيع الردود حسب المنتج ومركز الانطلاق' },
  compliance: { t: 'التوزيع والالتزام',  s: 'تصنيف المحطات وتوزيع تجاوز الشرائح' },
  quality:    { t: 'جودة البيانات',      s: 'محطات ناقصة وتجاوزات سعرية وأخطاء مسافات' },
  audit:      { t: 'مركز التدقيق المحاسبي', s: 'تقرير رسمي · أسباب الهدر · توصيات المعالجة · كشف الشذوذ · المقارنة الشهرية' },
  plan:       { t: 'خطة العمل حسب الفترات', s: 'خطة معالجة مرحلية بأثر مالي محسوب · متابعة الاتجاه عبر الأشهر' },
  users:      { t: 'إدارة المستخدمين', s: 'إضافة المستخدمين وصلاحياتهم · الحضور الآن · أوقات الدخول والخروج' },
};

/* ---------- التنقل ---------- */
function nav(pg) {
  PAGE = pg;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.pg === pg));
  $('#pgTitle').textContent = META[pg].t;
  $('#pgSub').textContent   = META[pg].s;
  $('#sidebar').classList.remove('open');
  { const bd = $('#sbBackdrop'); if (bd) bd.classList.remove('show'); }
  window.scrollTo(0, 0);
  render(pg);
}
function render(pg) {
  const c = $('#content');
  if      (pg === 'overview')   c.innerHTML = viewOverview();
  else if (pg === 'alerts')   { c.innerHTML = viewAlerts();   wireAlerts(); }
  else if (pg === 'stations') { c.innerHTML = viewStations(); wireStations(); }
  else if (pg === 'plan')     { c.innerHTML = viewPlan();     wirePlan(); }
  else if (pg === 'map')      { c.innerHTML = viewMap();      initMap(); }
  else if (pg === 'trips')      c.innerHTML = viewTrips();
  else if (pg === 'compliance') c.innerHTML = viewCompliance();
  else if (pg === 'quality')  { c.innerHTML = viewQuality();  wireQuality(); }
  else if (pg === 'audit')    { c.innerHTML = viewAudit();    wireAudit(); }
  else if (pg === 'users')    { c.innerHTML = viewUsers();    wireUsers(); }
  // انتقال ظهور لطيف عند كل تنقّل
  c.classList.remove('page-in'); void c.offsetWidth; c.classList.add('page-in');
}

/* ---------- عناصر رسومية مشتركة ---------- */
function kpiRow(items) {
  return `<div class="kpis">` + items.map(k => `
    <div class="kpi ${k.cls || ''}">
      ${k.tag ? `<span class="tag" style="background:${k.tagBg};color:${k.tagFg}">${k.tag}</span>` : ''}
      <div class="ic">${k.ic}</div><div class="v">${k.v}</div><div class="l">${k.l}</div>
    </div>`).join('') + `</div>`;
}
function bars(rows, grad) {
  const max = Math.max(...rows.map(r => r.v), 1);
  return rows.map(r => `
    <div class="barrow">
      <div class="nm" title="${r.nm}">${r.nm}</div>
      <div class="track"><div class="fill" style="width:${Math.max(4, 100 * r.v / max)}%;background:${grad}"></div></div>
      <div class="bval">${sar(r.v)}</div>
    </div>`).join('');
}
function donut(segs, total, label) {
  let off = 0; const C = 2 * Math.PI * 15.915;
  const arcs = segs.map(s => {
    const len = C * s.v / total;
    const e = `<circle cx="21" cy="21" r="15.915" fill="none" stroke="${s.c}" stroke-width="6" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 21 21)"/>`;
    off += len; return e;
  }).join('');
  return `<div class="donut-wrap">
    <svg class="donut" viewBox="0 0 42 42">
      <circle cx="21" cy="21" r="15.915" fill="none" stroke="#eef4f9" stroke-width="6"/>${arcs}
      <text x="21" y="20" text-anchor="middle" font-size="6" font-weight="800" fill="#142733">${label}</text>
      <text x="21" y="26" text-anchor="middle" font-size="3" fill="#7089a0">رحلة</text>
    </svg>
    <div class="leg">${segs.map(s => `<div class="leg-item"><i style="background:${s.c}"></i>${s.n}<b>${sar(s.v)}</b></div>`).join('')}</div>
  </div>`;
}

/* ============================================================
   1) لوحة التحكم
   ============================================================ */
function viewOverview() {
  const a = AGG;
  const hero = `
    <div class="hero">
      <div class="hero-flex">
        <div class="h-main">
          <div class="eyebrow">الفعلي مقابل الواجب · ${a.period}</div>
          <div class="num">${sar(a.waste)} <small>ر.س هدر</small></div>
          <div class="sub">الفعلي ${sar(a.actual)} − الواجب من الأقرب ${sar(a.should)} = هدر ${a.wastePct}% من قيمة النقل القابلة للقياس</div>
        </div>
        <div class="h-stat"><div class="v">${sar(a.total)}</div><div class="l">عدد الردود المدققة</div></div>
        <div class="h-stat"><div class="v warn">${sar(a.alert)}</div><div class="l">ردود بتنبيه</div></div>
        <div class="h-stat"><div class="v good">${a.compliance}%</div><div class="l">الالتزام بأقرب مركز ${infoDot('الالتزام')}</div></div>
      </div>
      <div class="costgap">
        <div class="cg-track">
          <div class="cg-should" style="width:${(100 * a.should / a.actual).toFixed(1)}%">الواجب ${sar(a.should)}</div>
          <div class="cg-waste"  style="width:${(100 * a.waste  / a.actual).toFixed(1)}%">هدر ${sar(a.waste)}</div>
        </div>
        <div class="cg-labels"><span>أرضية «بلا هدر» = التوريد من أقرب مركز</span><span>الفعلي ${sar(a.actual)} ر.س</span></div>
      </div>
    </div>`;
  const kpis = kpiRow([
    { ic: '💰', v: sar(a.actual), l: 'التكلفة الفعلية (ر.س)' },
    { ic: '🎯', v: sar(a.should), l: 'التكلفة الواجبة من الأقرب (ر.س) ' + infoDot('التكلفة الواجبة'), cls: 'ok' },
    { ic: '📉', v: sar(a.waste),  l: 'الهدر القابل للتوفير (ر.س) ' + infoDot('الهدر'), cls: 'crit', tag: a.wastePct + '%', tagBg: 'var(--crit-bg)', tagFg: 'var(--crit)' },
    { ic: '🚨', v: sar(a.alert),  l: 'ردود بتنبيه (تجاوز شريحة)', cls: 'warn' },
    { ic: '✅', v: sar(a.ok),     l: 'ردود سليمة (لا تجاوز)', cls: 'ok' },
    { ic: '🧾', v: sar(a.pover),  l: 'تجاوزات سعرية عن الجدول ' + infoDot('التجاوز السعري'), cls: a.pover ? 'crit' : 'ok' },
    { ic: '📍', v: sar(a.proxy_stations), l: 'محطات تحتاج إضافة للمرجع ' + infoDot('المحطات الناقصة'), cls: 'warn' },
    { ic: '🏢', v: sar(a.stations), l: 'المحطات المخدومة' },
  ]);
  const segs = [
    { n: 'سليم', v: a.ok, c: '#15a075' },
    { n: 'تنبيه', v: a.alert, c: '#dc2f44' },
    { n: 'تحتاج إضافة', v: a.proxy_trips, c: '#dd8a08' },
    { n: 'مستثناة (نجران)', v: a.excluded_trips, c: '#b9c6d2' },
  ].filter(s => s.v > 0);
  const orgRows  = Object.entries(a.byOrigin).map(([k, o]) => ({ nm: k, v: o.waste, n: o.alerts + '' })).filter(r => r.v > 0).sort((x, y) => y.v - x.v);
  const cityRows = Object.entries(a.byCity).map(([k, v]) => ({ nm: k, v })).sort((x, y) => y.v - x.v).slice(0, 8);
  return hero + kpis + `
    <div class="grid3">
      <div class="card"><h4>📊 توزيع الردود</h4>${donut(segs, a.total, sar(a.total))}</div>
      <div class="card"><h4>🏭 الهدر حسب مركز الانطلاق</h4>${bars(orgRows, 'linear-gradient(90deg,#1B95D3,#0F6FA3)')}</div>
      <div class="card"><h4>🏙️ الهدر حسب المدينة</h4>${bars(cityRows, 'linear-gradient(90deg,#dc2f44,#f0728a)')}</div>
    </div>`;
}

/* ============================================================
   2) تنبيهات المخالفات (مستوى المسار محطة←مركز)
   ============================================================ */
let ROUTES = null, aSort = { k: 'waste', d: -1 }, aFilt = { q: '', min: 1 };
function buildRoutes() {
  ROUTES = [];
  for (const [sno, s] of Object.entries(STATIONS)) {
    if (s.cov === 'excluded') continue;
    for (const o of (s.byO || [])) {
      if (o.bands > 0 && o.waste > 0) {
        ROUTES.push({
          sno: +sno, nm: s.nm, city: s.city, org: o.org, orgA: o.orgA,
          bench: s.bench, benchD: s.benchD, trips: o.trips, bands: o.bands,
          waste: o.waste, wpt: Math.round(o.waste / o.trips),
        });
      }
    }
  }
}
function viewAlerts() {
  return `
    <div class="toolbar">
      <input id="aq" placeholder="ابحث: محطة / مدينة / مركز الانطلاق…">
      <select id="amin"><option value="1">تجاوز ≥ 1 شريحة</option><option value="2">≥ 2</option><option value="3">≥ 3</option></select>
      <button class="btn" id="aexp">⤓ تصدير</button><span class="note" id="acnt"></span>
    </div>
    <p class="hint">كل سطر = <b>مسار مخالف</b> (محطة وُرّدت من مركز أبعد من الأقرب). اضغط لتفاصيل المحطة.</p>
    <div class="tbl-wrap"><table class="t"><thead><tr>
      <th class="txt sortable" data-k="nm">المحطة</th><th class="txt sortable" data-k="city">المدينة</th>
      <th class="txt sortable" data-k="org">وُرّدت من</th><th class="txt">بدل الأقرب</th>
      <th class="n sortable" data-k="bands">تجاوز الشرائح</th><th class="n sortable" data-k="trips">الردود</th>
      <th class="n sortable" data-k="wpt">هدر/ردة</th><th class="n sortable" data-k="waste">إجمالي الهدر</th>
    </tr></thead><tbody id="abody"></tbody></table></div>`;
}
function alertRows() {
  let v = ROUTES.filter(r => r.bands >= aFilt.min);
  if (aFilt.q) { const q = aFilt.q.trim().toLowerCase(); v = v.filter(r => (r.nm + ' ' + r.sno + ' ' + r.city + ' ' + r.org).toLowerCase().includes(q)); }
  v.sort((a, b) => { let x = a[aSort.k], y = b[aSort.k]; if (typeof x === 'string') return aSort.d * ('' + x).localeCompare('' + y, 'ar'); return aSort.d * ((x || 0) - (y || 0)); });
  return v;
}
function drawAlerts() {
  const v = alertRows();
  $('#acnt').textContent = `${num(v.length)} مسار مخالف — هدر ${num(v.reduce((s, r) => s + r.waste, 0))} ر.س`;
  $('#abody').innerHTML = v.slice(0, 400).map(r => `
    <tr class="clickrow" data-sno="${r.sno}">
      <td class="txt"><b>${r.sno}</b> · ${r.nm || '—'}</td><td class="txt">${r.city || '—'}</td>
      <td class="txt">${r.org}${r.orgA ? `<br><span class="sub2">${r.orgA}</span>` : ''}</td>
      <td class="txt sub2">${r.bench || '—'} ${r.benchD != null ? '(' + ltr(r.benchD) + 'كم)' : ''}</td>
      <td class="n"><span class="pill ${r.bands <= 2 ? 'p-mid' : 'p-crit'}">+${r.bands} شريحة</span></td>
      <td class="n">${sar(r.trips)}</td><td class="n">${sar(r.wpt)}</td>
      <td class="n crit-num">${sar(r.waste)}</td>
    </tr>`).join('') + (v.length > 400 ? `<tr><td colspan="8" class="more">… أول 400 من ${num(v.length)}. ضيّق البحث أو صدّر.</td></tr>` : '');
  $$('#abody .clickrow').forEach(t => t.onclick = () => openModal(t.dataset.sno));
}
function wireAlerts() {
  drawAlerts();
  $('#aq').oninput  = e => { aFilt.q = e.target.value; drawAlerts(); };
  $('#amin').onchange = e => { aFilt.min = +e.target.value; drawAlerts(); };
  $('#aexp').onclick = () => {
    const v = alertRows();
    csv(['رقم المحطة', 'اسم المحطة', 'المدينة', 'مركز الانطلاق', 'المركز الأقرب', 'كم الأقرب', 'تجاوز الشرائح', 'الردود', 'هدر/ردة', 'إجمالي الهدر'],
      v.map(r => [r.sno, `"${r.nm}"`, r.city, `"${r.org}"`, `"${r.bench || ''}"`, r.benchD || '', r.bands, r.trips, r.wpt, r.waste]),
      'تنبيهات_المسارات.csv');
  };
  sortHeaders(aSort, drawAlerts);
}

/* ============================================================
   3) بيان المحطات (سجل)
   ============================================================ */
let sSort = { k: 'waste', d: -1 }, sFilt = { q: '', city: '', scope: 'all' };
function viewStations() {
  return `
    <div class="toolbar">
      <input id="sq" placeholder="ابحث باسم المحطة / رقمها / المدينة…">
      <select id="sscope"><option value="all">كل المحطات</option><option value="alerts">ذات التنبيهات</option><option value="clean">السليمة</option><option value="proxy">تحتاج إضافة</option></select>
      <select id="scity"><option value="">كل المدن</option></select>
      <button class="btn" id="sexp">⤓ تصدير</button><span class="note" id="scnt"></span>
    </div>
    <p class="hint">سجل كل المحطات. اضغط أي محطة لتفاصيلها (المراكز، الشرائح، المنتجات).</p>
    <div class="tbl-wrap"><table class="t"><thead><tr>
      <th class="txt sortable" data-k="nm">المحطة</th><th class="txt sortable" data-k="city">المدينة</th>
      <th class="txt sortable" data-k="primstr">التوريد المعتمد</th><th class="n sortable" data-k="trips">الردود</th>
      <th class="n sortable" data-k="maxBands">أقصى تجاوز</th><th class="n sortable" data-k="waste">الهدر ر.س</th>
      <th class="n sortable" data-k="tier">التصنيف</th>
    </tr></thead><tbody id="sbody"></tbody></table></div>`;
}
function stationRows() {
  let v = SLIST.filter(r => {
    if (sFilt.scope === 'alerts' && r.alerts <= 0) return false;
    if (sFilt.scope === 'clean'  && r.tier !== 'سليم') return false;
    if (sFilt.scope === 'proxy'  && r.tier !== 'ناقصة') return false;
    if (sFilt.city && r.city !== sFilt.city) return false;
    if (sFilt.q) { const h = (r.nm + ' ' + r.sno + ' ' + r.city).toLowerCase(); if (!h.includes(sFilt.q.trim().toLowerCase())) return false; }
    return true;
  });
  const rank = { 'عالي': 5, 'متوسط': 4, 'منخفض': 3, 'ناقصة': 2, 'سليم': 1, 'مستثناة': 0 };
  v.sort((a, b) => { let x = a[sSort.k], y = b[sSort.k]; if (sSort.k === 'tier') { x = rank[a.tier]; y = rank[b.tier]; } if (typeof x === 'string') return sSort.d * ('' + x).localeCompare('' + y, 'ar'); return sSort.d * ((x || 0) - (y || 0)); });
  return v;
}
function drawStations() {
  const v = stationRows();
  $('#scnt').textContent = `${num(v.length)} محطة — هدر ${num(v.reduce((s, r) => s + (r.waste > 0 ? r.waste : 0), 0))} ر.س`;
  $('#sbody').innerHTML = v.slice(0, 500).map(r => `
    <tr class="clickrow" data-sno="${r.sno}">
      <td class="txt"><b>${r.sno}</b> · ${r.nm || '—'}</td><td class="txt">${r.city || '—'}</td>
      <td class="txt sub2">${r.primstr || '—'}</td><td class="n">${sar(r.trips)}</td>
      <td class="n">${r.maxBands > 0 ? ltr('+' + r.maxBands) : '—'}</td>
      <td class="n ${r.waste > 0 ? 'crit-num' : ''}">${r.waste > 0 ? sar(r.waste) : '—'}</td>
      <td class="n"><span class="pill p-tier-${r.tier}">${r.tier}</span></td>
    </tr>`).join('') + (v.length > 500 ? `<tr><td colspan="7" class="more">… أول 500 من ${num(v.length)}.</td></tr>` : '');
  $$('#sbody .clickrow').forEach(t => t.onclick = () => openModal(t.dataset.sno));
}
function wireStations() {
  const cities = [...new Set(SLIST.map(r => r.city).filter(Boolean))].sort();
  $('#scity').innerHTML += cities.map(c => `<option value="${c}">${c}</option>`).join('');
  drawStations();
  $('#sq').oninput     = e => { sFilt.q = e.target.value; drawStations(); };
  $('#sscope').onchange = e => { sFilt.scope = e.target.value; drawStations(); };
  $('#scity').onchange  = e => { sFilt.city = e.target.value; drawStations(); };
  $('#sexp').onclick = () => {
    const v = stationRows();
    csv(['رقم المحطة', 'اسم المحطة', 'المدينة', 'التوريد المعتمد', 'الردود', 'أقصى تجاوز', 'التكلفة الفعلية', 'التكلفة الواجبة', 'الهدر', 'التصنيف', 'أقرب مركز', 'كم الأقرب'],
      v.map(r => [r.sno, `"${r.nm}"`, r.city, `"${r.primstr}"`, r.trips, r.maxBands, r.actual, r.should, r.waste, r.tier, `"${r.bench || ''}"`, r.benchD || '']),
      'المحطات.csv');
  };
  sortHeaders(sSort, drawStations);
}

/* ============================================================
   4) خريطة المسارات (مسافات الطرق المضمّنة + رسم OSRM اختياري)
   ============================================================ */
let lmap = null, routeLayer = null, stMarker = null, curSno = null, lastM = null;
function viewMap() {
  return `
    <div class="map-wrap">
      <div class="map-side">
        <div class="map-search"><input id="mq" placeholder="ابحث عن محطة بالرقم أو الاسم…"></div>
        <div class="map-stat" id="mstat">⏳ تهيئة الخريطة…</div>
        <div class="map-results" id="mres"></div>
        <div class="map-tools" id="mtools" style="display:none">
          <select id="csel"></select>
          <div class="map-btns">
            <button class="btn" id="bNear">📍 الأقرب</button>
            <button class="btn ghost" id="bSel">المحدّد</button>
            <button class="btn ghost" id="bAll">22 مركز</button>
          </div>
          <button class="btn ghost" id="bExp">⤓ تصدير القياس</button>
        </div>
        <div class="route-info" id="rinfo"><h4>🛣️ قياس المسار</h4><p class="hint">اختر محطة لعرض مسافات الطرق المعتمدة ورسم المسار.</p></div>
      </div>
      <div id="leafmap"></div>
    </div>`;
}
function roadsOf(sno) {
  const r = RM.roads[sno]; if (!r) return null;
  return r.map(([ci, km]) => ({ name: RM.centers[ci], km })).sort((a, b) => a.km - b.km);
}
function haversine(a, b, c, d) {
  const R = 6371, dl = (c - a) * Math.PI / 180, dn = (d - b) * Math.PI / 180;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function waitL(cb, n) {
  n = n || 0;
  if (window.L) cb();
  else if (n < 50) setTimeout(() => waitL(cb, n + 1), 100);
  else $('#mstat').innerHTML = '⚠️ تعذّر تحميل مكتبة الخريطة — تحقق من الإنترنت.';
}
function initMap() {
  $('#csel').innerHTML = '<option value="">— اختر مركزاً —</option>' + RM.centers.map(c => `<option value="${c}">${c}</option>`).join('');
  fillRes('');
  $('#mq').oninput = e => fillRes(e.target.value);
  $('#bNear').onclick = () => measure(curSno, null);
  $('#bSel').onclick  = () => { const c = $('#csel').value; if (c && curSno) measure(curSno, c); };
  $('#bAll').onclick  = () => measureAll(curSno);
  $('#bExp').onclick  = exportM;
  $('#mstat').textContent = `✓ ${Object.keys(GEO).length} محطة · ${RM.centers.length} مركز — ابحث واختر محطة`;
  waitL(() => {
    if (lmap) { try { lmap.remove(); } catch (e) {} lmap = null; }
    try {
      lmap = L.map('leafmap', { zoomControl: true }).setView([23.8, 45], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(lmap);
      Object.entries(CENTERS).forEach(([nm, ll]) =>
        L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: '#db2f44', fillOpacity: 1 }).addTo(lmap).bindPopup('🏭 ' + nm));
      setTimeout(() => { try { lmap.invalidateSize(); } catch (e) {} }, 300);
    } catch (e) { $('#mstat').innerHTML = '⚠️ خطأ بالخريطة: ' + e.message; }
  });
}
function fillRes(q) {
  q = (q || '').trim().toLowerCase();
  let list = Object.entries(GEO);
  if (q) {
    list = list.filter(([code, s]) => (code + ' ' + s.n + ' ' + (s.city || '') + ' ' + (s.reg || '')).toLowerCase().includes(q));
    // ترتيب: تطابق الرقم أولاً، ثم الأكثر ردوداً
    list.sort((a, b) => {
      const am = a[0].startsWith(q) ? 0 : 1, bm = b[0].startsWith(q) ? 0 : 1;
      if (am !== bm) return am - bm;
      return (b[1].trips || 0) - (a[1].trips || 0);
    });
  } else {
    list.sort((a, b) => (b[1].trips || 0) - (a[1].trips || 0)); // الأكثر نشاطاً أولاً
  }
  const shown = list.slice(0, 40);
  $('#mres').innerHTML = shown.length ? shown.map(([code, s]) => {
    const road = roadsOf(code);
    const near = road && road[0] ? `${road[0].name} · ${num(road[0].km)}كم` : (s.near || '—');
    const gap = (s.avgKm && road && road[0]) ? s.avgKm - road[0].km : null;
    return `<div class="map-res" data-code="${code}">
      <div class="mr-top"><b>${code}</b> · ${s.n}</div>
      <div class="mr-meta"><span>📍 ${s.city || '—'}</span><span>🚚 ${num(s.trips || 0)} ردة</span><span>🧾 ${num(s.avgKm || 0)}كم</span></div>
      <div class="mr-near">أقرب مركز: ${near}${gap != null && Math.abs(gap) > 40 ? ` <em class="mr-gap">فرق ${gap >= 0 ? '+' : ''}${num(gap)}كم</em>` : ''}</div>
    </div>`;
  }).join('') : '<p class="hint" style="padding:8px">لا نتائج مطابقة</p>';
  if (!q && list.length > 40) $('#mres').insertAdjacentHTML('beforeend', `<p class="hint" style="padding:6px 8px">عرض أنشط 40 محطة — اكتب للبحث في الكل (${num(list.length)})</p>`);
  $$('#mres .map-res').forEach(d => d.onclick = () => selectStation(d.dataset.code));
}
function selectStation(code) {
  const s = GEO[code]; if (!s) return; curSno = code;
  $('#mtools').style.display = 'flex';
  waitL(() => {
    if (!lmap) return;
    if (stMarker) { try { lmap.removeLayer(stMarker); } catch (e) {} }
    stMarker = L.circleMarker([s.lat, s.lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#1B95D3', fillOpacity: 1 })
      .addTo(lmap).bindPopup(`⛽ ${code} · ${s.n}`).openPopup();
    lmap.setView([s.lat, s.lng], 9);
    setTimeout(() => { try { lmap.invalidateSize(); } catch (e) {} }, 150);
    measure(code, null);
  });
}
async function measure(code, centerName) {
  const s = GEO[code]; if (!s) return;
  const roads = roadsOf(code) || [];
  const target = centerName || (roads[0] ? roads[0].name : null);
  const cll = CENTERS[target];
  const roadRow = roads.find(r => r.name === target);
  const roadKm = roadRow ? roadRow.km : null;          // مسافة الطريق المعتمدة (مضمّنة)
  const billed = s.avgKm || 0;
  if (!cll) { $('#rinfo').innerHTML = `<h4>${code} · ${s.n}</h4><p class="hint">لا إحداثيات للمركز ${target}.</p>`; return; }
  // الأرقام جاهزة فوراً من البيانات المضمّنة
  lastM = { code, n: s.n, target, roadKm, billed, osrm: null };
  drawInfo(code, s, target, roadKm, billed, null, 'جارٍ رسم المسار الفعلي…');
  // رسم المسار: المعتمد المخزّن دائماً + محاولة OSRM للمسار المنحني
  if (routeLayer) { try { lmap.removeLayer(routeLayer); } catch (e) {} routeLayer = null; }
  let coords = null, osrmKm = null;
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 8000);
    const u = `https://router.project-osrm.org/route/v1/driving/${s.lng},${s.lat};${cll[1]},${cll[0]}?overview=full&geometries=geojson`;
    const j = await fetch(u, { signal: ctl.signal }).then(r => r.json()); clearTimeout(to);
    if (j.routes && j.routes[0]) { osrmKm = j.routes[0].distance / 1000; coords = j.routes[0].geometry.coordinates.map(c => [c[1], c[0]]); }
  } catch (e) {}
  if (coords) { routeLayer = L.polyline(coords, { color: '#1B95D3', weight: 5, opacity: .85 }).addTo(lmap); try { lmap.fitBounds(routeLayer.getBounds(), { padding: [50, 50] }); } catch (e) {} }
  else { routeLayer = L.polyline([[s.lat, s.lng], cll], { color: '#888', weight: 3, dashArray: '6' }).addTo(lmap); }
  lastM.osrm = osrmKm != null ? Math.round(osrmKm) : null;
  drawInfo(code, s, target, roadKm, billed, osrmKm, coords ? null : 'تعذّر رسم المسار الفعلي (OSRM) — عُرض خط مباشر. الأرقام المعتمدة أعلاه صحيحة.');
}
function drawInfo(code, s, target, roadKm, billed, osrmKm, msg) {
  // الفرق بين المفوتر (من ملف الفواتير) ومسافة الطريق المعتمدة
  const gap = (billed != null && roadKm != null) ? billed - roadKm : null;
  let billFlag = '';
  if (gap != null && Math.abs(gap) > 40)
    billFlag = `<div class="ri-flag ri-warn">⚠️ المفوتر يزيد عن مسافة الطريق بـ ${sar(Math.abs(gap))} كم — فرق يستحق المراجعة.</div>`;
  else if (gap != null)
    billFlag = `<div class="ri-flag ri-ok">✓ المفوتر قريب من مسافة الطريق المعتمدة.</div>`;
  let osrmFlag = '';
  if (osrmKm != null && roadKm != null && Math.abs(osrmKm - roadKm) > 40)
    osrmFlag = `<div class="ri-flag ri-warn">⚠️ مسافة المرجع (${sar(roadKm)} كم) تختلف عن الطريق الفعلي (${sar(osrmKm)} كم) — راجع مرجع هذه المحطة.</div>`;
  $('#rinfo').innerHTML = `
    <h4>🛣️ ${code} · ${s.n}</h4>
    <div class="ri-row"><span>المركز الهدف</span><b>${target}</b></div>
    <div class="ri-row"><span>📏 مسافة الطريق المعتمدة</span><b>${sar(roadKm)} كم</b></div>
    <div class="ri-row"><span>🧾 المفوتر من ملف الفواتير</span><b>${sar(billed)} كم</b></div>
    <div class="ri-row"><span>الفرق (مفوتر − طريق)</span><b class="${gap != null && Math.abs(gap) > 40 ? 'crit-num' : ''}">${gap != null ? (gap >= 0 ? '+' : '') + sar(gap) + ' كم' : '—'}</b></div>
    ${osrmKm != null ? `<div class="ri-row"><span>الطريق الفعلي (OSRM)</span><b>${sar(osrmKm)} كم</b></div>` : ''}
    ${billFlag}${osrmFlag}${msg ? `<p class="hint" style="margin-top:8px">${msg}</p>` : ''}`;
}
function measureAll(code) {
  const s = GEO[code]; if (!s) return;
  const roads = roadsOf(code);
  if (!roads) { $('#rinfo').innerHTML = `<h4>${code} · ${s.n}</h4><p class="hint">لا مصفوفة طرق لهذه المحطة بالمرجع.</p>`; return; }
  lastM = { code, n: s.n, target: roads[0].name + ' (الأقرب)', roadKm: roads[0].km, billed: s.avgKm || 0, osrm: null, all: roads };
  $('#rinfo').innerHTML = `
    <h4>📍 ${code} · ${s.n} — كل المراكز</h4>
    <p class="hint">مسافات الطرق المعتمدة لكل مركز (مرتّبة). اضغط «ارسم» لأي مركز.</p>
    <div style="max-height:320px;overflow-y:auto"><table class="all-tbl"><thead><tr><th class="txt">المركز</th><th>كم طرق</th><th>ارسم</th></tr></thead><tbody>
      ${roads.map((r, i) => `<tr class="${i === 0 ? 'near' : ''}"><td class="txt">${r.name}</td><td>${sar(r.km)}</td><td><span class="mbtn" data-c="${r.name}">ارسم</span></td></tr>`).join('')}
    </tbody></table></div>`;
  $$('#rinfo .mbtn').forEach(b => b.onclick = () => measure(code, b.dataset.c));
}
function exportM() {
  if (!lastM) { alert('اختر محطة وقِسها أولاً'); return; }
  const s = GEO[lastM.code]; const roads = roadsOf(lastM.code) || [];
  const near = roads[0] ? roads[0].name : '';
  const head = ['رقم المحطة', 'اسم المحطة', 'المركز المقيس', 'كم طرق معتمد', 'كم مفوتر (فاتورة)', 'الفرق', 'كم OSRM', 'أقرب مركز', 'كم الأقرب'];
  const gap = (lastM.billed != null && lastM.roadKm != null) ? lastM.billed - lastM.roadKm : '';
  const main = [lastM.code, `"${lastM.n}"`, `"${lastM.target}"`, lastM.roadKm != null ? lastM.roadKm : '', lastM.billed, gap, lastM.osrm != null ? lastM.osrm : '', `"${near}"`, roads[0] ? roads[0].km : ''];
  const lines = [head.join(','), main.join(',')];
  if (lastM.all) { lines.push(''); lines.push('المركز,كم طرق'); lastM.all.forEach(r => lines.push(`"${r.name}",${r.km}`)); }
  csvRaw(lines, 'قياس_' + lastM.code + '.csv');
}

/* ============================================================
   5) تحليل النقليات
   ============================================================ */
function viewTrips() {
  const prods = Object.entries(AGG.byProduct).sort((a, b) => b[1].trips - a[1].trips);
  const origins = Object.entries(AGG.byOrigin).sort((a, b) => b[1].trips - a[1].trips);
  const prodRows = prods.map(([p, o]) => `<tr><td class="txt"><b>${p}</b></td><td class="n">${sar(o.trips)}</td><td class="n">${sar(o.rate)}</td><td class="n">${sar(o.amt)}</td></tr>`).join('');
  const orgRows = origins.map(([k, o]) => `<tr><td class="txt"><b>${k}</b></td><td class="n">${sar(o.trips)}</td><td class="n">${sar(o.alerts)}</td><td class="n">${sar(o.amt)}</td><td class="n ${o.waste > 0 ? 'crit-num' : ''}">${o.waste > 0 ? sar(o.waste) : '—'}</td></tr>`).join('');
  return `
    <div class="grid2">
      <div class="card"><h4>⛽ الردود حسب المنتج</h4><div class="tbl-wrap" style="box-shadow:none;border:none"><table class="t" style="min-width:auto">
        <thead><tr><th class="txt">المنتج</th><th class="n">الردود</th><th class="n">متوسط سعر الردة</th><th class="n">الإجمالي ر.س</th></tr></thead><tbody>${prodRows}</tbody></table></div></div>
      <div class="card"><h4>🚏 الردود حسب المركز</h4>${bars(origins.map(([k, o]) => ({ nm: k, v: o.trips })), 'linear-gradient(90deg,#15a075,#3fbf97)')}</div>
    </div>
    <div class="card"><h4>🏭 ملخص مراكز الانطلاق</h4><div class="tbl-wrap" style="box-shadow:none;border:none"><table class="t">
      <thead><tr><th class="txt">المركز</th><th class="n">الردود</th><th class="n">ردود تنبيه</th><th class="n">الإجمالي ر.س</th><th class="n">الهدر ر.س</th></tr></thead><tbody>${orgRows}</tbody></table></div></div>`;
}

/* ============================================================
   6) التوزيع والالتزام
   ============================================================ */
function viewCompliance() {
  const t = AGG.tiers; const total = Object.values(t).reduce((a, b) => a + b, 0);
  const kpis = kpiRow([
    { ic: '🔴', v: sar(t['عالي'] || 0), l: 'تصنيف عالي (هدر ≥ 5000)', cls: 'crit' },
    { ic: '🟠', v: sar(t['متوسط'] || 0), l: 'تصنيف متوسط', cls: 'warn' },
    { ic: '🔵', v: sar(t['منخفض'] || 0), l: 'تصنيف منخفض' },
    { ic: '🟢', v: sar(t['سليم'] || 0), l: 'سليمة بالكامل', cls: 'ok' },
  ]);
  const segs = [
    { n: 'عالي', v: t['عالي'] || 0, c: '#dc2f44' }, { n: 'متوسط', v: t['متوسط'] || 0, c: '#dd8a08' },
    { n: 'منخفض', v: t['منخفض'] || 0, c: '#3a8dc4' }, { n: 'سليم', v: t['سليم'] || 0, c: '#15a075' },
    { n: 'ناقصة', v: t['ناقصة'] || 0, c: '#9a7fd1' }, { n: 'مستثناة', v: t['مستثناة'] || 0, c: '#b9c6d2' },
  ].filter(s => s.v > 0);
  const bands = Object.entries(AGG.bandsDist).filter(([k]) => k !== '0').map(([k, v]) => ({ nm: k === '6' ? '+6 فأكثر' : '+' + k + ' شريحة', v }));
  return kpis + `
    <div class="grid2">
      <div class="card"><h4>🎯 تصنيف المحطات حسب الهدر</h4>${donut(segs, total, sar(total))}
        <p class="hint" style="margin-top:12px">عالي ≥ 5000 ر.س، متوسط ≥ 1000، منخفض &gt; 0، سليم = 0. «ناقصة» خارج المرجع، «مستثناة» نجران.</p></div>
      <div class="card"><h4>📶 توزيع تجاوز الشرائح (عدد الردود)</h4>${bars(bands, 'linear-gradient(90deg,#dd8a08,#f0b44a)')}
        <p class="hint" style="margin-top:12px">كل شريحة = 50 كم. التجاوز = الفرق بين شريحة المسافة الفعلية وشريحة أقرب مركز.</p></div>
    </div>`;
}

/* ============================================================
   7) جودة البيانات
   ============================================================ */
/* ============================================================
   مركز التدقيق المحاسبي — تحليل الخبير
   ============================================================ */
function auditAnalyze() {
  // تجميع تحليلي من المحطات المُقاسة
  const benched = Object.entries(STATIONS).filter(([, s]) => s.cov === 'benchmark');
  let wFar = 0, wPover = 0, wTaifResid = 0;     // الهدر حسب السبب
  const reroute = [];                            // فرص إعادة التوجيه
  const anomalies = { pover: [], bigjump: [] };  // الشذوذ
  const reportRows = [];                         // التقرير الرسمي

  for (const [sno, s] of benched) {
    if (s.waste <= 0 && !s.byO.some(o => o.pover)) continue;
    let causeFar = 0, causePover = 0;
    for (const o of s.byO) {
      if (o.pover) { causePover += o.waste; anomalies.pover.push({ sno, nm: s.nm, org: o.orgA, rate: o.rate, km: o.kmTrip }); }
      else if (o.bands > 0) causeFar += o.waste;
      if (o.bands >= 3) anomalies.bigjump.push({ sno, nm: s.nm, org: o.orgA, bands: o.bands, kmTrip: o.kmTrip, kmRoad: o.kmRoad, waste: o.waste });
    }
    wFar += causeFar; wPover += causePover; if (s.taifFix) wTaifResid += s.waste;
    // السبب الرئيسي
    let cause = 'توريد من مركز أبعد', cls = 'c-far';
    if (causePover > causeFar) { cause = 'تجاوز سعري (أعلى من الجدول)'; cls = 'c-pov'; }
    // التوصية
    let rec = `إعادة التوجيه إلى ${s.bench} (${ltr(s.benchD)}كم)`;
    if (cls === 'c-pov') rec = 'مراجعة سعر الفاتورة مقابل جدول الشريحة';
    reportRows.push({ sno: +sno, nm: s.nm, city: s.city, actual: s.actual, should: s.should, waste: s.waste, bench: s.bench, benchD: s.benchD, cause, cls, rec, taifFix: s.taifFix });
    if (s.waste > 0) reroute.push({ sno: +sno, nm: s.nm, bench: s.bench, saving: s.waste });
  }
  reportRows.sort((a, b) => b.waste - a.waste);
  reroute.sort((a, b) => b.saving - a.saving);
  anomalies.pover.sort((a, b) => b.rate - a.rate);
  anomalies.bigjump.sort((a, b) => b.waste - a.waste);
  const totalReroute = reroute.reduce((t, r) => t + r.saving, 0);
  return { reportRows, wFar, wPover, wTaifResid, reroute, totalReroute, anomalies };
}

// سجل الأشهر (للمقارنة) — يُحفظ محلياً في المتصفح
function auditHistory(save) {
  let hist = [];
  try { hist = JSON.parse(localStorage.getItem('aldrees_hist') || '[]'); } catch (e) { hist = []; }
  if (save) {
    const snap = { period: AGG.period, actual: AGG.actual, should: AGG.should, waste: AGG.waste, wastePct: AGG.wastePct, compliance: AGG.compliance, total: AGG.total, ts: Date.now() };
    const i = hist.findIndex(h => h.period === snap.period);
    if (i >= 0) hist[i] = snap; else hist.push(snap);
    try { localStorage.setItem('aldrees_hist', JSON.stringify(hist)); } catch (e) {}
  }
  return hist;
}

/* ============================================================
   مخزن الفترات: يحفظ النتيجة الكاملة لكل فاتورة للتبديل بينها وتصديرها
   ============================================================ */
const PERIODS = {};   // period -> { AGG, STATIONS, GEO_trips }
const ARMONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

// اكتشاف الفترة من اسم الملف: MMYYYY (مثل 052026) أو YYYYMM
function detectPeriod(filename) {
  const name = filename || '';
  let mth, yr, m;
  if ((m = name.match(/(\d{2})(\d{4})/)) && +m[1] >= 1 && +m[1] <= 12) { mth = +m[1]; yr = +m[2]; }
  else if ((m = name.match(/(\d{4})(\d{2})/)) && +m[2] >= 1 && +m[2] <= 12) { yr = +m[1]; mth = +m[2]; }
  return (mth && yr) ? `${ARMONTHS[mth - 1]} ${yr}` : '';
}
function snapshotGeoTrips() {
  const g = {};
  for (const sno in GEO) if (GEO[sno].trips != null) g[sno] = { trips: GEO[sno].trips, avgKm: GEO[sno].avgKm };
  return g;
}
function loadPeriodsStore() {
  try { const raw = JSON.parse(localStorage.getItem('aldrees_periods') || '{}'); for (const k in raw) PERIODS[k] = raw[k]; } catch (e) {}
}
function persistPeriods() {
  try { localStorage.setItem('aldrees_periods', JSON.stringify(PERIODS)); return true; } catch (e) { return false; }
}
function savePeriod(period, res) {
  PERIODS[period] = { AGG: res.AGG, STATIONS: res.STATIONS, GEO_trips: res.GEO_trips || {} };
  const ok = persistPeriods();
  refreshPeriodSel();
  return ok;
}
function switchPeriod(period) {
  const p = PERIODS[period]; if (!p) return;
  for (const sno in GEO) GEO[sno].trips = 0;   // صفّر تراكب الخريطة ثم طبّق فترة الهدف
  applyAudit({ AGG: p.AGG, STATIONS: p.STATIONS, GEO_trips: p.GEO_trips });
  refreshPeriodSel();
}
function refreshPeriodSel() {
  const sel = $('#periodSel'); if (!sel) return;
  const names = Object.keys(PERIODS);
  if (names.length < 1) { sel.style.display = 'none'; return; }
  sel.style.display = '';
  sel.innerHTML = names.map(n => `<option value="${n}"${n === AGG.period ? ' selected' : ''}>${n}</option>`).join('');
}
// تصدير تقرير محطات فترة مخزّنة (من المقارنة الشهرية)
function exportPeriod(period) {
  const p = PERIODS[period];
  if (!p || !p.STATIONS) { alert(`تفاصيل «${period}» غير محفوظة في هذا المتصفح — افتحها بتبديل الفترة أولاً، أو أعد رفع فاتورتها.`); return; }
  const head = ['رقم المحطة', 'اسم المحطة', 'المدينة', 'المنطقة', 'الحالة', 'الردود', 'مركز الانطلاق', 'كل مراكز الانطلاق', 'الفعلي', 'الواجب', 'الفجوة (هدر)', 'التصنيف', 'المركز الأقرب الموصى به', 'كم الطريق الموصى'];
  const rows = Object.entries(p.STATIONS).map(([sno, o]) => {
    const org = originInfo(o);
    return [sno, `"${o.nm || ''}"`, `"${o.city || ''}"`, `"${o.reg || ''}"`, `"${covAr(o.cov)}"`, o.trips || 0, `"${org.main}"`, `"${org.all}"`, Math.round(o.actual || 0), Math.round(o.should || 0), Math.round(o.waste || 0), `"${o.tier || ''}"`, `"${o.bench || ''}"`, o.benchD != null ? o.benchD : ''];
  });
  const csvTxt = '﻿' + [head.join(','), ...rows.map(r => r.join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csvTxt], { type: 'text/csv;charset=utf-8' }));
  a.download = `تقرير_${period}.csv`; a.click();
}
// حذف فترة من المقارنة والمخزن (لإزالة الصفوف المكرّرة/القديمة)
function deletePeriod(period) {
  if (!confirm(`حذف «${period}» نهائياً من المقارنة والفواتير المحفوظة؟`)) return;
  let hist = [];
  try { hist = JSON.parse(localStorage.getItem('aldrees_hist') || '[]'); } catch (e) {}
  hist = hist.filter(h => h.period !== period);
  try { localStorage.setItem('aldrees_hist', JSON.stringify(hist)); } catch (e) {}
  delete PERIODS[period];
  persistPeriods();
  refreshPeriodSel();
  if (PAGE === 'audit') { const c = $('#content'); c.innerHTML = viewAudit(); wireAudit(); const tb = $('.atab[data-at="trend"]'); if (tb) tb.click(); }
}

/* ============================================================
   خطة العمل حسب الفترات — صفحة مستقلة
   خطة معالجة مرحلية بأثر مالي محسوب + متابعة الاتجاه عبر الأشهر
   ============================================================ */
function viewPlan() {
  const A = auditAnalyze();
  const L = AGG.loadEff || { consolSaving: 0, consolGroups: 0, consolTrips: 0, consolAnnual: 0 };
  const hist = auditHistory(true); // احفظ ملخّص الفترة الحالية لتظهر في المسار الزمني فوراً

  const monthly = (A.totalReroute || 0) + (L.consolSaving || 0);
  const annual = monthly * 12 + (A.wPover || 0);
  const targetWaste = Math.max(0, AGG.waste - (A.totalReroute || 0));
  const wasteCut = AGG.waste ? Math.round(100 * (A.totalReroute || 0) / AGG.waste) : 0;

  const hero = `<div class="plan-hero">
    <h3>خطة معالجة الهدر — ${AGG.period}</h3>
    <p>خطة عمل مرحلية مرتّبة حسب الأولوية والأثر المالي، مبنية على نتائج تدقيق الفترة الحالية. كل مرحلة محسوبة بالريال مع مسؤول وإطار زمني مقترح، وقابلة للمتابعة عبر الفترات.</p>
    <div class="ph-period">📅 الفترة: ${AGG.period} · ${num(AGG.total)} ردة مدققة</div>
  </div>`;

  const kpis = `<div class="plan-kpis">
    <div class="pk k-save"><div class="pk-l">وفر فوري — إعادة التوجيه</div><div class="pk-v">${num(A.totalReroute)}</div><div class="pk-s">ر.س / شهر · ${A.reroute.length} محطة</div></div>
    <div class="pk k-recover"><div class="pk-l">قابل للاسترداد — تصحيح سعري</div><div class="pk-v">${num(A.wPover)}</div><div class="pk-s">ر.س · ${A.anomalies.pover.length} حالة</div></div>
    <div class="pk k-annual"><div class="pk-l">الأثر السنوي المقدّر</div><div class="pk-v">${num(annual)}</div><div class="pk-s">ر.س / سنة عند الالتزام بالخطة</div></div>
    <div class="pk k-target"><div class="pk-l">خفض الهدر المستهدف</div><div class="pk-v">${wasteCut}%</div><div class="pk-s">من ${sar(AGG.waste)} إلى ${sar(targetWaste)}</div></div>
  </div>`;

  let strip;
  if (hist.length) {
    const items = hist.map((h, i) => {
      const prev = hist[i - 1];
      let d = '<span class="ps-d ps-flat">— الأساس</span>';
      if (prev) {
        const diff = h.waste - prev.waste;
        if (diff < 0) d = `<span class="ps-d ps-down">▼ ${num(Math.abs(diff))}</span>`;
        else if (diff > 0) d = `<span class="ps-d ps-up">▲ ${num(diff)}</span>`;
        else d = '<span class="ps-d ps-flat">= ثابت</span>';
      }
      const cur = h.period === AGG.period ? ' cur' : '';
      return `<div class="pstep${cur}"><div class="ps-p">${h.period}</div><div class="ps-w">${num(h.waste)} <small style="font-size:10px;color:var(--muted);font-weight:500">ر.س هدر</small></div><div class="ps-c">التزام ${h.compliance}% · ${num(h.total)} ردة</div>${d}</div>`;
    }).join('');
    strip = `<div class="card"><h4 style="margin-bottom:4px">مسار الأداء عبر الفترات</h4>
      <p class="hint" style="margin:2px 0 12px">كل فترة تُحفظ تلقائياً عند رفع فاتورتها. السهم يقارن الهدر بالفترة السابقة.</p>
      <div class="period-strip">${items}</div></div>`;
  } else {
    strip = `<div class="card"><div class="plan-empty">لا فترات محفوظة بعد — ستظهر هنا تلقائياً عند رفع فواتير الأشهر لبناء خط زمني للمقارنة والاتجاه.</div></div>`;
  }

  const top5 = A.reroute.slice(0, 5);
  const phase1 = `<div class="phase p-urgent">
    <div class="phase-hd"><div class="phase-num">١</div>
      <div class="phase-t"><h4>إعادة توجيه التوريد لأقرب مركز</h4><div class="ph-meta">عاجل · أثر مباشر بلا تكلفة إضافية · المسؤول: إدارة التشغيل والتوريد</div></div>
      <div class="phase-impact"><div class="pi-v">${num(A.totalReroute)}</div><div class="pi-l">ر.س / شهر</div></div></div>
    <div class="phase-body">
      <div class="phase-meta-row">
        <span class="pchip">محطات للمعالجة: <b>${A.reroute.length}</b></span>
        <span class="pchip">الإطار الزمني: <b>٣٠ يومًا</b></span>
        <span class="pchip">الأثر السنوي: <b>${num(A.totalReroute * 12)}</b> ر.س</span>
      </div>
      ${top5.length ? `<div class="tbl-wrap"><table class="dt"><thead><tr><th class="txt">المحطة</th><th class="txt">المركز الأقرب الموصى به</th><th class="n">وفر شهري</th></tr></thead><tbody>
        ${top5.map(r => `<tr class="rowlink" data-sno="${r.sno}"><td class="txt"><b>${r.sno}</b> ${r.nm}</td><td class="txt">${r.bench}</td><td class="n">${sar(r.saving)}</td></tr>`).join('')}
      </tbody></table></div>${A.reroute.length > 5 ? `<p class="hint" style="margin-top:8px">أعلى 5 من ${A.reroute.length} محطة — التفاصيل الكاملة في مركز التدقيق المحاسبي.</p>` : ''}` : '<p class="hint" style="margin:0">لا فرص إعادة توجيه في هذه الفترة. ✓</p>'}
    </div></div>`;

  const phase2 = `<div class="phase p-recover">
    <div class="phase-hd"><div class="phase-num">٢</div>
      <div class="phase-t"><h4>تصحيح التجاوزات السعرية ومطالبة المورّد</h4><div class="ph-meta">استرداد · مراجعة تعاقدية · المسؤول: إدارة العقود والمشتريات</div></div>
      <div class="phase-impact"><div class="pi-v">${num(A.wPover)}</div><div class="pi-l">ر.س قابلة للاسترداد</div></div></div>
    <div class="phase-body"><div class="phase-meta-row">
      <span class="pchip">حالات سعرية: <b>${A.anomalies.pover.length}</b></span>
      <span class="pchip">الإطار الزمني: <b>٦٠ يومًا</b></span>
      <span class="pchip">الإجراء: <b>مطالبة بالفرق أو تصحيح التعرفة</b></span>
    </div><p class="hint" style="margin:0">${A.anomalies.pover.length ? `فُوتِرت ${A.anomalies.pover.length} حالة بأعلى من سعر جدول الشريحة — راجع تبويب «كشف الشذوذ» في مركز التدقيق لتفاصيل كل حالة.` : 'لا تجاوزات سعرية مرصودة في هذه الفترة. ✓'}</p>
    </div></div>`;

  const phase3 = `<div class="phase p-improve">
    <div class="phase-hd"><div class="phase-num">٣</div>
      <div class="phase-t"><h4>تحسين كفاءة الحمولة ودمج الردود</h4><div class="ph-meta">تحسين تشغيلي · يحتاج تأكيد جدولة · المسؤول: التخطيط اللوجستي</div></div>
      <div class="phase-impact"><div class="pi-v">${num(L.consolSaving)}</div><div class="pi-l">ر.س / شهر (محتمل)</div></div></div>
    <div class="phase-body"><div class="phase-meta-row">
      <span class="pchip">مجموعات قابلة للدمج: <b>${num(L.consolGroups)}</b></span>
      <span class="pchip">ردود مشمولة: <b>${num(L.consolTrips)}</b></span>
      <span class="pchip">الأثر السنوي: <b>${num(L.consolAnnual)}</b> ر.س</span>
    </div><p class="hint" style="margin:0">دمج الردود الصغيرة في ناقلات أكبر ضمن سعة خزان كل محطة — فرصة تحتاج تأكيداً تشغيلياً قبل التنفيذ. التفاصيل في تبويب «كفاءة الحمولة».</p>
    </div></div>`;

  return `<div class="plan-wrap">${hero}${kpis}${strip}${phase1}${phase2}${phase3}</div>`;
}
function wirePlan() {
  $$('.plan-wrap .rowlink').forEach(r => r.onclick = () => openModal(+r.dataset.sno));
}

/* ============================================================
   إدارة المستخدمين — للمدير فقط
   ============================================================ */
let _editUid = null;   // معرّف المستخدم الجاري تعديله (null = إضافة جديد)
function fmtDT(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const t = d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    const dt = d.toLocaleDateString('en-GB');
    return `<span class="ltr">${dt} · ${t}</span>`;
  } catch (e) { return '—'; }
}
function viewUsers() {
  if (!auth.isAdmin()) return `<div class="card"><div class="plan-empty">هذه الصفحة للمدير فقط.</div></div>`;
  const users = auth.listUsers();
  const online = users.filter(u => auth.isOnline(u)).length;
  const roleAr = r => r === 'admin' ? 'مدير' : 'مستخدم';
  const permAr = u => (u.role === 'admin' || u.canExport) ? '<span class="perm-badge perm-exp">عرض + تصدير</span>' : '<span class="perm-badge perm-view">عرض فقط</span>';
  const modeNote = auth.mode === 'local'
    ? '<span class="mode-chip mode-local">وضع محلّي — الحضور على هذا المتصفح فقط. لتفعيل الحضور الحقيقي عبر الأجهزة اربط Supabase.</span>'
    : '<span class="mode-chip mode-live">متصل بالخادم — حضور حيّ عبر الأجهزة.</span>';

  const rows = users.map(u => {
    const on = auth.isOnline(u);
    return `<tr>
      <td class="txt"><b>${u.name || '—'}</b><div class="sub2">${u.username}</div></td>
      <td class="txt">${u.position || '—'}<div class="sub2">${u.department || ''}</div></td>
      <td class="txt"><span class="role-badge ${u.role === 'admin' ? 'role-admin' : ''}">${roleAr(u.role)}</span></td>
      <td class="txt">${permAr(u)}</td>
      <td class="txt"><span class="pres ${on ? 'pres-on' : 'pres-off'}">${on ? 'متصل الآن' : 'غير متصل'}</span>${u.active ? '' : ' <span class="perm-badge" style="background:var(--crit-bg);color:var(--crit)">موقوف</span>'}</td>
      <td class="n">${fmtDT(u.lastLogin)}</td>
      <td class="n">${fmtDT(u.lastLogout)}</td>
      <td class="n"><span style="display:inline-flex;gap:5px;justify-content:flex-end">
        <button class="btn ghost sm u-edit" data-id="${u.id}">تعديل</button>
        <button class="btn ghost sm u-del" data-id="${u.id}" title="حذف">🗑</button>
      </span></td>
    </tr>`;
  }).join('');

  const form = `<div class="card u-form" id="uForm" hidden>
    <h4 id="uFormTitle">إضافة مستخدم جديد</h4>
    <div class="u-grid">
      <label>الاسم<input id="uf_name" type="text" placeholder="الاسم الكامل"></label>
      <label>اسم المستخدم<input id="uf_username" type="text" placeholder="مثل: saad" dir="ltr" autocomplete="off"></label>
      <label>كلمة المرور<input id="uf_pw" type="text" placeholder="٦ أحرف على الأقل" dir="ltr"><span class="uf-hint" id="uf_pwHint"></span></label>
      <label>المنصب<input id="uf_pos" type="text" placeholder="مثل: محلّل تدقيق"></label>
      <label>القسم<input id="uf_dep" type="text" placeholder="مثل: المالية"></label>
      <label>الدور<select id="uf_role"><option value="user">مستخدم</option><option value="admin">مدير (كل الصلاحيات)</option></select></label>
      <label class="u-check"><input id="uf_exp" type="checkbox"> يقدر يصدّر الملفات والتقارير</label>
      <label class="u-check"><input id="uf_act" type="checkbox" checked> الحساب مُفعّل</label>
    </div>
    <div class="u-form-err" id="uf_err"></div>
    <div class="u-form-actions">
      <button class="btn up" id="uf_save">حفظ</button>
      <button class="btn ghost" id="uf_cancel">إلغاء</button>
    </div>
  </div>`;

  return `<div class="users-wrap">
    <div class="card"><div class="card-hd">
      <div><h3 style="font-family:var(--disp);color:var(--navy);font-size:16px">المستخدمون (${users.length})</h3>
      <p class="hint" style="margin:4px 0 0">${online} متصل الآن · ${modeNote}</p></div>
      <button class="btn up" id="uAdd">➕ إضافة مستخدم</button>
    </div></div>
    ${form}
    <div class="card"><div class="tbl-wrap"><table class="dt"><thead><tr>
      <th class="txt">المستخدم</th><th class="txt">المنصب / القسم</th><th class="txt">الدور</th><th class="txt">الصلاحية</th><th class="txt">الحالة</th><th class="n">آخر دخول</th><th class="n">آخر خروج</th><th class="n">إجراءات</th>
    </tr></thead><tbody>${rows}</tbody></table></div></div>
  </div>`;
}
function openUserForm(u) {
  _editUid = u ? u.id : null;
  $('#uFormTitle').textContent = u ? 'تعديل مستخدم' : 'إضافة مستخدم جديد';
  $('#uf_name').value = u ? (u.name || '') : '';
  $('#uf_username').value = u ? u.username : '';
  $('#uf_pw').value = '';
  $('#uf_pwHint').textContent = u ? '(اتركها فارغة للإبقاء على الحالية)' : '';
  $('#uf_pos').value = u ? (u.position || '') : '';
  $('#uf_dep').value = u ? (u.department || '') : '';
  $('#uf_role').value = u ? u.role : 'user';
  $('#uf_exp').checked = u ? !!u.canExport : false;
  $('#uf_act').checked = u ? u.active !== false : true;
  $('#uf_err').textContent = '';
  $('#uForm').hidden = false;
  $('#uForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function wireUsers() {
  if (!auth.isAdmin()) return;
  const add = $('#uAdd'); if (add) add.onclick = () => openUserForm(null);
  $$('.u-edit').forEach(b => b.onclick = () => { const u = auth.listUsers().find(x => x.id === b.dataset.id); if (u) openUserForm(u); });
  $$('.u-del').forEach(b => b.onclick = async () => {
    const u = auth.listUsers().find(x => x.id === b.dataset.id); if (!u) return;
    if (!confirm(`حذف المستخدم «${u.name || u.username}» نهائياً؟`)) return;
    const r = await auth.deleteUser(b.dataset.id);
    if (!r.ok) return alert(r.error);
    render('users');
  });
  const cancel = $('#uf_cancel'); if (cancel) cancel.onclick = () => { $('#uForm').hidden = true; _editUid = null; };
  const save = $('#uf_save'); if (save) save.onclick = async () => {
    const data = {
      name: $('#uf_name').value, username: $('#uf_username').value, password: $('#uf_pw').value,
      position: $('#uf_pos').value, department: $('#uf_dep').value,
      role: $('#uf_role').value, canExport: $('#uf_exp').checked, active: $('#uf_act').checked,
    };
    let r;
    if (_editUid) {
      const patch = { name: data.name, username: data.username, position: data.position, department: data.department, role: data.role, canExport: data.canExport, active: data.active };
      if (data.password) patch.password = data.password;
      r = await auth.updateUser(_editUid, patch);
    } else {
      r = await auth.createUser(data);
    }
    if (!r.ok) { $('#uf_err').textContent = '✕ ' + r.error; return; }
    _editUid = null;
    render('users');
  };
}

function viewAudit() {
  const A = auditAnalyze();
  const sav = (n) => `<b style="color:var(--ok)">${sar(n)}</b>`;
  // رأس الصفحة: ملخص تنفيذي
  const head = `
  <div class="audit-exec">
    <div class="ae-card"><div class="ae-l">إجمالي الهدر المرصود ${infoDot('الهدر')}</div><div class="ae-v crit-num">${sar(AGG.waste)}</div><div class="ae-s">${AGG.wastePct}% من الفعلي</div></div>
    <div class="ae-card"><div class="ae-l">وفر محتمل بإعادة التوجيه</div><div class="ae-v" style="color:var(--ok)">${sar(A.totalReroute)}</div><div class="ae-s">${A.reroute.length} محطة قابلة للمعالجة</div></div>
    <div class="ae-card"><div class="ae-l">التزام التوريد ${infoDot('الالتزام')}</div><div class="ae-v">${AGG.compliance}%</div><div class="ae-s">${num(AGG.ok)} ردة مطابقة</div></div>
    <div class="ae-card"><div class="ae-l">حالات تستحق المراجعة</div><div class="ae-v">${num(A.anomalies.pover.length + A.anomalies.bigjump.length)}</div><div class="ae-s">شذوذ سعري + قفزات</div></div>
  </div>`;
  // أزرار الأقسام
  const tabs = `
  <div class="audit-tabs">
    <button class="atab active" data-at="report">📋 التقرير الرسمي</button>
    <button class="atab" data-at="root">🔍 أسباب الهدر</button>
    <button class="atab" data-at="rec">💡 توصيات المعالجة</button>
    <button class="atab" data-at="anom">⚠️ كشف الشذوذ</button>
    <button class="atab" data-at="load">⚖️ كفاءة الحمولة</button>
    <button class="atab" data-at="trend">📈 المقارنة الشهرية</button>
  </div>`;

  // 1) التقرير الرسمي
  const report = `<div class="apane" data-pane="report">
    <div class="card"><div class="card-hd"><h3>تقرير التدقيق الرسمي — ${AGG.period}</h3><button class="btn ghost sm" id="expAudit">⤓ تصدير التقرير</button></div>
    <p class="hint" style="margin:0 0 12px">قائمة المحطات ذات الهدر، مرتّبة تنازلياً. كل صف: المعيار (الواجب) مقابل الفعلي، الفجوة، السبب، والتوصية — جاهزة للأرشفة أو المطالبة.</p>
    <div class="tbl-wrap"><table class="dt"><thead><tr><th class="txt">المحطة</th><th class="n">الفعلي ${infoDot('الفعلي')}</th><th class="n">الواجب ${infoDot('الواجب')}</th><th class="n">الفجوة (هدر) ${infoDot('الهدر')}</th><th class="txt">السبب</th><th class="txt">التوصية</th></tr></thead><tbody>
      ${A.reportRows.slice(0, 60).map(r => `<tr class="rowlink" data-sno="${r.sno}"><td class="txt"><b>${r.sno}</b> ${r.nm}${r.taifFix ? ' <span class="tag-taif">سيل</span>' : ''}<div class="sub2">${r.city || ''}</div></td>
        <td class="n">${sar(r.actual)}</td><td class="n">${sar(r.should)}</td><td class="n crit-num">${sar(r.waste)}</td>
        <td class="txt"><span class="cause ${r.cls}">${r.cause}</span></td><td class="txt sub2">${r.rec}</td></tr>`).join('')}
    </tbody></table></div>
    ${A.reportRows.length > 60 ? `<p class="hint" style="margin-top:10px">عرض أعلى 60 محطة — التصدير يشمل الكل (${num(A.reportRows.length)})</p>` : ''}
    </div></div>`;

  // 2) أسباب الهدر
  const totCause = Math.max(A.wFar + A.wPover, 1);
  const root = `<div class="apane" data-pane="root" hidden>
    <div class="card"><h3>تحليل أسباب الهدر (Root Cause)</h3>
    <p class="hint" style="margin:6px 0 16px">تفكيك الهدر إلى مصادره الجذرية لتوجيه المعالجة نحو السبب الأكبر.</p>
    ${causeBar('توريد من مركز أبعد من اللازم', A.wFar, totCause, '#c0392b', 'الشاحنة انطلقت من مركز أبعد، فدخلت شريحة سعرية أعلى. المعالجة: إعادة توجيه التوريد لأقرب مركز.')}
    ${causeBar('تجاوز سعري (أعلى من الجدول)', A.wPover, totCause, '#b8860b', 'الأجر المفوتر تجاوز سعر جدول الشريحة. المعالجة: مطالبة المورّد بالفرق أو تصحيح التعرفة.')}
    ${A.wTaifResid > 0 ? causeBar('تجاوز فوق مسار السيل (الطائف)', A.wTaifResid, totCause, '#1B95D3', 'محطات الطائف بعد تصحيح مسار السيل لا يزال بعض ردودها يتجاوز — يستحق مراجعة تشغيلية.') : ''}
    <div class="cause-note">💡 الخلاصة: <b>${Math.round(100 * A.wFar / totCause)}%</b> من الهدر سببه التوريد من مركز أبعد — وهو قابل للمعالجة بإعادة التوجيه دون أي تكلفة إضافية.</div>
    </div></div>`;

  // 3) توصيات المعالجة
  const rec = `<div class="apane" data-pane="rec" hidden>
    <div class="card"><h3>توصيات المعالجة الكمّية</h3>
    <p class="hint" style="margin:6px 0 16px">إجراءات عملية بأثر مالي محسوب بالريال.</p>
    <div class="rec-box rec-1"><div class="rec-h">١ · إعادة توجيه التوريد لأقرب مركز</div>
      <div class="rec-impact">الوفر المتوقّع: ${sav(A.totalReroute)} ر.س / شهر</div>
      <p>أعلى ${Math.min(10, A.reroute.length)} محطة بفرصة توفير:</p>
      <div class="tbl-wrap"><table class="dt"><thead><tr><th class="txt">المحطة</th><th class="txt">المركز الأقرب الموصى به</th><th class="n">وفر شهري</th></tr></thead><tbody>
        ${A.reroute.slice(0, 10).map(r => `<tr class="rowlink" data-sno="${r.sno}"><td class="txt"><b>${r.sno}</b> ${r.nm}</td><td class="txt">${r.bench}</td><td class="n">${sar(r.saving)}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
    <div class="rec-box rec-2"><div class="rec-h">٢ · تصحيح التجاوزات السعرية</div>
      <div class="rec-impact">قابل للاسترداد: ${sav(A.wPover)} ر.س</div>
      <p>${A.anomalies.pover.length} حالة فُوتِرت بأعلى من سعر جدول الشريحة — تستحق مطالبة المورّد بالفرق.</p>
    </div>
    <div class="rec-box rec-3"><div class="rec-h">٣ · الأثر السنوي المقدّر</div>
      <div class="rec-impact">لو تكرّر النمط: ${sav(A.totalReroute * 12)} ر.س / سنة</div>
      <p>إجمالي الوفر الممكن سنوياً عند معالجة إعادة التوجيه وحدها (تقدير على أساس الشهر الحالي).</p>
    </div>
    </div></div>`;

  // 4) كشف الشذوذ
  const anom = `<div class="apane" data-pane="anom" hidden>
    <div class="card"><h3>كشف الشذوذ (Anomalies)</h3>
    <p class="hint" style="margin:6px 0 16px">حالات تخرج عن النمط المتوقّع — تستحق تدقيقاً يدوياً.</p>
    <h5>أ · تجاوزات سعرية — الأجر أعلى من جدول الشريحة (${A.anomalies.pover.length})</h5>
    ${A.anomalies.pover.length ? `<div class="tbl-wrap"><table class="dt"><thead><tr><th class="txt">المحطة</th><th class="txt">المصدر</th><th class="n">كم</th><th class="n">الأجر المفوتر</th></tr></thead><tbody>
      ${A.anomalies.pover.slice(0, 15).map(a => `<tr class="rowlink" data-sno="${a.sno}"><td class="txt"><b>${a.sno}</b> ${a.nm}</td><td class="txt">${a.org}</td><td class="n">${ltr(a.km)}</td><td class="n crit-num">${sar(a.rate)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="hint">لا تجاوزات سعرية مرصودة.</p>'}
    <h5 style="margin-top:20px">ب · قفزات شريحة كبيرة — توريد من مركز أبعد بـ٣ شرائح أو أكثر (${A.anomalies.bigjump.length})</h5>
    ${A.anomalies.bigjump.length ? `<div class="tbl-wrap"><table class="dt"><thead><tr><th class="txt">المحطة</th><th class="txt">المصدر</th><th class="n">كم مفوتر</th><th class="n">كم الأقرب</th><th class="n">الشرائح</th><th class="n">هدر</th></tr></thead><tbody>
      ${A.anomalies.bigjump.slice(0, 15).map(a => `<tr class="rowlink" data-sno="${a.sno}"><td class="txt"><b>${a.sno}</b> ${a.nm}</td><td class="txt">${a.org}</td><td class="n">${ltr(a.kmTrip)}</td><td class="n">${a.kmRoad != null ? ltr(a.kmRoad) : '—'}</td><td class="n">${a.bands}</td><td class="n crit-num">${sar(a.waste)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="hint">لا قفزات كبيرة مرصودة.</p>'}
    </div></div>`;

  // 5) كفاءة الحمولة والدمج
  const L = AGG.loadEff || { avgFill: 0, bigTrips: 0, bigFull: 0, bigFullPct: 0, smallTrips: 0, consolSaving: 0, consolGroups: 0, consolTrips: 0, consolBlocked: 0, consolAnnual: 0, top: [] };
  const prodAr = { PETROL_91: 'بنزين ٩١', PETROL_95: 'بنزين ٩٥', DIESEL: 'ديزل', KEROSENE: 'كيروسين' };
  const load = `<div class="apane" data-pane="load" hidden>
    <div class="card"><h3>كفاءة الحمولة والدمج (Load Efficiency)</h3>
    <p class="hint" style="margin:6px 0 16px">البُعد اللوجستي: هل الناقلات ممتلئة؟ وهل توجد ردود صغيرة قابلة للدمج في ناقلات أكبر أرخص للّتر — ضمن سعة خزان كل محطة؟</p>
    <div class="load-cards">
      <div class="lc"><div class="lc-l">متوسط الحمولة الفعلية</div><div class="lc-v">${num(L.avgFill)} <small>لتر</small></div></div>
      <div class="lc"><div class="lc-l">امتلاء الناقلات الكبيرة</div><div class="lc-v" style="color:var(--ok)">${L.bigFullPct}%</div><div class="lc-s">${num(L.bigFull)} من ${num(L.bigTrips)} ممتلئة ≥٩٠٪</div></div>
      <div class="lc"><div class="lc-l">وفر الدمج المحتمل</div><div class="lc-v" style="color:var(--ok)">${sar(L.consolSaving)}</div><div class="lc-s">شهرياً · ${sar(L.consolAnnual)} سنوياً</div></div>
      <div class="lc"><div class="lc-l">ردود قابلة للدمج</div><div class="lc-v">${num(L.consolTrips)}</div><div class="lc-s">في ${num(L.consolGroups)} مجموعة</div></div>
    </div>
    <div class="cause-note" style="margin:16px 0">✅ مؤشر صحي: ناقلاتك الكبيرة ممتلئة بنسبة <b>${L.bigFullPct}%</b> — لا هدر يُذكر من النقل الناقص.
    ${L.consolBlocked ? `<br>🔒 <b>${num(L.consolBlocked)}</b> مجموعة استُبعدت لأن خزان المحطة أصغر من أن يستقبل ناقلة كبيرة.` : ''}</div>
    <div class="rec-box rec-1" style="border-right-color:#b8860b">
      <div class="rec-h">⚠️ تنبيه مهني: فرصة تحتاج تأكيداً تشغيلياً — ليست هدراً مؤكداً</div>
      <p>الدمج يفترض إمكانية توحيد التسليمات زمنياً لنفس المحطة والمنتج. الأرقام محسوبة ضمن سعة خزان كل محطة (من ملف الخزانات)، لكن القرار النهائي يحتاج مراجعة جدولة التوريد.</p>
    </div>
    <h5>تفصيل مخالفات الحمولة والمبالغ — لكل محطة ومنتج</h5>
    <p class="hint" style="margin:2px 0 10px">«امتلاء الناقلة» = المتوسط الفعلي ÷ الحمولة المثالية (أكبر ناقلة يتّسع لها الخزان حتى 42,000 لتر). الأعمدة المالية تبيّن سعر الردة والتكلفة الحالية مقابل التكلفة بعد الدمج والوفر.</p>
    ${L.top.length ? `<div class="tbl-wrap"><table class="dt"><thead><tr><th class="txt">المحطة</th><th class="txt">المنتج</th><th class="n">إجمالي الحمولة الفعلية</th><th class="n">المتوسط / ردة</th><th class="n">امتلاء الناقلة ${infoDot('امتلاء الناقلة')}</th><th class="n">سعة الخزان</th><th class="n">ردود→دمج</th><th class="n">سعر الردة الحالي</th><th class="n">التكلفة الحالية</th><th class="n">بعد الدمج</th><th class="n">الوفر</th></tr></thead><tbody>
      ${L.top.slice(0, 40).map(t => `<tr class="rowlink" data-sno="${t.sno}"><td class="txt"><b>${t.sno}</b> ${t.nm}<div class="sub2">${t.city || ''}</div></td><td class="txt">${prodAr[t.prod] || t.prod}</td><td class="n"><b>${num(t.totalVol)}</b> <small style="color:var(--muted)">لتر</small></td><td class="n">${num(t.avgLoad)}</td><td class="n"><span class="util-badge ${t.util < 60 ? 'u-bad' : t.util < 80 ? 'u-mid' : 'u-ok'}">${t.util}%</span></td><td class="n">${t.tankKnown ? num(t.tankCap) : '<span style="color:var(--muted);font-size:11px">غير متوفر</span>'}</td><td class="n">${num(t.fromTrips)} ← ${num(t.toTrips)}</td><td class="n">${sar(t.rateNow)}</td><td class="n">${sar(t.costNow)}</td><td class="n" style="color:var(--ink-2)">${sar(t.costAfter)}</td><td class="n crit-num" style="color:var(--ok)">${sar(t.saving)}</td></tr>`).join('')}
    </tbody></table></div>${L.top.length > 40 ? `<p class="hint" style="margin-top:10px">عرض أعلى 40 مخالفة من ${num(L.consolGroups)} — التصدير يشمل الكل</p>` : ''}
    <button class="btn ghost sm" id="expLoad" style="margin-top:12px">⤓ تصدير مخالفات الحمولة</button>` : '<p class="hint">لا مخالفات حمولة مرصودة.</p>'}
    </div></div>`;

  // 6) المقارنة الشهرية
  const hist = auditHistory(false);
  const trend = `<div class="apane" data-pane="trend" hidden>
    <div class="card"><h3>المقارنة الشهرية</h3>
    <p class="hint" style="margin:6px 0 16px">يُحفظ ملخّص كل شهر تلقائياً عند رفعه، فتُبنى مقارنة الاتجاه عبر الأشهر (محفوظة في هذا المتصفح). اضغط زر التصدير في أي صف لتنزيل تقرير محطات تلك الفترة، أو «عرض» لجعلها الفترة النشطة.</p>
    ${hist.length ? `<div class="tbl-wrap"><table class="dt"><thead><tr><th class="txt">الفترة</th><th class="n">الردود</th><th class="n">الفعلي</th><th class="n">الواجب</th><th class="n">الهدر</th><th class="n">% الهدر</th><th class="n">الالتزام</th><th class="n">إجراءات</th></tr></thead><tbody>
      ${hist.slice().reverse().map(h => `<tr${h.period === AGG.period ? ' class="trend-cur"' : ''}><td class="txt"><b>${h.period}</b>${h.period === AGG.period ? ' <span class="tag-cur">نشطة</span>' : ''}</td><td class="n">${num(h.total)}</td><td class="n">${sar(h.actual)}</td><td class="n">${sar(h.should)}</td><td class="n crit-num">${sar(h.waste)}</td><td class="n">${h.wastePct}%</td><td class="n">${h.compliance}%</td><td class="n"><span style="display:inline-flex;gap:5px;justify-content:flex-end">${h.period !== AGG.period ? `<button class="btn ghost sm trend-show" data-period="${h.period}" title="اجعلها الفترة النشطة">عرض</button>` : ''}<button class="btn ghost sm trend-exp" data-period="${h.period}" title="تصدير تقرير هذه الفترة">⤓</button>${h.period !== AGG.period ? `<button class="btn ghost sm trend-del" data-period="${h.period}" title="حذف هذه الفترة من المقارنة">🗑</button>` : ''}</span></td></tr>`).join('')}
    </tbody></table></div>
    ${hist.length < 2 ? '<div class="cause-note">📌 شهر واحد محفوظ حتى الآن. ارفع فاتورة شهر آخر (يونيو…) لتظهر مقارنة الاتجاه والفروقات.</div>' : ''}` :
    '<p class="hint">لا سجل بعد — سيُحفظ ملخّص الشهر تلقائياً.</p>'}
    </div></div>`;

  return `<div class="audit-center">${head}${tabs}${report}${root}${rec}${anom}${load}${trend}</div>`;
}
/* قاموس التعريفات المركزي — يُستخدم مع infoDot('key') */
const GLOSSARY = {
  'الهدر': 'الفرق المالي بين ما دُفع فعلاً وما <b>كان يجب</b> أن يُدفع لو وُرّدت كل ردة من أقرب مركز. يُحسب كمجموع الفروقات الموجبة لكل ردة (التكلفة الزائدة فقط).',
  'التكلفة الواجبة': 'المعيار المحاسبي للنظام: التكلفة الصحيحة لكل ردة = سعر التوريد من <b>أقرب مركز أرامكو بمسافة الطرق الفعلية</b>. أي تجاوز فوقها يُعدّ هدراً.',
  'الفعلي': 'المبلغ المدفوع فعلاً حسب الفواتير لهذه الفترة.',
  'الواجب': 'المبلغ الذي <b>كان يجب</b> دفعه لو وُرّدت كل ردة من أقرب مركز معتمد (التكلفة المثالية بلا هدر).',
  'الشريحة': 'جدول الأسعار مقسّم لشرائح مسافة كل <b>50 كم</b>. كل شريحة لها سعر ثابت للردة حسب حجم الناقلة. تجاوز المسافة لشريحة أعلى يرفع السعر.',
  'الالتزام': 'نسبة الردود التي وُرّدت من المركز الصحيح (الأقرب) دون تجاوز شريحة. كلما ارتفعت قلّ الهدر.',
  'امتلاء الناقلة': 'نسبة كم الناقلة ممتلئة فعلاً مقابل الحجم الأمثل الذي يتّسع له خزان المحطة.<br><br><b>مثال محطة 1085:</b><br>• الخزان يتّسع لـ<b>42,000 لتر</b> (الأرخص للّتر).<br>• لكنها تُحمَّل <b>19,998 لتر</b> فقط لكل ردة.<br>• الامتلاء = 48% 🔴<br><br>كلما قلّت النسبة زادت فرصة الدمج والتوفير.',
  'الحمولة المثالية': 'أكبر ناقلة يتّسع لها خزان المحطة لهذا المنتج (حتى 42,000 لتر) — وهي الأرخص للّتر. التوريد بحمولة أقل بكثير يعني فرصة دمج ضائعة.',
  'المحطات الناقصة': 'محطات لها ردود في الفواتير لكنها غير مدرجة في ملف المرجع (المسافات). تُقاس مؤقتاً مقابل أقل مسافة مفوترة لها، وتُعرض منفصلة حتى تُضاف للمرجع.',
  'تصحيح السيل': 'محطات الطائف يُمنع وصولها عبر طريق الهدا (ممنوع على القاطرات)، فالمسار الإجباري عبر <b>السيل</b> أطول. يُصحّح المرجع تلقائياً لطريق السيل لتفادي تنبيهات هدر كاذبة.',
  'التجاوز السعري': 'حالة فُوتِرت بأجر <b>أعلى</b> من سعر جدول الشريحة لكيلومتراتها — قابلة للمطالبة بالفرق من المورّد.',
  'الدمج': 'توحيد عدة ردود صغيرة لنفس المحطة والمنتج في ناقلات كبيرة أقل عدداً وأرخص للّتر — ضمن سعة خزان المحطة. فرصة توفير تحتاج تأكيد جدولة التوريد.',
};
function infoDot(key, htmlOverride) {
  const html = htmlOverride || GLOSSARY[key] || '';
  return `<button class="info-dot" type="button" data-tip="${html.replace(/"/g, '&quot;')}" data-tiptitle="${key}" aria-label="معلومات">؟</button>`;
}
function causeBar(label, val, total, color, note) {
  const pct = Math.round(100 * val / total);
  return `<div class="cause-row"><div class="cause-top"><span>${label}</span><b>${sar(val)} · ${pct}%</b></div>
    <div class="cause-track"><div class="cause-fill" style="width:${Math.max(2, pct)}%;background:${color}"></div></div>
    <div class="cause-desc">${note}</div></div>`;
}
function wireAudit() {
  auditHistory(true); // احفظ ملخّص الشهر الحالي
  $$('.atab').forEach(b => b.onclick = () => {
    $$('.atab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    $$('.apane').forEach(p => p.hidden = p.dataset.pane !== b.dataset.at);
  });
  $$('.audit-center .rowlink').forEach(r => r.onclick = () => openModal(+r.dataset.sno));
  $$('.trend-exp').forEach(b => b.onclick = () => exportPeriod(b.dataset.period));
  $$('.trend-show').forEach(b => b.onclick = () => switchPeriod(b.dataset.period));
  $$('.trend-del').forEach(b => b.onclick = () => deletePeriod(b.dataset.period));
  const ea = $('#expAudit'); if (ea) ea.onclick = exportAuditReport;
  const el = $('#expLoad'); if (el) el.onclick = exportLoadReport;
}
function showTip(title, html, anchor) {
  let bd = $('#infoBd');
  if (!bd) { bd = document.createElement('div'); bd.id = 'infoBd'; document.body.appendChild(bd); }
  let pop = $('#infoPop');
  if (!pop) { pop = document.createElement('div'); pop.id = 'infoPop'; document.body.appendChild(pop); }
  pop.innerHTML = `<div class="ip-hd"><b>${title}</b><button id="ipx">✕</button></div><div class="ip-body">${html}</div>`;
  bd.classList.add('show'); pop.classList.add('show');
  const close = () => { pop.classList.remove('show'); bd.classList.remove('show'); };
  $('#ipx').onclick = close;
  bd.onclick = close;
}
function exportLoadReport() {
  const L = AGG.loadEff || { top: [] };
  const pAr = { PETROL_91: 'بنزين 91', PETROL_95: 'بنزين 95', DIESEL: 'ديزل', KEROSENE: 'كيروسين' };
  const head = ['رقم المحطة', 'اسم المحطة', 'المدينة', 'المنتج', 'إجمالي الحمولة الفعلية', 'المتوسط لكل ردة', 'الحمولة المثالية', 'امتلاء الناقلة %', 'سعة الخزان', 'ردود حالية', 'بعد الدمج', 'سعر الردة الحالي', 'التكلفة الحالية', 'التكلفة بعد الدمج', 'الوفر'];
  const rows = L.top.map(t => [t.sno, `"${t.nm}"`, `"${t.city || ''}"`, `"${pAr[t.prod] || t.prod}"`, t.totalVol, t.avgLoad, t.ideal, t.util, t.tankKnown ? t.tankCap : 'غير متوفر', t.fromTrips, t.toTrips, t.rateNow, t.costNow, t.costAfter, t.saving]);
  const csv = '\ufeff' + [head.join(','), ...rows.map(r => r.join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `مخالفات_الحمولة_${AGG.period}.csv`; a.click();
}
// معلومات مركز الانطلاق لمحطة (من كائن محطة يحوي byO)
function originInfo(s) {
  if (!s || !s.byO || !s.byO.length) return { main: '', all: '' };
  const main = s.byO.reduce((a, b) => (b.trips || 0) > (a.trips || 0) ? b : a);
  return { main: main.orgA || '', all: s.byO.map(o => `${o.orgA} (${o.trips})`).join(' + ') };
}
function covAr(cov) { return cov === 'benchmark' ? 'مدرجة بالمرجع' : cov === 'proxy' ? 'ناقصة (خارج المرجع)' : (cov || ''); }

function exportAuditReport() {
  const A = auditAnalyze();
  const head = ['رقم المحطة', 'اسم المحطة', 'المدينة', 'المنطقة', 'الحالة', 'عدد الردود', 'مركز الانطلاق', 'كل مراكز الانطلاق', 'الفعلي', 'الواجب', 'الفجوة (هدر)', 'التصنيف', 'المركز الأقرب الموصى به', 'كم الطريق الموصى', 'السبب', 'التوصية'];
  const rows = A.reportRows.map(r => {
    const s = STATIONS[r.sno] || {};
    const o = originInfo(s);
    return [r.sno, `"${r.nm}"`, `"${r.city || s.city || ''}"`, `"${s.reg || ''}"`, `"${covAr(s.cov)}"`, s.trips || 0, `"${o.main}"`, `"${o.all}"`, r.actual, r.should, r.waste, `"${s.tier || ''}"`, `"${r.bench}"`, r.benchD, `"${r.cause}"`, `"${r.rec}"`];
  });
  const csv = '\ufeff' + [head.join(','), ...rows.map(r => r.join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `تقرير_التدقيق_${AGG.period}.csv`; a.click();
}

function viewQuality() {
  const kpis = kpiRow([
    { ic: '📍', v: sar(AGG.proxy_stations), l: 'محطات تحتاج إضافة للمرجع ' + infoDot('المحطات الناقصة'), cls: 'warn' },
    { ic: '🚚', v: sar(AGG.proxy_trips), l: 'ردود لمحطات ناقصة' },
    { ic: '🧾', v: sar(AGG.pover), l: 'تجاوزات سعرية عن الجدول', cls: AGG.pover ? 'crit' : 'ok' },
  ]);
  const po = AGG.priceOver.map(x => `<tr><td class="txt"><b>${x.sno}</b> · ${x.nm || '—'}</td><td class="txt">${x.org}</td><td class="n">${sar(x.km)}</td><td class="n">${x.tier === 'big' ? 'كبيرة' : 'صغيرة'}</td><td class="n">${sar(x.rate)}</td><td class="n">${sar(x.exp)}</td><td class="n crit-num">${ltr('+' + num(x.diff))}</td></tr>`).join('');
  const ps = AGG.proxyStations.map(m => `<tr class="clickrow" data-sno="${m.sno}"><td class="txt"><b>${m.sno}</b> · ${m.nm || '—'}</td><td class="n">${sar(m.trips)}</td><td class="n ${m.waste > 0 ? 'crit-num' : ''}">${m.waste > 0 ? sar(m.waste) : '—'}</td></tr>`).join('');
  return kpis + `
    <div class="card"><h4>🧾 التجاوزات السعرية عن الجدول</h4>
      <p class="hint" style="margin-bottom:12px">أجر مفوتر أعلى من الجدول للشريحة نفسها — يتطلب مراجعة.</p>
      <div class="tbl-wrap" style="box-shadow:none;border:none"><table class="t"><thead><tr><th class="txt">المحطة</th><th class="txt">مركز الانطلاق</th><th class="n">كم</th><th class="n">الفئة</th><th class="n">المفوتر</th><th class="n">الجدول</th><th class="n">الزيادة ر.س</th></tr></thead>
        <tbody>${po || '<tr><td colspan="7" class="more">لا توجد</td></tr>'}</tbody></table></div></div>
    <div class="card"><h4>📍 محطات تحتاج إضافة للمرجع</h4>
      <p class="hint" style="margin-bottom:12px">لها ردود لكن غير مدرجة بالمرجع — قُيست مؤقتاً مقابل أقل مسافة حقّقتها. (اضغط للتفاصيل)</p>
      <div class="tbl-wrap" style="box-shadow:none;border:none"><table class="t" style="min-width:auto"><thead><tr><th class="txt">المحطة</th><th class="n">الردود</th><th class="n">هدر تقديري ر.س</th></tr></thead>
        <tbody id="psBody">${ps}</tbody></table></div></div>`;
}
function wireQuality() { $$('#psBody .clickrow').forEach(t => t.onclick = () => openModal(t.dataset.sno)); }

/* ============================================================
   نافذة تفاصيل المحطة
   ============================================================ */
function openModal(sno) {
  const d = STATIONS[sno]; if (!d) return;
  $('#mTitle').textContent = `${sno} · ${d.nm || 'محطة'}`;
  $('#mSub').textContent = `${d.city || ''} · ${d.reg || ''}${d.primstr ? ' · التوريد المعتمد: ' + d.primstr : ''}`;
  $('#mKpis').innerHTML = [
    { v: sar(d.trips), l: 'عدد الردود' },
    { v: sar(d.actual), l: 'التكلفة الفعلية (ر.س)' },
    { v: sar(d.should), l: 'التكلفة الواجبة (ر.س)', c: 'ok' },
    { v: sar(d.waste), l: 'الهدر (ر.س)', c: d.waste > 0 ? 'crit' : 'ok' },
  ].map(k => `<div class="mkpi"><div class="v ${k.c || ''}">${k.v}</div><div class="l">${k.l}</div></div>`).join('');
  $('#mInfo').innerHTML = [
    { l: 'متوسط كم النقليات', v: sar(d.avgKmTrip) + ' كم' },
    { l: 'عدد المراكز المورِّدة', v: sar(d.centers) },
    { l: 'ردود بتنبيه', v: sar(d.alerts) + ' من ' + sar(d.trips) },
    { l: 'التصنيف', v: `<span class="pill p-tier-${d.tier}">${d.tier}</span>` },
  ].map(b => `<div class="b"><div class="l">${b.l}</div><div class="v">${b.v}</div></div>`).join('');
  const nb = $('#mNear');
  if (d.cov === 'excluded') { nb.className = 'near-box nb-grey'; nb.innerHTML = '⏸️ هذه المحطة <b>مستثناة من التصنيف</b> (منطقة نجران).'; }
  else if (d.cov === 'proxy') { nb.className = 'near-box nb-amber'; nb.innerHTML = `⚠️ <b>غير مدرجة بالمرجع</b> — قُيست مؤقتاً مقابل أقل مسافة حقّقتها (${ltr(d.benchD)} كم · سعر الردة ${sar(d.benchR)} ر.س).`; }
  else { nb.className = 'near-box nb-ok'; nb.innerHTML = `🎯 أقرب مركز معتمد: <b>${d.bench || '—'}</b> على بُعد <b>${ltr(d.benchD)} كم</b> · سعر الردة المفترض <b>${sar(d.benchR)} ر.س</b> (أساس «بلا هدر»)${d.taifFix ? `<div style="margin-top:8px;font-size:12px;color:#7a5a12;background:#fdf1d8;border:1px solid #f1d79a;border-radius:8px;padding:8px 10px">🛣️ مرجع مصحّح لطريق <b>السيل</b> الإجباري (طريق الهدا ممنوع على القاطرات) — لتفادي تنبيه الهدر الكاذب.</div>` : ''}`; }
  $('#mCenters').innerHTML = (d.byO || []).map(o => {
    const bp = o.bands === 0 ? 'p-ok' : o.bands <= 2 ? 'p-mid' : 'p-crit';
    return `<tr class="${o.bands === 0 ? 'good' : (o.waste > 0 ? 'bad' : '')}">
      <td class="txt"><b>${o.org}</b>${o.orgA ? `<br><span class="sub2">${o.orgA}</span>` : ''}</td>
      <td class="n"><span class="pill ${o.bands === 0 ? 'p-ok' : 'p-crit'}">${o.bands === 0 ? 'سليم' : 'تنبيه'}</span></td>
      <td class="n"><span class="pill ${bp}">${o.bands === 0 ? 'بلا تجاوز' : '+' + o.bands + ' شريحة'}</span></td>
      <td class="n">${sar(o.trips)}</td><td class="n">${o.rate ? sar(o.rate) : '—'}${o.pover ? ' 🧾' : ''}</td>
      <td class="n">${o.kmTrip ? sar(o.kmTrip) : '—'}</td><td class="n">${o.kmRoad != null ? ltr(o.kmRoad) : '—'}</td>
      <td class="n ${o.waste > 0 ? 'crit-num' : ''}">${o.waste > 0 ? sar(o.waste) : '—'}</td></tr>`;
  }).join('');
  $('#mProds').innerHTML = (d.byP || []).map(p => `<tr><td class="txt"><b>${p.prod}</b></td><td class="n">${sar(p.trips)}</td><td class="n">${sar(p.rate)}</td><td class="n">${sar(p.amt)}</td></tr>`).join('');
  $('#ov').classList.add('show');
}

/* ============================================================
   أدوات عامة: ترتيب الأعمدة، التصدير، البوابة
   ============================================================ */
function sortHeaders(state, redraw) {
  $$('#content table.t thead th.sortable').forEach(th => th.onclick = () => {
    const k = th.dataset.k;
    if (state.k === k) state.d *= -1; else { state.k = k; state.d = (k === 'nm' || k === 'city' || k === 'org' || k === 'primstr') ? 1 : -1; }
    redraw();
  });
}
function csvRaw(lines, name) {
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
}
function csv(head, rows, name) { csvRaw([head.join(','), ...rows.map(r => r.join(','))], name); }

/* ============================================================
   الرفع الذاتي لفواتير شهر جديد
   ============================================================ */
function parseInvoiceRows(wb) {
  let ws = wb.Sheets['PSDAllInvRpt'];
  if (!ws) { // اختر أول ورقة فيها أعمدة الفواتير
    for (const nm of wb.SheetNames) {
      const d = XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, defval: null });
      if (d[0] && d[0].map(x => ('' + x).trim()).includes('DESTINATION')) { ws = wb.Sheets[nm]; break; }
    }
  }
  if (!ws) throw new Error('لم يُعثر على ورقة الفواتير (PSDAllInvRpt أو ورقة فيها DESTINATION)');
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const h = data[0].map(x => ('' + x).trim());
  const at = n => h.indexOf(n);
  const iO = at('ORIGIN'), iD = at('DESTINATION'), iKM = at('KM'), iWT = at('WT_IN_MT'), iAMT = at('AMT'), iNT = at('NOTRIPS'), iPR = at('PRODUCT_NAME');
  if (iD < 0 || iKM < 0 || iAMT < 0) throw new Error('أعمدة الملف غير مطابقة — مطلوب: DESTINATION و KM و AMT');
  const rows = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r]; if (!row || row[iD] == null) continue;
    const m = ('' + row[iD]).match(/^\s*(\d+)/); const sno = m ? +m[1] : 0;
    const km = +row[iKM] || 0; if (!sno || km <= 0) continue;
    rows.push([sno, iO >= 0 ? ('' + (row[iO] || '')).trim() : '', km, +row[iWT] || 0, +row[iAMT] || 0, +row[iNT] || 1, iPR >= 0 ? ('' + (row[iPR] || '')).trim() : 'غير محدد']);
  }
  return rows;
}
function applyAudit(res) {
  AGG = res.AGG; STATIONS = res.STATIONS;
  for (const sno in res.GEO_trips) if (GEO[sno]) { GEO[sno].trips = res.GEO_trips[sno].trips; GEO[sno].avgKm = res.GEO_trips[sno].avgKm; }
  window.SLIST = Object.entries(STATIONS).map(([sno, o]) => ({
    sno: +sno, nm: o.nm || '', city: o.city || '', reg: o.reg || '', primstr: o.primstr || '',
    trips: o.trips || 0, alerts: o.alerts || 0, actual: o.actual || 0, should: o.should || 0,
    waste: o.waste || 0, maxBands: o.maxBands || 0, tier: o.tier || 'سليم', bench: o.bench || '', benchD: o.benchD,
  }));
  ROUTES = null; buildRoutes();
  auditHistory(true);   // احفظ ملخّص الفترة فوراً لتظهر في المقارنة الشهرية والخطة
  $('#sbPeriod').textContent = AGG.period;
  $('#nbAlerts').textContent = num((AGG.tiers['عالي'] || 0) + (AGG.tiers['متوسط'] || 0));
  $('#nbQual').textContent = num(AGG.proxy_stations);
  nav('overview');
}
function showProc(msg) { $('#proc').style.display = 'flex'; $('#procMsg').textContent = msg; }
function hideProc() { $('#proc').style.display = 'none'; }
async function handleUpload(file) {
  // اكتشاف الشهر تلقائياً من اسم الملف (مثل PSDAllInvRpt052026 → مايو 2026)
  const guess = detectPeriod(file && file.name);
  const label = guess
    ? `هذه الفاتورة تتبع الشهر المكتشَف تلقائياً:\n\n«${guess}»\n\nاضغط موافق لاعتماده، أو عدّله:`
    : 'لم أتعرّف على الشهر من اسم الملف.\nاكتب الشهر الذي تتبعه هذه الفاتورة (مثل: مايو 2026):';
  let period = prompt(label, guess);
  if (period === null) return;            // ألغى
  period = period.trim();
  if (!period) { alert('يجب تحديد الشهر الذي تتبعه الفاتورة.'); return; }
  showProc('جارٍ قراءة الملف…');
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    await new Promise(r => setTimeout(r, 30));
    showProc('جارٍ قراءة جدول الفواتير…');
    // قراءة سريعة: ورقة الفواتير فقط بوضع dense (أسرع ~الضعف من قراءة كل الأوراق)
    let wb;
    try { wb = XLSX.read(bytes, { type: 'array', sheets: ['PSDAllInvRpt'], dense: true, cellStyles: false, cellNF: false, cellText: false }); } catch (e) { wb = null; }
    if (!wb || !wb.Sheets['PSDAllInvRpt']) wb = XLSX.read(bytes, { type: 'array', dense: true, cellStyles: false, cellNF: false, cellText: false });
    const rows = parseInvoiceRows(wb);
    if (!rows.length) throw new Error('لم يُقرأ أي صف صالح — تحقق من الملف');
    showProc(`جارٍ تدقيق ${num(rows.length)} ردة بنموذج التكلفة الواجبة…`);
    await new Promise(r => setTimeout(r, 30));
    const res = AldreesAudit.runAudit(rows, REF, period);
    applyAudit(res);
    const persisted = savePeriod(period, res);   // خزّن الفاتورة الكاملة للتبديل والتصدير
    hideProc();
    alert(`✓ تم تحليل «${period}»\nالردود: ${num(res.AGG.total)}\nالهدر: ${num(res.AGG.waste)} ر.س (${res.AGG.wastePct}%)` +
      (persisted ? '\n\nيمكنك الآن التبديل بين الفواتير من القائمة أعلى الصفحة.' : '\n\n⚠️ حُفظت للجلسة الحالية فقط (ذاكرة المتصفح ممتلئة).'));
  } catch (e) {
    hideProc();
    alert('تعذّر تحليل الملف:\n' + e.message);
  }
}

/* ============================================================
   التشغيل
   ============================================================ */
async function boot() {
  await auth.init();   // تهيئة نظام المستخدمين (يُنشئ المدير الافتراضي أول مرة)
  // البوابة عبر نظام المستخدمين
  const box = () => $('.login-box');
  function closeGate() { const ov = $('#loginOv'); ov.style.transition = 'opacity .6s,transform .6s'; ov.style.opacity = '0'; ov.style.transform = 'scale(1.05)'; setTimeout(() => { ov.style.display = 'none'; }, 600); }
  function openGate() { const ov = $('#loginOv'); ov.style.display = 'flex'; ov.style.opacity = '1'; ov.style.transform = 'none'; }
  function applyPermissions() {
    const u = auth.currentUser();
    document.body.classList.toggle('is-admin', auth.isAdmin());
    document.body.classList.toggle('no-export', !auth.canExport());
    const chip = $('#sbUser');
    if (chip) chip.innerHTML = u ? `<div class="su-name">${u.name || u.username}</div><div class="su-role">${u.position || 'مستخدم'}${u.role === 'admin' ? ' · مدير' : ''}</div>` : '';
    if (PAGE === 'users' && !auth.isAdmin()) nav('overview');
  }
  async function login() {
    const u = $('#lu').value.trim(), p = $('#lp').value, btn = $('#lbtn');
    if (!u || !p) { $('#lerr').textContent = 'أدخل اسم المستخدم وكلمة المرور'; return; }
    btn.classList.add('loading'); $('#lerr').textContent = '';
    const r = await auth.signIn(u, p);
    btn.classList.remove('loading');
    if (r.ok) { applyPermissions(); box().classList.add('login-ok'); setTimeout(closeGate, 250); if (PAGE) nav(PAGE); }
    else { $('#lerr').textContent = '✕ ' + r.error; box().classList.remove('shake'); void box().offsetWidth; box().classList.add('shake'); }
  }
  $('#lbtn').onclick = login;
  $('#lu').addEventListener('keydown', e => { if (e.key === 'Enter') $('#lp').focus(); });
  $('#lp').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  auth.onChange = () => { if (PAGE === 'users' && $('#uForm') && $('#uForm').hidden) render('users'); };
  if (auth.isAuthed()) { auth.startHeartbeat(); applyPermissions(); $('#loginOv').style.display = 'none'; } else openGate();
  window.addEventListener('beforeunload', () => auth.touchAway());

  // شريط جانبي + رأس
  $('#logout').onclick = () => { auth.signOut(); applyPermissions(); openGate(); };
  { const av = $('#appVer'); if (av) av.textContent = APP_VERSION; }
  $('#sbPeriod').textContent = AGG.period;
  $('#nbAlerts').textContent = num((AGG.tiers['عالي'] || 0) + (AGG.tiers['متوسط'] || 0));
  $('#nbQual').textContent = num(AGG.proxy_stations);
  $$('.nav-item').forEach(b => b.onclick = () => nav(b.dataset.pg));
  // زر القائمة على الجوال + خلفية الإغلاق
  const sb = $('#sidebar');
  const bd = document.createElement('div'); bd.id = 'sbBackdrop'; document.body.appendChild(bd);
  const toggleSb = (open) => { sb.classList.toggle('open', open); bd.classList.toggle('show', open); };
  $('#hamb').onclick = () => toggleSb(!sb.classList.contains('open'));
  bd.onclick = () => toggleSb(false);
  // تفويض عام لعلامات المعلومات (تعمل في كل الصفحات)
  document.addEventListener('click', (e) => {
    const dot = e.target.closest && e.target.closest('.info-dot');
    if (dot) { e.preventDefault(); e.stopPropagation(); showTip(dot.dataset.tiptitle, dot.dataset.tip, dot); }
  });
  $('#expBtn').onclick = () => {
    if (PAGE === 'alerts') return $('#aexp').click();
    if (PAGE === 'stations') return $('#sexp').click();
    if (PAGE === 'map') return exportM();
    if (PAGE === 'trips') return csv(['المنتج', 'الردود', 'سعر الردة', 'الإجمالي'], Object.entries(AGG.byProduct).map(([p, o]) => [p, o.trips, o.rate, o.amt]), 'المنتجات.csv');
    if (PAGE === 'quality') return csv(['رقم المحطة', 'اسم المحطة', 'الردود', 'هدر تقديري'], AGG.proxyStations.map(m => [m.sno, `"${m.nm}"`, m.trips, m.waste]), 'محطات_ناقصة.csv');
    $('#sexp') ? $('#sexp').click() : nav('stations');
  };
  $('#mClose').onclick = () => $('#ov').classList.remove('show');
  $('#ov').onclick = e => { if (e.target.id === 'ov') $('#ov').classList.remove('show'); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#ov').classList.remove('show'); });
  // زر الرفع الذاتي
  const fi = $('#fileInput');
  $('#uploadBtn').onclick = () => fi.click();
  fi.onchange = e => { if (e.target.files[0]) { handleUpload(e.target.files[0]); e.target.value = ''; } };
  // مخزن الفترات + مبدّل الفواتير
  loadPeriodsStore();
  if (!PERIODS[AGG.period]) PERIODS[AGG.period] = { AGG, STATIONS, GEO_trips: snapshotGeoTrips() };
  $('#periodSel').onchange = e => switchPeriod(e.target.value);
  refreshPeriodSel();

  // قائمة المحطات الخفيفة للجداول
  window.SLIST = Object.entries(STATIONS).map(([sno, o]) => ({
    sno: +sno, nm: o.nm || '', city: o.city || '', reg: o.reg || '', primstr: o.primstr || '',
    trips: o.trips || 0, alerts: o.alerts || 0, actual: o.actual || 0, should: o.should || 0,
    waste: o.waste || 0, maxBands: o.maxBands || 0, tier: o.tier || 'سليم', bench: o.bench || '', benchD: o.benchD,
  }));
  buildRoutes();
  render('overview');
}
document.addEventListener('DOMContentLoaded', boot);