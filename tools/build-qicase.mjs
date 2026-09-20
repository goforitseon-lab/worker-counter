/* ============================================================
   무선충전 보조배터리 케이스   node tools/build-qicase.mjs [출력폴더]

     하부 셸 + 전면 커버 2피스.
       · 셸 바닥 바깥면 = AIRBAG 경고라벨 4색 상감, 면 전체를 채운다.
       · 커버 윗면      = 우주 로고 2색 상감.
       두 면 다 "베드에 닿는 면"이라 서포트 없이 인쇄한 것처럼 매끈하게 나온다.
       (커버는 로고면을 베드에 깔고 뒤집어 출력한다)
       · 체결 = 커버 안쪽 립의 비드 ↔ 셸 안쪽벽 홈.
         들어갈 때는 30도 경사로 미끄러지고, 걸리는 면은 수평 0도.
         한 번 닫으면 공구 없이는 열리지 않는다.

     USB-C 개구 위치는 PORT 값들로만 바뀐다.
     확인용으로 포트 주변만 잘라낸 시험 조각도 같이 내보낸다.
   ============================================================ */
import fs from 'fs'; import path from 'path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { newSolid, addSpan, cutSpan, meshOf, audit, toSTL, inRR, sdRR }
  from './lib/solid.mjs';
import { write3mf } from './lib/threemf.mjs';

/* --plain     : 라벨·로고 없이 단색 시험 출력용 (바닥이 꽉 차서 브림이 필요 없다)
   --capT=1.0  : 커버 두께. 얇을수록 맥세이프 자력이 세진다
   --modH=100  : 모듈 세로 실측값. 케이스 세로 = modH + 2*clr + 2*wall */
const PLAIN = process.argv.includes('--plain');
const arg = (k, d) => { const m = process.argv.find(a => a.startsWith(`--${k}=`));
                        return m ? parseFloat(m.split('=')[1]) : d; };
const OUT = process.argv.filter(a => !a.startsWith('--'))[2] || 'out-qi';
fs.mkdirSync(OUT, { recursive: true });

const M = {
  /* 모듈 실측 */
  modW: 60, modH: arg('modH', 93), modT: 12,   // 세로는 실측 93mm
  clr: 0.35,                 // 모듈 둘레 여유 (편측)
  /* 케이스 */
  wall: 2.6, floor: arg('floor', 1.2), corner: 5, res: 0.15,
  capT: arg('capT', 0.8),    // 커버 판 두께 — 맥세이프 자력 때문에 얇게
  /* 체결 — 커버 안쪽 립이 셸 안쪽벽 홈에 물린다 */
  rimT: 0.85,                // 립 두께 (얇아야 휘어서 들어간다)
  rimFit: 0.15,              // 립과 확장부 사이 헐거움
  rimH: 5.0,                 // 립 길이
  beadD: 0.6,                // 비드 돌출 (실걸림 = beadD - rimFit)
  beadCorner: 13,            // 모서리 이만큼은 비드를 빼서 립이 휠 수 있게 한다
  beadH: 1.0,                // 비드 평평한 구간 높이
  beadRamp: 0.7,             // 진입 경사 높이
  boreGap: 0.3,              // 립 아래끝과 확장부 턱 사이 여유
  leadIn: 0.5,               // 셸 입구 유도 챔퍼
  /* USB-C 개구 — 모듈 밑면 기준 6~10mm 에 가로 10mm (실측).
     ⚠ USB-C 플러그 쉘 규격이 8.34 x 2.56mm 라 가로는 9.0mm 아래로 못 줄인다.
        (9.0 = 플러그 8.34 + 좌우 0.33 여유) */
  portW: arg('portW', 9.0), portH: 5.4, portX: 0, portZ: 5.3,
  portCh: 0.5, portChD: 1.0, // 바깥쪽 유도 챔퍼 (넓어지는 양 / 깊이)
  /* 라벨 */
  labelT: 0.4,               // 색이 들어가는 깊이 (0.2mm 층 x2)
  labelInset: 1.0,           // 케이스 모서리에서 라벨까지 (둥근 모서리 때문에 필요)
  labelFill: true,           // true = 면을 꽉 채우도록 살짝 늘림
  /* 커버 로고 */
  logoSize: 46,              // 로고 폭
  logoT: 0.4,                // 로고 상감 깊이 (커버가 얇아져서 같이 줄임)
};

