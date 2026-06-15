// Firebase Realtime DB REST API 래퍼 (SDK 미사용 → 저용량)
// 경로 예: /request.json, /response.json, /location.json

window.api = (function () {
  function url(path) {
    const base = window.getDbUrl();
    if (!base) throw new Error('DB URL 미설정');
    return base + path + '.json';
  }

  async function get(path) {
    const r = await fetch(url(path), { cache: 'no-store' });
    if (!r.ok) throw new Error('GET 실패: ' + r.status);
    return r.json();
  }

  async function put(path, data) {
    const r = await fetch(url(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error('PUT 실패: ' + r.status);
    return r.json();
  }

  async function del(path) {
    const r = await fetch(url(path), { method: 'DELETE' });
    if (!r.ok) throw new Error('DELETE 실패: ' + r.status);
    return r.json();
  }

  return { get, put, del };
})();

window.fmt = {
  time(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  },
  relative(ts) {
    if (!ts) return '';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}초 전`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}분 전`;
    return `${Math.floor(m / 60)}시간 전`;
  }
};
