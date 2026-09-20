# 3D 출력물 생성기

(주)우주특수산업 3D 프린터 출력물을 만드는 스크립트 모음.
치수를 눈으로 맞추지 않고 **숫자로 검증**하는 것이 이 폴더의 원칙이다.

## 설치 (맥북 기준, 최초 1회)

```bash
brew install node          # 없으면
npm install
npx playwright install chromium
```

글자와 SVG 를 픽셀로 바꾸는 데 캔버스가 필요해서 헤드리스 크로미움을 쓴다.

## 실행

```bash
node tools/build-qicase.mjs out-qi            # 무선충전 케이스
node tools/build-qicase.mjs out-qi --plain    # 라벨·로고 없는 단색 시험용
node tools/build-cardcase.mjs out-card        # 명함 케이스
node tools/stl-preview.mjs 미리보기.png 파일.stl   # STL 음영 렌더
```

### build-qicase.mjs 인자

| 인자 | 기본값 | 설명 |
|---|---|---|
| `--modH=93` | 93 | **모듈 세로 실측값.** 케이스 세로 = modH + 0.7 + 5.2 |
| `--capT=0.8` | 0.8 | 커버 두께. 얇을수록 맥세이프 자력이 세다 |
| `--floor=1.2` | 1.2 | 바닥 두께 |
| `--portW=9.0` | 9.0 | USB-C 개구 가로. **8.9 아래로 내리면 플러그가 안 들어간다** |
| `--plain` | — | 라벨·로고 없이 단색으로 |

## 현재 설계값 (v2)

- 외형 65.9 × 98.9 × 14.3 mm · 모듈 자리 60.7 × 93.7 × 12.3
- 체결: 커버 안쪽 립의 비드 ↔ 셸 안쪽벽 홈. **실걸림 0.43~0.45mm, 걸림면 수평 0도**
  → 닫히지만 공구 없이는 안 열린다
- 셸 바닥 = AIRBAG 라벨 4색, 커버 윗면 = 우주 로고 2색. 둘 다 베드 접촉면이라 **서포트 불필요**
- 커버는 **로고면을 베드에 깔고 뒤집어서** 출력한다

## 출력 순서

1. `qi_porttest.stl` (5분) — 포트 위치 확인. **본 출력 전 반드시**
2. `qi_shell.3mf` (4파트) + `qi_cap.3mf` (3파트) — 슬라이서에서 파트별 필라멘트 지정
3. 한 번 닫으면 안 열리므로 모듈을 먼저 넣고 닫을 것

## 지켜야 할 것

- **몸체 STL 만 슬라이싱하지 말 것.** 색 파트가 빠지면 베드 접촉이 58% 로 떨어진다. 반드시 3MF
- 라벨·로고는 **색이 들어가는 자리만** 파낸다. 실루엣 전체를 파면 흰 바탕이 빈 홈이 되어 첫 층이 뭉개진다
- 베드에 닿는 면의 그림은 **X 로 뒤집어야** 완성품에서 바로 읽힌다
- 빌드할 때마다 찍히는 **베드 접촉 면적 · 실걸림 · 닫힌 메시** 세 줄을 확인할 것

## 구조

```
tools/
  lib/solid.mjs     다중구간 하이트맵 엔진 (벽 관통 구멍·언더컷 표현 가능)
  lib/threemf.mjs   파트별 필라멘트 지정이 되는 3MF 쓰기
  lib/browser.mjs   Playwright 경로 해석
  build-qicase.mjs  무선충전 케이스
  build-cardcase.mjs 명함 케이스
  stl-preview.mjs   Z버퍼 음영 렌더
assets/
  airbag-label.png  AIRBAG 라벨 4색 인덱스 (실치수 112.01 × 72.14mm)
woojoo-logo.svg     회사 로고 (path0 = 남색, path1,2 = 초록)
```
