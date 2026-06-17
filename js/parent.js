// 부모 페이지 로직 - 단발 요청 + 주기 추적
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

  let reqPollTimer = null;
  let waitDeadline = 0;
  let lastResponseTs = 0;
  let lastLocTs = 0;
  let trackRefreshTimer = null;

  // ===== 공용 헬퍼 =====
  function showSetup() { setupSection.classList.remove('hidden'); mainSection.classList.add('hidden'); }
  function showMain() { setupSection.classList.add('hidden'); mainSection.classList.remove('hidden'); }
  function setStatus(icon, text, sub) {
    statusIcon.textContent = icon;
    statusText.textContent = text;
    statusSub.textContent = sub || '';
  }
  function showLocation(loc) {
    if (!loc || !loc.timestamp || loc.timestamp === lastLocTs) return;
    lastLocTs = loc.timestamp;
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

  // ===== 단발 요청 =====
  function stopReqPolling() {
    if (reqPollTimer) { clearTimeout(reqPollTimer); reqPollTimer = null; }
    requestBtn.classList.remove('hidden');
    cancelBtn.classList.add('hidden');
  }

  async function pollOnce() {
    try {
      const [response, location] = await Promise.all([
        window.api.get('/response'),
        window.api.get('/location')
      ]);
      if (response && response.timestamp && response.timestamp > lastResponseTs) {
        lastResponseTs = response.timestamp;
        if (response.status === 'denied') {
          setStatus('❌', '거절되었어요', window.fmt.time(response.timestamp));
          stopReqPolling();
          return;
        }
      }
      if (location && location.timestamp && location.timestamp >= (waitDeadline - window.ICARE.RESPONSE_WAIT_MS)) {
        setStatus('🎯', '위치 도착!', window.fmt.time(location.timestamp));
        showLocation(location);
        stopReqPolling();
        return;
      }
      if (Date.now() > waitDeadline) {
        stopReqPolling();
        try { await window.api.put('/request', { active: false, timestamp: Date.now() }); } catch (e) {}
        setStatus('⏳', '응답이 없어 취소했어요', '아이 폰이 켜진 뒤 다시 요청해주세요');
        return;
      }
      reqPollTimer = setTimeout(pollOnce, window.ICARE.POLL_INTERVAL_MS);
    } catch (e) {
      setStatus('⚠️', '연결 오류', e.message);
      stopReqPolling();
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
      pollOnce();
    } catch (e) {
      setStatus('⚠️', '전송 실패', e.message);
      stopReqPolling();
    }
  }

  async function cancel() {
    stopReqPolling();
    try { await window.api.put('/request', { active: false, timestamp: Date.now() }); } catch (e) {}
    setStatus('📍', '취소했어요', '');
  }

  // ===== 주기 추적 =====
  function populateOptions() {
    const intSel = $('trackInterval');
    window.ICARE.TRACK_INTERVAL_OPTIONS.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.v; opt.textContent = o.label;
      intSel.appendChild(opt);
    });
    intSel.value = 30; // 기본 30초

    const durSel = $('trackDuration');
    window.ICARE.TRACK_DURATION_OPTIONS.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.v; opt.textContent = o.label;
      durSel.appendChild(opt);
    });
    durSel.value = 1; // 기본 1시간
  }

  function renderTrackingState(t, location) {
    const now = Date.now();
    const active = t && t.enabled && t.endsAt && t.endsAt > now;
    if (active) {
      $('trackOffView').classList.add('hidden');
      $('trackOnView').classList.remove('hidden');
      const remainMin = Math.ceil((t.endsAt - now) / 60000);
      const intervalLabel = (t.interval >= 60 ? Math.round(t.interval / 60) + '분' : t.interval + '초');
      let sub = `${intervalLabel} 간격 · ${remainMin}분 남음`;
      if (location && location.timestamp) sub += ` · 마지막 ${window.fmt.relative(location.timestamp)}`;
      $('trackStatusSub').textContent = sub;
      if (location) showLocation(location);
    } else {
      $('trackOnView').classList.add('hidden');
      $('trackOffView').classList.remove('hidden');
    }
  }

  async function refreshTracking() {
    try {
      const [t, location] = await Promise.all([
        window.api.get('/tracking'),
        window.api.get('/location')
      ]);
      renderTrackingState(t, location);
    } catch (e) {
      // 표시만 안 함, 다음 사이클에 재시도
    }
    if (!document.hidden) {
      trackRefreshTimer = setTimeout(refreshTracking, window.ICARE.PARENT_REFRESH_MS);
    }
  }

  async function startTracking() {
    const interval = parseInt($('trackInterval').value, 10);
    const durationH = parseFloat($('trackDuration').value);
    const now = Date.now();
    const endsAt = now + durationH * 3600 * 1000;
    try {
      await window.api.put('/tracking', { enabled: true, interval, endsAt, startedAt: now });
      refreshTracking();
    } catch (e) {
      alert('추적 시작 실패: ' + e.message);
    }
  }

  async function stopTracking() {
    try {
      await window.api.put('/tracking', { enabled: false, endsAt: Date.now(), startedAt: 0 });
      refreshTracking();
    } catch (e) {
      alert('추적 중지 실패: ' + e.message);
    }
  }

  // ===== 이벤트 =====
  requestBtn.addEventListener('click', requestLocation);
  cancelBtn.addEventListener('click', cancel);
  $('trackStartBtn').addEventListener('click', startTracking);
  $('trackStopBtn').addEventListener('click', stopTracking);
  $('settingsBtn').addEventListener('click', (e) => {
    e.preventDefault();
    showSetup();
    $('dbUrlInput').value = window.getDbUrl();
    $('changeRoleBtn').classList.remove('hidden');
  });
  $('saveDbUrl').addEventListener('click', () => {
    const v = $('dbUrlInput').value.trim();
    if (!v.startsWith('https://')) { alert('https:// 로 시작하는 Firebase DB URL을 입력하세요'); return; }
    window.setDbUrl(v);
    showMain();
    setStatus('📍', '위치를 요청해보세요', '');
    refreshTracking();
  });
  $('changeRoleBtn').addEventListener('click', () => {
    window.setRole('');
    location.href = './index.html';
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (trackRefreshTimer) { clearTimeout(trackRefreshTimer); trackRefreshTimer = null; }
    } else if (window.getDbUrl()) {
      refreshTracking();
    }
  });

  // ===== 초기화 =====
  $('appVersion').textContent = window.ICARE.VERSION;
  populateOptions();
  if (window.getRole() !== 'parent') window.setRole('parent');
  if (!window.getDbUrl()) {
    showSetup();
  } else {
    showMain();
    setStatus('📍', '위치를 요청해보세요', '');
    refreshTracking();
  }
})();