const R = M.res;
const iw = M.modW + 2*M.clr, ih = M.modH + 2*M.clr;      // 모듈 자리
const ow = iw + 2*M.wall,    oh = ih + 2*M.wall;         // 케이스 외형
const cav = M.modT + 0.3;                                 // 모듈이 들어갈 깊이
const wallTop = M.floor + cav;                            // 셸 벽 높이 (커버가 여기 얹힌다)
const total = wallTop + M.capT;

const bore = M.rimT + M.rimFit;                           // 벽 안쪽을 깎아내는 양
const boreW = iw + 2*bore, boreH = ih + 2*bore;           // 확장부 개구
const rimOutW = boreW - 2*M.rimFit, rimOutH = boreH - 2*M.rimFit;   // 립 바깥면
const grvW = boreW + 2*M.beadD, grvH = boreH + 2*M.beadD;           // 홈 개구

/* 체결 높이 (조립 좌표 = 케이스 바닥이 0) */
const rimZ0 = wallTop - M.rimH;                           // 립 아래끝
const boreZ = rimZ0 - M.boreGap;                          // 확장부는 립보다 조금 아래에서 시작
const beadZ0 = rimZ0 + 1.0, beadZ1 = beadZ0 + M.beadH;    // 비드 평평 구간
const grvZ0 = beadZ0 - 0.1, grvZ1 = beadZ1 + 0.1;         // 홈 (비드보다 0.1 여유)

/* ---------- AIRBAG 라벨 (4색 인덱스 래스터) ----------
   원본 실치수 112.01 x 72.14 mm. 커버 윗면에 90도 돌려 얹는다. */
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const LAB_W = 112.01, LAB_H = 72.14;
const faceW = ow - 2*M.labelInset, faceH = oh - 2*M.labelInset;
const sx = faceW / LAB_H, sy = faceH / LAB_W;             // 라벨 세로→케이스 가로, 가로→세로
const kx = M.labelFill ? sx : Math.min(sx, sy);
const ky = M.labelFill ? sy : Math.min(sx, sy);
const labXext = LAB_H * kx, labYext = LAB_W * ky;
const labCols = Math.round(labYext / R), labRows = Math.round(labXext / R);
const labX1 = (ow + labXext)/2, labY0 = (oh - labYext)/2;

const browser = await chromium.launch();
const page = await browser.newPage();
const labelPng = fs.readFileSync(path.join(ROOT,'assets','airbag-label.png')).toString('base64');
const labIdx = Uint8Array.from(await page.evaluate(async ({ b64, w, h }) => {
  const img = new Image();
  await new Promise((ok,no) => { img.onload=ok; img.onerror=no; img.src='data:image/png;base64,'+b64; });
  const cv = document.createElement('canvas'); cv.width=w; cv.height=h;
  const ctx = cv.getContext('2d', { willReadFrequently:true });
  ctx.imageSmoothingEnabled = false;                      // 팔레트 색을 그대로 보존
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0,0,w,h).data;
  const PAL = [[255,255,255],[255,230,0],[34,31,31],[237,33,35]];
  const out = [];
  for (let i=0;i<w*h;i++) {
    let best=0, bd=Infinity;
    for (let k=0;k<4;k++) { const p=PAL[k];
      const e=(d[i*4]-p[0])**2+(d[i*4+1]-p[1])**2+(d[i*4+2]-p[2])**2;
      if (e<bd) { bd=e; best=k; } }
    out.push(best);
  }
  return out;
}, { b64: labelPng, w: labCols, h: labRows }));

/* ---------- 우주 로고 2색 마스크 ----------
   path[0] = 상부(남색), path[1,2] = 하부(초록). 커버 가운데에 상감한다. */
