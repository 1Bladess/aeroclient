const loginCard = document.getElementById('loginCard');
const adminCard = document.getElementById('adminCard');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const devlogForm = document.getElementById('devlogForm');
const adminDevlogList = document.getElementById('adminDevlogList');
const manifestJson = document.getElementById('manifestJson');
const saveManifestBtn = document.getElementById('saveManifestBtn');
const adminMessage = document.getElementById('adminMessage');

const queryApiBase = new URLSearchParams(window.location.search).get('api');
if (queryApiBase) {
  localStorage.setItem('aero_api_base', queryApiBase);
}

const isGithubPages = window.location.hostname.endsWith('github.io');
const storedApiBase = (localStorage.getItem('aero_api_base') || '').trim();
const defaultApiBase = window.location.hostname.endsWith('github.io') ? 'http://localhost:8080' : '';
const API_BASE = (storedApiBase || defaultApiBase).trim().replace(/\/+$/, '');

function isInvalidApiBase(base) {
  if (!base) return false;
  try {
    const u = new URL(base);
    return u.hostname.endsWith('github.io');
  } catch (_err) {
    return true;
  }
}

if (isInvalidApiBase(API_BASE)) {
  localStorage.removeItem('aero_api_base');
}

const EFFECTIVE_API_BASE = isInvalidApiBase(API_BASE) ? '' : API_BASE;

let authToken = (localStorage.getItem('aero_admin_token') || '').trim();

function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!EFFECTIVE_API_BASE) return normalizedPath;
  return `${EFFECTIVE_API_BASE}${normalizedPath}`;
}

function authHeader() {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

async function api(path, options = {}) {
  if (isGithubPages && !EFFECTIVE_API_BASE) {
    throw new Error('Backend URL missing. Open admin with ?api=https://your-backend-domain');
  }

  const res = await fetch(apiUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...authHeader()
    },
    ...options
  });

  let body = null;
  try { body = await res.json(); } catch (_e) {}

  if (!res.ok) {
    const msg = (body && body.error) || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return body;
}

if (isGithubPages && !EFFECTIVE_API_BASE) {
  loginError.textContent = 'Set backend URL: admin.html?api=https://your-backend-domain';
}

async function checkSession() {
  try {
    await api('/api/auth/me');
    showAdmin();
    await refreshDevlog();
    await loadManifest();
  } catch (_err) {
    showLogin();
  }
}

function showLogin() {
  loginCard.classList.remove('hidden');
  adminCard.classList.add('hidden');
}

function showAdmin() {
  loginCard.classList.add('hidden');
  adminCard.classList.remove('hidden');
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    const loginData = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (loginData && loginData.token) {
      authToken = String(loginData.token);
      localStorage.setItem('aero_admin_token', authToken);
    }
    showAdmin();
    await refreshDevlog();
    await loadManifest();
  } catch (err) {
    loginError.textContent = err.message;
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch (_err) {
    // Clear local state even if backend session is already gone.
  }
  authToken = '';
  localStorage.removeItem('aero_admin_token');
  showLogin();
});

devlogForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  adminMessage.textContent = '';
  try {
    const title = document.getElementById('postTitle').value.trim();
    const tag = document.getElementById('postTag').value.trim() || 'UPDATE';
    const content = document.getElementById('postContent').value.trim();

    await api('/api/admin/devlog', {
      method: 'POST',
      body: JSON.stringify({ title, tag, content })
    });

    devlogForm.reset();
    adminMessage.textContent = 'Devlog post published.';
    await refreshDevlog();
  } catch (err) {
    adminMessage.textContent = err.message;
  }
});

async function refreshDevlog() {
  const data = await api('/api/devlog?limit=100');
  adminDevlogList.innerHTML = '';

  for (const item of data.items || []) {
    const node = document.createElement('article');
    node.className = 'entry';
    node.innerHTML = `
      <h4>${escapeHtml(item.title || '')}</h4>
      <div class="meta">${escapeHtml(item.tag || 'UPDATE')} • ${formatDate(item.publishedAt)}</div>
      <div>${escapeHtml(item.content || '')}</div>
      <button class="inline-danger" data-id="${item.id}">Delete</button>
    `;
    adminDevlogList.appendChild(node);
  }

  for (const btn of adminDevlogList.querySelectorAll('button[data-id]')) {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!id) return;
      await api(`/api/admin/devlog/${id}`, { method: 'DELETE' });
      await refreshDevlog();
    });
  }
}

async function loadManifest() {
  const data = await api('/api/updates/manifest?platform=windows&channel=stable');
  manifestJson.value = JSON.stringify(data, null, 2);
}

saveManifestBtn.addEventListener('click', async () => {
  adminMessage.textContent = '';
  try {
    const parsed = JSON.parse(manifestJson.value);
    await api('/api/admin/updates/manifest', {
      method: 'PUT',
      body: JSON.stringify({
        channel: 'stable',
        platform: 'windows',
        manifest: parsed
      })
    });
    adminMessage.textContent = 'Manifest saved.';
  } catch (err) {
    adminMessage.textContent = err.message;
  }
});

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

checkSession();
