/* ============================================================
   (주)우주특수산업 명함 케이스 — STL 생성기 (화면 없이 바로 실행)

     node tools/build-cardcase.mjs [출력폴더]

   구성
     · 트레이(아래) : 명함 수납. 앞벽 가드 턱으로 카드가 쏟아지지 않는다.
                      뒤쪽 양옆 귀에 원형 소켓 → 뚜껑 핀이 딸깍 끼워진다.
     · 뚜껑(위)     : 평판. 윗면에 명함 내용 전체를 양각으로 직접 새긴다.
                      뒤쪽 팔의 원형 핀이 경첩 축, 앞쪽은 턱에 딸깍 물린다.

   출력 자세 그대로 서포트 없이 뽑으면 된다.
   ============================================================ */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const OUT = process.argv[2] || 'out';
fs.mkdirSync(OUT, { recursive: true });

const CFG = {
  /* 명함 · 수납 */
  cardW: 90, cardD: 50, tol: 0.4, cards: 30, cardT: 0.28,
  /* 케이스 */
  wall: 1.6, floor: 1.2, corner: 3, res: 0.12,
  guardH: 3.6,        // 카드 스택 위로 벽이 더 올라가는 높이
  guardLip: 1.3,      // 앞벽 안쪽으로 내민 가드 턱
  scoopR: 11,         // 옆벽 손가락 홈 반폭
  /* 뚜껑 */
  lidT: 2.0, lidFit: 0.3,
  catchLip: 0.6,      // 앞쪽 걸림턱이 뚜껑 위로 덮는 양 (딸깍)
  /* 경첩 */
  pinR: 1.0, pinFit: 0.2, pinLen: 2.6, armLen: 5.0, armW: 9.0,
  earT: 2.6, earGap: 0.35,
  /* 각인 */
  embossH: 0.6, logoSize: 15, bodySize: 2.9,
  card: {
    coKo: '(주)우주특수산업', coEn: 'WooJoo Special Industry',
    title: '대표이사', name: '백용선',
    lines: [
      ['본사 · 울산광역시 중구 성안8길 55', 800],
      ['TEL. 070-5154-4146   FAX. 052) 943-6446   Mobile. 010-2827-7649', 500],
      ['경주공장 · 경주시 외동읍 구어2산단로1길 114', 800],
      ['TEL. 052) 243-6441   FAX. 052) 243-6446', 500],
      ['E-mail. goforitseon@gwoojoo.co.kr', 500],
    ],
    web: 'http://www.gwoojoo.com'
  }
};

const LOGO_SVG = fs.readFileSync(
  path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'woojoo-logo.svg'), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => { console.error('[pageerror]', e.message); });
await page.setContent(`<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
</head><body></body></html>`);
try { await page.evaluate(() => document.fonts.ready); } catch {}
await page.waitForTimeout(1500);

