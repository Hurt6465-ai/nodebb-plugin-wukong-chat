'use strict';

const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const plugin = {};

let User;
let Winston;

const DEFAULTS = {
  forumUrl: process.env.NBB_WK_FORUM_URL || 'https://bbs.886.best',
  wkHost: process.env.NBB_WK_HOST || 'http://172.17.0.1:5001',
  wkManagerToken: process.env.NBB_WK_MANAGER_TOKEN || '123456',
  wkSecretKey: process.env.NBB_WK_SECRET_KEY || '123456',
  wkWsPublicAddr: process.env.NBB_WK_WS_PUBLIC_ADDR || 'wss://bbs.886.best/wkws/',
  topicChannelType: Number(process.env.NBB_WK_TOPIC_CHANNEL_TYPE || 2),
  topicChannelPrefix: process.env.NBB_WK_TOPIC_CHANNEL_PREFIX || 'nbb_topic_',
  aiProxyEndpoint: (process.env.AI_PROXY_ENDPOINT || '').trim().replace(/\/+$/, ''),
  aiProxyApiKey: (process.env.AI_PROXY_API_KEY || '').trim(),
  aiProxyModel: (process.env.AI_PROXY_MODEL || 'gpt-4o-mini').trim(),
};

const profileCache = new Map();
const PROFILE_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

function logInfo(...args) {
  if (Winston && typeof Winston.info === 'function') Winston.info('[wukong-chat] ' + args.map(String).join(' '));
  else console.log('[wukong-chat]', ...args);
}

function logWarn(...args) {
  if (Winston && typeof Winston.warn === 'function') Winston.warn('[wukong-chat] ' + args.map(String).join(' '));
  else console.warn('[wukong-chat]', ...args);
}

function signWukongToken(uid) {
  return crypto.createHash('sha256').update(`wk:${uid}:${DEFAULTS.wkSecretKey}`).digest('hex');
}

