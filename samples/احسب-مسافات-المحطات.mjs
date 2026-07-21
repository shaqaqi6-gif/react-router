#!/usr/bin/env node
/* ============================================================
   حساب مسافات الطرق بين المحطات ومراكز أرامكو (٢٢ مركزاً) + أقرب مركز
   ------------------------------------------------------------
   يعمل على جهازك حيث الإنترنت مفتوح (خدمة OSRM وروابط Google تُحجب في بيئة
   Claude، لذلك يُشغَّل محلياً).

   التشغيل:
     1) ثبّت Node.js 18+ (فيه fetch مدمج).
     2) في مجلد فيه ملف المحطات:  npm init -y  &&  npm i xlsx
     3) node احسب-مسافات-المحطات.mjs "اسم ملف المحطات.xlsx"

   المخرجات: ملف «مسافات_الطرق_الناتجة.xlsx» فيه لكل محطة:
     الإحداثيات · مسافة الطريق لكل مركز من الـ٢٢ · أقرب مركز ومسافته.
   ============================================================ */
import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'node:fs';

const INPUT = process.argv[2];
if (!INPUT) { console.error('الاستخدام: node احسب-مسافات-المحطات.mjs "ملف المحطات.xlsx"'); process.exit(1); }

/* إحداثيات مراكز أرامكو الـ٢٢ [lat, lng] */
const CENTERS = {
  "أرامكو جنوب الرياض":[24.55,46.72],"أرامكو شمال الرياض":[24.92,46.69],"أرامكو الوسيع":[24.62,46.95],
  "أرامكو الأحساء":[25.36,49.57],"أرامكو القصيم":[26.31,43.84],"أرامكو الظهران":[26.29,50.12],
  "أرامكو القطيف":[26.52,50.02],"أرامكو الجبيل":[27.01,49.62],"أرامكو السليل":[20.46,45.58],
  "أرامكو المدينة":[24.47,39.61],"أرامكو أبها":[18.22,42.51],"أرامكو نجران":[17.55,44.22],
  "أرامكو جنوب جدة":[21.35,39.19],"أرامكو شمال جدة":[21.72,39.16],"أرامكو سكاكا":[29.88,40.10],
  "أرامكو ينبع":[24.09,38.06],"أرامكو بيش":[17.38,42.57],"أرامكو جازان":[16.89,42.57],
  "أرامكو رابغ":[22.80,39.03],"أرامكو طريف":[31.67,38.66],"أرامكو تبوك":[28.38,36.57],"أرامكو ضباء":[27.35,35.69],
};
const CN = Object.keys(CENTERS);
const R = 6371;
const hav = (a,b,c,d)=>{const dl=(c-a)*Math.PI/180,dn=(d-b)*Math.PI/180;const x=Math.sin(dl/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(x));};

