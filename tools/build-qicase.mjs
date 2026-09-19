/* ============================================================
   무선충전 보조배터리 케이스   node tools/build-qicase.mjs [출력폴더]

     하부 셸 + 평판 커버 2피스.
       · 바닥 바깥면 = AIRBAG 경고라벨 4색 상감 (베드에 닿는 면이라 1층부터 색이 깔린다)
       · 커버 윗면   = 우주 로고 원형 뱃지 (폰이 평평하게 놓이도록 포켓 방식)

     USB-C 개구 위치는 PORT 값 세 개로만 바뀐다.
     확인용으로 포트 주변만 잘라낸 시험 조각도 같이 내보낸다.
   ============================================================ */
import fs from 'fs'; import path from 'path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { newSolid, addSpan, cutSpan, meshOf, audit, toSTL, inRR, sdRR, volumeOf, F }
  from './lib/solid.mjs';
import { write3mf } from './lib/threemf.mjs';

const OUT = process.argv[2] || 'out-qi';
fs.mkdirSync(OUT, { recursive: true });

const M = {
  /* 모듈 실측 */
  modW: 60, modH: 100, modT: 12,
  clr: 0.35,                 // 모듈 둘레 여유 (편측)
  /* 케이스 */
  wall: 2.2, floor: 1.6, lidT: 1.6, lidFit: 0.3,
  corner: 5, res: 0.15,
  /* USB-C 개구 — 아래 네 값만 고치면 위치가 바뀐다
     실측: 모듈 밑면에서 6mm 올라온 자리에서 시작해 10mm 에서 끝남 (가로 10mm).
     여유 0.7mm 씩 줘서 중심 8mm 에 5.4mm 높이로 뚫는다. */
  portW: 11.5,               // 가로 (플러그 쉘 여유 포함)
  portH: 5.4,                // 세로
  portX: 0,                  // 좌우 중심에서 오프셋 (+ = 오른쪽)
  portZ: 5.3,                // 바닥 안쪽면에서 개구 아래끝까지
  portCh: 0.8, portChD: 1.2, // 바깥쪽 유도 챔퍼 (넓어지는 양 / 깊이)
  /* 각인 — 원형 포켓을 0.5mm 파고 그 안에 로고만 표면 높이로 남긴다.
     (통짜 음각보다 훨씬 잘 보이고, 폰이 닿는 면은 그대로 평평하다) */
  logoSize: 30, engraveD: 0.5, badgeR: 18.5, badgeFloorT: 0.4,
  /* 바닥 AIRBAG 라벨 상감 */
  labelMargin: 3.0,          // 케이스 바깥 모서리에서 라벨까지
  labelT: 0.6,               // 색이 들어가는 깊이 (0.2mm 층 x3)
};

const R = M.res;
const iw = M.modW + 2*M.clr, ih = M.modH + 2*M.clr;      // 내부
const ow = iw + 2*M.wall,    oh = ih + 2*M.wall;         // 외부
const cav = M.modT + 0.3;                                 // 모듈이 들어갈 깊이
const ledgeZ = M.floor + cav;                             // 커버가 앉는 단
const wallTop = ledgeZ + M.lidT;                          // 셸 전체 높이
const rimW = M.wall * 0.55, ledgeW = M.wall - rimW;
const recW = iw + 2*ledgeW, recH = ih + 2*ledgeW;          // 커버 자리
const lidW = recW - 2*M.lidFit, lidH = recH - 2*M.lidFit;

/* ---------- 로고 마스크 (브라우저에서 한 번만 래스터) ---------- */
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const LOGO = fs.readFileSync(path.join(ROOT, 'woojoo-logo.svg'), 'utf8');
const px = Math.round(M.logoSize / R);
const browser = await chromium.launch();
const page = await browser.newPage();
const logoMask = await page.evaluate(async ({ svg, px }) => {
  const url = URL.createObjectURL(new Blob(
    [svg.replace('<svg ', `<svg width="${px}" height="${px}" `).replace(/currentColor/g,'#000')],
    { type:'image/svg+xml' }));
  const img = new Image();
  await new Promise((ok,no)=>{ img.onload=ok; img.onerror=no; img.src=url; });
  const cv = document.createElement('canvas'); cv.width=px; cv.height=px;
  const ctx = cv.getContext('2d', { willReadFrequently:true });
  ctx.drawImage(img, 0, 0, px, px);
  const d = ctx.getImageData(0,0,px,px).data, m = [];
  for (let i=0;i<px*px;i++) m.push(d[i*4+3] > 128 ? 1 : 0);
  return m;
}, { svg: LOGO, px });

