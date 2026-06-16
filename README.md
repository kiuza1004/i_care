# 우리아이 위치찾기

가족용 초경량 위치 확인 웹앱. 부모폰에서 요청하고, 아이폰에서 승낙하면 위치를 1회 전송합니다.

- **무료**: GitHub Pages + Firebase Realtime Database 무료 한도 내
- **저데이터**: 1회 요청에 ~1–2KB. 서비스워커 캐시로 두 번째부터는 정적 리소스 0KB
- **저전력**: 아이폰 측은 앱이 보일 때만 폴링. 백그라운드 푸시 미사용 → 배터리/데이터 부담 없음
- **단순**: HTML/CSS/JS만. 빌드 도구 없음

## 사용 흐름

### A. 단발 요청 (필요할 때 1회)

1. 부모 → 부모폰 앱에서 "위치 요청하기 (1회)" 누름
2. 부모가 전화/문자로 아이에게 "앱 열어줘" 알림
3. 아이폰 앱을 열면 요청 알림이 표시됨 → "위치 보내기" 탭
4. 부모폰에 위치 도착 → 카카오/네이버/구글지도 링크로 열어 확인

### B. 주기 추적 (일정 시간 자동 갱신)

1. 부모 → "🔄 주기 추적" 카드에서 간격(5/10/30분)·지속(1/2/4시간) 선택 → "추적 시작"
2. 아이는 앱 화면을 켜둔 채로 둠 (예: 등하굣길)
3. 아이 폰이 자동으로 간격마다 GPS를 부모에게 전송
4. 지정 시간이 지나면 자동 종료. 부모가 수동으로 "추적 중지"도 가능

**주의**: 모바일 브라우저는 백그라운드 탭을 종료합니다.
- 아이 앱이 **열려있고 화면이 켜진 상태**여야 추적이 진행됩니다
- 잠금화면 방지(Wake Lock API)는 추적 모드에서 자동 적용
- 아이가 다른 앱으로 전환하면 추적이 일시 정지되고, 다시 돌아오면 재개

> 백그라운드 푸시/추적을 일부러 빼서 데이터/배터리를 아꼈습니다. 가족 간 짧은 연락 + 추적 모드로 충분합니다.

## 최초 설정 (10분)

### 1. Firebase 프로젝트 만들기 (무료 Spark 플랜)

1. https://console.firebase.google.com 접속 → 로그인
2. **프로젝트 추가** → 이름 입력 (예: `i-care`) → 만들기 (Google Analytics는 꺼도 됨)
3. 좌측 메뉴 **빌드 → Realtime Database** → **데이터베이스 만들기**
   - 위치: `asia-southeast1` (싱가포르) 선택
   - 보안 규칙: **테스트 모드로 시작** 선택
4. 만들어진 데이터베이스 상단의 URL 복사
   - 예: `https://i-care-xxxxx-default-rtdb.asia-southeast1.firebasedatabase.app/`

### 2. 보안 규칙 설정

테스트 모드는 30일 후 만료됩니다. **규칙** 탭에서 아래로 교체하세요. (가족용이므로 공개 규칙)

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

> URL이 곧 비밀번호 역할입니다. 가족 외 공유 금지.

### 3. 앱 열기

GitHub Pages 배포 URL을 부모폰/아이폰에서 엽니다.
- 예: `https://kiuza1004.github.io/i_care/`

처음 열면 Firebase Database URL 입력창이 나옵니다. 위 1번에서 복사한 URL을 붙여넣고 저장합니다.

### 4. 홈 화면에 추가 (PWA 설치)

**iPhone (Safari)**: 공유 → "홈 화면에 추가"
**Android (Chrome)**: 메뉴 → "앱 설치" 또는 "홈 화면에 추가"

홈에서 바로 실행되며 전체화면 앱처럼 동작합니다.

## 폴더 구조

```
i_care/
├── index.html        # 역할 선택 (부모/아이)
├── parent.html       # 부모 화면
├── child.html        # 아이 화면
├── manifest.json     # PWA 매니페스트
├── sw.js             # 서비스워커 (정적 캐시)
├── icon.svg          # 앱 아이콘
├── css/style.css
└── js/
    ├── config.js     # 상수 + DB URL 저장/조회
    ├── api.js        # Firebase REST API 호출
    ├── parent.js
    └── child.js
```

## 데이터 사용량 추정

| 항목 | 데이터 |
|---|---|
| 최초 PWA 설치 (모든 정적 리소스) | ~12KB |
| 이후 앱 실행 (캐시 사용) | 0KB |
| 단발 요청 1회 | ~1–2KB |
| 한 달 단발 30회 사용 | ~60KB |
| 추적 1회 전송 + 설정확인 | ~1KB |
| 추적 5분 간격으로 1시간 (12회 + 설정확인 9회) | ~21KB |
| 추적 매일 2시간 30일 | ~30MB |

아이폰 1GB 한도 대비 무시할 수준입니다.

## 데이터 구조 (Firebase RTDB)

```
/request   { active: bool, timestamp: ms }                      # 단발: 부모가 씀, 아이가 읽음
/response  { status: "accepted"|"denied", timestamp: ms }       # 단발 응답
/location  { lat, lng, accuracy, timestamp: ms }                # 가장 최근 위치 (단발/추적 공용)
/tracking  { enabled: bool, interval: sec, endsAt: ms, startedAt: ms }  # 추적 상태
```

요청은 10분 후 자동 만료(`ICARE.REQUEST_TTL_MS`).
추적은 `endsAt`가 현재 시각을 지나면 자동 만료.

## 로컬 테스트

```bash
# 아무 정적 서버 (Python 예시)
python -m http.server 8080
# 브라우저: http://localhost:8080
```

HTTPS가 아니어도 localhost에서는 Geolocation/Service Worker가 동작합니다.