const result = await page.evaluate(async ({ CFG, LOGO_SVG }) => {
  const F = Math.fround, KMAX = 3;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- 다중 구간 하이트맵 ---------- */
  function newSolid(W, H, res) {
    const cols = Math.max(4, Math.round(W / res)), rows = Math.max(4, Math.round(H / res));
    return { sp: new Float32Array(cols*rows*KMAX*2), cnt: new Uint8Array(cols*rows),
             cols, rows, res, W: cols*res, H: rows*res };
  }
  function addSpan(g, i, z0, z1) {
    if (!(z1 - z0 > 1e-9)) return;
    const base = i*KMAX*2; let lo = z0, hi = z1; const keep = [];
    for (let k = 0; k < g.cnt[i]; k++) {
      const a = g.sp[base+k*2], b = g.sp[base+k*2+1];
      if (b < lo - 1e-9 || a > hi + 1e-9) keep.push([a,b]);
      else { lo = Math.min(lo,a); hi = Math.max(hi,b); }
    }
    keep.push([lo,hi]); keep.sort((p,q)=>p[0]-q[0]);
    const n = Math.min(keep.length, KMAX);
    for (let k = 0; k < n; k++) { g.sp[base+k*2]=F(keep[k][0]); g.sp[base+k*2+1]=F(keep[k][1]); }
    g.cnt[i] = n;
  }
  function cutSpan(g, i, z0, z1) {
    if (!(z1 - z0 > 1e-9) || !g.cnt[i]) return;
    const base = i*KMAX*2; const keep = [];
    for (let k = 0; k < g.cnt[i]; k++) {
      const a = g.sp[base+k*2], b = g.sp[base+k*2+1];
      if (z1 <= a + 1e-9 || z0 >= b - 1e-9) { keep.push([a,b]); continue; }
      if (a < z0 - 1e-9) keep.push([a, z0]);
      if (z1 < b - 1e-9) keep.push([z1, b]);
    }
    const n = Math.min(keep.length, KMAX);
    for (let k = 0; k < n; k++) { g.sp[base+k*2]=F(keep[k][0]); g.sp[base+k*2+1]=F(keep[k][1]); }
    g.cnt[i] = n;
  }
  const volumeOf = g => {
    let v = 0;
    for (let i = 0; i < g.cnt.length; i++) {
      const base = i*KMAX*2;
      for (let k = 0; k < g.cnt[i]; k++) v += g.sp[base+k*2+1] - g.sp[base+k*2];
    }
    return v * g.res * g.res;
  };

  function meshOf(g, ox = 0, oy = 0, out) {
    const { sp, cnt, cols, rows, res } = g, P = out || [];
    const IN = (c,r) => c>=0 && r>=0 && c<cols && r<rows, ID = (c,r) => r*cols+c;
    const N = (c,r) => IN(c,r) ? cnt[ID(c,r)] : 0;
    const LO = (c,r,k) => sp[ID(c,r)*KMAX*2+k*2], HI = (c,r,k) => sp[ID(c,r)*KMAX*2+k*2+1];
    const same = (c1,r1,c2,r2) => {
      const n = N(c1,r1); if (n !== N(c2,r2)) return false;
      for (let k=0;k<n;k++) if (LO(c1,r1,k)!==LO(c2,r2,k)||HI(c1,r1,k)!==HI(c2,r2,k)) return false;
      return true;
    };
    function diff(c1,r1,c2,r2) {
      const o = [];
      for (let k=0;k<N(c1,r1);k++) {
        let segs = [[LO(c1,r1,k), HI(c1,r1,k)]];
        for (let m=0;m<N(c2,r2);m++) {
          const bl=LO(c2,r2,m), bh=HI(c2,r2,m), nx=[];
          for (const [l,h] of segs) {
            if (bh <= l+1e-9 || bl >= h-1e-9) { nx.push([l,h]); continue; }
            if (l < bl-1e-9) nx.push([l,bl]);
            if (bh < h-1e-9) nx.push([bh,h]);
          }
          segs = nx; if (!segs.length) break;
        }
        for (const sg of segs) if (sg[1]-sg[0] > 1e-9) o.push(sg);
      }
      return o;
    }
    const X = c => ox + c*res, YL = r => oy + (rows-1-r)*res, YH = r => oy + (rows-r)*res;
    const push = (a,b,c) => P.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]);
    const quad = (a,b,c,d) => { push(a,b,c); push(a,c,d); };

    for (let r=0;r<rows;r++) { let c=0;
      while (c<cols) {
        if (!N(c,r)) { c++; continue; }
        let c2=c; while (c2+1<cols && same(c,r,c2+1,r)) c2++;
        const x0=X(c),x1=X(c2+1),y0=YL(r),y1=YH(r);
        for (let k=0;k<N(c,r);k++) {
          const l=LO(c,r,k), h=HI(c,r,k);
          quad([x0,y0,h],[x1,y0,h],[x1,y1,h],[x0,y1,h]);
          quad([x0,y0,l],[x0,y1,l],[x1,y1,l],[x1,y0,l]);
        }
        c=c2+1;
      } }
    for (let c=-1;c<cols;c++) { let r=0;
      while (r<rows) {
        const pa=diff(c,r,c+1,r), pb=diff(c+1,r,c,r);
        if (!pa.length && !pb.length) { r++; continue; }
        let r2=r; while (r2+1<rows && same(c,r,c,r2+1) && same(c+1,r,c+1,r2+1)) r2++;
        const xw=X(c+1), yA=YL(r2), yB=YH(r);
        pa.forEach(([z0,z1])=>quad([xw,yA,z0],[xw,yB,z0],[xw,yB,z1],[xw,yA,z1]));
        pb.forEach(([z0,z1])=>quad([xw,yA,z0],[xw,yA,z1],[xw,yB,z1],[xw,yB,z0]));
        r=r2+1;
      } }
    for (let r=-1;r<rows;r++) { let c=0;
      while (c<cols) {
        const pa=diff(c,r,c,r+1), pb=diff(c,r+1,c,r);
        if (!pa.length && !pb.length) { c++; continue; }
        let c2=c; while (c2+1<cols && same(c,r,c2+1,r) && same(c,r+1,c2+1,r+1)) c2++;
        const yw=YL(r), x0=X(c), x1=X(c2+1);
        pa.forEach(([z0,z1])=>quad([x0,yw,z0],[x1,yw,z0],[x1,yw,z1],[x0,yw,z1]));
        pb.forEach(([z0,z1])=>quad([x0,yw,z0],[x0,yw,z1],[x1,yw,z1],[x1,yw,z0]));
        c=c2+1;
      } }
    return P;
  }

  function inRR(x, y, w, h, r) {
    if (w<=0||h<=0||x<0||y<0||x>w||y>h) return false;
    const rr = Math.max(0, Math.min(r, w/2, h/2));
    if (!rr) return true;
    const cx = clamp(x, rr, w-rr), cy = clamp(y, rr, h-rr);
    return (x-cx)**2 + (y-cy)**2 <= rr*rr;
  }

  /* ---------- 치수 ---------- */
  const C = CFG;
  const stack = C.cards * C.cardT;
  const iw = C.cardW + 2*C.tol, id = C.cardD + 2*C.tol;      // 카드 공간
  const ow = iw + 2*C.wall,     od = id + 2*C.wall;          // 트레이 바깥
  const trayTop = C.floor + stack + C.guardH;
  const ledgeZ  = trayTop - C.lidT;                          // 뚜껑이 앉는 단
  const ledgeW  = C.wall * 0.45, rimW = C.wall - ledgeW;
  const recW = iw + 2*ledgeW, recD = id + 2*ledgeW;          // 뚜껑 자리
  const low = recW - 2*C.lidFit, lod = recD - 2*C.lidFit;    // 뚜껑 크기
  const lidX0 = (ow - low)/2, lidY0 = (od - lod)/2;          // 트레이 기준 뚜껑 위치
  const guardBot = C.floor + stack + 0.3;
  const pivotY = od + 1.2, pivotZ = ledgeZ + C.lidT/2;
  const armBack = pivotY + C.pinR + 0.6;
  const earIn = lidX0 - C.earGap, earOut = earIn + C.earT;   // 트레이 기준(좌측). 우측은 대칭
  const postTop = pivotZ + C.pinR + 1.3;
  const socketR = C.pinR + C.pinFit;
  const socketDepth = C.earT - 0.7;                          // 귀 안쪽에 남길 살 0.7mm
  const pinLen = C.earGap + socketDepth - 0.25;             // 핀이 귀를 뚫지 않도록
  const earY0 = od - 0.8, earY1 = pivotY + C.pinR + 2.2;

  /* ---------- 트레이 ---------- */
  function buildTray() {
    const padX = Math.max(0, -(earIn - C.earT)) + 1.0;
    const g = newSolid(ow + 2*padX, earY1 + 1.0, C.res);
    const { cols, rows, res } = g;
    const innerR = C.corner - C.wall;

    for (let r=0;r<rows;r++) {
      const y = (rows-1-r+0.5)*res;
      for (let c=0;c<cols;c++) {
        const x = (c+0.5)*res - padX;
        const i = r*cols+c;

        /* 본체 */
        if (inRR(x, y, ow, od, C.corner)) {
          if (inRR(x-C.wall, y-C.wall, iw, id, innerR)) {
            addSpan(g, i, 0, C.floor);
            if (y < C.wall + C.guardLip) addSpan(g, i, guardBot, ledgeZ);      // 가드 턱
          } else {
            const inLedge = inRR(x-rimW, y-rimW, ow-2*rimW, od-2*rimW, C.corner-rimW);
            let h = inLedge ? ledgeZ : trayTop;
            if (y > od - rimW - 0.01 && !inLedge) h = ledgeZ;                  // 뒷벽 림은 낮춘다(뚜껑 회전)
            const onSide = (x < C.wall) || (x > ow - C.wall);
            if (onSide && Math.abs(y - od/2) < C.scoopR) {                     // 손가락 홈
              const t = (y - od/2)/C.scoopR, lo = C.floor + stack*0.65;
              h = Math.min(h, lo + (h-lo)*(1 - Math.sqrt(1-t*t)));
            }
            addSpan(g, i, 0, h);
            /* 앞쪽 걸림턱 — 뚜껑 앞모서리 위를 덮어 딸깍 잡는다 */
            const lipIn = rimW + ledgeW + 0.8;
            if (y < lipIn && y > rimW - 0.01 && Math.abs(x - ow/2) < ow*0.28) {
              const t = clamp((lipIn - y)/0.6, 0, 1);        // 안쪽 끝을 비스듬히 깎아 부드럽게 물리게
              if (t > 0.02) addSpan(g, i, trayTop - C.catchLip*t, trayTop);
            }
          }
          continue;
        }

        /* 경첩 귀 (뒤쪽 바깥) */
        const dx = (x < ow/2) ? (lidX0 - x) : (x - (ow - lidX0));
        if (y > earY0 && y < earY1 && dx >= C.earGap && dx <= C.earGap + C.earT) {
          addSpan(g, i, 0, postTop);
          continue;
        }
        /* 귀를 트레이에 잇는 뒤판 */
        if (y > earY0 && y < od + 1.0 && dx > 0 && dx < C.earGap + C.earT) addSpan(g, i, 0, ledgeZ);
      }
    }

    /* 소켓 파내기 (귀 안쪽 면에서) */
    for (let r=0;r<rows;r++) {
      const y = (rows-1-r+0.5)*res, dy = y - pivotY;
      if (Math.abs(dy) > socketR) continue;
      const hz = Math.sqrt(Math.max(0, socketR*socketR - dy*dy));
      for (let c=0;c<cols;c++) {
        const x = (c+0.5)*res - padX;
        const dx = (x < ow/2) ? (lidX0 - x) : (x - (ow - lidX0));
        if (dx < C.earGap || dx > C.earGap + socketDepth) continue;
        const i = r*cols+c;
        cutSpan(g, i, pivotZ - hz, pivotZ + hz);
        if (Math.abs(dy) <= socketR*0.78) cutSpan(g, i, pivotZ, postTop + 1);   // 위로 트인 좁은 입구
      }
    }
    return { g, padX };
  }

  /* ---------- 명함 각인 마스크 ---------- */
  async function loadLogo(px) {
    const svg = LOGO_SVG.replace('<svg ', '<svg width="640" height="640" ').replace(/currentColor/g, '#000');
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
    const cv = document.createElement('canvas'); cv.width = px; cv.height = px;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, px, px);
    const d = ctx.getImageData(0, 0, px, px).data, m = new Uint8Array(px*px);
    for (let i = 0; i < px*px; i++) m[i] = d[i*4+3] > 128 ? 1 : 0;
    URL.revokeObjectURL(url);
    return m;
  }

  /* 판(뚜껑 평판) 좌표계에 맞춰 그린다. ox0/oy0 = 격자 안에서 판의 좌/상단 위치(mm) */
  async function cardMask(cols, rows, res, ox0, oy0, W, H) {
    const cv = document.createElement('canvas'); cv.width = cols; cv.height = rows;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,cols,rows);
    ctx.fillStyle = '#fff';
    const X = mm => (mm + ox0)/res, Y = ty => (ty + oy0)/res;
    const S = mm => mm/res;                       // 길이 환산 (오프셋 더하면 안 됨)
    let minText = 99;
    const setF = (px,w) => { ctx.font = `${w} ${px}px 'Noto Sans KR', system-ui, sans-serif`; };
    const T = (txt, xmm, tymm, size, weight, align, maxW) => {
      if (!txt) return;
      let px = size/res; setF(px, weight);
      if (maxW) { const mp = maxW/res, w = ctx.measureText(txt).width;
        if (w > mp) { px *= mp/w; setF(px, weight); } }
      minText = Math.min(minText, px*res);
      ctx.textAlign = align || 'left'; ctx.textBaseline = 'top';
      ctx.fillText(txt, X(xmm), Y(tymm));
    };
    const K = CFG.card, M = Math.max(3.5, W*0.05), body = CFG.bodySize;
    const sName = body*2.2, sCoKo = body*1.75, sCoEn = body*0.95, sTitle = body*0.95;
    const step = body*1.34, half = (W - 2*M - 3)/2;
    const top = M*0.9, logoS = Math.min(CFG.logoSize, H*0.34, W*0.28);
    const tx = M + logoS + 2.5, rightMax = W - M - tx - 2;
    T(K.coEn, tx, top + logoS*0.14, sCoEn, 600, 'left', rightMax*0.62);
    T(K.coKo, tx, top + logoS*0.14 + sCoEn*1.45, sCoKo, 800, 'left', rightMax*0.7);
    T(K.title, W-M, top + logoS*0.08, sTitle, 600, 'right', half*0.7);
    T(K.name, W-M, top + logoS*0.08 + sTitle*1.6, sName, 800, 'right', half*0.8);
    const ruleTy = top + logoS + 2.4;
    ctx.fillRect(X(M), Y(ruleTy), S(W-2*M), Math.max(1, S(0.35)));
    const webH = K.web ? body*1.9 : 0;
    const aT = ruleTy + 2.2, aB = H - M*0.8 - webH;
    const blockH = K.lines.length * step;
    let ty = aT + Math.max(0, (aB - aT - blockH)/2);
    K.lines.forEach(([t,w]) => { T(t, M, ty, body, w, 'left', W-2*M); ty += step; });
    if (K.web) T(K.web, W/2, H - M*0.8 - body*1.25, body, 600, 'center', W-2*M);

    const img = ctx.getImageData(0,0,cols,rows).data, mask = new Uint8Array(cols*rows);
    for (let i = 0; i < cols*rows; i++) if (img[i*4] > 127) mask[i] = 1;

    const lp = Math.max(8, Math.round(logoS/res));
    const lm = await loadLogo(lp);
    const ox = Math.round(X(M)), oy = Math.round(Y(top));
    for (let yy = 0; yy < lp; yy++) { const t2 = oy+yy; if (t2<0||t2>=rows) continue;
      for (let xx = 0; xx < lp; xx++) { if (!lm[yy*lp+xx]) continue;
        const t3 = ox+xx; if (t3<0||t3>=cols) continue; mask[t2*cols+t3] = 1; } }
    return { mask, minText };
  }

  /* ---------- 뚜껑 (평판 + 명함 직각인 + 경첩 팔) ---------- */
  async function buildLid() {
    const pinOut = pinLen;
    const armEnd = armBack - lidY0;                       // 뚜껑 기준 팔 끝
    const g = newSolid(low + 2*pinOut, Math.max(lod, armEnd) + 0.6, C.res);
    const { cols, rows, res } = g;
    const lidR = Math.max(0, C.corner - rimW - C.lidFit);
    const notchDepth = C.catchLip - 0.2;                  // 걸림턱과 0.2mm 간섭 → 딸깍
    const notchY = rimW + ledgeW + 0.8 - lidY0;
    const pivotLocalY = pivotY - lidY0;
    const armX = C.armW;

    for (let r=0;r<rows;r++) {
      const y = (rows-1-r+0.5)*res;
      for (let c=0;c<cols;c++) {
        const x = (c+0.5)*res - pinOut;
        const i = r*cols+c;
        if (inRR(x, y, low, lod, lidR)) {
          addSpan(g, i, 0, y < notchY ? C.lidT - notchDepth : C.lidT);
        } else if (y >= lod && y < armEnd && (x < armX || x > low - armX) && x > 0 && x < low) {
          addSpan(g, i, 0, C.lidT);                        // 경첩 팔
        }
      }
    }

    /* 경첩 핀 */
    const zc = C.lidT/2;
    for (let r=0;r<rows;r++) {
      const y = (rows-1-r+0.5)*res, dy = y - pivotLocalY;
      if (Math.abs(dy) > C.pinR) continue;
      const hz = Math.sqrt(Math.max(0, C.pinR*C.pinR - dy*dy));
      for (let c=0;c<cols;c++) {
        const x = (c+0.5)*res - pinOut;
        if (!(x < 0 && x > -pinOut) && !(x > low && x < low + pinOut)) continue;
        addSpan(g, r*cols+c, Math.max(0, zc-hz), zc+hz);
      }
    }

    /* 명함 각인 — 뚜껑 윗면에 바로.
       색을 따로 지정할 수 있도록 글자는 별도 덩어리로 만든다 (3MF 파트 분리) */
    const { mask, minText } = await cardMask(cols, rows, res, pinOut, g.H - lod, low, lod);
    const ink = newSolid(g.W, g.H, res);
    let inkCells = 0;
    for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
      const i = r*cols+c;
      if (!mask[i] || !g.cnt[i]) continue;
      const x = (c+0.5)*res - pinOut, y = (rows-1-r+0.5)*res;
      if (!inRR(x, y, low, lod, lidR) || y < notchY) continue;
      addSpan(ink, i, C.lidT, C.lidT + C.embossH);
      inkCells++;
    }
    return { g, ink, minText, inkCells };
  }

  /* ---------- STL ---------- */
  function toSTL(P, title) {
    const n = P.length/9, buf = new ArrayBuffer(84 + n*50), dv = new DataView(buf);
    const head = ('woojoo card case · ' + title).slice(0,79);
    for (let i=0;i<head.length;i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
    dv.setUint32(80, n, true);
    let o = 84;
    for (let t=0;t<n;t++) {
      const i=t*9;
      const ux=P[i+3]-P[i],uy=P[i+4]-P[i+1],uz=P[i+5]-P[i+2];
      const vx=P[i+6]-P[i],vy=P[i+7]-P[i+1],vz=P[i+8]-P[i+2];
      let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
      const L=Math.hypot(nx,ny,nz)||1;
      dv.setFloat32(o,nx/L,true); dv.setFloat32(o+4,ny/L,true); dv.setFloat32(o+8,nz/L,true); o+=12;
      for (let k=0;k<9;k++){ dv.setFloat32(o,P[i+k],true); o+=4; }
      dv.setUint16(o,0,true); o+=2;
    }
    return Array.from(new Uint8Array(buf));
  }
  function audit(P, g) {
    let v6=0,nx=0,ny=0,nz=0;
    let x0=1e9,y0=1e9,z0=1e9,x1=-1e9,y1=-1e9,z1=-1e9;
    for (let i=0;i<P.length;i+=9) {
      const ax=P[i],ay=P[i+1],az=P[i+2],bx=P[i+3],by=P[i+4],bz=P[i+5],cx=P[i+6],cy=P[i+7],cz=P[i+8];
      v6+=ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx);
      const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
      nx+=uy*vz-uz*vy; ny+=uz*vx-ux*vz; nz+=ux*vy-uy*vx;
    }
    for (let i=0;i<P.length;i+=3) {
      if(P[i]<x0)x0=P[i]; if(P[i]>x1)x1=P[i];
      if(P[i+1]<y0)y0=P[i+1]; if(P[i+1]>y1)y1=P[i+1];
      if(P[i+2]<z0)z0=P[i+2]; if(P[i+2]>z1)z1=P[i+2];
    }
    const gv = volumeOf(g);
    return { tri:P.length/9, size:[+(x1-x0).toFixed(2),+(y1-y0).toFixed(2),+(z1-z0).toFixed(2)],
             z0:+z0.toFixed(3), vol:+(gv/1000).toFixed(2),
             relErr:+(Math.abs(v6/6-gv)/gv).toExponential(1),
             normSum:+(Math.abs(nx)+Math.abs(ny)+Math.abs(nz)).toExponential(1) };
  }

  /* 위에서 내려다본 음영 미리보기 */
  function render(g, scale, extra) {
    const { cols, rows, res } = g;
    const topZ = new Float32Array(cols*rows);
    let zmax = 0;
    for (let i=0;i<cols*rows;i++) {
      let t = 0;
      for (let k=0;k<g.cnt[i];k++) t = Math.max(t, g.sp[i*KMAX*2+k*2+1]);
      if (extra) for (let k=0;k<extra.cnt[i];k++) t = Math.max(t, extra.sp[i*KMAX*2+k*2+1]);
      topZ[i] = t; if (t > zmax) zmax = t;
    }
    const cv = document.createElement('canvas');
    cv.width = Math.round(cols*scale); cv.height = Math.round(rows*scale);
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(cols, rows);
    for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
      const i=r*cols+c, k=i*4, h=topZ[i];
      if (h <= 0) { img.data[k]=246; img.data[k+1]=246; img.data[k+2]=244; img.data[k+3]=255; continue; }
      const hx = (c>0?topZ[i-1]:h) - (c<cols-1?topZ[i+1]:h);
      const hy = (r>0?topZ[i-cols]:h) - (r<rows-1?topZ[i+cols]:h);
      const sh = Math.max(-1, Math.min(1, (hx*0.8 + hy*0.6)/res));
      const base = 0.42 + 0.46*(h/zmax);
      const v = Math.max(0, Math.min(1, base + sh*0.34));
      img.data[k]=Math.round(232*v); img.data[k+1]=Math.round(178*v+12); img.data[k+2]=Math.round(38*v+8);
      img.data[k+3]=255;
    }
    const tmp = document.createElement('canvas'); tmp.width=cols; tmp.height=rows;
    tmp.getContext('2d').putImageData(img,0,0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png').split(',')[1];
  }

  /* 앞뒤 방향 단면 — 가드 턱·걸림턱·경첩이 보이도록 */
  function section(g, xmm, offX, scale) {
    const { cols, rows, res } = g;
    const c = Math.round((xmm + offX)/res);
    let zmax = 0;
    for (let i=0;i<g.cnt.length;i++)
      for (let k=0;k<g.cnt[i];k++) zmax = Math.max(zmax, g.sp[i*KMAX*2+k*2+1]);
    const zpx = Math.ceil(zmax/res) + 6;
    const cv = document.createElement('canvas');
    cv.width = Math.round(rows*scale); cv.height = Math.round(zpx*scale);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#f6f6f4'; ctx.fillRect(0,0,cv.width,cv.height);
    ctx.fillStyle = '#d9a520';
    for (let r=0;r<rows;r++) {
      const i = r*cols+c;
      for (let k=0;k<g.cnt[i];k++) {
        const z0 = g.sp[i*KMAX*2+k*2], z1 = g.sp[i*KMAX*2+k*2+1];
        const px = (rows-1-r)*scale;                 // y 축 (앞 → 뒤)
        ctx.fillRect(px, (zpx - z1/res)*scale, Math.ceil(scale), Math.max(1,(z1-z0)/res*scale));
      }
    }
    return cv.toDataURL('image/png').split(',')[1];
  }

  const tray = buildTray();
  const lid  = await buildLid();

  /* 특정 지점의 고체 구간을 그대로 찍어본다 (가드·걸림턱이 실제로 있는지) */
  function probe(g, offX, offY, xmm, ymm) {
    const c = Math.round((xmm + offX)/g.res - 0.5);
    const r = g.rows - 1 - Math.round((ymm + offY)/g.res - 0.5);
    if (c<0||r<0||c>=g.cols||r>=g.rows) return 'grid 밖';
    const i = r*g.cols + c, o = [];
    for (let k=0;k<g.cnt[i];k++) o.push([+g.sp[i*KMAX*2+k*2].toFixed(2), +g.sp[i*KMAX*2+k*2+1].toFixed(2)]);
    return o.length ? o.map(v=>`${v[0]}~${v[1]}`).join(' + ') : '빈칸';
  }
  const px = tray.padX, py = 0;
  const probes = {
    '카드 바닥 (한가운데)':        probe(tray.g, px, py, ow/2, od/2),
    '앞벽 안쪽 y=2.2 (가드턱)':    probe(tray.g, px, py, ow/2, C.wall + 0.6),
    '앞벽 안쪽 y=2.8 (가드턱 끝)': probe(tray.g, px, py, ow/2, C.wall + 1.2),
    '앞벽 안쪽 y=3.5 (턱 바깥)':   probe(tray.g, px, py, ow/2, C.wall + 1.9),
    '앞 단 y=1.3 (걸림턱)':        probe(tray.g, px, py, ow/2, 1.3),
    '앞 바깥벽 y=0.4':             probe(tray.g, px, py, ow/2, 0.4),
    '뒷벽 y=53 (낮춘 림)':         probe(tray.g, px, py, ow/2, od - 1.0),
    '경첩 귀 (소켓 중심)':         probe(tray.g, px, py, lidX0 - C.earGap - 0.5, pivotY),
    '경첩 귀 (소켓 옆)':           probe(tray.g, px, py, lidX0 - C.earGap - 0.5, pivotY + socketR - 0.1),
  };
  const Pt = new Float32Array(meshOf(tray.g));
  const Pl = new Float32Array(meshOf(lid.g));
  const Pi = new Float32Array(meshOf(lid.ink));

  /* ---------- 맞물림 검증 ---------- */
  const fit = {
    '뚜껑 여유(편측)': +(((recW - low)/2)).toFixed(3),
    '핀 끝 x(트레이좌표)': +((lidX0 - pinLen)).toFixed(3),
    '소켓 안쪽 끝 x': +((lidX0 - C.earGap - socketDepth)).toFixed(3),
    '귀 안쪽 끝 x': +((lidX0 - C.earGap - C.earT)).toFixed(3),
    '핀이 귀를 안뚫음': (lidX0 - pinLen) > (lidX0 - C.earGap - C.earT) + 0.3,
    '핀이 소켓에 닿음': (lidX0 - pinLen) <= (lidX0 - C.earGap - socketDepth) + 0.4,
    '핀 반지름': C.pinR, '소켓 반지름': +socketR.toFixed(2),
    '소켓 입구 반폭': +(socketR*0.78).toFixed(3),
    '입구가 핀보다 좁음': socketR*0.78 < C.pinR,
    '핀축 z(뚜껑)': +((C.lidT/2 + ledgeZ)).toFixed(3),
    '소켓축 z(트레이)': +pivotZ.toFixed(3),
    '축 일치': Math.abs((C.lidT/2 + ledgeZ) - pivotZ) < 0.01,
    '걸림턱 간섭': +((C.catchLip - (C.catchLip - 0.2))).toFixed(2),
    '가드턱 높이': +((ledgeZ - (C.floor + stack + 0.3))).toFixed(2),
    '가드턱이 카드위': (C.floor + stack + 0.3) > (C.floor + stack) - 1e-9
  };

  return {
    probes,
    fit,
    dims: { stack:+stack.toFixed(2), trayTop:+trayTop.toFixed(2), ledgeZ:+ledgeZ.toFixed(2),
            lid:[+low.toFixed(2), +lod.toFixed(2), C.lidT], pivotZ:+pivotZ.toFixed(2),
            closedH:+(trayTop + C.embossH).toFixed(2), minText:+lid.minText.toFixed(2) },
    trayAudit: audit(Pt, tray.g), lidAudit: audit(Pl, lid.g),
    inkAudit: audit(Pi, lid.ink), inkCells: lid.inkCells,
    trayStl: toSTL(Pt, 'tray'), lidStl: toSTL(new Float32Array([...Pl, ...Pi]), 'lid'),
    trayMesh: Array.from(Pt), lidMesh: Array.from(Pl), inkMesh: Array.from(Pi),
    trayPng: render(tray.g, 1.6), lidPng: render(lid.g, 1.4, lid.ink),
    sectionPng: section(tray.g, ow/2, tray.padX, 5)
  };
}, { CFG, LOGO_SVG });

