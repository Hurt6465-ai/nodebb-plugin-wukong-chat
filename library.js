/* eslint-disable no-console */
'use strict';

/**
 * NodeBB Wukong Chat plugin backend.
 *
 * This file is adapted from the old standalone Express bridge, but it is a
 * NodeBB plugin library.js:
 * - no express app.listen()
 * - no axios dependency
 * - uses NodeBB req.uid + src/user directly
 * - registers routes under /api/wukong/*
 * - provisions WuKongIM users through the official /user/token API.
 * - never calls the invalid /user endpoint that returned 404 in this deployment.
 * - also listens to NodeBB action:user.create and pre-provisions the user.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let multer = null;
try {
  multer = require('multer');
} catch (err) {
  // Upload route will return a clear error when multer is missing.
}

const user = require.main.require('./src/user');

const plugin = {};

const PLUGIN_ROOT = __dirname;
const ACTIVITY_FILE = path.join(PLUGIN_ROOT, 'topic-chat-activity.json');
const NOTIFY_FILE = path.join(PLUGIN_ROOT, 'topic-chat-notify.json');

const DEFAULT_FORUM_URL = 'https://bbs.886.best';
const DEFAULT_WK_HOST = 'http://172.17.0.1:5001';
const DEFAULT_WK_MANAGER_TOKEN = '123456';
const DEFAULT_WK_SECRET_KEY = '123456';
const DEFAULT_WK_WS_PUBLIC_ADDR = 'wss://bbs.886.best/wkws/';

const FORUM_URL = String(process.env.WK_FORUM_URL || process.env.FORUM_URL || DEFAULT_FORUM_URL).replace(/\/+$/, '');
const WK_HOST = String(process.env.WK_HOST || DEFAULT_WK_HOST).replace(/\/+$/, '');
const WK_MANAGER_TOKEN = String(process.env.WK_MANAGER_TOKEN || DEFAULT_WK_MANAGER_TOKEN);
const WK_SECRET_KEY = String(process.env.WK_SECRET_KEY || DEFAULT_WK_SECRET_KEY);
const WK_WS_PUBLIC_ADDR = String(process.env.WK_WS_PUBLIC_ADDR || DEFAULT_WK_WS_PUBLIC_ADDR).trim();

const AI_PROXY_ENDPOINT = String(process.env.AI_PROXY_ENDPOINT || '').trim().replace(/\/+$/, '');
const AI_PROXY_API_KEY = String(process.env.AI_PROXY_API_KEY || '').trim();
const AI_PROXY_MODEL = String(process.env.AI_PROXY_MODEL || 'gpt-4o-mini').trim();

const TOPIC_CHANNEL_TYPE = 2;
const TOPIC_CHANNEL_PREFIX = 'nbb_topic_';
const USER_PROFILE_CACHE_TTL_MS = Number(process.env.USER_PROFILE_CACHE_TTL_MS || 30 * 24 * 60 * 60 * 1000);
const PRESENCE_TTL_MS = 45000;

// WuKongIM official user registration/login endpoint is POST /user/token.
// Keep this enabled by default so NodeBB users are provisioned when they register
// and again when they first open /wukong. It is safe to call repeatedly: existing
// users are updated by WuKongIM. Set WK_SYNC_USER=false only for emergency disable.
const SYNC_WUKONG_USER = !/^(0|false|no)$/i.test(String(process.env.WK_SYNC_USER || 'true'));
const WK_DEVICE_FLAG = Number(process.env.WK_DEVICE_FLAG || 1); // 1 = web
const WK_DEVICE_LEVEL = Number(process.env.WK_DEVICE_LEVEL || 1); // 1 = main device

const userProfileCache = new Map();
const topicPresence = new Map();

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
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

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const s = String(value).trim();
    if (s) return s;
  }
  return '';
}

function signWukongToken(uid) {
  return crypto
    .createHash('sha256')
    .update(`wk:${uid}:${WK_SECRET_KEY}`)
    .digest('hex');
}

function topicIdFromChannelId(channelId) {
  const match = String(channelId || '').match(/^nbb_topic_(\d+)$/);
  return match ? match[1] : '';
}

function normalizeTopicChannelId(channelId, tid) {
  const raw = String(channelId || '').trim();
  const safeTid = String(tid || '').trim();

  if (safeTid && !/^\d+$/.test(safeTid)) return null;

  const expected = safeTid ? `${TOPIC_CHANNEL_PREFIX}${safeTid}` : '';
  if (expected && raw && raw !== expected) return null;
  if (expected) return expected;

  if (new RegExp(`^${TOPIC_CHANNEL_PREFIX}\\d+$`).test(raw)) return raw;
  return null;
}

function readJsonFile(file, fallback) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data == null ? fallback : data;
  } catch (err) {
    return fallback;
  }
}

function writeJsonFile(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('[wukong-chat] write json failed:', file, err.message);
  }
}

function readActivity() {
  const data = readJsonFile(ACTIVITY_FILE, {});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function writeActivity(data) {
  writeJsonFile(ACTIVITY_FILE, data || {});
}

function readNotify() {
  const data = readJsonFile(NOTIFY_FILE, []);
  return Array.isArray(data) ? data : [];
}

function writeNotify(list) {
  writeJsonFile(NOTIFY_FILE, (list || []).slice(-5000));
}

async function fetchJson(url, options = {}, timeoutMs = 8000) {
  if (typeof fetch !== 'function') {
    throw new Error('global_fetch_not_available');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const text = await resp.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (err) {
      data = text;
    }

    return {
      status: resp.status,
      ok: resp.ok,
      data,
      text,
      headers: resp.headers,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function wkPostAny(pathList, payload, timeout = 5000, acceptStatuses = []) {
  const errors = [];

  for (const apiPath of pathList) {
    const url = WK_HOST + apiPath;

    try {
      const resp = await fetchJson(
        url,
        {
          method: 'POST',
          headers: {
            token: WK_MANAGER_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload || {}),
        },
        timeout
      );

      if ((resp.status >= 200 && resp.status < 300) || acceptStatuses.includes(resp.status)) {
        return resp.data || { status: 'ok', accepted_status: resp.status };
      }

      errors.push({ path: apiPath, status: resp.status, data: resp.data });
    } catch (err) {
      errors.push({ path: apiPath, error: err.message });
    }
  }

  const err = new Error('all_wukong_endpoints_failed');
  err.wkErrors = errors;
  err.payload = payload;
  throw err;
}

function getReqUid(req) {
  const uid = req && (req.uid || (req.user && req.user.uid));
  return uid ? String(uid) : '';
}

async function getNodeBBUserByUid(uid) {
  uid = String(uid || '').trim();
  if (!/^\d+$/.test(uid)) return null;

  const fields = await user.getUserFields(uid, [
    'uid',
    'username',
    'userslug',
    'displayname',
    'fullname',
    'picture',
    'uploadedpicture',
    'icon:text',
    'icon:bgColor',
    'status',
    'language',
    'language_flag',
  ]);

  if (!fields || !fields.uid) return null;

  return {
    uid: String(fields.uid),
    username: firstNonEmpty(fields.username, fields.userslug, `user${uid}`),
    userslug: firstNonEmpty(fields.userslug, fields.username),
    displayname: firstNonEmpty(fields.displayname, fields.fullname, fields.username, `user${uid}`),
    fullname: firstNonEmpty(fields.fullname),
    picture: firstNonEmpty(fields.picture, fields.uploadedpicture),
    icontext: firstNonEmpty(fields['icon:text'], fields.icontext, fields.username ? String(fields.username).charAt(0).toUpperCase() : ''),
    iconbgColor: firstNonEmpty(fields['icon:bgColor'], fields.iconbgColor, '#72a5f2'),
    status: firstNonEmpty(fields.status),
    language: firstNonEmpty(fields.language),
    language_flag: firstNonEmpty(fields.language_flag),
  };
}

async function getCurrentUser(req) {
  const uid = getReqUid(req);
  if (!uid) return null;

  const u = await getNodeBBUserByUid(uid);
  if (!u) return { uid, username: `user${uid}` };
  return u;
}

function clearExpiredUserProfileCache() {
  const now = Date.now();
  for (const [uid, item] of userProfileCache.entries()) {
    if (!item || Number(item.expiresAt || 0) <= now) userProfileCache.delete(uid);
  }
}

async function fetchNodeBBUserPublic(uid) {
  uid = String(uid || '').trim();
  if (!/^\d+$/.test(uid)) return null;

  clearExpiredUserProfileCache();
  const cached = userProfileCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const u = await getNodeBBUserByUid(uid);
  if (!u) return null;

  userProfileCache.set(uid, {
    value: u,
    expiresAt: Date.now() + USER_PROFILE_CACHE_TTL_MS,
  });

  return u;
}

async function provisionWukongUser(uid, username, token, source = 'unknown') {
  uid = String(uid || '').trim();
  username = String(username || uid || '').trim();
  token = String(token || signWukongToken(uid));

  if (!uid) return { ok: false, skipped: true, reason: 'missing_uid', source };

  if (!SYNC_WUKONG_USER) {
    return { ok: true, skipped: true, reason: 'WK_SYNC_USER_disabled', uid, source };
  }

  const payload = {
    uid,
    token,
    device_flag: WK_DEVICE_FLAG,
    device_level: WK_DEVICE_LEVEL,
  };

  try {
    // Official WuKongIM user registration/login API.
    // It registers the user if absent and updates token if present.
    const data = await wkPostAny(['/user/token', '/v1/user/token'], payload, 5000, [409]);
    return { ok: true, uid, username, source, payload, data };
  } catch (err) {
    console.warn('[wukong-chat] provision user token failed:', uid, err.message, err.wkErrors || err.upstream || '');
    return { ok: false, uid, username, source, payload, error: err.message, wkErrors: err.wkErrors || err.upstream };
  }
}

async function maybeSyncWukongUser(uid, username, token) {
  return provisionWukongUser(uid, username, token, 'token-route');
}

async function ensureWukongTopicChannel(channelId, uid, tempSubscriber = 1) {
  const channelType = TOPIC_CHANNEL_TYPE;

  try {
    await wkPostAny(
      ['/channel', '/v1/channel'],
      {
        channel_id: String(channelId),
        channel_type: channelType,
        large: 1,
        ban: 0,
        subscribers: [String(uid)],
      },
      5000,
      [409]
    );
  } catch (createErr) {
    await wkPostAny(
      ['/channel/info', '/v1/channel/info'],
      {
        channel_id: String(channelId),
        channel_type: channelType,
        large: 1,
        ban: 0,
      },
      5000,
      []
    );
  }

  const basePayload = {
    channel_id: String(channelId),
    channel_type: channelType,
    reset: 0,
    subscribers: [String(uid)],
  };

  try {
    return await wkPostAny(
      ['/channel/subscriber_add', '/v1/channel/subscriber_add'],
      { ...basePayload, temp_subscriber: Number(tempSubscriber ? 1 : 0) },
      5000,
      []
    );
  } catch (tempErr) {
    return wkPostAny(
      ['/channel/subscriber_add', '/v1/channel/subscriber_add'],
      { ...basePayload, temp_subscriber: 0 },
      5000,
      []
    );
  }
}

function cleanupPresence() {
  const now = Date.now();
  for (const [tid, users] of topicPresence.entries()) {
    for (const [uid, info] of users.entries()) {
      if (!info || now - Number(info.ts || 0) > PRESENCE_TTL_MS) users.delete(uid);
    }
    if (!users.size) topicPresence.delete(tid);
  }
}

function registerPageRoutes(router, middleware) {
  async function renderWukongPage(req, res) {
    const targetUid = req.params && req.params.uid ? String(req.params.uid) : String(req.query.uid || '');
    const tid = String(req.query.tid || '');
    const channelId = tid ? `${TOPIC_CHANNEL_PREFIX}${tid}` : targetUid;
    const channelType = tid ? TOPIC_CHANNEL_TYPE : 1;

    res.render('wukong-chat', {
      title: '悟空聊天',
      targetUid,
      tid,
      channelId,
      channelType,
    });
  }

  router.get('/wukong', middleware.ensureLoggedIn, asyncHandler(renderWukongPage));
  router.get('/wukong/:uid', middleware.ensureLoggedIn, asyncHandler(renderWukongPage));
}

function registerApiRoutes(router, middleware) {
  const api = '/api/wukong';
  const ensureLogin = middleware.ensureLoggedIn;

  router.get(`${api}/healthz`, (req, res) => {
    res.json({
      ok: true,
      wk: WK_HOST,
      wkws: WK_WS_PUBLIC_ADDR,
      topic_channel_type: TOPIC_CHANNEL_TYPE,
      prefix: TOPIC_CHANNEL_PREFIX,
      sync_user: SYNC_WUKONG_USER,
      time: new Date().toISOString(),
    });
  });

  router.get(`${api}/page-check`, ensureLogin, asyncHandler(async (req, res) => {
    const current = await getCurrentUser(req);
    res.json({
      ok: true,
      uid: current && current.uid,
      pageRoutes: ['/wukong', '/wukong/:uid'],
      apiBase: api,
    });
  }));

  router.get(`${api}/me`, ensureLogin, asyncHandler(async (req, res) => {
    const current = await getCurrentUser(req);
    if (!current) return res.status(401).json({ error: 'unauthorized' });

    res.json({
      ...current,
      wkUid: String(current.uid),
    });
  }));

  router.get(`${api}/token`, ensureLogin, asyncHandler(async (req, res) => {
    const current = await getCurrentUser(req);
    if (!current) return res.status(401).json({ error: 'unauthorized' });

    const uid = String(current.uid);
    const token = signWukongToken(uid);
    const sync = await maybeSyncWukongUser(uid, current.username, token);

    res.json({
      ok: true,
      uid,
      wkUid: uid,
      token,
      username: current.username,
      addr: WK_WS_PUBLIC_ADDR,
      wsAddr: WK_WS_PUBLIC_ADDR,
      wkws: WK_WS_PUBLIC_ADDR,
      user: current,
      sync,
    });
  }));

  router.get(`${api}/user/:uid`, ensureLogin, asyncHandler(async (req, res) => {
    const uid = String(req.params.uid || '').trim();
    if (!/^\d+$/.test(uid)) return res.status(400).json({ error: 'invalid_uid' });

    const u = await fetchNodeBBUserPublic(uid);
    if (!u) return res.status(404).json({ error: 'user_not_found' });

    res.json(u);
  }));

  router.get(`${api}/users`, ensureLogin, asyncHandler(async (req, res) => {
    const raw = String(req.query.uids || req.query.uid || '').trim();
    const uids = raw
      .split(',')
      .map(x => String(x || '').trim())
      .filter(x => /^\d+$/.test(x))
      .filter((x, i, arr) => arr.indexOf(x) === i)
      .slice(0, 80);

    const users = [];
    for (const uid of uids) {
      const u = await fetchNodeBBUserPublic(uid);
      if (u) users.push(u);
    }

    res.setHeader('Cache-Control', 'private, max-age=60');
    res.json({ users, cacheTtlMs: USER_PROFILE_CACHE_TTL_MS });
  }));

  async function historyHandler(req, res) {
    const current = await getCurrentUser(req);
    if (!current) return res.status(401).json({ error: 'unauthorized' });

    const login_uid = String(current.uid);
    const channel_id = String(req.query.channel_id || req.query.channelId || '').trim();
    const limit = clampInt(req.query.limit, 1, 200, 50);
    const start_message_seq = clampInt(req.query.start_message_seq || req.query.startMessageSeq, 0, 999999999, 0);
    const pull_mode_req = clampInt(req.query.pull_mode, 0, 1, start_message_seq ? 0 : 1);

    if (!channel_id) return res.status(400).json({ error: 'missing_params', field: 'channel_id' });

    const defaultType = channel_id.startsWith(TOPIC_CHANNEL_PREFIX) ? TOPIC_CHANNEL_TYPE : 1;
    const channel_type = normalizeChannelType(req.query.channel_type || req.query.channelType, defaultType);

    const payload = {
      login_uid,
      channel_id,
      channel_type,
      start_message_seq,
      end_message_seq: 0,
      limit,
      pull_mode: pull_mode_req,
    };

    let data = await wkPostAny(['/channel/messagesync', '/v1/channel/messagesync'], payload, 5000, []);
    const list = Array.isArray(data) ? data : (
      Array.isArray(data && data.messages) ? data.messages :
        (Array.isArray(data && data.data) ? data.data :
          (data && data.data && Array.isArray(data.data.messages) ? data.data.messages : []))
    );

    if (start_message_seq && (!list || !list.length)) {
      const altPayload = { ...payload, pull_mode: pull_mode_req ? 0 : 1 };
      data = await wkPostAny(['/channel/messagesync', '/v1/channel/messagesync'], altPayload, 5000, []);
      if (data && typeof data === 'object' && !Array.isArray(data)) data._alt_pull_mode = altPayload.pull_mode;
    }

    res.json(data);
  }

  router.get(`${api}/history`, ensureLogin, asyncHandler(historyHandler));
  router.get(`${api}/get-history`, ensureLogin, asyncHandler(historyHandler));

  router.post(`${api}/conversation/sync`, ensureLogin, asyncHandler(async (req, res) => {
    const current = await getCurrentUser(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const payload = {
      uid: String(current.uid),
      version: clampInt(body.version, 0, 999999999, 0),
      msg_count: clampInt(body.msg_count || body.msgCount, 1, 100, 1),
    };

    const data = await wkPostAny(['/conversation/sync', '/v1/conversation/sync'], payload, 5000, []);
    res.json(data);
  }));

  router.post(`${api}/topic-channel/ensure`, ensureLogin, asyncHandler(async (req, res) => {
    const current = await getCurrentUser(req);
    const uid = String(current.uid);
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const tidFromBody = String(body.tid || req.query.tid || '').trim();
    const channelIdFromBody = String(body.channel_id || body.channelId || req.query.channel_id || '').trim();
    const tid = tidFromBody || topicIdFromChannelId(channelIdFromBody);
    const cid = String(body.cid || req.query.cid || '').trim();
    const channel_id = normalizeTopicChannelId(channelIdFromBody, tid);
    const requested_channel_type = toInt(body.channel_type || body.channelType || req.query.channel_type, TOPIC_CHANNEL_TYPE);
    const temp_subscriber = body.temp_subscriber == null ? 1 : toInt(body.temp_subscriber, 1);

    if (!channel_id) {
      return res.status(400).json({
        error: 'invalid_topic_channel',
        expect: 'nbb_topic_{tid}',
        received: { tid: tidFromBody, channel_id: channelIdFromBody, body },
      });
    }

    await ensureWukongTopicChannel(channel_id, uid, temp_subscriber);

    res.json({
      ok: true,
      uid,
      tid,
      cid,
      channel_id,
      channel_type: TOPIC_CHANNEL_TYPE,
      requested_channel_type,
      temp_subscriber: Number(temp_subscriber ? 1 : 0),
      note: requested_channel_type !== TOPIC_CHANNEL_TYPE ? 'topic chat is forced to channel_type=2 for compatibility' : undefined,
    });
  }));

  router.get(`${api}/topic-history`, ensureLogin, asyncHandler(async (req, res) => {
    const tidFromQuery = String(req.query.tid || '').trim();
    const channelIdFromQuery = String(req.query.channel_id || req.query.channelId || '').trim();
    const tid = tidFromQuery || topicIdFromChannelId(channelIdFromQuery);
    const channel_id = normalizeTopicChannelId(channelIdFromQuery, tid);

    if (!channel_id) {
      return res.status(400).json({
        error: 'invalid_topic_channel',
        expect: 'nbb_topic_{tid}',
        received: { tid: tidFromQuery, channel_id: channelIdFromQuery },
      });
    }

    req.query.channel_id = channel_id;
    req.query.channel_type = String(TOPIC_CHANNEL_TYPE);
    return historyHandler(req, res);
  }));

  router.post(`${api}/upload`, ensureLogin, (req, res, next) => {
    if (!multer) {
      return res.status(500).json({ error: 'missing_upload_deps', install: 'npm i multer' });
    }

    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 80 * 1024 * 1024, files: 10 },
    }).array('files[]', 10);

    upload(req, res, next);
  }, asyncHandler(async (req, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ error: 'missing_file' });

    if (typeof FormData === 'undefined' || typeof Blob === 'undefined') {
      return res.status(500).json({ error: 'missing_formdata_blob_runtime' });
    }

    const form = new FormData();
    for (const f of files) {
      form.append(
        'files[]',
        new Blob([f.buffer], { type: f.mimetype || 'application/octet-stream' }),
        f.originalname || `file_${Date.now()}`
      );
    }

    const csrf = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'] || '';

    const resp = await fetch(FORUM_URL + '/api/post/upload', {
      method: 'POST',
      headers: {
        Cookie: req.headers.cookie || '',
        Accept: 'application/json',
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      body: form,
    });

    const text = await resp.text();
    let data = text;
    try { data = text ? JSON.parse(text) : null; } catch (err) {}

    res.status(resp.status).send(data);
  }));

  router.post(`${api}/topic-activity/touch`, ensureLogin, asyncHandler(async (req, res) => {
    const current = await getCurrentUser(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const tid = String(body.tid || '').trim();
    const cid = String(body.cid || '').trim();

    if (!/^\d+$/.test(tid)) return res.status(400).json({ error: 'invalid_tid' });

    const data = readActivity();
    data[tid] = {
      tid,
      cid,
      title: String(body.title || ''),
      channel_id: String(body.channel_id || `nbb_topic_${tid}`),
      last_chat_at: Date.now(),
      last_chat_uid: String(current.uid),
      last_chat_username: String(current.username || ''),
      last_chat_text: String(body.text || '').slice(0, 200),
      chat_count: Number((data[tid] && data[tid].chat_count) || 0) + 1,
    };

    writeActivity(data);
    res.json({ ok: true, activity: data[tid] });
  }));

  router.get(`${api}/topic-activity`, ensureLogin, asyncHandler(async (req, res) => {
    const cid = String(req.query.cid || '').trim();
    const data = readActivity();
    const list = Object.values(data)
      .filter(x => !cid || String(x.cid) === cid)
      .sort((a, b) => Number(b.last_chat_at || 0) - Number(a.last_chat_at || 0));

    res.json({ ok: true, list });
  }));

  router.post(`${api}/topic-notify`, ensureLogin, asyncHandler(async (req, res) => {
    const current = await getCurrentUser(req);
    const fromUid = String(current.uid);
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const tid = String(body.tid || '').trim();
    const cid = String(body.cid || '').trim();
    const channelId = String(body.channel_id || body.channelId || '').trim();
    const text = String(body.text || '').slice(0, 500);
    const quoteUid = String(body.quote_uid || body.quoteUid || '').trim();
    const quoteMsgId = String(body.quote_msg_id || body.quoteMsgId || '').trim();
    const quoteText = String(body.quote_text || body.quoteText || '').slice(0, 300);
    const quoteUser = String(body.quote_user || body.quoteUser || '').slice(0, 120);
    const quoteType = String(body.quote_type || body.quoteType || '').slice(0, 30);
    const quoteMediaUrl = String(body.quote_media_url || body.quoteMediaUrl || '').slice(0, 500);
    const quoteAudioUrl = String(body.quote_audio_url || body.quoteAudioUrl || '').slice(0, 500);
    const messageId = String(body.message_id || body.msg_id || body.client_msg_no || body.clientMsgNo || '').trim();
    const messageSeq = Number(body.message_seq || body.messageSeq || 0) || 0;
    const messageText = String(body.message_text || body.messageText || body.text || '').slice(0, 500);
    const mentionUids = Array.isArray(body.mention_uids || body.mentionUids)
      ? (body.mention_uids || body.mentionUids).map(x => String(x).trim()).filter(Boolean)
      : [];

    const targets = new Set();
    mentionUids.forEach(uid => { if (uid && uid !== fromUid) targets.add(uid); });
    if (quoteUid && quoteUid !== fromUid) targets.add(quoteUid);

    const now = Date.now();
    const list = readNotify();
    const fromName = String(current.username || `用户${fromUid}`);

    for (const toUid of targets) {
      const type = quoteUid && String(toUid) === quoteUid ? 'reply' : 'mention';
      list.push({
        id: crypto.randomBytes(8).toString('hex'),
        version: now + list.length,
        tid,
        cid,
        channel_id: channelId,
        to_uid: String(toUid),
        from_uid: fromUid,
        from_name: fromName,
        type,
        text: type === 'reply' ? `${fromName} 回复了你` : `${fromName} @了你`,
        message_id: messageId,
        client_msg_no: messageId,
        message_seq: messageSeq,
        message_text: messageText || text,
        quote_uid: quoteUid,
        quote_msg_id: quoteMsgId,
        quote_text: quoteText,
        quote_user: quoteUser,
        quote_type: quoteType,
        quote_media_url: quoteMediaUrl,
        quote_audio_url: quoteAudioUrl,
        done: false,
        ts: now,
      });
    }

    writeNotify(list);
    res.json({ ok: true, count: targets.size });
  }));

  router.get(`${api}/topic-notify/list`, ensureLogin, asyncHandler(async (req, res) => {
    const current = await getCurrentUser(req);
    const uid = String(current.uid);
    const tid = String(req.query.tid || '').trim();
    const after = Number(req.query.after || 0);

    const list = readNotify()
      .filter(n => String(n.to_uid) === uid && !n.done && (!tid || String(n.tid) === tid) && Number(n.version || 0) > after)
      .sort((a, b) => Number(a.version || 0) - Number(b.version || 0))
      .slice(0, 50);

    const version = list.reduce((m, n) => Math.max(m, Number(n.version || 0)), after || 0);
    res.json({ ok: true, version, list });
  }));

  router.post(`${api}/topic-notify/done`, ensureLogin, asyncHandler(async (req, res) => {
    const current = await getCurrentUser(req);
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(String) : [];

    if (!ids.length) return res.json({ ok: true, count: 0 });

    const set = new Set(ids);
    const list = readNotify();
    let count = 0;

    for (const n of list) {
      if (String(n.to_uid) === String(current.uid) && set.has(String(n.id))) {
        n.done = true;
        count++;
      }
    }

    writeNotify(list);
    res.json({ ok: true, count });
  }));

  router.post(`${api}/topic-presence/ping`, ensureLogin, asyncHandler(async (req, res) => {
    const current = await getCurrentUser(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const tid = String(body.tid || '').trim();
    const cid = String(body.cid || '').trim();
    const channelId = String(body.channel_id || body.channelId || `nbb_topic_${tid}`).trim();

    if (!/^\d+$/.test(tid)) return res.status(400).json({ error: 'invalid_tid' });

    cleanupPresence();

    if (!topicPresence.has(tid)) topicPresence.set(tid, new Map());
    topicPresence.get(tid).set(String(current.uid), {
      uid: String(current.uid),
      username: String(current.username || ''),
      cid,
      channel_id: channelId,
      ts: Date.now(),
    });

    res.json({ ok: true, tid, count: topicPresence.get(tid).size, ttl_ms: PRESENCE_TTL_MS });
  }));

  router.get(`${api}/topic-presence`, ensureLogin, asyncHandler(async (req, res) => {
    const tid = String(req.query.tid || '').trim();
    if (!/^\d+$/.test(tid)) return res.status(400).json({ error: 'invalid_tid' });

    cleanupPresence();

    const users = topicPresence.get(tid) || new Map();
    res.json({
      ok: true,
      tid,
      count: users.size,
      users: Array.from(users.values()).map(u => ({ uid: u.uid, username: u.username })),
    });
  }));

  router.get(`${api}/translate/google`, ensureLogin, asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    let sl = String(req.query.sl || 'auto').trim() || 'auto';
    let tl = String(req.query.tl || 'en').trim() || 'en';

    if (!q) return res.status(400).json({ error: 'missing_q' });
    if (q.length > 5000) return res.status(400).json({ error: 'text_too_long', max: 5000 });
    if (sl !== 'auto' && sl.includes('-')) sl = sl.split('-')[0];
    if (tl.includes('-')) tl = tl.split('-')[0];

    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', sl);
    url.searchParams.set('tl', tl);
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', q);

    const r = await fetchJson(url.toString(), { method: 'GET' }, 8000);

    if (r.status < 200 || r.status >= 300) {
      return res.status(502).json({ error: 'google_translate_failed', status: r.status, detail: r.data });
    }

    const parts = Array.isArray(r.data && r.data[0]) ? r.data[0] : [];
    const translation = parts.map(item => item && item[0] ? item[0] : '').join('').trim();
    res.json({ ok: true, translation, raw: r.data });
  }));

  router.post(`${api}/ai/chat`, ensureLogin, asyncHandler(async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const endpoint = String(body.endpoint || AI_PROXY_ENDPOINT || '').trim().replace(/\/+$/, '');
    const apiKey = String(body.apiKey || AI_PROXY_API_KEY || '').trim();
    const model = String(body.model || AI_PROXY_MODEL || 'gpt-4o-mini').trim();
    const temperature = Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.2;
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (!endpoint) return res.status(400).json({ error: 'missing_endpoint' });
    if (!apiKey) return res.status(400).json({ error: 'missing_api_key' });
    if (!messages.length) return res.status(400).json({ error: 'missing_messages' });
    if (!/^https?:\/\//i.test(endpoint)) return res.status(400).json({ error: 'invalid_endpoint' });

    const url = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint}/chat/completions`;
    const r = await fetchJson(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, temperature, messages, stream: false }),
      },
      20000
    );

    if (r.status < 200 || r.status >= 300) {
      return res.status(502).json({ error: 'ai_upstream_failed', status: r.status, detail: r.data });
    }

    res.json(r.data);
  }));
}


function extractUidFromHookData(data) {
  const candidates = [
    data && data.uid,
    data && data.user && data.user.uid,
    data && data.userData && data.userData.uid,
    data && data.data && data.data.uid,
  ];
  for (const item of candidates) {
    const uid = String(item || '').trim();
    if (/^\d+$/.test(uid)) return uid;
  }
  return '';
}

function extractUsernameFromHookData(data) {
  const candidates = [
    data && data.username,
    data && data.user && data.user.username,
    data && data.userData && data.userData.username,
    data && data.data && data.data.username,
  ];
  for (const item of candidates) {
    const username = String(item || '').trim();
    if (username) return username;
  }
  return '';
}

plugin.onUserCreate = async function onUserCreate(data) {
  const uid = extractUidFromHookData(data);
  if (!uid) {
    console.warn('[wukong-chat] action:user.create fired without uid:', data);
    return data;
  }

  let username = extractUsernameFromHookData(data);
  if (!username) {
    const u = await getNodeBBUserByUid(uid);
    username = (u && u.username) || `user${uid}`;
  }

  const token = signWukongToken(uid);
  const result = await provisionWukongUser(uid, username, token, 'action:user.create');
  console.log('[wukong-chat] provision on user.create:', { uid, username, ok: result && result.ok, skipped: result && result.skipped });
  return data;
};

plugin.addNavigation = async function addNavigation(header) {
  header = header || [];
  header.push({
    route: '/wukong',
    title: '悟空聊天',
    iconClass: 'fa-comments',
    text: '悟空聊天',
  });
  return header;
};

plugin.init = async function init(params) {
  const { router, middleware } = params;

  console.log(`[wukong-chat] init start. wkHost=${WK_HOST} wkws=${WK_WS_PUBLIC_ADDR} syncUser=${SYNC_WUKONG_USER}`);

  registerPageRoutes(router, middleware);
  registerApiRoutes(router, middleware);

  console.log('[wukong-chat] routes registered: /wukong, /wukong/:uid, /api/wukong/healthz');
};

module.exports = plugin;