/* ---------- AIRBAG 라벨 (4색 인덱스 래스터) ----------
   원본은 실치수 112.27 x 72.39 mm. 케이스 바닥에 90도 돌려 얹는다.
   바닥 바깥면은 베드에 닿는 면이므로 X 로 뒤집어야 뒤집어 봤을 때 바로 읽힌다. */
const LAB_W_MM = 112.01, LAB_H_MM = 72.14;
const labScale = Math.min((ow - 2*M.labelMargin) / LAB_H_MM,     // 라벨 세로 → 케이스 가로
                          (oh - 2*M.labelMargin) / LAB_W_MM);    // 라벨 가로 → 케이스 세로
const labXext = LAB_H_MM * labScale, labYext = LAB_W_MM * labScale;
const labCols = Math.round(labYext / R), labRows = Math.round(labXext / R);
const labX1 = (ow + labXext)/2, labY0 = (oh - labYext)/2;        // 배치 기준 모서리

const labelPng = fs.readFileSync(path.join(ROOT, 'assets', 'airbag-label.png')).toString('base64');
const labIdx = Uint8Array.from(await page.evaluate(async ({ b64, w, h }) => {
  const img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = 'data:image/png;base64,' + b64; });
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;                 // 팔레트 색을 그대로 보존
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const PAL = [[255,255,255],[255,230,0],[34,31,31],[237,33,35]];
  const out = [];
  for (let i = 0; i < w*h; i++) {
    let best = 0, bd = Infinity;
    for (let k = 0; k < 4; k++) {
      const p = PAL[k];
      const e = (d[i*4]-p[0])**2 + (d[i*4+1]-p[1])**2 + (d[i*4+2]-p[2])**2;
      if (e < bd) { bd = e; best = k; }
    }
    out.push(best);
  }
  return out;
}, { b64: labelPng, w: labCols, h: labRows }));

/* 라벨 실루엣 = 테두리에서 흘려넣은 흰색을 뺀 나머지 (둥근 모서리 바깥을 제외) */
const labIn = new Uint8Array(labCols*labRows).fill(1);
{
  const st = [];
  const push = i => { if (labIn[i] && labIdx[i] === 0) { labIn[i] = 0; st.push(i); } };
  for (let c = 0; c < labCols; c++) { push(c); push((labRows-1)*labCols + c); }
  for (let r = 0; r < labRows; r++) { push(r*labCols); push(r*labCols + labCols-1); }
  while (st.length) {
    const i = st.pop(), r = (i/labCols)|0, c = i % labCols;
    if (c > 0) push(i-1);
    if (c < labCols-1) push(i+1);
    if (r > 0) push(i-labCols);
    if (r < labRows-1) push(i+labCols);
  }
}

/* 케이스 좌표 (x,y) → 라벨 픽셀 인덱스. 범위 밖이면 -1 */
function labAt(x, y) {
  const pc = Math.floor((y - labY0) / R);            // 라벨 가로 → 케이스 세로
  const pr = Math.floor((labX1 - x) / R);            // 라벨 세로 → 케이스 가로 (X 뒤집음)
  if (pc < 0 || pr < 0 || pc >= labCols || pr >= labRows) return -1;
  const i = pr*labCols + pc;
  return labIn[i] ? i : -1;
}

await browser.close();

/* ---------- 하부 셸 ---------- */
function buildShell(clipY, withLabel = true) {   // clipY 가 있으면 그만큼만 잘라 시험 조각
  const H = clipY || oh;
  const g = newSolid(ow, H, R);
  const { cols, rows } = g;
  const innerR = M.corner - M.wall;
  for (let r=0;r<rows;r++) {
    const y = (rows-1-r+0.5)*R;
    for (let c=0;c<cols;c++) {
      const x = (c+0.5)*R, i = r*cols+c;
      if (!inRR(x, y, ow, oh, M.corner)) continue;
      if (inRR(x - M.wall, y - M.wall, iw, ih, innerR)) { addSpan(g, i, 0, M.floor); continue; }
      /* 바깥 림은 wallTop, 안쪽 단은 ledgeZ (커버가 여기 앉는다) */
      const onLedge = inRR(x - rimW, y - rimW, ow - 2*rimW, oh - 2*rimW, M.corner - rimW);
      addSpan(g, i, 0, onLedge ? ledgeZ : wallTop);
    }
  }
  /* USB-C 개구 — 아래쪽 짧은 변을 관통 */
  const pcx = ow/2 + M.portX, pz0 = M.floor + M.portZ, pz1 = pz0 + M.portH;
  for (let r=0;r<rows;r++) {
    const y = (rows-1-r+0.5)*R;
    if (y > M.wall + 0.6) continue;                    // 앞벽 두께만큼만
    /* 바깥면(y=0)에서 가장 넓고 안으로 갈수록 좁아지는 유도 챔퍼 */
    const e = M.portCh * Math.max(0, 1 - y/M.portChD);
    for (let c=0;c<cols;c++) {
      const x = (c+0.5)*R;
      if (Math.abs(x - pcx) > M.portW/2 + e) continue;
      cutSpan(g, r*cols+c, pz0 - e, pz1 + e);
    }
  }
  /* 바닥 바깥면에서 라벨 두께만큼 걷어낸다 — 그 자리를 색 파트가 채운다 */
  if (withLabel)
    for (let r=0;r<rows;r++) {
      const y = (rows-1-r+0.5)*R;
      for (let c=0;c<cols;c++)
        if (labAt((c+0.5)*R, y) >= 0) cutSpan(g, r*cols+c, 0, M.labelT);
    }
  return g;
}