/* ============================================================
   3MF 쓰기
     슬라이서에서 파트별로 필라멘트를 지정할 수 있도록,
     뚜껑을 "몸체 + 글자" 두 파트를 가진 하나의 오브젝트로 내보낸다.
     (프루사/오르카/뱀부 모두 파트별 필라멘트 지정 가능)
   ============================================================ */
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

function modelXml(parts) {
  const objs = parts.map((p, i) =>
    `<object id="${i+1}" type="model" name="${p.name}">${meshXml(p.mesh)}</object>`).join('');
  const comps = parts.map((p, i) => `<component objectid="${i+1}"/>`).join('');
  const rootId = parts.length + 1;
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <metadata name="Title">(주)우주특수산업 명함 케이스</metadata>
 <metadata name="Designer">WooJoo Special Industry</metadata>
 <resources>${objs}<object id="${rootId}" type="model" name="assembly"><components>${comps}</components></object></resources>
 <build><item objectid="${rootId}"/></build>
</model>`;
}

function write3mf(file, parts) {
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
    ['3D/3dmodel.model', modelXml(parts)]
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

fs.writeFileSync(path.join(OUT, 'woojoo_case_tray.stl'), Buffer.from(result.trayStl));
fs.writeFileSync(path.join(OUT, 'woojoo_case_lid.stl'),  Buffer.from(result.lidStl));
write3mf(path.join(OUT, 'woojoo_case_tray.3mf'), [{ name: '트레이', mesh: result.trayMesh }]);
write3mf(path.join(OUT, 'woojoo_case_lid.3mf'), [
  { name: '뚜껑 몸체 (흰색)', mesh: result.lidMesh },
  { name: '명함 글자 (검정)', mesh: result.inkMesh }
]);
fs.writeFileSync(path.join(OUT, 'preview_tray.png'), Buffer.from(result.trayPng, 'base64'));
fs.writeFileSync(path.join(OUT, 'preview_lid.png'),  Buffer.from(result.lidPng, 'base64'));
fs.writeFileSync(path.join(OUT, 'preview_section.png'), Buffer.from(result.sectionPng, 'base64'));
console.log('치수      ', JSON.stringify(result.dims));
console.log('단면 실측 (z 구간, mm)');
for (const [k,v] of Object.entries(result.probes)) console.log('   ', k.padEnd(26), v);
console.log('맞물림    ');
for (const [k,v] of Object.entries(result.fit)) console.log('   ', k.padEnd(22), v);
console.log('트레이    ', JSON.stringify(result.trayAudit));
console.log('뚜껑      ', JSON.stringify(result.lidAudit));
console.log('글자      ', JSON.stringify(result.inkAudit), '셀', result.inkCells);
const fitOk = result.fit['핀이 귀를 안뚫음'] && result.fit['핀이 소켓에 닿음']
  && result.fit['입구가 핀보다 좁음'] && result.fit['축 일치'] && result.fit['가드턱이 카드위'];
const ok = [result.trayAudit, result.lidAudit].every(a => a.relErr < 1e-6 && a.normSum < 1e-5 && a.z0 === 0) && fitOk;
console.log(ok ? '✅ 두 파트 모두 닫힌 메시 · 베드에 밀착' : '❌ 검증 실패');
await browser.close();