const LOGO = fs.readFileSync(path.join(ROOT,'woojoo-logo.svg'), 'utf8');
const lgPx = Math.round(M.logoSize / R);
const logoMask = await page.evaluate(async ({ svg, px }) => {
  const shot = async keep => {                        // keep = 남길 path 번호들
    let n = -1;
    const one = svg.replace(/<path\b/g, () => { n++; return keep.includes(n) ? '<path' : '<path display="none"'; })
                   .replace('<svg ', `<svg width="${px}" height="${px}" `);
    const url = URL.createObjectURL(new Blob([one], { type:'image/svg+xml' }));
    const img = new Image();
    await new Promise((ok,no)=>{ img.onload=ok; img.onerror=no; img.src=url; });
    const cv = document.createElement('canvas'); cv.width=px; cv.height=px;
    const ctx = cv.getContext('2d', { willReadFrequently:true });
    ctx.drawImage(img, 0, 0, px, px);
    const d = ctx.getImageData(0,0,px,px).data, m = [];
    for (let i=0;i<px*px;i++) m.push(d[i*4+3] > 128 ? 1 : 0);
    return m;
  };
  return { navy: await shot([0]), green: await shot([1,2]) };
}, { svg: LOGO, px: lgPx });
const lgNavy = Uint8Array.from(logoMask.navy), lgGreen = Uint8Array.from(logoMask.green);

/* 커버 평면좌표 → 로고 색 (0 없음 / 1 남색 / 2 초록).
   로고면도 베드에 닿으므로 X 를 뒤집는다. */
const lgX1 = (ow + M.logoSize)/2, lgY1 = (oh + M.logoSize)/2;
function logoAt(x, y) {
  const c = Math.floor((lgX1 - x) / R), r = Math.floor((lgY1 - y) / R);
  if (c<0 || r<0 || c>=lgPx || r>=lgPx) return 0;
  const i = r*lgPx + c;
  return lgNavy[i] ? 1 : (lgGreen[i] ? 2 : 0);
}

await browser.close();

/* 라벨 실루엣 = 테두리에서 흘려넣은 흰색을 뺀 나머지 (둥근 모서리 바깥 제외) */
const labIn = new Uint8Array(labCols*labRows).fill(1);
{
  const st = [];
  const push = i => { if (labIn[i] && labIdx[i]===0) { labIn[i]=0; st.push(i); } };
  for (let c=0;c<labCols;c++) { push(c); push((labRows-1)*labCols+c); }
  for (let r=0;r<labRows;r++) { push(r*labCols); push(r*labCols+labCols-1); }
  while (st.length) {
    const i = st.pop(), r = (i/labCols)|0, c = i%labCols;
    if (c>0) push(i-1); if (c<labCols-1) push(i+1);
    if (r>0) push(i-labCols); if (r<labRows-1) push(i+labCols);
  }
}

/* 셸 평면좌표 (x,y) → 라벨 색 번호 (0 흰바탕 / 1 노랑 / 2 검정 / 3 빨강, 범위 밖 -1).
   바닥 바깥면이 베드에 닿으므로 X 를 뒤집어야 케이스를 뒤집어 봤을 때 바로 읽힌다.

   흰 바탕은 파내지 않는다 — 로고와 똑같이 "색이 들어가는 자리만" 파고
   몸체 살이 그대로 바탕이 된다. 그래야 바닥이 베드에 꽉 닿아서
   첫 층이 뭉개지지 않는다. */
function labColor(x, y) {
  const pc = Math.floor((y - labY0) / R);
  const pr = Math.floor((labX1 - x) / R);
  if (pc<0 || pr<0 || pc>=labCols || pr>=labRows) return -1;
  const i = pr*labCols + pc;
  return labIn[i] ? labIdx[i] : -1;
}

