/* ============================================================
   무선충전 보조배터리 케이스   node tools/build-qicase.mjs [출력폴더]

     하부 셸 + 평판 커버 2피스. 커버는 코일 위를 덮으므로
     폰이 평평하게 놓이도록 로고를 "음각"으로 새긴다.

     USB-C 개구 위치는 PORT 값 세 개로만 바뀐다.
     확인용으로 포트 주변만 잘라낸 시험 조각도 같이 내보낸다.
   ============================================================ */
import fs from 'fs'; import path from 'path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { newSolid, addSpan, cutSpan, meshOf, audit, toSTL, inRR, sdRR, volumeOf, F }
  from './lib/solid.mjs';

const OUT = process.argv[2] || 'out-qi';
fs.mkdirSync(OUT, { recursive: true });

const M = {
  /* 모듈 실측 */
  modW: 60, modH: 100, modT: 12,
  clr: 0.35,                 // 모듈 둘레 여유 (편측)
  /* 케이스 */
  wall: 2.2, floor: 1.2, lidT: 1.6, lidFit: 0.3,
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
  logoSize: 30, engraveD: 0.5, badgeR: 18.5,
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
const LOGO = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname),
  '..', 'woojoo-logo.svg'), 'utf8');
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
await browser.close();

/* ---------- 하부 셸 ---------- */
function buildShell(clipY) {                 // clipY 가 있으면 그만큼만 잘라 시험 조각
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
  return g;
}

/* ---------- 커버 (평판 + 로고 음각) ---------- */
function buildLid() {
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
    }
  }
  return g;
}

const shell = buildShell();
const lid   = buildLid();
const test  = buildShell(26);                            // 포트 주변 26mm 만

const Ps = new Float32Array(meshOf(shell));
const Pl = new Float32Array(meshOf(lid));
const Pt = new Float32Array(meshOf(test));

fs.writeFileSync(path.join(OUT,'qi_shell.stl'), toSTL(Ps,'shell'));
fs.writeFileSync(path.join(OUT,'qi_lid.stl'),   toSTL(Pl,'lid'));
fs.writeFileSync(path.join(OUT,'qi_porttest.stl'), toSTL(Pt,'port test'));

console.log('케이스 외형   ', `${ow.toFixed(1)} × ${oh.toFixed(1)} × ${wallTop.toFixed(1)} mm`);
console.log('내부 (모듈)   ', `${iw.toFixed(1)} × ${ih.toFixed(1)} × ${cav.toFixed(1)} mm`);
console.log('커버          ', `${lidW.toFixed(1)} × ${lidH.toFixed(1)} × ${M.lidT} mm  (로고 뱃지 Ø${(M.badgeR*2).toFixed(0)} · 포켓 깊이 ${M.engraveD}mm)`);
console.log('USB-C 개구    ', `가로 ${M.portW} × 세로 ${M.portH}`,
            `· 좌우중심 ${M.portX >= 0 ? '+' : ''}${M.portX}`,
            `· 바닥 안쪽면에서 ${M.portZ}~${(M.portZ+M.portH).toFixed(1)}mm`,
            `(중심 ${(M.portZ+M.portH/2).toFixed(1)}mm) · 바깥 챔퍼 +${M.portCh}mm`);
console.log('셸  ', JSON.stringify(audit(Ps, shell)));
console.log('커버', JSON.stringify(audit(Pl, lid)));
console.log('시험', JSON.stringify(audit(Pt, test)));
const ok = [audit(Ps,shell), audit(Pl,lid), audit(Pt,test)]
  .every(a => a.relErr < 1e-6 && a.normSum < 1e-5 && a.z0 === 0);
console.log(ok ? '✅ 전 파트 닫힌 메시 · 베드 밀착' : '❌ 검증 실패');
