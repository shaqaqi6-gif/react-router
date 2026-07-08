/* محرّك تدقيق نقليات الدريس — نموذج التكلفة الواجبة (وحدة ES) */
const _engineExports = {};
/* ============================================================
   محرّك تدقيق نقليات الدريس — نموذج التكلفة الواجبة
   يحوّل صفوف الفواتير الخام إلى: AGG + STATIONS + GEO(ردود)
   المراجع الثابتة: REF_META, REF_ROADS(RM), REF_PRICE, REF_NAJRAN, REF_O2A
   ============================================================ */
(function (global) {
  'use strict';

  function band(km) { return km > 0 ? Math.floor((km - 1) / 50) + 1 : 1; }
  const CAPS = [18000, 20000, 25000, 32000, 36000, 42000];
  function nearestCap(w) { let b = CAPS[0]; for (const c of CAPS) if (Math.abs(c - w) < Math.abs(b - w)) b = c; return b; }
  function rateOf(P, cap, b) {
    const t = cap === 'big' ? P.large : P.small;
    return t[Math.min(b, t.length) - 1];
  }
  function tierOf(waste, cov) {
    if (cov === 'excluded') return 'مستثناة';
    if (cov === 'proxy') return 'ناقصة';
    if (waste >= 5000) return 'عالي';
    if (waste >= 1000) return 'متوسط';
    if (waste > 0) return 'منخفض';
    return 'سليم';
  }

  /* المدخل: rows = مصفوفة [sno, origin, km, wt, amt, notrips, product]
     REF = { meta, roads:{centers,roads}, price:{large,small}, najran:[...], o2a:{} } */
  function runAudit(rows, REF, period) {
    const META = REF.meta, RM = REF.roads, P = REF.price;
    const NAJRAN = new Set(REF.najran), O2A = REF.o2a || {};
    const DROP_CENTERS = new Set(['أرامكو نجران']);   // مراكز مُزالة نهائياً — لا تُعتمد كمرجع
    const TANKS = REF.tanks || {};
    const centers = RM.centers, roads = RM.roads;
    const INREF = roads; // المحطات المدرجة بالمرجع لها مصفوفة طرق
    // كفاءة الحمولة: تجميع الردود الصغيرة + إحصاء الامتلاء
    const smallGroups = {};       // "sno|band|prod" -> [{wt,amt}]
    const fill = { big: 0, bigFull: 0, small: 0, volSum: 0, volN: 0 };

    // محطات الطائف: يُمنع طريق الهدا على القاطرات، فالمسار الإجباري = السيل (أطول).
    // القاعدة: مرجع محطة الطائف = الأطول بين (مسافة المرجع) و (أقل مسافة مفوترة فعلية = السيل).
    const TAIF = new Set();
    for (const [sno, m] of Object.entries(META)) {
      const blob = (m.nm || '') + ' ' + (m.city || '');
      if (blob.indexOf('طائف') >= 0 || blob.indexOf('الهدا') >= 0) TAIF.add(+sno);
    }
    const taifMinKm = {};
    for (const t of rows) {
      const sno = t[0], km = t[2];
      if (km > 0 && TAIF.has(sno)) taifMinKm[sno] = Math.min(taifMinKm[sno] != null ? taifMinKm[sno] : 1e9, km);
    }

    function nearestOf(sno) {
      const r = roads[sno]; if (!r) return null;
      let best = null;
      for (const x of r) { if (DROP_CENTERS.has(centers[x[0]])) continue; if (!best || x[1] < best[1]) best = x; }
      if (!best) return null;
      let km = best[1]; const name = centers[best[0]]; let corrected = false;
      // تصحيح الطائف: اعتمد المسار الإجباري الأطول (السيل) إن كان المفوتر الأدنى أكبر من مرجع الهدا
      if (TAIF.has(+sno) && taifMinKm[sno] != null && taifMinKm[sno] > km + 15) {
        km = taifMinKm[sno]; corrected = true;
      }
      return { name, km, corrected };
    }
    function roadTo(sno, centerName) {
      const r = roads[sno]; if (!r) return null;
      for (const x of r) if (centers[x[0]] === centerName) return x[1];
      return null;
    }

    // تمريرة 1: أقل كم لكل محطة ناقصة (لتقييمها مقابل أقل مسافة حققتها)
    const proxyMin = {};
    for (const t of rows) {
      const sno = t[0], km = t[2];
      if (km <= 0) continue;
      if (!INREF[sno] && !NAJRAN.has(sno)) proxyMin[sno] = Math.min(proxyMin[sno] != null ? proxyMin[sno] : 1e9, km);
    }

    // تجميع لكل محطة
    const ST = {};
    function ensure(sno, cov, fallbackName) {
      if (!ST[sno]) {
        const m = META[sno] || {};
        ST[sno] = {
          nm: m.nm || fallbackName || '', city: m.city || '', reg: m.reg || '', primstr: m.primstr || '',
          cov, trips: 0, amt: 0, actual: 0, should: 0, waste: 0, alerts: 0, maxBands: 0,
          centersSet: {}, _byO: {}, _byP: {},
          bench: null, benchD: null, benchR: null, _kmSum: 0,
        };
      } else if (!ST[sno].nm && fallbackName) { ST[sno].nm = fallbackName; }
      return ST[sno];
    }

    const AGG = {
      period: period || '—', total: 0, amt: 0, actual: 0, should: 0, waste: 0,
      ok: 0, alert: 0, proxy_trips: 0, excluded_trips: 0,
      byOrigin: {}, byCity: {}, byProduct: {}, byRegion: {},
      _proxyStations: {}, priceOver: [],
    };

    for (const t of rows) {
      const sno = t[0], origin = t[1], km = t[2], wt = t[3], amt = t[4], nt = t[5] || 1, prod = t[6] || 'غير محدد', destName = t[7] || '';
      if (!sno || km <= 0) continue;
      AGG.total++; AGG.amt += amt;
      const cap = wt >= 28000 ? 'big' : 'small';
      const bb = band(km);
      // كفاءة الحمولة (لكل الردود غير المستثناة)
      if (wt > 0 && !NAJRAN.has(sno)) {
        fill.volSum += wt * nt; fill.volN += nt;
        if (cap === 'big') { fill.big += nt; if (wt >= 0.90 * nearestCap(wt)) fill.bigFull += nt; }
        else {
          fill.small += nt;
          const k = sno + '|' + bb + '|' + prod;
          (smallGroups[k] || (smallGroups[k] = [])).push({ wt, amt, nt });
        }
      }
      const billedRate = rateOf(P, cap, bb);
      let orgA = O2A[origin] || origin;
      // أصل غير مربوط يشبه مستودع الدمام (NNN - DAM PSD ...) → أرامكو الظهران
      if (orgA === origin && /DAM\s*PSD|DAMMAM/i.test(origin)) orgA = 'أرامكو الظهران';

      // نجران: مُزالة بالكامل — تُسقَط ردودها ولا تُحتسب في أي شيء
      if (NAJRAN.has(sno)) continue;

      // ناقصة (خارج المرجع) — تقييم مقابل أقل مسافة محققة
      if (!INREF[sno]) {
        AGG.proxy_trips++;
        const nb = band(proxyMin[sno]);
        const sr = rateOf(P, cap, nb) * nt;
        const w = Math.max(0, amt - sr);
        const s = ensure(sno, 'proxy', destName);
        s.trips += nt; s.amt += amt; s.actual += amt; s.should += sr; s.waste += w; s._kmSum += km * nt;
        s.bench = '(أقل مسافة محققة)'; s.benchD = Math.round(proxyMin[sno]); s.benchR = Math.round(rateOf(P, cap, nb));
        const bands = Math.max(0, bb - nb);
        if (bands > 0) s.alerts += nt;
        s.maxBands = Math.max(s.maxBands, bands);
        accOrigin(s, origin, orgA, km, roadTo(sno, orgA), billedRate, nt, w, bands, prod, amt, false);
        AGG._proxyStations[sno] = s;
        continue;
      }

      // مُقاسة
      const near = nearestOf(sno);
      const nb = band(near.km);
      const sr = rateOf(P, cap, nb) * nt;
      const w = Math.max(0, amt - sr);
      const bands = Math.max(0, bb - nb);
      const s = ensure(sno, 'benchmark', destName);
      s.trips += nt; s.amt += amt; s.actual += amt; s.should += sr; s.waste += w; s._kmSum += km * nt;
      s.bench = near.name; s.benchD = Math.round(near.km * 10) / 10; s.benchR = Math.round(rateOf(P, cap, nb));
      s.taifFix = near.corrected || false;
      s.maxBands = Math.max(s.maxBands, bands);
      if (bands > 0) { s.alerts += nt; AGG.alert += nt; } else AGG.ok += nt;
      AGG.actual += amt; AGG.should += sr; AGG.waste += w;

      // تجاوز سعري: الأجر المفوتر أعلى من جدول شريحة الكيلومترات المفوترة
      const pover = amt / nt > billedRate * 1.02;
      if (pover && AGG.priceOver.length < 200)
        AGG.priceOver.push({ sno, nm: s.nm, org: orgA, km: Math.round(km), tier: cap, rate: Math.round(amt / nt), exp: Math.round(billedRate), diff: Math.round(amt / nt - billedRate) });

      accOrigin(s, origin, orgA, km, roadTo(sno, orgA), billedRate, nt, w, bands, prod, amt, pover);

      // مجاميع
      const ob = AGG.byOrigin[orgA] || (AGG.byOrigin[orgA] = { trips: 0, alerts: 0, amt: 0, waste: 0, rate: 0, _rsum: 0, _rn: 0 });
      ob.trips += nt; ob.amt += amt; ob.waste += w; if (bands > 0) ob.alerts += nt; ob._rsum += amt; ob._rn += nt;
      AGG.byCity[s.city || '—'] = (AGG.byCity[s.city || '—'] || 0) + w;
      AGG.byRegion[s.reg || '—'] = (AGG.byRegion[s.reg || '—'] || 0) + w;
      const pb = AGG.byProduct[prod] || (AGG.byProduct[prod] = { trips: 0, amt: 0, rate: 0, _rsum: 0, _rn: 0 });
      pb.trips += nt; pb.amt += amt; pb._rsum += amt; pb._rn += nt;
    }

    function accOrigin(s, origin, orgA, km, kmRoad, rate, nt, w, bands, prod, amt, pover) {
      s.centersSet[orgA] = 1;
      const o = s._byO[orgA] || (s._byO[orgA] = { org: origin, orgA, trips: 0, _kmSum: 0, _rsum: 0, kmRoad: kmRoad != null ? Math.round(kmRoad) : null, bands: 0, waste: 0, pover: false });
      o.trips += nt; o._kmSum += km * nt; o._rsum += amt; o.waste += w; o.bands = Math.max(o.bands, bands); if (pover) o.pover = true;
      const p = s._byP[prod] || (s._byP[prod] = { prod, trips: 0, amt: 0, _rsum: 0 });
      p.trips += nt; p.amt += amt; p._rsum += amt;
    }

    // إنهاء البنية
    const STATIONS = {}, GEO_trips = {};
    const tiers = {}, bandsDist = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 };
    // تفاوت مسموح: أي مركز انطلاق فرقه للردة أقل من TOL ر.س يُعتبر مقبولاً (لا هدر)
    const TOL = (REF.tolPerTrip != null) ? REF.tolPerTrip : 110;
    let totalForgiven = 0;
    for (const [sno, s] of Object.entries(ST)) {
      const byO = Object.values(s._byO).map(o => ({
        org: o.org, orgA: o.orgA, trips: o.trips, rate: Math.round(o._rsum / o.trips),
        kmTrip: Math.round(o._kmSum / o.trips), kmRoad: o.kmRoad, bands: o.bands, waste: Math.round(o.waste), pover: o.pover,
      })).sort((a, b) => b.waste - a.waste);
      // تطبيق التفاوت المسموح: صفّر هدر المراكز ذات فرق الردة < TOL واحسب المُعفى
      let forgiven = 0;
      for (const o of byO) {
        if (o.waste > 0 && o.waste / o.trips < TOL) { forgiven += o.waste; o.waste = 0; o.tol = true; }
      }
      const sWaste = Math.max(0, Math.round(s.waste) - forgiven);
      totalForgiven += forgiven;
      const tier = tierOf(sWaste, s.cov);
      tiers[tier] = (tiers[tier] || 0) + 1;
      const byP = Object.values(s._byP).map(p => ({ prod: p.prod, trips: p.trips, amt: Math.round(p.amt), rate: Math.round(p._rsum / p.trips) }))
        .sort((a, b) => b.trips - a.trips);
      STATIONS[sno] = {
        nm: s.nm, city: s.city, reg: s.reg, primstr: s.primstr, cov: s.cov,
        trips: s.trips, amt: Math.round(s.amt), actual: Math.round(s.actual), should: Math.round(s.should) + forgiven,
        waste: sWaste, alerts: s.alerts, maxBands: s.maxBands, tier,
        bench: s.bench, benchD: s.benchD, benchR: s.benchR, taifFix: s.taifFix || false,
        avgKmTrip: Math.round(s._kmSum / s.trips), centers: Object.keys(s.centersSet).length, byO, byP,
      };
      GEO_trips[sno] = { trips: s.trips, avgKm: Math.round(s._kmSum / s.trips) };
      // توزيع الشرائح (عدد الردود)
      for (const o of byO) {
        const key = Math.min(o.bands, 6) + '';
        bandsDist[key] = (bandsDist[key] || 0) + o.trips;
      }
    }
    // إنهاء المجاميع
    for (const o of Object.values(AGG.byOrigin)) o.rate = Math.round(o._rsum / o._rn);
    for (const p of Object.values(AGG.byProduct)) p.rate = Math.round(p._rsum / p._rn);
    // خصم الهدر المُعفى (التفاوت المسموح < TOL) من المجاميع لاتساق الإحصائيات
    AGG.actual = Math.round(AGG.actual); AGG.should = Math.round(AGG.should) + totalForgiven; AGG.waste = Math.max(0, Math.round(AGG.waste) - totalForgiven); AGG.amt = Math.round(AGG.amt);
    AGG.tolPerTrip = TOL; AGG.forgiven = Math.round(totalForgiven);
    AGG.wastePct = AGG.actual ? Math.round(1000 * AGG.waste / AGG.actual) / 10 : 0;
    AGG.compliance = (AGG.ok + AGG.alert) ? Math.round(100 * AGG.ok / (AGG.ok + AGG.alert)) : 0;
    AGG.stations = Object.values(STATIONS).filter(s => s.cov === 'benchmark').length;
    AGG.proxy_stations = Object.keys(AGG._proxyStations).length;
    AGG.pover = AGG.priceOver.length;
    AGG.tiers = tiers; AGG.bandsDist = bandsDist;
    AGG.proxyStations = Object.entries(AGG._proxyStations).map(([sno, s]) => ({ sno: +sno, nm: s.nm, trips: s.trips, waste: Math.round(s.waste) })).sort((a, b) => b.waste - a.waste);
    AGG.topStations = Object.entries(STATIONS).filter(([, s]) => s.waste > 0).map(([sno, s]) => ({ sno: +sno, nm: s.nm, waste: s.waste })).sort((a, b) => b.waste - a.waste).slice(0, 20);
    delete AGG._proxyStations;

    // ===== كفاءة الحمولة والدمج =====
    const consol = [];   // مخالفات/فرص الحمولة لكل (محطة،منتج،شريحة)
    let consolSaving = 0, consolGroups = 0, consolTrips = 0, consolBlocked = 0;
    for (const [key, lst] of Object.entries(smallGroups)) {
      if (lst.length < 2) continue;
      const [snoS, bS, prodS] = key.split('|');
      const sno = +snoS, b = +bS;
      const tcap = (TANKS[sno] && TANKS[sno][prodS]) || 0;
      const ceilV = Math.min(42000, tcap > 0 ? tcap : 42000);
      const nTrips = lst.reduce((t, x) => t + x.nt, 0);
      const vol = lst.reduce((t, x) => t + x.wt * x.nt, 0);
      const costSmall = lst.reduce((t, x) => t + x.amt, 0);
      const avgLoad = Math.round(vol / nTrips);
      const ideal = Math.round(ceilV);
      const tankKnown = tcap > 0;
      const util = ideal > 0 ? Math.round(100 * avgLoad / ideal) : 0;  // امتلاء الناقلة مقابل المثالي
      if (ceilV < 28000) { consolBlocked++; continue; } // الخزان لا يتّسع لناقلة كبيرة
      const nLarge = Math.max(1, Math.ceil(vol / ceilV));
      const costLarge = nLarge * rateOf(P, 'big', b);
      if (costLarge < costSmall && nLarge < nTrips) {
        const sv = costSmall - costLarge;
        consolSaving += sv; consolGroups++; consolTrips += nTrips;
        const st = ST[sno];
        consol.push({
          sno, nm: st ? st.nm : (META[sno] ? META[sno].nm : ''), city: st ? st.city : (META[sno] ? META[sno].city : ''),
          prod: prodS, band: b, trips: nTrips, fromTrips: nTrips, toTrips: nLarge,
          saving: Math.round(sv), tankCap: Math.round(tcap), tankKnown, totalVol: Math.round(vol), avgLoad, ideal, util,
          costNow: Math.round(costSmall), costAfter: Math.round(costLarge),
          rateNow: Math.round(costSmall / nTrips), rateAfter: Math.round(rateOf(P, 'big', b)),
        });
      }
    }
    consol.sort((a, b) => b.saving - a.saving);
    AGG.loadEff = {
      avgFill: fill.volN ? Math.round(fill.volSum / fill.volN) : 0,
      bigTrips: fill.big, bigFull: fill.bigFull,
      bigFullPct: fill.big ? Math.round(100 * fill.bigFull / fill.big) : 0,
      smallTrips: fill.small,
      consolSaving: Math.round(consolSaving), consolGroups, consolTrips, consolBlocked,
      consolAnnual: Math.round(consolSaving * 12),
      top: consol.slice(0, 200),
    };

    return { AGG, STATIONS, GEO_trips };
  }

  global.AldreesAudit = { runAudit, band, rateOf };
})(_engineExports);
export const AldreesAudit = _engineExports.AldreesAudit;