/* ---------- 하부 셸 (바닥을 베드에 놓고 그대로 출력) ---------- */
function buildShell(clipY, withLabel = true) {
  const H = clipY || oh;
  const g = newSolid(ow, H, R);
  const { cols, rows } = g;
  const innerR = M.corner - M.wall, boreR = innerR + bore, grvR = boreR + M.beadD;
  for (let r=0;r<rows;r++) {
    const y = (rows-1-r+0.5)*R;
    for (let c=0;c<cols;c++) {
      const x = (c+0.5)*R, i = r*cols+c;
      if (!inRR(x, y, ow, oh, M.corner)) continue;
      if (inRR(x - M.wall, y - M.wall, iw, ih, innerR)) { addSpan(g, i, 0, M.floor); continue; }
      addSpan(g, i, 0, wallTop);
      /* 벽 안쪽을 립 두께만큼 넓힌다 (z ≥ boreZ) */
      const dBore = (ow - boreW)/2;
      if (inRR(x - dBore, y - dBore, boreW, boreH, boreR)) {
        cutSpan(g, i, boreZ, wallTop + 1);
        continue;
      }
      /* 입구 유도 챔퍼 — 비드가 처음 물리기 쉽게 벽 안쪽 위끝을 45도로 딴다 */
      const dIn = sdRR(x - dBore, y - dBore, boreW, boreH, boreR);
      if (dIn > 0 && dIn <= M.leadIn) cutSpan(g, i, wallTop - (M.leadIn - dIn), wallTop + 1);
      /* 비드가 앉을 홈 — 위쪽 면이 수평이라 여기서 걸린다 */
      const dG = (ow - grvW)/2;
      if (inRR(x - dG, y - dG, grvW, grvH, grvR)) cutSpan(g, i, grvZ0, grvZ1);
    }
  }
  /* USB-C 개구 — 아래쪽 짧은 변을 관통 */
  const pcx = ow/2 + M.portX, pz0 = M.floor + M.portZ, pz1 = pz0 + M.portH;
  for (let r=0;r<rows;r++) {
    const y = (rows-1-r+0.5)*R;
    if (y > M.wall + 0.6) continue;
    const e = M.portCh * Math.max(0, 1 - y/M.portChD);    // 바깥쪽 유도 챔퍼
    for (let c=0;c<cols;c++) {
      const x = (c+0.5)*R;
      if (Math.abs(x - pcx) > M.portW/2 + e) continue;
      cutSpan(g, r*cols+c, pz0 - e, pz1 + e);
    }
  }
  /* 바닥 바깥면에서 라벨 두께만큼 걷어낸다 — 그 자리를 색 파트가 채운다 */
  if (withLabel && !PLAIN)
    for (let r=0;r<rows;r++) {
      const y = (rows-1-r+0.5)*R;
      for (let c=0;c<cols;c++)
        if (labColor((c+0.5)*R, y) > 0) cutSpan(g, r*cols+c, 0, M.labelT);
    }
  return g;
}

/* ---------- 커버 (라벨면을 베드에 깔고 뒤집어 출력) ----------
   출력 좌표 z = 조립 좌표를 뒤집은 것:  z_print = total - z_assy
   판  : z 0 ~ capT      (z 0~logoT 가 로고 색)
   립  : z capT ~ capT+rimH
   비드: 립 바깥면에 붙는다 */
