/* تصحيحات بيانات المحطات — للمحطات التي ورثت مصفوفة طرق خاطئة (منسوخة من محطة
   أخرى) أو التي يلزم اعتماد مركزها الصحيح ومسافة طريقه الفعلية المقاسة.

   مثال محطة 915 (الصعاق المندق - الباحة): كانت مصفوفتها منسوخة من محطة رياض،
   فظهر «الأقرب» أرامكو جنوب الرياض على بُعد 34كم (والباحة تبعد ~755كم!) وضخّم
   الهدر إلى 17,391. الصحيح: أرامكو اعتمدت التوريد من «شمال جدة»، ومسافة الطريق
   الفعلية المقاسة = 389.7كم — فالمفوتر (405كم) ≈ الطريق الفعلي، والهدر الحقيقي
   ~941 (فرق شريحة واحدة فقط في الفوترة).

   الطريقة: (1) نعيد بناء مصفوفة الطرق تقديرياً (مستقيم × 1.21 المعايَر) لإصلاح
   الأرقام الخاطئة، (2) نعتمد «المركز الصحيح» ومسافته الفعلية المقاسة كأساس للهدر،
   (3) نعيد اشتقاق الشرائح والهدر بنفس منطق المحرّك ونحدّث الإجماليات. */
import { GEO, CENTERS, RM, REF } from './data.js';

const ROAD_FACTOR = 1.21;
const band = km => km > 0 ? Math.floor((km - 1) / 50) + 1 : 1;
function rateOf(cap, b) { const t = cap === 'big' ? REF.price.large : REF.price.small; return t[Math.min(b, t.length) - 1]; }
const tierOf = w => w >= 5000 ? 'عالي' : w >= 1000 ? 'متوسط' : w > 0 ? 'منخفض' : 'سليم';
function hav(a, b, c, d) {
  const R = 6371, dl = (c - a) * Math.PI / 180, dn = (d - b) * Math.PI / 180;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// المحطات المصحّحة يدوياً — فارغة الآن بعد اعتماد ملف المسافات الرسمي «مقاس فعلي»
// (يغطي كل المحطات بمسافات طرق حقيقية، فلا حاجة لتصحيحات فردية). تبقى الوحدة
// جاهزة لأي تصحيح مستقبلي: أضِف { 'رقم': { bench, benchKm } } وسيُطبَّق تلقائياً.
const FIXES = {};

export function applyCorrections(STATIONS, AGG) {
  for (const [sno, fx] of Object.entries(FIXES)) {
    const g = GEO[sno];
    // 1) إعادة بناء مصفوفة الطرق تقديرياً (تُصلح الأرقام الخاطئة للخريطة والمحرّك)
    if (fx.rebuildRoads && g && g.lat && g.lng) {
      RM.roads[sno] = RM.centers.map((nm, ci) => {
        const ll = CENTERS[nm];
        return [ci, ll ? Math.round(hav(g.lat, g.lng, ll[0], ll[1]) * ROAD_FACTOR) : 9999];
      });
    }
    // 2) اعتماد المسافة الفعلية المقاسة للمركز الصحيح في المصفوفة
    const ci = RM.centers.indexOf(fx.bench);
    if (ci >= 0 && RM.roads[sno]) {
      const ex = RM.roads[sno].find(x => x[0] === ci);
      if (ex) ex[1] = fx.benchKm; else RM.roads[sno].push([ci, fx.benchKm]);
    }
    if (g) { g.near = fx.bench; g.nearKm = fx.benchKm; }

    // 3) إعادة اشتقاق تدقيق المحطة على أساس المركز الصحيح ومسافته الفعلية
    const s = STATIONS[sno]; if (!s || s.cov !== 'benchmark') continue;
    const oldBand = band(s.benchD || 1);
    const cap = Math.abs(rateOf('big', oldBand) - (s.benchR || 0)) <= Math.abs(rateOf('small', oldBand) - (s.benchR || 0)) ? 'big' : 'small';
    const nb = band(fx.benchKm);
    const newBenchR = rateOf(cap, nb);
    const newShould = Math.round(newBenchR * (s.trips || 0));
    const newWaste = Math.max(0, Math.round((s.actual || 0) - newShould));

    const dShould = newShould - (s.should || 0);
    const dWaste = newWaste - (s.waste || 0);
    const oldTier = s.tier, newTier = tierOf(newWaste);

    s.bench = fx.bench; s.benchD = fx.benchKm; s.benchR = Math.round(newBenchR);
    s.should = newShould; s.waste = newWaste; s.tier = newTier;

    let maxBands = 0;
    for (const o of (s.byO || [])) {
      const found = RM.roads[sno].find(([c]) => RM.centers[c] === o.orgA);
      if (found) o.kmRoad = found[1];
      o.bands = Math.max(0, band(o.kmTrip) - nb);
      maxBands = Math.max(maxBands, o.bands);
      o.waste = Math.max(0, Math.round((o.rate || 0) * (o.trips || 0)) - Math.round(newBenchR * (o.trips || 0)));
    }
    s.maxBands = maxBands;

    if (AGG) {
      AGG.should = Math.round((AGG.should || 0) + dShould);
      AGG.waste = Math.round((AGG.waste || 0) + dWaste);
      if (AGG.tiers && oldTier !== newTier) {
        AGG.tiers[oldTier] = Math.max(0, (AGG.tiers[oldTier] || 0) - 1);
        AGG.tiers[newTier] = (AGG.tiers[newTier] || 0) + 1;
      }
    }
  }
}
