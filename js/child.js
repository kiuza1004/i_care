// 아이 페이지 로직 - 데이터 절약 최우선
// - 앱이 열려있을 때만 폴링
// - 보이지 않을 때는 폴링 중지
// - 위치 1회 전송 후 종료
(function () {
  const $ = (id) => document.getElementById(id);
  const setupSection = $('setupSection');
  const mainSection = $('mainSection');
  const idleCard = $('idleCard');
  const requestCard = $('requestCard');
  const sendingCard = $('sendingCard');
  const doneCard = $('doneCard');
  const reqTime = $('reqTime');

  let pollTimer = null;
  let currentRequestTs = 0;
  let handledTs = parseInt(localStorage.getItem('icare_handled_ts') || '0', 10);

  function showSetup() {
    setupSection.classList.remove('hidden');
    mainSection.classList.add('hidden');
  }
  function showMain() {
    setupSection.classList.add('hidden');
    mainSection.classList.remove('hidden');
  }
  function showCard(card) {
    [idleCard, requestCard, sendingCard, doneCard].forEach(c => c.classList.add('hidden'));
    card.classList.remove('hidden');
  }

  function stopPolling() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  }

  async function checkOnce() {
    try {
      const req = await window.api.get('/request');
      if (!req || !req.active || !req.timestamp) return null;
      const age = Date.now() - req.timestamp;
      if (age > window.ICARE.REQUEST_TTL_MS) return null; // 만료
      if (req.timestamp <= handledTs) return null;        // 이미 처리됨
      return req;
    } catch (e) {
      return null;
    }
  }

  async function poll() {
    if (document.hidden) {
      // 화면이 꺼져있으면 폴링 정지 (배터리/데이터 절약)
      stopPolling();
      return;
    }
    const req = await checkOnce();
    if (req) {
      currentRequestTs = req.timestamp;
      reqTime.textContent = '요청 시각: ' + window.fmt.time(req.timestamp);
      showCard(requestCard);
      stopPolling();
      return;
    }
    pollTimer = setTimeout(poll, window.ICARE.POLL_INTERVAL_MS);
  }

  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('이 기기는 위치를 지원하지 않아요')); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 25000, maximumAge: 30000 }
      );
    });
  }

  async function accept() {
    showCard(sendingCard);
    try {
      const pos = await getPosition();
      const loc = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: Date.now()
      };
      await window.api.put('/location', loc);
      await window.api.put('/response', { status: 'accepted', timestamp: Date.now() });
      handledTs = currentRequestTs;
      localStorage.setItem('icare_handled_ts', String(handledTs));
      $('doneText').textContent = '위치를 보냈어요 ✅';
      showCard(doneCard);
    } catch (e) {
      $('doneText').textContent = '실패: ' + (e.message || '알 수 없음');
      showCard(doneCard);
    }
  }

  async function deny() {
    try {
      await window.api.put('/response', { status: 'denied', timestamp: Date.now() });
      handledTs = currentRequestTs;
      localStorage.setItem('icare_handled_ts', String(handledTs));
    } catch (e) {}
    $('doneText').textContent = '거절했어요';
    showCard(doneCard);
  }

  function startIdle() {
    showCard(idleCard);
    stopPolling();
    if (!document.hidden) poll();
  }

  // 이벤트
  $('acceptBtn').addEventListener('click', accept);
  $('denyBtn').addEventListener('click', deny);
  $('checkBtn').addEventListener('click', async () => {
    const req = await checkOnce();
    if (req) {
      currentRequestTs = req.timestamp;
      reqTime.textContent = '요청 시각: ' + window.fmt.time(req.timestamp);
      showCard(requestCard);
    }
  });
  $('doneBtn').addEventListener('click', startIdle);
  $('settingsBtn').addEventListener('click', (e) => { e.preventDefault(); showSetup(); $('dbUrlInput').value = window.getDbUrl(); });
  $('saveDbUrl').addEventListener('click', () => {
    const v = $('dbUrlInput').value.trim();
    if (!v.startsWith('https://')) { alert('https:// 로 시작하는 Firebase DB URL을 입력하세요'); return; }
    window.setDbUrl(v);
    showMain();
    startIdle();
  });

  // 화면 보임/안보임에 따라 폴링 시작/중지
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPolling();
    } else if (window.getDbUrl() && idleCard && !idleCard.classList.contains('hidden')) {
      poll();
    }
  });

  // 초기화
  if (!window.getDbUrl()) {
    showSetup();
  } else {
    showMain();
    startIdle();
  }
})();
