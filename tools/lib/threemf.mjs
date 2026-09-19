/* ============================================================
   3MF 쓰기 — 슬라이서에서 파트별로 필라멘트를 지정할 수 있도록
   여러 파트를 components 로 묶은 오브젝트 하나로 내보낸다.
   (프루사 / 오르카 / 뱀부 모두 파트별 필라멘트 지정 가능)
   ============================================================ */
import fs from 'fs';
import zlib from 'zlib';

function meshXml(P) {
  const map = new Map(), vs = [], tri = [];
  const key = (a,b,c) => `${Math.round(a*1e4)},${Math.round(b*1e4)},${Math.round(c*1e4)}`;
  const idx = (a,b,c) => {
    const k = key(a,b,c); let v = map.get(k);
    if (v === undefined) { v = vs.length; map.set(k, v); vs.push([a,b,c]); }
    return v;
  };
  for (let i = 0; i < P.length; i += 9) {
    const a = idx(P[i],P[i+1],P[i+2]);
    const b = idx(P[i+3],P[i+4],P[i+5]);
    const c = idx(P[i+6],P[i+7],P[i+8]);
    if (a !== b && b !== c && a !== c) tri.push(`<triangle v1="${a}" v2="${b}" v3="${c}"/>`);
  }
  const num = v => (Math.round(v*1e4)/1e4).toString();
  return `<mesh><vertices>`
    + vs.map(v => `<vertex x="${num(v[0])}" y="${num(v[1])}" z="${num(v[2])}"/>`).join('')
    + `</vertices><triangles>` + tri.join('') + `</triangles></mesh>`;
}

function modelXml(parts, title) {
  const objs = parts.map((p, i) =>
    `<object id="${i+1}" type="model" name="${p.name}">${meshXml(p.mesh)}</object>`).join('');
  const comps = parts.map((p, i) => `<component objectid="${i+1}"/>`).join('');
  const rootId = parts.length + 1;
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <metadata name="Title">${title}</metadata>
 <metadata name="Designer">WooJoo Special Industry</metadata>
 <resources>${objs}<object id="${rootId}" type="model" name="assembly"><components>${comps}</components></object></resources>
 <build><item objectid="${rootId}"/></build>
</model>`;
}

export function write3mf(file, parts, title = '(주)우주특수산업') {
  const enc = new TextEncoder();
  const entries = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`],
    ['3D/3dmodel.model', modelXml(parts, title)]
  ];
  const CRC = (() => { const t = new Uint32Array(256);
    for (let i=0;i<256;i++){ let c=i; for (let k=0;k<8;k++) c = (c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[i]=c>>>0; }
    return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF;
    for (let i=0;i<u8.length;i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0; };

  const local = [], central = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const raw = enc.encode(text);
    const comp = zlib.deflateRawSync(raw, { level: 9 });
    const nb = enc.encode(name);
    const lh = Buffer.alloc(30 + nb.length);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc32(raw), 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nb.length, 26);
    Buffer.from(nb).copy(lh, 30);
    local.push(lh, comp);

    const ch = Buffer.alloc(46 + nb.length);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc32(raw), 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(offset, 42);
    Buffer.from(nb).copy(ch, 46);
    central.push(ch);
    offset += lh.length + comp.length;
  }
  const cs = central.reduce((a, b) => a + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cs, 12); end.writeUInt32LE(offset, 16);
  fs.writeFileSync(file, Buffer.concat([...local, ...central, end]));
}
