# Choco Astro Studio

스태킹 완료된 천체사진을 빠르게 확인하고 보정하기 위한 브라우저 기반 프로토타입입니다.

## 주요 기능

- TIFF/TIF, PNG, JPG/JPEG, WebP 등 이미지 열기
- 고비트 TIFF 화면용 자동 정규화 미리보기
- 히스토그램 표시
- Black/Mid/White point 기반 스트레치
- 노출, 밝기, 대비, 채도, 자연 채도, 감마
- 자동 스트레치, 배경 어둡게, 배경 중화, 그라디언트 완화
- 별 마스크 감지 및 별 축소
- 은하/성운 후보 자동 감지
- 사용자가 이미지 위를 드래그해 대상 영역 힌트 지정
- 배경/대상/별 마스크 기반 부분 보정
- PNG/JPG 저장
- 어두운 배경의 각진 모던 UI

## 실행 방법

### 가장 간단한 방법

`index.html`을 브라우저로 열면 됩니다.

단, TIFF 디코딩 라이브러리 `UTIF.js`를 CDN에서 불러오기 때문에 인터넷 연결이 필요합니다.

### 로컬 서버로 실행

브라우저 보안 정책 때문에 일부 환경에서 파일 직접 열기가 제한될 수 있습니다.
그럴 때는 폴더에서 아래 중 하나를 실행하세요.

```bash
python -m http.server 8000
```

그 다음 브라우저에서 접속:

```text
http://localhost:8000
```

## GitHub Pages 배포 방법

1. GitHub에 새 저장소를 만듭니다.
2. 이 폴더의 `index.html`, `styles.css`, `app.js`, `README.md`를 업로드합니다.
3. 저장소 Settings → Pages로 이동합니다.
4. Source를 `Deploy from a branch`로 설정합니다.
5. Branch를 `main`, 폴더를 `/root`로 설정합니다.
6. 저장하면 GitHub Pages 주소가 생성됩니다.

## 현재 한계

- 이 버전은 서버 없는 정적 웹앱이므로 고비트 TIFF를 화면용으로 자동 정규화하지만, 저장/보정 파이프라인은 브라우저 미리보기용 8-bit RGBA 기반입니다.
- FITS는 아직 지원하지 않습니다.
- AI 부분 선택은 딥러닝 모델이 아니라 밝기/구조/선택영역 기반 스마트 마스크입니다.
- 저장은 PNG/JPG를 지원합니다. 16-bit TIFF 저장은 후속 버전에서 Python/WebAssembly 엔진이 필요합니다.

## 다음 개발 후보

- 16-bit 처리 엔진
- FITS 읽기
- TIFF 저장
- 커브 편집 UI
- 마스크 브러시 수정
- 실제 AI/SAM 계열 마스크 연동
- 별 축소 알고리즘 고도화
- Electron/Tauri 데스크톱 앱 패키징
