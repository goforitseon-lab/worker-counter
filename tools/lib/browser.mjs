/* ============================================================
   Playwright 불러오기 — 어느 컴퓨터에서 돌려도 되게

     글자·SVG 를 픽셀로 바꾸는 데 캔버스가 필요해서 헤드리스
     크로미움을 쓴다. 설치 위치가 컴퓨터마다 다르므로
     1) 프로젝트에 설치된 것   2) 전역 설치본  순으로 찾는다.
   ============================================================ */
export async function chromium() {
  const tries = [
    'playwright',                                        // npm i playwright
    'playwright-core',
    '/opt/node22/lib/node_modules/playwright/index.mjs', // 이 저장소가 처음 돌던 서버
  ];
  const fails = [];
  for (const spec of tries) {
    try { return (await import(spec)).chromium; }
    catch (e) { fails.push(`  ${spec} → ${e.code || e.message.split('\n')[0]}`); }
  }
  throw new Error(
    'Playwright 를 찾지 못했습니다. 프로젝트 폴더에서 아래를 실행하세요:\n' +
    '  npm install\n  npx playwright install chromium\n\n시도한 경로:\n' + fails.join('\n'));
}