/* استخراج إحداثي من نص/رابط Google (مباشر أو بعد فكّ الرابط المختصر) */
function coordFrom(text){
  const s = ''+text;
  let m = s.match(/[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
       || s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || s.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
  return m ? [ +m[1], +m[2] ] : null;
}
async function resolve(link){
  const direct = coordFrom(link); if (direct) return direct;
  try {
    const res = await fetch(link, { redirect:'follow', headers:{'User-Agent':'Mozilla/5.0'} });
    const fin = coordFrom(res.url); if (fin) return fin;
    const body = await res.text(); return coordFrom(body);
  } catch(e){ return null; }
}

/* مصفوفة مسافات الطرق عبر OSRM table (المحطات مصادر، المراكز وجهات) */
async function osrmTable(stationCoords){
  const centerCoords = CN.map(n=>CENTERS[n]); // [lat,lng]
  const all = [...stationCoords, ...centerCoords];
  const coordStr = all.map(([la,ln])=>`${ln},${la}`).join(';');
  const S = stationCoords.map((_,i)=>i).join(';');
  const D = centerCoords.map((_,i)=>i+stationCoords.length).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${coordStr}?sources=${S}&destinations=${D}&annotations=distance`;
  const j = await fetch(url).then(r=>r.json());
  if (!j.distances) throw new Error('OSRM لم يُرجع مصفوفة (distances). الرد: '+(j.message||j.code||'?'));
  return j.distances.map(row=>row.map(m=> m==null?null:Math.round(m/1000))); // متر -> كم
}

/* --- القراءة --- */
const wb = XLSX.read(readFileSync(INPUT));
const sheet = wb.SheetNames.find(n=>n.toLowerCase().includes('station')) || wb.SheetNames[0];
const data = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header:1, defval:null });
// إيجاد صف العناوين والأعمدة
let hi = data.findIndex(r => r && r.some(c => (''+c).includes('كود المحطة')));
if (hi < 0) hi = 0;
const H = data[hi].map(x=>(''+x).trim());
const col = (needle)=>H.findIndex(h=>h.includes(needle));
const iCode=col('كود المحطة'), iLoc=col('الموقع'), iProj=col('المشروع');
const iGeo = H.findIndex(h=>h.includes('الجغراف')) >=0 ? H.findIndex(h=>h.includes('الجغراف')) : (H.length-1);

const stations=[];
for (let i=hi+1;i<data.length;i++){const r=data[i]; if(!r||r[iCode]==null)continue;
  stations.push({ code:r[iCode], loc:(''+(r[iLoc]||'')).trim(), proj:(''+(r[iProj]||'')).trim(), geo:r[iGeo] }); }
console.log(`المحطات: ${stations.length} — جارٍ استخراج الإحداثيات…`);

/* --- استخراج الإحداثيات (يفكّ الروابط المختصرة) --- */
for (const s of stations){ s.ll = s.geo!=null ? await resolve(s.geo) : null; if(!s.ll) console.warn('  ⚠️ بلا إحداثي:', s.code, s.loc); }
const ok = stations.filter(s=>s.ll);
console.log(`إحداثيات مستخرجة: ${ok.length}/${stations.length} — جارٍ حساب مسافات الطرق (OSRM)…`);

/* --- مسافات الطرق على دفعات (حد OSRM ~100 نقطة) --- */
const BATCH = 78; let matrix=[];
for (let i=0;i<ok.length;i+=BATCH){
  const chunk = ok.slice(i,i+BATCH);
  try { const m = await osrmTable(chunk.map(s=>s.ll)); matrix.push(...m); }
  catch(e){ console.warn('  OSRM فشل لدفعة — استخدام التقدير الهوائي×1.39:', e.message);
    for (const s of chunk) matrix.push(CN.map(n=>Math.round(hav(s.ll[0],s.ll[1],CENTERS[n][0],CENTERS[n][1])*1.39))); }
  await new Promise(r=>setTimeout(r,1200)); // تهدئة
}

/* --- بناء المخرجات --- */
const rows = ok.map((s,idx)=>{
  const d = matrix[idx];
  let bi=0; for(let k=1;k<d.length;k++) if(d[k]!=null && (d[bi]==null||d[k]<d[bi])) bi=k;
  const row={ 'كود المحطة':s.code, 'الموقع':s.loc, 'أسم المشروع':s.proj, 'lat':s.ll[0], 'lng':s.ll[1],
    'أقرب مركز':CN[bi], 'مسافة الطريق للأقرب (كم)':d[bi] };
  CN.forEach((n,k)=>row[n]=d[k]);
  return row;
});
const missing = stations.filter(s=>!s.ll).map(s=>({ 'كود المحطة':s.code, 'الموقع':s.loc, 'أسم المشروع':s.proj, 'lat':'', 'lng':'', 'أقرب مركز':'تعذّر — راجع رابط الموقع', 'مسافة الطريق للأقرب (كم)':'' }));
const ws = XLSX.utils.json_to_sheet([...rows, ...missing]);
const nwb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(nwb, ws, 'مسافات الطرق');
writeFileSync('مسافات_الطرق_الناتجة.xlsx', XLSX.write(nwb,{type:'buffer',bookType:'xlsx'}));
console.log(`✓ تم. الناتج: مسافات_الطرق_الناتجة.xlsx (${rows.length} محطة محسوبة، ${missing.length} متعذّرة)`);
