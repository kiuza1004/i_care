// 부모 페이지 로직
(function () {
  const $ = (id) => document.getElementById(id);
  const setupSection = $('setupSection');
  const mainSection = $('mainSection');
  const statusIcon = $('statusIcon');
  const statusText = $('statusText');
  const statusSub = $('statusSub');
  const requestBtn = $('requestBtn');
  const cancelBtn = $('cancelBtn');
  const resultCard = $('resultCard');

  let pollTimer = null;
  let waitDeadline = 0;
  let lastResponseTs = 0;

  function showSetup() {
    setupSection.classList.remove('hidden');
    mainSection.classList.add('hidden');
  }

  function showMain() {
    setupSection.classList.add('hidden');
    mainSection.classList.remove('hidden');
  }

  function setStatus(icon, text, sub) {
    statusIcon.textContent = icon;
    statusText.textContent = text;
    statusSub.textContent = sub || '';
  }

  function showResult(loc) {
    resultCard.classList.remove('hidden');
    $('lat').textContent = loc.lat.toFixed(6);
    $('lng').textContent = loc.lng.toFixed(6);
    $('acc').textContent = Math.round(loc.accuracy || 0);
    $('ts').textContent = window.fmt.time(loc.timestamp);
    const { lat, lng } = loc;
    $('kakaoLink').href = `https://map.kakao.com/link/map/위치,${lat},${lng}`;
    $('naverLink').href = `https://map.naver.com/p/?c=${lng},${lat},17,0,0,0,dh`;
    $('googleLink').href = `https://www.google.com/maps?q=${lat},${lng}`;
  }

  function stopPolling() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    requestBtn.classList.remove('hidden');
    cancelBtn.classList.add('hidden');
  }

  async function poll() {
    try {
      const [response, location] = await Promise.all([
        window.api.get('/response'),
        window.api.get('/location')
      ]);

      // 응답 처리
      if (response && response.timestamp && response.timestamp > lastResponseTs) {
        lastResponseTs = response.timestamp;
        if (response.status === 'denied') {
          setStatus('❌', '거절되었어요', window.fmt.time(response.timestamp));
          stopPolling();
          return;
        }
      }

      // 위치 도착
      if (location && location.timestamp && location.timestamp >= (waitDeadline - window.ICARE.RESPONSE_WAIT_MS)) {
        setStatus('🎯', '위치 도착!', window.fmt.time(location.timestamp));
        showResult(location);
        stopPolling();
        return;
      }

      // 타임아웃
      if (Date.now() > waitDeadline) {
        setStatus('⏳', '응답이 없어요', '아이가 앱을 열도록 알려주세요');
        stopPolling();
        return;
      }

      pollTimer = setTimeout(poll, window.ICARE.POLL_INTERVAL_MS);
    } catch (e) {
      setStatus('⚠️', '연결 오류', e.message);
      stopPolling();
    }
  }

  async function requestLocation() {
    if (!window.getDbUrl()) { showSetup(); return; }
    requestBtn.classList.add('hidden');
    cancelBtn.classList.remove('hidden');
    resultCard.classList.add('hidden');
    setStatus('📤', '요청 보내는 중...', '');

    try {
      const now = Date.now();
      await window.api.put('/request', { active: true, timestamp: now });
      waitDeadline = now + window.ICARE.RESPONSE_WAIT_MS;
      lastResponseTs = now;
      setStatus('⏳', '응답 대기 중...', '아이가 앱을 열어 승낙해야 합니다');
      poll();
    } catch (e) {
      setStatus('⚠️', '전송 실패', e.message);
      stopPolling();
    }
  }

  async function cancel() {
    stopPolling();
    try { await window.api.put('/request', { active: false, timestamp: Date.now() }); } catch (e) {}
    setStatus('📍', '취소했어요', '다시 요청할 수 있어요');
  }

  // 이벤트
  requestBtn.addEventListener('click', requestLocation);
  cancelBtn.addEventListener('click', cancel);
  $('settingsBtn').addEventListener('click', (e) => { e.preventDefault(); showSetup(); $('dbUrlInput').value = window.getDbUrl(); });
  $('saveDbUrl').addEventListener('click', () => {
    const v = $('dbUrlInput').value.trim();
    if (!v.startsWith('https://')) { alert('https:// 로 시작하는 Firebase DB URL을 입력하세요'); return; }
    window.setDbUrl(v);
    showMain();
    setStatus('📍', '위치를 요청해보세요', '');
  });

  // 초기화
  if (!window.getDbUrl()) {
    showSetup();
  } else {
    showMain();
    setStatus('📍', '위치를 요청해보세요', '');
  }
})();
