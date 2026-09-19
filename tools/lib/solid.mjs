/* ============================================================
   다중 구간 하이트맵 지오메트리 엔진 (Node 전용, DOM 불필요)

     칸마다 z 방향 고체 구간 [lo,hi] 을 여러 개 가질 수 있다.
     구간이 둘 이상이면 "아래 살 - 빈 공간 - 위 살" 구조가 되어
     경첩 구멍, 안쪽으로 내민 턱, 옆면 관통 구멍 같은 것도 만들 수 있다.
   ============================================================ */
export const F = Math.fround;
export const KMAX = 3;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function newSolid(W, H, res) {
  const cols = Math.max(4, Math.round(W / res)), rows = Math.max(4, Math.round(H / res));
  return { sp: new Float32Array(cols*rows*KMAX*2), cnt: new Uint8Array(cols*rows),
           cols, rows, res, W: cols*res, H: rows*res };
}
export function addSpan(g, i, z0, z1) {
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
export function cutSpan(g, i, z0, z1) {
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
export const volumeOf = g => {
  let v = 0;
  for (let i = 0; i < g.cnt.length; i++) {
    const base = i*KMAX*2;
    for (let k = 0; k < g.cnt[i]; k++) v += g.sp[base+k*2+1] - g.sp[base+k*2];
  }
  return v * g.res * g.res;
};

/* 라운드 사각형 내부 / 부호거리 */
export function inRR(x, y, w, h, r) {
  if (w<=0||h<=0||x<0||y<0||x>w||y>h) return false;
  const rr = Math.max(0, Math.min(r, w/2, h/2));
  if (!rr) return true;
  const cx = clamp(x, rr, w-rr), cy = clamp(y, rr, h-rr);
  return (x-cx)**2 + (y-cy)**2 <= rr*rr;
}
export function sdRR(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w/2, h/2));
  const qx = Math.abs(x - w/2) - (w/2 - rr), qy = Math.abs(y - h/2) - (h/2 - rr);
  return Math.hypot(Math.max(qx,0), Math.max(qy,0)) + Math.min(Math.max(qx,qy),0) - rr;
}

export function meshOf(g, ox = 0, oy = 0, out) {
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

/* 닫힌 메시인지 / 크기 검사 */
export function audit(P, g) {
  let v6=0,nx=0,ny=0,nz=0,x0=1e9,y0=1e9,z0=1e9,x1=-1e9,y1=-1e9,z1=-1e9;
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

export function toSTL(P, title) {
  const n = P.length/9, buf = Buffer.alloc(84 + n*50);
  buf.write(('woojoo · ' + title).slice(0,79), 0, 'ascii');
  buf.writeUInt32LE(n, 80);
  let o = 84;
  for (let t=0;t<n;t++) {
    const i=t*9;
    const ux=P[i+3]-P[i],uy=P[i+4]-P[i+1],uz=P[i+5]-P[i+2];
    const vx=P[i+6]-P[i],vy=P[i+7]-P[i+1],vz=P[i+8]-P[i+2];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    const L=Math.hypot(nx,ny,nz)||1;
    buf.writeFloatLE(nx/L,o); buf.writeFloatLE(ny/L,o+4); buf.writeFloatLE(nz/L,o+8); o+=12;
    for (let k=0;k<9;k++){ buf.writeFloatLE(P[i+k],o); o+=4; }
    buf.writeUInt16LE(0,o); o+=2;
  }
  return buf;
}