/* ---------- 라벨 색 파트 (셸이 비워둔 자리를 정확히 메운다) ---------- */
function buildInk(color) {
  const g = newSolid(ow, oh, R);
  const { cols, rows } = g;
  for (let r=0;r<rows;r++) {
    const y = (rows-1-r+0.5)*R;
    for (let c=0;c<cols;c++) {
      const i = labAt((c+0.5)*R, y);
      if (i >= 0 && labIdx[i] === color) addSpan(g, r*cols+c, 0, M.labelT);
    }
  }
  return g;
}

/* ---------- 커버 (평판 + 로고 음각) ---------- */
function buildLid(badgeFloor = true) {
  const g = newSolid(lidW, lidH, R);
  const { cols, rows } = g;
  const lidR = Math.max(0, M.corner - rimW - M.lidFit);
  const cx = lidW/2, cy = lidH/2;                      // 로고 중심
  for (let r=0;r<rows;r++) {
    const y = (rows-1-r+0.5)*R;
    for (let c=0;c<cols;c++) {
      const x = (c+0.5)*R, i = r*cols+c;
      if (!inRR(x, y, lidW, lidH, lidR)) continue;
      addSpan(g, i, 0, M.lidT);
      /* 원형 포켓을 파되, 로고 획이 있는 칸은 남겨 표면과 같은 높이로 세운다.
         폰이 닿는 면은 로고 윗면 + 바깥 평면이라 여전히 평평하다. */
      if (Math.hypot(x - cx, y - cy) > M.badgeR) continue;
      const lx = Math.round((x - (cx - M.logoSize/2))/R);
      const ly = Math.round(((cy + M.logoSize/2) - y)/R);
      const onLogo = lx>=0 && ly>=0 && lx<px && ly<px && logoMask[ly*px+lx];
      if (!onLogo) cutSpan(g, i, M.lidT - M.engraveD, M.lidT + 1);
      /* 포켓 바닥은 따로 떼어 다른 색 필라멘트를 지정할 수 있게 한다 */
      if (badgeFloor && !onLogo) cutSpan(g, i, M.lidT - M.engraveD - M.badgeFloorT, M.lidT - M.engraveD);
    }
  }
  return g;
}

function buildBadgeFloor() {
  const g = newSolid(lidW, lidH, R);
  const { cols, rows } = g;
  const cx = lidW/2, cy = lidH/2;
  for (let r=0;r<rows;r++) {
    const y = (rows-1-r+0.5)*R;
    for (let c=0;c<cols;c++) {
      const x = (c+0.5)*R, i = r*cols+c;
      if (Math.hypot(x - cx, y - cy) > M.badgeR) continue;
      const lx = Math.round((x - (cx - M.logoSize/2))/R);
      const ly = Math.round(((cy + M.logoSize/2) - y)/R);
      if (lx>=0 && ly>=0 && lx<px && ly<px && logoMask[ly*px+lx]) continue;
      addSpan(g, i, M.lidT - M.engraveD - M.badgeFloorT, M.lidT - M.engraveD);
    }
  }
  return g;
}

const shell = buildShell();
const lid   = buildLid();
const badge = buildBadgeFloor();
const inks  = [1,2,3].map(buildInk);                     // 노랑 / 검정 / 빨강
const test  = buildShell(26, false);                     // 포트 주변 26mm 만 (라벨 제외)

const Ps = new Float32Array(meshOf(shell));
const Pl = new Float32Array(meshOf(lid));
const Pb = new Float32Array(meshOf(badge));
const Pi = inks.map(g => new Float32Array(meshOf(g)));
const Pt = new Float32Array(meshOf(test));

const INK = ['노랑', '검정', '빨강'];

