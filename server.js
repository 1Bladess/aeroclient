const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const PRESENCE_TTL_SECONDS = Number(process.env.PRESENCE_TTL_SECONDS || 60);

const DEFAULT_ADMIN_USERNAME = 'Duckyblade';
const DEFAULT_ADMIN_PASSWORD_HASH = '$2a$12$t9Krc/IYZb/OSUoQ1YJmseP/hLK9eGVVZy2PCkqqNSjNeRcIu9Caq';
const ADMIN_USERNAME = DEFAULT_ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = DEFAULT_ADMIN_PASSWORD_HASH;
const JWT_SECRET = (process.env.JWT_SECRET || '').trim();
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '12h').trim();

if (!JWT_SECRET) {
  console.error('Missing required env: JWT_SECRET');
  process.exit(1);
}

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const presence = new Map();

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      devlog: [
        {
          id: crypto.randomUUID(),
          title: 'Aero Website Backend Live',
          content: 'Admin login, online count, devlog, and update manifests are now editable from your web panel.',
          publishedAt: new Date().toISOString(),
          tag: 'UPDATE'
        }
      ],
      manifests: {
        stable: {
          windows: {
            version: '1.0.0',
            mandatory: false,
            notesUrl: 'https://aero-client.github.io/aero/',
            files: []
          }
        }
      }
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function readStore() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function signToken() {
  return jwt.sign({ sub: ADMIN_USERNAME, role: 'owner' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function authRequired(req, res, next) {
  const token = req.cookies.aero_admin || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.sub !== ADMIN_USERNAME) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = payload;
    next();
  } catch (_err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

function cleanupPresence() {
  const now = Date.now();
  const ttlMs = PRESENCE_TTL_SECONDS * 1000;
  for (const [key, value] of presence.entries()) {
    if (now - value.lastSeenMs > ttlMs) {
      presence.delete(key);
    }
  }
}

setInterval(cleanupPresence, 10_000).unref();

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (username !== ADMIN_USERNAME) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const ok = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken();
  res.cookie('aero_admin', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 12
  });

  return res.json({ ok: true, username: ADMIN_USERNAME });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('aero_admin');
  return res.json({ ok: true });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  return res.json({ ok: true, username: req.user.sub });
});

app.post('/api/presence/heartbeat', (req, res) => {
  const body = req.body || {};
  const clientId = String(body.clientId || '').trim();
  const username = String(body.username || '').trim();
  const state = String(body.state || 'launcher').trim();

  if (!clientId) {
    return res.status(400).json({ error: 'clientId is required' });
  }

  presence.set(clientId, {
    username: username || null,
    state,
    lastSeenMs: Date.now()
  });

  cleanupPresence();
  return res.json({ ok: true, online: presence.size });
});

app.get('/api/presence/count', (_req, res) => {
  cleanupPresence();
  return res.json({ online: presence.size, ttlSeconds: PRESENCE_TTL_SECONDS });
});

app.get('/api/devlog', (req, res) => {
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const store = readStore();
  const posts = [...(store.devlog || [])]
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
    .slice(0, limit);
  return res.json({ items: posts });
});

app.post('/api/admin/devlog', authRequired, (req, res) => {
  const { title, content, tag } = req.body || {};
  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  const store = readStore();
  const post = {
    id: crypto.randomUUID(),
    title: String(title).trim(),
    content: String(content).trim(),
    tag: String(tag || 'UPDATE').trim().toUpperCase(),
    publishedAt: new Date().toISOString()
  };

  store.devlog = Array.isArray(store.devlog) ? store.devlog : [];
  store.devlog.push(post);
  writeStore(store);

  return res.json({ ok: true, item: post });
});

app.delete('/api/admin/devlog/:id', authRequired, (req, res) => {
  const id = String(req.params.id || '');
  const store = readStore();
  const before = (store.devlog || []).length;
  store.devlog = (store.devlog || []).filter((p) => p.id !== id);

  if (store.devlog.length === before) {
    return res.status(404).json({ error: 'Post not found' });
  }

  writeStore(store);
  return res.json({ ok: true });
});

app.get('/api/updates/manifest', (req, res) => {
  const platform = String(req.query.platform || 'windows').toLowerCase();
  const channel = String(req.query.channel || 'stable').toLowerCase();

  const store = readStore();
  const channelObj = (store.manifests || {})[channel] || {};
  const manifest = channelObj[platform];

  if (!manifest) {
    return res.status(404).json({ error: 'Manifest not found' });
  }

  return res.json(manifest);
});

app.put('/api/admin/updates/manifest', authRequired, (req, res) => {
  const { channel, platform, manifest } = req.body || {};
  const c = String(channel || 'stable').toLowerCase();
  const p = String(platform || 'windows').toLowerCase();

  if (!manifest || typeof manifest !== 'object') {
    return res.status(400).json({ error: 'manifest object is required' });
  }

  const store = readStore();
  store.manifests = store.manifests || {};
  store.manifests[c] = store.manifests[c] || {};
  store.manifests[c][p] = manifest;
  writeStore(store);

  return res.json({ ok: true });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  ensureDataFile();
  console.log(`Aero web control running on http://localhost:${PORT}`);
});
