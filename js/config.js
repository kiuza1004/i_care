// 가족용 위치찾기 - 환경설정
// Firebase Realtime Database URL은 localStorage에 저장합니다.
// (설치 시 ⚙️ 또는 최초 화면에서 입력)
window.ICARE = {
  DB_URL_KEY: 'icare_db_url',
  REQUEST_TTL_MS: 10 * 60 * 1000, // 요청 유효시간 10분
  POLL_INTERVAL_MS: 4000,         // 폴링 간격 (포그라운드에서만)
  RESPONSE_WAIT_MS: 3 * 60 * 1000 // 부모가 응답 기다리는 최대시간 3분
};

window.getDbUrl = function () {
  const v = (localStorage.getItem(window.ICARE.DB_URL_KEY) || '').trim();
  return v.replace(/\/+$/, '');
};

window.setDbUrl = function (url) {
  localStorage.setItem(window.ICARE.DB_URL_KEY, (url || '').trim());
};
