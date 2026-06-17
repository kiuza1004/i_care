// 아이 페이지 로직 - 데이터/배터리 절약
// - 화면이 보일 때만 동작 (visibilitychange)
// - 단발 요청 + 주기 추적 모두 지원
// - 단발 요청은 자동 수락 (아이가 직접 조작 못 함)
// - Wake Lock으로 추적 중 자동 잠금 방지
(function () {
  const $ = (id) => document.getElementById(id);
  const setupSection = $('setupSection');
  const mainSection = $('mainSection');
  const idleCard = $('idleCard');
  const requestCard = $('requestCard');
  const sendingCard = $('sendingCard');
  const doneCard = $('doneCard');
  const trackingCard = $('trackingCard');
  const reqTime = $('reqTime');

  let pollTimer = null;       // idle 모드 폴링 타이머
  let trackTimer = null;      // 추적 GPS 전송 타이머
  let trackCheckTimer = null; // 추적 설정 재확인 타이머
  let trackingActive = false;
  let trackingIntervalMs = 600000;
  let trackingEndsAt = 0;
  let lastTrackSendTs = 0;
  let currentRequestTs = 0;
  let wakeLock = null;
  let handledTs = parseInt(localStorage.getItem('icare_handled_ts') || '0', 10);

  function showSetup() { setupSection.classList.remove('hidden'); mainSection.classList.add('hidden'); }
  function showMain() { setupSection.classList.add('hidden'); mainSection.classList.remove('hidden'); }
  function showCard(card) {
    [idleCard, requestCard, sendingCard, doneCard, trackingCard].forEach(c => c.classList.add('hidden'));
    card.classList.remove('hidden');
  }

  // ===== Wake Lock =====
  async function acquireWakeLock() {
    if (wakeLock) return;
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } catch (e) {}
    }
  }
  function releaseWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
  }

  // ===== GPS =====
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

  async function sendCurrentLocation() {
    const pos = await getPosition();
    const loc = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      timestamp: Date.now()
    };
    await window.api.put('/location', loc);
    return loc;
  }

  // ===== 단발 요청 처리 =====
  async function checkPendingRequest() {
    try {
      const req = await window.api.get('/request');
      if (!req || !req.active || !req.timestamp) return null;
      if (Date.now() - req.timestamp > window.ICARE.REQUEST_TTL_MS) return null;
      if (req.timestamp <= handledTs) return null;
      return req;
    } catch (e) { return null; }
  }

  async function accept() {
    showCard(sendingCard);
    try {
      await sendCurrentLocation();
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

  // ===== 추적 모드 =====
  function clearTrackTimers() {
    if (trackTimer) { clearTimeout(trackTimer); trackTimer = null; }
    if (trackCheckTimer) { clearTimeout(trackCheckTimer); trackCheckTimer = null; }
  }

  function trackingUpdateSub(extra) {
    const remainMin = Math.max(0, Math.ceil((trackingEndsAt - Date.now()) / 60000));
    const minLabel = (trackingIntervalMs >= 60000 ? Math.round(trackingIntervalMs / 60000) + '분' : Math.round(trackingIntervalMs / 1000) + '초');
    let sub = `${minLabel}마다 전송 · ${remainMin}분 남음`;
    if (extra) sub = extra + ' · ' + sub;
    $('trackingSub').textContent = sub;
  }

  async function trackingTick() {
    if (!trackingActive) return;
    if (Date.now() >= trackingEndsAt) { await stopTracking(false); return; }
    if (document.hidden) return; // 화면 숨김 시 GPS 안 함
    try {
      trackingUpdateSub('전송 중');
      await sendCurrentLocation();
      lastTrackSendTs = Date.now();
      trackingUpdateSub('마지막 ' + window.fmt.time(lastTrackSendTs).slice(11));
    } catch (e) {
      trackingUpdateSub('전송 실패 - 재시도');
    }
    // 다음 전송 예약
    const wait = Math.max(5000, trackingIntervalMs);
    trackTimer = setTimeout(trackingTick, wait);
  }

  async function checkTrackingConfig() {
    try {
      const t = await window.api.get('/tracking');
      const now = Date.now();
      const active = t && t.enabled && t.endsAt && t.endsAt > now;
      if (active) {
        const intervalMs = (t.interval || 600) * 1000;
        const endsAt = t.endsAt;
        if (!trackingActive) {
          // 새로 시작
          trackingActive = true;
          trackingIntervalMs = intervalMs;
          trackingEndsAt = endsAt;
          await acquireWakeLock();
          showCard(trackingCard);
          trackingUpdateSub('시작 중');
          await trackingTick();
        } else {
          // 설정 변경 반영
          trackingIntervalMs = intervalMs;
          trackingEndsAt = endsAt;
        }
      } else if (trackingActive) {
        await stopTracking(false);
      }
    } catch (e) { /* 무시 */ }
    // 주기적으로 설정 재확인 (부모가 중지/연장한 경우 감지)
    if (!document.hidden) {
      trackCheckTimer = setTimeout(checkTrackingConfig, window.ICARE.TRACK_CHECK_MS);
    }
  }

  async function stopTracking(notifyParent) {
    trackingActive = false;
    clearTrackTimers();
    releaseWakeLock();
    if (notifyParent) {
      try { await window.api.put('/tracking', { enabled: false, endsAt: Date.now(), startedAt: 0 }); } catch (e) {}
    }
    startIdle();
  }

  // ===== 폴링 (idle 상태) =====
  function stopIdlePolling() { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } }

  async function idleTick() {
    if (document.hidden || trackingActive) { stopIdlePolling(); return; }
    // 요청 또는 추적 설정 둘 다 확인
    const req = await checkPendingRequest();
    if (req) {
      currentRequestTs = req.timestamp;
      reqTime.textContent = '요청 시각: ' + window.fmt.time(req.timestamp);
      stopIdlePolling();
      if (window.getAutoAccept()) await accept();
      else showCard(requestCard);
      return;
    }
    pollTimer = setTimeout(idleTick, window.ICARE.POLL_INTERVAL_MS);
  }

  function startIdle() {
    trackingActive = false;
    showCard(idleCard);
    stopIdlePolling();
    if (trackCheckTimer) { clearTimeout(trackCheckTimer); trackCheckTimer = null; }
    if (!document.hidden) {
      idleTick();
      checkTrackingConfig(); // 추적 모드도 함께 확인
    }
  }

  // ===== 이벤트 =====
  $('acceptBtn').addEventListener('click', accept);
  $('denyBtn').addEventListener('click', deny);
  $('checkBtn').addEventListener('click', async () => {
    const req = await checkPendingRequest();
    if (req) {
      currentRequestTs = req.timestamp;
      reqTime.textContent = '요청 시각: ' + window.fmt.time(req.timestamp);
      if (window.getAutoAccept()) await accept();
      else showCard(requestCard);
    }
    checkTrackingConfig();
  });
  $('doneBtn').addEventListener('click', startIdle);
  $('trackingStopBtn').addEventListener('click', () => stopTracking(true));
  $('settingsBtn').addEventListener('click', (e) => {
    e.preventDefault();
    showSetup();
    $('dbUrlInput').value = window.getDbUrl();
    $('autoAcceptSelect').value = window.getAutoAccept() ? '1' : '0';
    $('changeRoleBtn').classList.remove('hidden');
  });
  $('saveDbUrl').addEventListener('click', () => {
    const v = $('dbUrlInput').value.trim();
    if (!v.startsWith('https://')) { alert('https:// 로 시작하는 Firebase DB URL을 입력하세요'); return; }
    window.setDbUrl(v);
    window.setAutoAccept($('autoAcceptSelect').value === '1');
    showMain();
    startIdle();
  });
  $('changeRoleBtn').addEventListener('click', () => {
    window.setRole('');
    location.href = './index.html';
  });

  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
      stopIdlePolling();
      clearTrackTimers();
      releaseWakeLock();
    } else if (window.getDbUrl()) {
      if (trackingActive) {
        await acquireWakeLock();
        await checkTrackingConfig();
        trackingTick();
      } else {
        idleTick();
        checkTrackingConfig();
      }
    }
  });

  // Wake Lock 해제 시 화면 복귀 후 재획득
  if ('wakeLock' in navigator) {
    document.addEventListener('visibilitychange', async () => {
      if (!document.hidden && trackingActive && !wakeLock) {
        await acquireWakeLock();
      }
    });
  }

  // ===== 초기화 =====
  if (window.getRole() !== 'child') window.setRole('child');
  if (!window.getDbUrl()) {
    showSetup();
    $('autoAcceptSelect').value = window.getAutoAccept() ? '1' : '0';
  } else {
    showMain();
    startIdle();
  }
})();