function requestJson(method, urlString, options = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (err) {
      return reject(err);
    }

    const body = options.body === undefined ? null : (typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    const headers = Object.assign({}, options.headers || {});
    if (body && !headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json';
    if (body && !headers['Content-Length'] && !headers['content-length']) headers['Content-Length'] = Buffer.byteLength(body);

    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers,
      timeout: options.timeout || 6000,
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = text;
        if (text) {
          try { data = JSON.parse(text); } catch (_) {}
        }
        resolve({ status: res.statusCode || 0, headers: res.headers, data });
      });
    });
    req.on('timeout', () => req.destroy(new Error('request_timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function wkUrl(path) {
  return DEFAULTS.wkHost.replace(/\/+$/, '') + path;
}

async function wkPostAny(pathList, payload, timeout = 6000, acceptStatuses = []) {
  const errors = [];
  for (const path of pathList) {
    try {
      const resp = await requestJson('POST', wkUrl(path), {
        timeout,
        headers: {
          token: DEFAULTS.wkManagerToken,
          'Content-Type': 'application/json',
        },
        body: payload,
      });
      if ((resp.status >= 200 && resp.status < 300) || acceptStatuses.includes(resp.status)) {
        return resp.data || { ok: true, accepted_status: resp.status };
      }
      errors.push({ path, status: resp.status, data: resp.data });
    } catch (err) {
      errors.push({ path, error: err.message });
    }
  }
  const err = new Error('all_wukong_endpoints_failed');
  err.wkErrors = errors;
  err.payload = payload;
  throw err;
}

function toInt(value, defaultValue) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

function clampInt(value, min, max, defaultValue) {
  const n = toInt(value, defaultValue);
  return Math.max(min, Math.min(max, n));
}

function normalizeChannelType(value, defaultValue = 1) {
  const n = toInt(value, defaultValue);
  return [1, 2].includes(n) ? n : defaultValue;
}

function topicIdFromChannelId(channelId) {
  const re = new RegExp('^' + DEFAULTS.topicChannelPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$');
  const match = String(channelId || '').match(re);
  return match ? match[1] : '';
}

function normalizeTopicChannelId(channelId, tid) {
  const raw = String(channelId || '').trim();
  const safeTid = String(tid || '').trim();
  if (safeTid && !/^\d+$/.test(safeTid)) return null;
  const expected = safeTid ? `${DEFAULTS.topicChannelPrefix}${safeTid}` : '';
  if (expected && raw && raw !== expected) return null;
  if (expected) return expected;
  const re = new RegExp('^' + DEFAULTS.topicChannelPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\d+$');
  if (re.test(raw)) return raw;
  return null;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const s = String(value).trim();
    if (s) return s;
  }
  return '';
}

function pickPublicUserFields(u, uid) {
  u = u || {};
  uid = String((u.uid !== undefined && u.uid !== null) ? u.uid : uid);
  return {
    uid,
    username: firstNonEmpty(u.username, u.userslug, `user${uid}`),
    userslug: firstNonEmpty(u.userslug, u.slug, u.username),
    displayname: firstNonEmpty(u.displayname, u.fullname, u.name, u.username, `user${uid}`),
    fullname: firstNonEmpty(u.fullname),
    picture: firstNonEmpty(u.picture, u.uploadedpicture),
    icontext: firstNonEmpty(u.icontext, u['icon:text']),
    iconbgColor: firstNonEmpty(u.iconbgColor, u['icon:bgColor'], '#72a5f2'),
    status: firstNonEmpty(u.status, u.userStatus, u.presence, u.onlineStatus),
    language_flag: firstNonEmpty(u.language_flag, u.languageFlag, u.countryFlag, u.country_flag, u.flag, u.nationality, u.country, u.localeCountry),
  };
}

async function getNodeBBUserPublic(uid) {
  uid = String(uid || '').trim();
  if (!/^\d+$/.test(uid)) return null;
  const cached = profileCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const fields = [
    'uid', 'username', 'userslug', 'displayname', 'fullname',
    'picture', 'uploadedpicture', 'icon:text', 'icon:bgColor', 'status',
    'language_flag', 'countryFlag', 'country_flag', 'flag', 'country', 'nationality',
  ];
  const u = await User.getUserFields(uid, fields);
  if (!u || !u.uid) return null;
  const user = pickPublicUserFields(u, uid);
  profileCache.set(uid, { value: user, expiresAt: Date.now() + PROFILE_CACHE_TTL });
  return user;
}

async function syncWukongUser(uid, username) {
  if (!uid) return;
  try {
    await wkPostAny(['/user', '/v1/user'], { uid: String(uid), name: String(username || `user${uid}`) }, 5000, []);
  } catch (err) {
    logWarn('sync user failed:', err.message, JSON.stringify(err.wkErrors || {}));
  }
}

async function syncWukongToken(uid, token) {
  try {
    await wkPostAny(['/user/token', '/v1/user/token'], {
      uid: String(uid),
      token: String(token),
      device_flag: 1,
      device_level: 1,
    }, 5000, []);
  } catch (err) {
    logWarn('sync user token failed:', err.message, JSON.stringify(err.wkErrors || {}));
  }
}

async function ensureWukongTopicChannel(channelId, uid, tempSubscriber = 1) {
  const channelType = DEFAULTS.topicChannelType;
  try {
    await wkPostAny(['/channel', '/v1/channel'], {
      channel_id: String(channelId),
      channel_type: channelType,
      large: 1,
      ban: 0,
      subscribers: [String(uid)],
    }, 5000, [409]);
  } catch (_) {
    await wkPostAny(['/channel/info', '/v1/channel/info'], {
      channel_id: String(channelId),
      channel_type: channelType,
      large: 1,
      ban: 0,
    }, 5000, []);
  }

  const basePayload = {
    channel_id: String(channelId),
    channel_type: channelType,
    reset: 0,
    subscribers: [String(uid)],
  };
  try {
    return await wkPostAny(['/channel/subscriber_add', '/v1/channel/subscriber_add'], {
      ...basePayload,
      temp_subscriber: Number(tempSubscriber ? 1 : 0),
    }, 5000, []);
  } catch (_) {
    return wkPostAny(['/channel/subscriber_add', '/v1/channel/subscriber_add'], {
      ...basePayload,
      temp_subscriber: 0,
    }, 5000, []);
  }
}

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function errorHandler(err, req, res, next) {
  logWarn('api error:', err && err.stack ? err.stack : err);
  if (err && (err.wkErrors || err.upstream)) {
    return res.status(502).json({
      error: err.message || 'wukong_upstream_error',
      wkErrors: err.wkErrors,
      upstream: err.upstream,
      payload: err.payload,
    });
  }
  res.status(500).json({ error: err && err.message ? err.message : 'internal_server_error' });
}

function getEnsureLoggedIn(middleware) {
  if (middleware && typeof middleware.ensureLoggedIn === 'function') return middleware.ensureLoggedIn;
  return function fallbackEnsureLoggedIn(req, res, next) {
    if (!req.uid) return res.status(401).json({ error: 'not_logged_in' });
    next();
  };
}

function renderPage(req, res) {
  res.render('wukong-chat', {
    title: '悟空聊天',
    targetUid: String((req.params && req.params.uid) || req.query.uid || ''),
    channelId: String(req.query.channel_id || ''),
    channelType: String(req.query.channel_type || (req.params && req.params.uid ? '1' : '')),
    tid: String(req.query.tid || ''),
  });
}

plugin.init = async function init(params) {
  User = require.main.require('./src/user');
  try { Winston = require.main.require('./src/winston'); } catch (_) { Winston = console; }

  const router = params.router;
  const middleware = params.middleware || {};
  const ensureLoggedIn = getEnsureLoggedIn(middleware);

  logInfo('init start. wkHost=' + DEFAULTS.wkHost + ' wkws=' + DEFAULTS.wkWsPublicAddr);

  router.get('/wukong', ensureLoggedIn, asyncHandler(async (req, res) => renderPage(req, res)));
  router.get('/wukong/:uid', ensureLoggedIn, asyncHandler(async (req, res) => renderPage(req, res)));

  // Some NodeBB setups sit behind proxies or unusual routers. This alias helps test if the route loaded.
  router.get('/api/wukong/page-check', ensureLoggedIn, asyncHandler(async (req, res) => {
    res.json({ ok: true, pageRoutes: ['/wukong', '/wukong/:uid'], uid: String(req.uid || '') });
  }));

  router.get('/api/wukong/healthz', asyncHandler(async (req, res) => {
    res.json({ ok: true, wk: DEFAULTS.wkHost, wkws: DEFAULTS.wkWsPublicAddr, topic_channel_type: DEFAULTS.topicChannelType, prefix: DEFAULTS.topicChannelPrefix, time: new Date().toISOString() });
  }));

  router.get('/api/wukong/config', ensureLoggedIn, asyncHandler(async (req, res) => {
    res.json({
      ok: true,
      wsAddr: DEFAULTS.wkWsPublicAddr,
      topicChannelType: DEFAULTS.topicChannelType,
      topicChannelPrefix: DEFAULTS.topicChannelPrefix,
      sdk: 'https://cdn.jsdelivr.net/npm/wukongimjssdk@latest/lib/wukongimjssdk.umd.js',
    });
  }));

  router.get('/api/wukong/me', ensureLoggedIn, asyncHandler(async (req, res) => {
    const u = await getNodeBBUserPublic(req.uid);
    res.json({ ok: true, user: u, uid: String(req.uid), wkUid: String(req.uid) });
  }));

  router.get('/api/wukong/token', ensureLoggedIn, asyncHandler(async (req, res) => {
    const u = await getNodeBBUserPublic(req.uid);
    if (!u) return res.status(401).json({ error: 'invalid_me' });
    const uid = String(req.uid);
    const token = signWukongToken(uid);
    await syncWukongUser(uid, u.username || u.displayname || `user${uid}`);
    await syncWukongToken(uid, token);
    res.json({ ok: true, uid, wkUid: uid, token, username: u.username, addr: DEFAULTS.wkWsPublicAddr, wsAddr: DEFAULTS.wkWsPublicAddr, wkws: DEFAULTS.wkWsPublicAddr, user: u });
  }));

  router.get('/api/wukong/user/:uid', ensureLoggedIn, asyncHandler(async (req, res) => {
    const uid = String(req.params.uid || '').trim();
    if (!/^\d+$/.test(uid)) return res.status(400).json({ error: 'invalid_uid' });
    const u = await getNodeBBUserPublic(uid);
    if (!u) return res.status(404).json({ error: 'user_not_found' });
    await syncWukongUser(uid, u.username || u.displayname || `user${uid}`);
    res.json(u);
  }));

  router.get('/api/wukong/users', ensureLoggedIn, asyncHandler(async (req, res) => {
    const raw = String(req.query.uids || req.query.uid || '').trim();
    const uids = raw.split(',').map(x => String(x || '').trim()).filter(x => /^\d+$/.test(x)).filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 80);
    const users = [];
    for (const uid of uids) {
      const u = await getNodeBBUserPublic(uid);
      if (u) users.push(u);
    }
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.json({ users, cacheTtlMs: PROFILE_CACHE_TTL });
  }));

  router.get('/api/wukong/history', ensureLoggedIn, asyncHandler(async (req, res) => {
    const login_uid = String(req.uid);
    const channel_id = String(req.query.channel_id || '').trim();
    const limit = clampInt(req.query.limit, 1, 200, 50);
    const start_message_seq = clampInt(req.query.start_message_seq, 0, 999999999, 0);
    const pull_mode_req = clampInt(req.query.pull_mode, 0, 1, start_message_seq ? 0 : 1);
    if (!channel_id) return res.status(400).json({ error: 'missing_params', field: 'channel_id' });
    const defaultType = channel_id.startsWith(DEFAULTS.topicChannelPrefix) ? DEFAULTS.topicChannelType : 1;
    const channel_type = normalizeChannelType(req.query.channel_type, defaultType);
    const payload = { login_uid, channel_id, channel_type, start_message_seq, end_message_seq: 0, limit, pull_mode: pull_mode_req };
    let data = await wkPostAny(['/channel/messagesync', '/v1/channel/messagesync'], payload, 6000, []);
    const list = Array.isArray(data) ? data : (Array.isArray(data && data.messages) ? data.messages : (Array.isArray(data && data.data) ? data.data : (data && data.data && Array.isArray(data.data.messages) ? data.data.messages : [])));
    if (start_message_seq && (!list || !list.length)) {
      const altPayload = { ...payload, pull_mode: pull_mode_req ? 0 : 1 };
      data = await wkPostAny(['/channel/messagesync', '/v1/channel/messagesync'], altPayload, 6000, []);
      if (data && typeof data === 'object' && !Array.isArray(data)) data._alt_pull_mode = altPayload.pull_mode;
    }
    res.json(data);
  }));

  router.post('/api/wukong/topic-channel/ensure', ensureLoggedIn, asyncHandler(async (req, res) => {
    const uid = String(req.uid);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const tidFromBody = String(body.tid || req.query.tid || '').trim();
    const channelIdFromBody = String(body.channel_id || req.query.channel_id || '').trim();
    const tid = tidFromBody || topicIdFromChannelId(channelIdFromBody);
    const cid = String(body.cid || req.query.cid || '').trim();
    const channel_id = normalizeTopicChannelId(channelIdFromBody, tid);
    const temp_subscriber = body.temp_subscriber == null ? 1 : toInt(body.temp_subscriber, 1);
    if (!channel_id) return res.status(400).json({ error: 'invalid_topic_channel', expect: `${DEFAULTS.topicChannelPrefix}{tid}`, received: { tid: tidFromBody, channel_id: channelIdFromBody } });
    await ensureWukongTopicChannel(channel_id, uid, temp_subscriber);
    res.json({ ok: true, uid, tid, cid, channel_id, channel_type: DEFAULTS.topicChannelType, temp_subscriber: Number(temp_subscriber ? 1 : 0) });
  }));

  router.get('/api/wukong/conversation/sync', ensureLoggedIn, asyncHandler(async (req, res) => {
    const payload = { uid: String(req.uid), version: clampInt(req.query.version, 0, 999999999, 0), msg_count: clampInt(req.query.msg_count, 1, 100, 20) };
    const data = await wkPostAny(['/conversation/sync', '/v1/conversation/sync'], payload, 6000, []);
    res.json(data);
  }));

  router.get('/api/wukong/translate/google', ensureLoggedIn, asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    let sl = String(req.query.sl || 'auto').trim() || 'auto';
    let tl = String(req.query.tl || 'en').trim() || 'en';
    if (!q) return res.status(400).json({ error: 'missing_q' });
    if (q.length > 5000) return res.status(400).json({ error: 'text_too_long', max: 5000 });
    if (sl !== 'auto' && sl.includes('-')) sl = sl.split('-')[0];
    if (tl.includes('-')) tl = tl.split('-')[0];
    const u = new URL('https://translate.googleapis.com/translate_a/single');
    u.searchParams.set('client', 'gtx');
    u.searchParams.set('sl', sl);
    u.searchParams.set('tl', tl);
    u.searchParams.set('dt', 't');
    u.searchParams.set('q', q);
    const r = await requestJson('GET', u.toString(), { timeout: 8000 });
    if (r.status < 200 || r.status >= 300) return res.status(502).json({ error: 'google_translate_failed', status: r.status, detail: r.data });
    const parts = Array.isArray(r.data && r.data[0]) ? r.data[0] : [];
    const translation = parts.map(item => item && item[0] ? item[0] : '').join('').trim();
    res.json({ ok: true, translation });
  }));

  router.post('/api/wukong/ai/chat', ensureLoggedIn, asyncHandler(async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const endpoint = String(body.endpoint || DEFAULTS.aiProxyEndpoint || '').trim().replace(/\/+$/, '');
    const apiKey = String(body.apiKey || DEFAULTS.aiProxyApiKey || '').trim();
    const model = String(body.model || DEFAULTS.aiProxyModel || 'gpt-4o-mini').trim();
    const temperature = Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.2;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!endpoint) return res.status(400).json({ error: 'missing_endpoint' });
    if (!apiKey) return res.status(400).json({ error: 'missing_api_key' });
    if (!messages.length) return res.status(400).json({ error: 'missing_messages' });
    if (!/^https?:\/\//i.test(endpoint)) return res.status(400).json({ error: 'invalid_endpoint' });
    const url = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint}/chat/completions`;
    const r = await requestJson('POST', url, {
      timeout: 20000,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: { model, temperature, messages, stream: false },
    });
    if (r.status < 200 || r.status >= 300) return res.status(502).json({ error: 'ai_upstream_failed', status: r.status, detail: r.data });
    res.json(r.data);
  }));

  router.use('/api/wukong', errorHandler);
  logInfo('routes registered: /wukong, /wukong/:uid, /api/wukong/healthz');
};

plugin.addNavigation = async function addNavigation(header) {
  header.navigation = header.navigation || [];
  if (!header.navigation.some(item => item && item.route === '/wukong')) {
    header.navigation.push({
      route: '/wukong',
      title: '悟空聊天',
      iconClass: 'fa-comments',
      textClass: 'visible-xs-inline',
      text: '悟空聊天',
    });
  }
  return header;
};

module.exports = plugin;