const P = z => total - z;                                  // 조립 z → 출력 z
function buildCap() {
  const g = newSolid(ow, oh, R);
  const { cols, rows } = g;
  const rimR = M.corner - M.wall + bore - M.rimFit;
  const dR = (ow - rimOutW)/2;
  const bZ1 = P(beadZ0), bZ0 = P(beadZ1);                  // 비드 평평 구간 (출력 z)
  const rampZ1 = bZ1 + M.beadRamp;                         // 진입 경사 끝
  /* 포트 자리 — 립을 이만큼 잘라내야 케이블이 들어간다 */
  const pcx = ow/2 + M.portX;
  const portTop = P(M.floor + M.portZ + M.portH + 0.5);    // 출력 z 기준 위쪽 한계
  for (let r=0;r<rows;r++) {
    const y = (rows-1-r+0.5)*R;
    for (let c=0;c<cols;c++) {
      const x = (c+0.5)*R, i = r*cols+c;
      if (!inRR(x, y, ow, oh, M.corner)) continue;
      addSpan(g, i, 0, M.capT);                            // 판
      /* 립 — 바깥 링만 남긴다 */
      const outIn = inRR(x - dR, y - dR, rimOutW, rimOutH, rimR);
      const inIn  = inRR(x - dR - M.rimT, y - dR - M.rimT, rimOutW - 2*M.rimT, rimOutH - 2*M.rimT,
                         Math.max(0, rimR - M.rimT));
      if (outIn && !inIn) {
        const isPort = y < M.wall + bore + 1 && Math.abs(x - pcx) < M.portW/2 + 1.5;
        if (!isPort) addSpan(g, i, M.capT, M.capT + M.rimH);
        else if (portTop > M.capT) addSpan(g, i, M.capT, portTop);   // 포트 자리는 짧게
      }
      /* 비드 — 립 바깥쪽에 덧붙는 띠.
         조립할 때 먼저 닿는 쪽(출력 위쪽)이 경사면, 걸리는 쪽은 수평. */
      if (!outIn) {
        const out = sdRR(x - dR, y - dR, rimOutW, rimOutH, rimR);  // 립 바깥면에서의 거리
        const isPort = y < M.wall + bore + 1 && Math.abs(x - pcx) < M.portW/2 + 1.5;
        const atCorner = Math.abs(x - ow/2) > rimOutW/2 - M.beadCorner
                      && Math.abs(y - oh/2) > rimOutH/2 - M.beadCorner;
        if (!isPort && !atCorner && out > 0 && out <= M.beadD) {
          const zTop = rampZ1 - (out / M.beadD) * M.beadRamp;      // 바깥일수록 일찍 끝난다
          if (zTop > bZ0) addSpan(g, i, bZ0, zTop);
        }
      }
      /* 로고 상감 자리를 베드면에서 걷어낸다 */
      if (!PLAIN && logoAt(x, y)) cutSpan(g, i, 0, M.logoT);
    }
  }
  return g;
}

/* ---------- 색 파트 (몸체가 비워둔 자리를 정확히 메운다) ---------- */
function buildInk(color) {                                 // 셸 바닥 라벨
  const g = newSolid(ow, oh, R);
  const { cols, rows } = g;
  for (let r=0;r<rows;r++) {
    const y = (rows-1-r+0.5)*R;
    for (let c=0;c<cols;c++) {
      const x = (c+0.5)*R;
      if (labColor(x, y) === color && inRR(x, y, ow, oh, M.corner))
        addSpan(g, r*cols+c, 0, M.labelT);
    }
  }
  return g;
}

function buildLogoInk(color) {                             // 커버 로고
  const g = newSolid(ow, oh, R);
  const { cols, rows } = g;
  for (let r=0;r<rows;r++) {
    const y = (rows-1-r+0.5)*R;
    for (let c=0;c<cols;c++) {
      const x = (c+0.5)*R;
      if (logoAt(x, y) === color && inRR(x, y, ow, oh, M.corner))
        addSpan(g, r*cols+c, 0, M.logoT);
    }
  }
  return g;
}

const shell = buildShell();
const cap   = buildCap();
const inks  = [1,2,3].map(buildInk);                       // 노랑 / 검정 / 빨강 (흰 바탕은 몸체 살)
const lgs   = [1,2].map(buildLogoInk);                     // 남색 / 초록
const test  = buildShell(30, false);                       // 포트 주변 30mm 만 (라벨 제외)

const Ps = new Float32Array(meshOf(shell));
const Pc = new Float32Array(meshOf(cap));
const Pi = inks.map(g => new Float32Array(meshOf(g)));
const Pg = lgs.map(g => new Float32Array(meshOf(g)));
const Pt = new Float32Array(meshOf(test));
const INK = ['노랑','검정','빨강'];