fs.writeFileSync(path.join(OUT,'qi_shell.stl'), toSTL(Ps,'shell'));
fs.writeFileSync(path.join(OUT,'qi_lid.stl'),   toSTL(Pl,'lid'));
fs.writeFileSync(path.join(OUT,'qi_porttest.stl'), toSTL(Pt,'port test'));
write3mf(path.join(OUT,'qi_shell.3mf'), [
  { name: '1 케이스 몸체 (흰색)', mesh: Ps },
  { name: '2 라벨 노란 띠 (노랑)', mesh: Pi[0] },
  { name: '3 라벨 그림·글자 (검정)', mesh: Pi[1] },
  { name: '4 라벨 금지표시 (빨강)', mesh: Pi[2] },
], '(주)우주특수산업 무선충전 케이스 — 하부');
write3mf(path.join(OUT,'qi_lid.3mf'), [
  { name: '1 커버 몸체 (흰색)', mesh: Pl },
  { name: '2 뱃지 바닥 (검정)', mesh: Pb },
], '(주)우주특수산업 무선충전 케이스 — 커버');

/* ---------- 바닥을 뒤집어 본 그림 (거울 방향 확인용) ---------- */
{
  const cols = Math.round(ow/R), rows = Math.round(oh/R);
  const PAL = [[255,255,255],[255,230,0],[34,31,31],[237,33,35]];
  const buf = Buffer.alloc(cols*rows*3, 0xe8);
  for (let r=0;r<rows;r++) {
    const y = (rows-1-r+0.5)*R;
    for (let c=0;c<cols;c++) {
      const xPlan = ow - (c+0.5)*R;                 // 밑에서 올려다본 시점 = X 반전
      let col = null;
      if (inRR(xPlan, y, ow, oh, M.corner)) {
        const i = labAt(xPlan, y);
        col = i >= 0 ? PAL[labIdx[i]] : [246,246,248];
      }
      const o = (r*cols+c)*3;
      if (col) { buf[o]=col[0]; buf[o+1]=col[1]; buf[o+2]=col[2]; }
    }
  }
  const png = await (async () => {
    const b = await chromium.launch(); const pg = await b.newPage();
    const d = await pg.evaluate(({ raw, w, h }) => {
      const cv = document.createElement('canvas'); cv.width=w; cv.height=h;
      const ctx = cv.getContext('2d'); const im = ctx.createImageData(w,h);
      for (let i=0;i<w*h;i++){ im.data[i*4]=raw[i*3]; im.data[i*4+1]=raw[i*3+1];
        im.data[i*4+2]=raw[i*3+2]; im.data[i*4+3]=255; }
      ctx.putImageData(im,0,0); return cv.toDataURL('image/png').split(',')[1];
    }, { raw: Array.from(buf), w: cols, h: rows });
    await b.close(); return d;
  })();
  fs.writeFileSync(path.join(OUT,'preview_bottom.png'), Buffer.from(png,'base64'));
}

console.log('케이스 외형   ', `${ow.toFixed(1)} × ${oh.toFixed(1)} × ${wallTop.toFixed(1)} mm`);
console.log('내부 (모듈)   ', `${iw.toFixed(1)} × ${ih.toFixed(1)} × ${cav.toFixed(1)} mm`);
console.log('커버          ', `${lidW.toFixed(1)} × ${lidH.toFixed(1)} × ${M.lidT} mm`,
            `(로고 뱃지 Ø${(M.badgeR*2).toFixed(0)} · 포켓 ${M.engraveD}mm)`);
console.log('USB-C 개구    ', `가로 ${M.portW} × 세로 ${M.portH}`,
            `· 좌우중심 ${M.portX >= 0 ? '+' : ''}${M.portX}`,
            `· 바닥 안쪽면에서 ${M.portZ}~${(M.portZ+M.portH).toFixed(1)}mm`,
            `(중심 ${(M.portZ+M.portH/2).toFixed(1)}mm) · 바깥 챔퍼 +${M.portCh}mm`);
console.log('바닥 라벨     ', `${labXext.toFixed(1)} × ${labYext.toFixed(1)} mm`,
            `(원본 ${LAB_W_MM} × ${LAB_H_MM} 의 ${(labScale*100).toFixed(1)}%)`,
            `· 상감 깊이 ${M.labelT}mm`);

const all = [['셸',Ps,shell], ['커버',Pl,lid], ['뱃지바닥',Pb,badge],
             ...Pi.map((P,i)=>[`라벨 ${INK[i]}`,P,inks[i]]), ['시험',Pt,test]];
for (const [n,P,g] of all) console.log(n.padEnd(9), JSON.stringify(audit(P,g)));
/* 색 파트는 셸 바닥에 얹히므로 z0 은 0, 뱃지 바닥만 커버 안쪽이라 0 이 아니다 */
const ok = all.every(([n,P,g]) => { const a = audit(P,g);
  return a.relErr < 1e-6 && a.normSum < 1e-5 && (n === '뱃지바닥' || a.z0 === 0); });
console.log(ok ? '✅ 전 파트 닫힌 메시 · 치수 검증 통과' : '❌ 검증 실패');
