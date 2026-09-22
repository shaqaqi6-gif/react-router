/* ============================================================
   كاتب ملفات ZIP مبسّط (تخزين بلا ضغط — STORED)
   كافٍ تمامًا لحزمة .pkpass ولا يحتاج أي مكتبة خارجية.
   المواصفة: APPNOTE.TXT (PKWARE) — ترويسة محلية + دليل مركزي.
   ============================================================ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * يبني أرشيف ZIP من قائمة ملفات.
 * @param {{name: string, data: Buffer}[]} files
 * @returns {Buffer}
 */
export function zipStore(files) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const crc = crc32(data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);  // توقيع الترويسة المحلية
    local.writeUInt16LE(20, 4);          // أدنى إصدار مطلوب
    local.writeUInt16LE(0x0800, 6);      // علم UTF-8 لأسماء الملفات
    local.writeUInt16LE(0, 8);           // طريقة التخزين: بلا ضغط
    local.writeUInt16LE(0, 10);          // وقت التعديل (ثابت = بناء قابل للتكرار)
    local.writeUInt16LE(0x0021, 12);     // تاريخ التعديل: 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(local, data);

    const entry = Buffer.alloc(46 + name.length);
    entry.writeUInt32LE(0x02014b50, 0);  // توقيع الدليل المركزي
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0x0021, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);     // إزاحة الترويسة المحلية
    name.copy(entry, 46);
    central.push(entry);

    offset += local.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);      // نهاية الدليل المركزي
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, end]);
}