fs.writeFileSync(path.join(OUT,'qi_shell.stl'), toSTL(Ps,'shell'));
fs.writeFileSync(path.join(OUT,'qi_cap.stl'),   toSTL(Pc,'cap'));
fs.writeFileSync(path.join(OUT,'qi_porttest.stl'), toSTL(Pt,'port test'));
write3mf(path.join(OUT,'qi_shell.3mf'), [
  { name:'1 케이스 몸체 (흰색 = 라벨 바탕)', mesh: Ps },
  { name:'2 라벨 노란 띠 (노랑)',            mesh: Pi[0] },
  { name:'3 라벨 그림·글자 (검정)',          mesh: Pi[1] },
  { name:'4 라벨 금지표시 (빨강)',           mesh: Pi[2] },
], '(주)우주특수산업 무선충전 케이스 — 하부');
write3mf(path.join(OUT,'qi_cap.3mf'), [
  { name:'1 커버 몸체 (흰색)',   mesh: Pc },
  { name:'2 로고 상부 (남색)',   mesh: Pg[0] },
  { name:'3 로고 하부 (초록)',   mesh: Pg[1] },
], '(주)우주특수산업 무선충전 케이스 — 커버');

/* ---------- 거울 방향 확인용 그림 두 장 ----------
   bottom = 케이스를 뒤집어 본 모습 · top = 위에서 본 커버 */
{
  const cols = Math.round(ow/R), rows = Math.round(oh/R);
  const PAL = [[255,255,255],[255,230,0],[34,31,31],[237,33,35]];
  const LG  = { 1:[28,46,92], 2:[0,140,90] };
  const draw = mode => {
    const buf = Buffer.alloc(cols*rows*3, 0xf2);
    for (let r=0;r<rows;r++) {
      const y = (rows-1-r+0.5)*R;
      for (let c=0;c<cols;c++) {
        const xp = ow - (c+0.5)*R;                     // 바라보는 시점 = 출력 평면의 X 반전
        if (!inRR(xp, y, ow, oh, M.corner)) continue;
        let col = [244,244,246];
        if (mode === 'label') { const k = labColor(xp, y); if (k >= 0) col = PAL[k]; }
        else { const k = logoAt(xp, y); if (k) col = LG[k]; }
        const o = (r*cols+c)*3; buf[o]=col[0]; buf[o+1]=col[1]; buf[o+2]=col[2];
      }
    }
    return buf;
  };
  const b = await chromium.launch(); const pg = await b.newPage();
  for (const [mode, file] of [['label','preview_bottom.png'], ['logo','preview_top.png']]) {
    const d = await pg.evaluate(({ raw, w, h }) => {
      const cv = document.createElement('canvas'); cv.width=w; cv.height=h;
      const ctx = cv.getContext('2d'); const im = ctx.createImageData(w,h);
      for (let i=0;i<w*h;i++){ im.data[i*4]=raw[i*3]; im.data[i*4+1]=raw[i*3+1];
        im.data[i*4+2]=raw[i*3+2]; im.data[i*4+3]=255; }
      ctx.putImageData(im,0,0); return cv.toDataURL('image/png').split(',')[1];
    }, { raw: Array.from(draw(mode)), w: cols, h: rows });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(d,'base64'));
  }
  await b.close();
}

console.log('케이스 외형   ', `${ow.toFixed(1)} × ${oh.toFixed(1)} × ${total.toFixed(1)} mm`);
console.log('모듈 자리     ', `${iw.toFixed(1)} × ${ih.toFixed(1)} × ${cav.toFixed(1)} mm`);
console.log('커버          ', `${ow.toFixed(1)} × ${oh.toFixed(1)} × ${M.capT} mm`,
            `· 립 ${M.rimT}t × ${M.rimH}L`);
const grip = M.beadD - M.rimFit;
console.log('체결          ', `실걸림 ${grip.toFixed(2)}mm · 걸림면 수평(0도) · 진입 경사 ${(Math.atan(M.beadRamp/M.beadD)*180/Math.PI).toFixed(0)}도`);
console.log('              ', `물리는 높이 ${beadZ0.toFixed(1)}~${beadZ1.toFixed(1)}mm · 닫을 때 립이 ${grip.toFixed(2)}mm 안으로 휜다`,
            `· 모서리 ${M.beadCorner}mm 는 비드 없음(휘라고)`);
