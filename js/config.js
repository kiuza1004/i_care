// 가족용 위치찾기 - 환경설정
// Firebase Realtime Database URL은 localStorage에 저장합니다.
// (설치 시 ⚙️ 또는 최초 화면에서 입력)
window.ICARE = {
  DB_URL_KEY: 'icare_db_url',
  ROLE_KEY: 'icare_role',           // 'parent' | 'child'
  AUTO_ACCEPT_KEY: 'icare_auto_accept', // '1' | '0' (아이 측)
  REQUEST_TTL_MS: 10 * 60 * 1000, // 요청 유효시간 10분
  POLL_INTERVAL_MS: 4000,         // 폴링 간격 (포그라운드에서만)
  RESPONSE_WAIT_MS: 3 * 60 * 1000,// 부모가 응답 기다리는 최대시간 3분
  TRACK_CHECK_MS: 20000,          // 아이 측 /tracking 상태 재확인 간격
  PARENT_REFRESH_MS: 15000,       // 부모 측 /location 갱신 폴링 간격
  TRACK_INTERVAL_OPTIONS: [       // 추적 간격 후보 (초)
    { v: 30,   label: '30초' },
    { v: 60,   label: '1분' },
    { v: 180,  label: '3분' },
    { v: 300,  label: '5분' },
    { v: 600,  label: '10분' },
    { v: 1800, label: '30분' }
  ],
  TRACK_DURATION_OPTIONS: [       // 추적 지속 시간 후보 (시간)
    { v: 1, label: '1시간' },
    { v: 2, label: '2시간' },
    { v: 4, label: '4시간' }
  ]
};

window.getDbUrl = function () {
  const v = (localStorage.getItem(window.ICARE.DB_URL_KEY) || '').trim();
  return v.replace(/\/+$/, '');
};

window.setDbUrl = function (url) {
  localStorage.setItem(window.ICARE.DB_URL_KEY, (url || '').trim());
};

window.getRole = function () {
  return localStorage.getItem(window.ICARE.ROLE_KEY) || '';
};

window.setRole = function (role) {
  if (role) localStorage.setItem(window.ICARE.ROLE_KEY, role);
  else localStorage.removeItem(window.ICARE.ROLE_KEY);
};

window.getAutoAccept = function () {
  const v = localStorage.getItem(window.ICARE.AUTO_ACCEPT_KEY);
  return v === null ? true : v === '1'; // 기본: 자동 수락
};

window.setAutoAccept = function (on) {
  localStorage.setItem(window.ICARE.AUTO_ACCEPT_KEY, on ? '1' : '0');
};
