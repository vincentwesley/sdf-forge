/**
 * Minimal ZIP writer (PKWARE APPNOTE 6.3): one "deflate" or "store" entry per
 * file, no ZIP64, no encryption. Compression uses the platform's
 * CompressionStream('deflate-raw') (browsers, workers and Node 18+); without it
 * entries are stored uncompressed, which is still a valid archive.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  /** store small or already-compressed files (e.g. PNG) */
  store?: boolean;
  /** start the file's data on a multiple of this many bytes (USDZ needs 64); implies store */
  align?: number;
}

let CRC_TABLE: Uint32Array | null = null;
export function crc32(data: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Build a ZIP archive. Timestamps are fixed (1 Jan 2020) so output is reproducible. */
export async function writeZip(entries: ZipEntry[]): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const DOS_TIME = 0;
  const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    let method = 0;
    let body = e.data;
    if (!e.store && !e.align) {
      const z = await deflateRaw(e.data);
      if (z && z.length < e.data.length) {
        method = 8;
        body = z;
      }
    }
    if (body.length > 0xfffffffe || offset > 0xfffffffe) throw new Error('File too large for ZIP');
    // padding in the local header's extra field so the data starts aligned
    let extra = 0;
    if (e.align) {
      const rem = (offset + 30 + name.length) % e.align;
      extra = rem ? e.align - rem : 0;
      if (extra > 0 && extra < 4) extra += e.align; // an extra field needs at least its 4-byte header
    }
    const lh = new Uint8Array(30 + name.length + extra);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, method, true);
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, extra, true);
    lh.set(name, 30);
    if (extra) {
      lv.setUint16(30 + name.length, 0x1986, true); // padding block id (as used by USD's own packager)
      lv.setUint16(32 + name.length, extra - 4, true);
    }
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    locals.push(lh, body);
    centrals.push(ch);
    offset += lh.length + body.length;
  }
  const cdSize = centrals.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let o = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, o);
    o += part.length;
  }
  return out.buffer;
}
