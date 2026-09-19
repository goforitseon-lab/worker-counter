/* ============================================================
   STL 미리보기 렌더러
     node tools/stl-preview.mjs <out.png> <a.stl> [b.stl ...]

     바이너리 STL을 읽어 아이소메트릭 음영 이미지를 만든다.
     파트마다 색을 바꿔 여러 개를 한 장에 겹쳐 볼 수 있다.
   ============================================================ */
import fs from 'fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const argv = process.argv.slice(2);
const view = { az: -35, el: 28 };                       // 기본 시점 (방위/고도, 도)
const [outPng, ...stls] = argv.filter(a => {
  const m = /^--(az|el)=(-?[\d.]+)$/.exec(a);
  if (m) { view[m[1]] = parseFloat(m[2]); return false; }
  return true;
});
if (!outPng || !stls.length) {
  console.error('사용법: node tools/stl-preview.mjs [--az=-35] [--el=28] <out.png> <a.stl> [b.stl ...]');
  process.exit(1);
}

/* ---------- 바이너리 STL 읽기 ---------- */
function readSTL(file) {
  const b = fs.readFileSync(file);
  const n = b.readUInt32LE(80);
  const tri = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;            // 법선 12바이트 건너뜀
    for (let k = 0; k < 9; k++) tri[i * 9 + k] = b.readFloatLE(o + k * 4);
  }
  return tri;
}

const parts = stls.map(f => ({ name: f, tri: Array.from(readSTL(f)) }));

/* ---------- 브라우저 캔버스에서 음영 처리 ---------- */
const browser = await chromium.launch();
const page = await browser.newPage();
const b64 = await page.evaluate(({ parts, view }) => {
  const W = 1400, H = 980, SS = 2;         // SS = 초과표본 배율
  const cv = document.createElement('canvas');
  cv.width = W * SS; cv.height = H * SS;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#f4f5f7'; ctx.fillRect(0, 0, cv.width, cv.height);

  /* 직교 투영 (Z축 위, 시선 방위·고도는 인자로) */
  const az = view.az * Math.PI / 180, el = view.el * Math.PI / 180;
  const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
  const proj = (x, y, z) => {
    const X = x * ca - y * sa;
    const Y = x * sa + y * ca;
    return [X, -Y * se + z * ce, Y * ce + z * se];   // [화면x, 화면y, 깊이]
  };

  /* 전체 경계로 배율 맞추기 */
  let lo = [1e9, 1e9], hi = [-1e9, -1e9];
  for (const p of parts)
    for (let i = 0; i < p.tri.length; i += 3) {
      const q = proj(p.tri[i], p.tri[i + 1], p.tri[i + 2]);
      lo[0] = Math.min(lo[0], q[0]); hi[0] = Math.max(hi[0], q[0]);
      lo[1] = Math.min(lo[1], q[1]); hi[1] = Math.max(hi[1], q[1]);
    }
  const pad = 70 * SS;
  const s = Math.min((cv.width - 2 * pad) / (hi[0] - lo[0]),
                     (cv.height - 2 * pad) / (hi[1] - lo[1]));
  const ox = (cv.width - (hi[0] - lo[0]) * s) / 2 - lo[0] * s;
  const oy = (cv.height - (hi[1] - lo[1]) * s) / 2 - lo[1] * s;

  /* 파트별 기본색 */
  const HUES = [[62, 82, 110], [38, 92, 74], [120, 62, 52], [96, 86, 46]];

  /* 소프트웨어 Z버퍼 래스터라이저 — 화가 알고리즘의 면 겹침을 피한다 */
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const buf = img.data;
  const zb = new Float32Array(cv.width * cv.height).fill(-Infinity);

  parts.forEach((p, pi) => {
    const [hr, hg, hb] = HUES[pi % HUES.length];
    for (let i = 0; i < p.tri.length; i += 9) {
      const a = proj(p.tri[i],     p.tri[i + 1], p.tri[i + 2]);
      const b = proj(p.tri[i + 3], p.tri[i + 4], p.tri[i + 5]);
      const c = proj(p.tri[i + 6], p.tri[i + 7], p.tri[i + 8]);
      const ax = a[0] * s + ox, ay = a[1] * s + oy;
      const bx = b[0] * s + ox, by = b[1] * s + oy;
      const cx = c[0] * s + ox, cy = c[1] * s + oy;
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (area >= 0) continue;                       // 뒷면 제거
      /* 모델 공간 법선으로 음영 */
      const ux = p.tri[i + 3] - p.tri[i], uy = p.tri[i + 4] - p.tri[i + 1], uz = p.tri[i + 5] - p.tri[i + 2];
      const vx = p.tri[i + 6] - p.tri[i], vy = p.tri[i + 7] - p.tri[i + 1], vz = p.tri[i + 8] - p.tri[i + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const L = Math.hypot(nx, ny, nz) || 1;
      const lit = Math.max(0, (nx * -0.35 + ny * -0.45 + nz * 0.82) / L);
      const k = 0.32 + 0.68 * lit;
      const cr = Math.round(hr + (255 - hr) * k),
            cg = Math.round(hg + (255 - hg) * k),
            cbl = Math.round(hb + (255 - hb) * k);
      /* 경계 상자 주사 */
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))),
            x1 = Math.min(cv.width - 1,  Math.ceil(Math.max(ax, bx, cx))),
            y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))),
            y1 = Math.min(cv.height - 1, Math.ceil(Math.max(ay, by, cy)));
      const inv = 1 / area;
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5;
        for (let x = x0; x <= x1; x++) {
          const pxc = x + 0.5;
          const w0 = ((bx - ax) * (py - ay) - (by - ay) * (pxc - ax)) * inv;
          const w1 = ((cx - bx) * (py - by) - (cy - by) * (pxc - bx)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          /* w1,w2,w0 은 각각 c,a,b 꼭짓점의 무게 */
          const z = w1 * a[2] + w2 * b[2] + w0 * c[2];
          const idx = y * cv.width + x;
          if (z <= zb[idx]) continue;
          zb[idx] = z;
          const o = idx * 4;
          buf[o] = cr; buf[o + 1] = cg; buf[o + 2] = cbl; buf[o + 3] = 255;
        }
      }
    }
  });
  ctx.putImageData(img, 0, 0);

  /* 다운샘플 */
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const oc = out.getContext('2d');
  oc.imageSmoothingQuality = 'high';
  oc.drawImage(cv, 0, 0, W, H);
  return out.toDataURL('image/png').split(',')[1];
}, { parts, view });

await browser.close();
fs.writeFileSync(outPng, Buffer.from(b64, 'base64'));
console.log(`${outPng}  ←  ${stls.join(', ')}`);
