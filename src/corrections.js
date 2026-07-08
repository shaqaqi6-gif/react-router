/* تصحيحات بيانات المحطات — إعادة حساب مسافات الطرق والتدقيق للمحطات التي
   ورثت مصفوفة طرق خاطئة (منسوخة من محطة أخرى)، فظهر «الأقرب» بمركز بعيد
   جغرافياً بمسافة صغيرة وهمية — ما ضخّم الهدر بشكل غير صحيح.

   مثال: محطة 915 (الصعاق المندق - الباحة) كانت مصفوفتها منسوخة من محطة رياض،
   فظهر «أرامكو جنوب الرياض» أقرب مركز على بُعد 34كم — والباحة تبعد ~755كم عن
   الرياض! الصحيح أن الأقرب هو «أرامكو أبها» (~307كم).

   الطريقة: نعيد حساب مسافات الطرق تقديرياً من الموقع الصحيح = المسافة المستقيمة
   × معامل 1.21 (مُعايَر من 25 ألف زوج من بيانات الطرق الحقيقية بالمرجع)، ثم نعيد
   اشتقاق الأقرب والشرائح والهدر بنفس منطق المحرّك. حين يُرفَع تقرير جديد يستخدم
   المحرّك المصفوفة المصحّحة تلقائياً. */
import { GEO, CENTERS, RM, REF } from './data.js';

const ROAD_FACTOR = 1.21;

// محطات تُصحَّح إحداثياتها (اختياري). إن لم تُذكر تُستخدم إحداثيات GEO الحالية.
const COORD_FIX = {
  // '915': { lat: 20.09858, lng: 41.29716 },  // الباحة/المندق
};
// محطات نعيد حساب مصفوفة طرقها بالكامل (كانت خاطئة/منسوخة)
const RECOMPUTE_ROADS = ['915'];

function hav(a, b, c, d) {
  const R = 6371, dl = (c - a) * Math.PI / 180, dn = (d - b) * Math.PI / 180;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const band = km => km > 0 ? Math.floor((km - 1) / 50) + 1 : 1;
function rateOf(cap, b) { const t = cap === 'big' ? REF.price.large : REF.price.small; return t[Math.min(b, t.length) - 1]; }
const tierOf = w => w >= 5000 ? 'عالي' : w >= 1000 ? 'متوسط' : w > 0 ? 'منخفض' : 'سليم';

export function applyCorrections(STATIONS, AGG) {
  for (const sno of RECOMPUTE_ROADS) {
    const g = GEO[sno]; if (!g) continue;
    if (COORD_FIX[sno]) { g.lat = COORD_FIX[sno].lat; g.lng = COORD_FIX[sno].lng; }

    // 1) مصفوفة طرق مصحّحة (خط مستقيم × معامل الطرق) — تُصلح المحرّك للتقارير القادمة أيضاً
    const mat = RM.centers.map((nm, ci) => {
      const ll = CENTERS[nm];
      return [ci, ll ? Math.round(hav(g.lat, g.lng, ll[0], ll[1]) * ROAD_FACTOR) : 9999];
    });
    RM.roads[sno] = mat;

    // 2) الأقرب (باستثناء نجران المُلغاة)
    const near = mat.map(([ci, km]) => ({ name: RM.centers[ci], km }))
      .filter(x => x.name !== 'أرامكو نجران').sort((a, b) => a.km - b.km)[0];
    g.near = near.name; g.nearKm = near.km;

    // 3) إعادة اشتقاق تدقيق المحطة (نفس منطق المحرّك) بالبيانات المجمّعة
    const s = STATIONS[sno]; if (!s || s.cov !== 'benchmark') continue;
    const oldBand = band(s.benchD || 1);
    // استنتاج فئة القاطرة (كبيرة/صغيرة) من سعر المرجع القديم
    const cap = Math.abs(rateOf('big', oldBand) - (s.benchR || 0)) <= Math.abs(rateOf('small', oldBand) - (s.benchR || 0)) ? 'big' : 'small';
    const nb = band(near.km);
    const newBenchR = rateOf(cap, nb);
    const newShould = Math.round(newBenchR * (s.trips || 0));
    const newWaste = Math.max(0, Math.round((s.actual || 0) - newShould));

    const dShould = newShould - (s.should || 0);
    const dWaste = newWaste - (s.waste || 0);
    const oldTier = s.tier, newTier = tierOf(newWaste);

    s.bench = near.name; s.benchD = near.km; s.benchR = Math.round(newBenchR);
    s.should = newShould; s.waste = newWaste; s.tier = newTier;

    // إعادة حساب الشرائح والهدر لكل مركز انطلاق ومسافة طريقه المصحّحة
    let maxBands = 0;
    for (const o of (s.byO || [])) {
      const found = mat.find(([ci]) => RM.centers[ci] === o.orgA);
      if (found) o.kmRoad = found[1];
      o.bands = Math.max(0, band(o.kmTrip) - nb);
      maxBands = Math.max(maxBands, o.bands);
      o.waste = Math.max(0, Math.round((o.rate || 0) * (o.trips || 0)) - Math.round(newBenchR * (o.trips || 0)));
    }
    s.maxBands = maxBands;

    // تحديث الإجماليات
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
