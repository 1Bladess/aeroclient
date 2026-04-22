const queryApiBase = new URLSearchParams(window.location.search).get('api');
if (queryApiBase) {
  localStorage.setItem('aero_api_base', queryApiBase);
}

const storedApiBase = (localStorage.getItem('aero_api_base') || '').trim();
const isGithubPages = window.location.hostname.endsWith('github.io');
const hostedApiBase = 'https://aero-web-control.onrender.com';
const defaultApiBase = isGithubPages ? hostedApiBase : '';
let resolvedApiBase = (storedApiBase || defaultApiBase).trim();

if (isGithubPages && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(resolvedApiBase)) {
  resolvedApiBase = hostedApiBase;
  localStorage.setItem('aero_api_base', hostedApiBase);
}

const API_BASE = resolvedApiBase;

function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!API_BASE) return normalizedPath;
  return `${API_BASE.replace(/\/+$/, '')}${normalizedPath}`;
}

function getWebsiteClientId() {
  const key = 'aero_web_client_id';
  const existing = (localStorage.getItem(key) || '').trim();
  if (existing) return existing;
  const generated = `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(key, generated);
  return generated;
}

async function sendHeartbeat() {
  const body = {
    clientId: getWebsiteClientId(),
    username: 'website-guest',
    state: 'website'
  };

  try {
    await fetch(apiUrl('/api/presence/heartbeat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (_err) {
    // Keep public page resilient if backend is temporarily unavailable.
  }
}

async function fetchOnlineCount() {
  const res = await fetch(apiUrl('/api/presence/count'));
  if (!res.ok) return;
  const data = await res.json();
  const el = document.getElementById('onlineCount');
  if (el) el.textContent = String(data.online || 0);
}

async function fetchDevlog() {
  const res = await fetch(apiUrl('/api/devlog?limit=20'));
  if (!res.ok) return;
  const data = await res.json();
  const list = document.getElementById('devlogList');
  if (!list) return;

  list.innerHTML = '';
  const items = Array.isArray(data.items) ? data.items : [];
  for (const item of items) {
    const node = document.createElement('article');
    node.className = 'entry';
    node.innerHTML = `
      <h4>${escapeHtml(item.title || '')}</h4>
      <div class="meta">${escapeHtml(item.tag || 'UPDATE')} • ${formatDate(item.publishedAt)}</div>
      <div>${escapeHtml(item.content || '')}</div>
    `;
    list.appendChild(node);
  }
}

function formatDate(iso) {
  if (!iso) return 'Unknown date';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleString();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

fetchOnlineCount();
fetchDevlog();
sendHeartbeat();
setInterval(fetchOnlineCount, 10000);
setInterval(fetchDevlog, 30000);
setInterval(sendHeartbeat, 15000);