console.log('USB-C 개구    ', `안쪽 ${M.portW} × ${M.portH} · 바깥 ${(M.portW+2*M.portCh).toFixed(1)} × ${(M.portH+2*M.portCh).toFixed(1)}`,
            `· 바닥 안쪽면에서 ${M.portZ}~${(M.portZ+M.portH).toFixed(1)}mm`);
console.log('              ', `플러그 쉘 8.34mm 기준 좌우 여유 ${((M.portW-8.34)/2).toFixed(2)}mm`,
            M.portW >= 8.9 ? '✓' : '❌ 플러그가 안 들어간다');
console.log('바닥 라벨     ', `${labXext.toFixed(1)} × ${labYext.toFixed(1)} mm`,
            `(원본 ${LAB_W}×${LAB_H} 대비 ${(kx*100).toFixed(1)}% / ${(ky*100).toFixed(1)}%)`,
            `· 상감 ${M.labelT}mm`);
console.log('커버 로고     ', `${M.logoSize}mm · 2색 상감 ${M.logoT}mm · 로고 위 살두께 ${(M.capT-M.logoT).toFixed(1)}mm`);
console.log('맥세이프 간격 ', `커버 ${M.capT}mm + 모듈 유격 ${(cav-M.modT).toFixed(2)}mm =`,
            `자석에서 폰까지 ${(M.capT + cav - M.modT).toFixed(2)}mm`);
console.log('두께 내역     ', `바닥 ${M.floor} + 모듈칸 ${cav.toFixed(1)} + 커버 ${M.capT} = ${total.toFixed(1)}mm`,
            `· 라벨 아래 살두께 ${(M.floor - M.labelT).toFixed(1)}mm · 로고 아래 ${(M.capT - M.logoT).toFixed(1)}mm`);
console.log('확장부/립     ', `확장부 z ${boreZ.toFixed(1)}~${wallTop.toFixed(1)} · 립 z ${rimZ0.toFixed(1)}~${wallTop.toFixed(1)}`,
            boreZ <= rimZ0 ? '(립이 턱에 안 닿음 ✓)' : '❌ 립이 턱에 부딪힘');

const LGN = ['남색','초록'];
function bedArea(P) {                                      // z=0 에 놓인 면의 넓이
  let a = 0;
  for (let i=0;i<P.length;i+=9) {
    if (Math.abs(P[i+2])>1e-4 || Math.abs(P[i+5])>1e-4 || Math.abs(P[i+8])>1e-4) continue;
    a += Math.abs((P[i+3]-P[i])*(P[i+7]-P[i+1]) - (P[i+4]-P[i+1])*(P[i+6]-P[i])) / 2;
  }
  return a;
}
const faceA = ow*oh;
console.log('베드 접촉     ', `셸 몸체 ${bedArea(Ps).toFixed(0)}mm² (${(bedArea(Ps)/faceA*100).toFixed(0)}%)`,
            `· 색 파트까지 ${(bedArea(Ps)+Pi.reduce((t,p)=>t+bedArea(p),0)).toFixed(0)}mm²`,
            `· 커버 ${bedArea(Pc).toFixed(0)}mm² (${(bedArea(Pc)/faceA*100).toFixed(0)}%)`);
console.log('              ', '※ 몸체 STL 만 슬라이싱하면 바닥이 거의 안 닿는다 → 반드시 3MF(전 파트)로');

const all = [['셸',Ps,shell], ['커버',Pc,cap],
             ...Pi.map((p,i)=>[`라벨 ${INK[i]}`,p,inks[i]]),
             ...Pg.map((p,i)=>[`로고 ${LGN[i]}`,p,lgs[i]]), ['시험',Pt,test]];
for (const [n,p,g] of all) console.log(n.padEnd(9), JSON.stringify(audit(p,g)));
/* 얇은 파트일수록 부피가 작아 상대오차가 커진다 — 절대 부피 오차로도 본다 */
const ok = all.every(([,p,g]) => { const a = audit(p,g);
  return (a.relErr < 1e-5 || a.relErr * a.vol * 1000 < 0.01)
      && a.normSum < 1e-5 && a.z0 === 0; });
console.log(ok ? '✅ 전 파트 닫힌 메시 · 베드 밀착' : '❌ 검증 실패');
