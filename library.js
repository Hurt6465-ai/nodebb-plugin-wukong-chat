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

let db = null;
try {
  db = require.main.require('./src/database');
} catch (err) {
  console.warn('[wukong-chat] database module unavailable:', err.message);
}

let posts = null;
try {
  posts = require.main.require('./src/posts');
} catch (err) {
  console.warn('[wukong-chat] posts module unavailable:', err.message);
}

let topics = null;
try {
  topics = require.main.require('./src/topics');
} catch (err) {
  console.warn('[wukong-chat] topics module unavailable:', err.message);
}

let privileges = null;
try {
  privileges = require.main.require('./src/privileges');
} catch (err) {
  console.warn('[wukong-chat] privileges module unavailable:', err.message);
}

const plugin = {};

const PLUGIN_ROOT = __dirname;
const ACTIVITY_FILE = path.join(PLUGIN_ROOT, 'topic-chat-activity.json');
const NOTIFY_FILE = path.join(PLUGIN_ROOT, 'topic-chat-notify.json');
const CONVERSATION_STATE_FILE = path.join(PLUGIN_ROOT, 'wukong-conversations-state.json');

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
const RECENT_ROOM_MEMBERS_TTL_MS = Number(process.env.WK_RECENT_ROOM_MEMBERS_TTL_MS || 10 * 60 * 1000);
const RECENT_ROOM_MEMBERS_LIMIT = clampInt(process.env.WK_RECENT_ROOM_MEMBERS_LIMIT, 1, 20, 8);
const TOPIC_COMMENTER_MEMBER_LIMIT = clampInt(process.env.WK_TOPIC_COMMENTER_MEMBER_LIMIT, 1, 20, 7);
const TOPIC_COMMENTER_POST_SCAN_LIMIT = clampInt(process.env.WK_TOPIC_COMMENTER_POST_SCAN_LIMIT, 10, 200, 60);
const MEDIA_TTL_MS = Number(process.env.WK_MEDIA_TTL_MS || 48 * 60 * 60 * 1000);
const TOPIC_CONVERSATION_IDLE_DELETE_MS = Number(process.env.WK_TOPIC_CONVERSATION_IDLE_DELETE_MS || 3 * 60 * 60 * 1000);
const TOPIC_CONVERSATION_DELETE_TOPIC = !/^(0|false|no)$/i.test(String(process.env.WK_TOPIC_CONVERSATION_DELETE_TOPIC || 'true'));
const TOPIC_CONVERSATION_DELETE_MODE = String(process.env.WK_TOPIC_CONVERSATION_DELETE_MODE || 'purge').trim().toLowerCase(); // delete | purge
const TOPIC_CONVERSATION_DELETE_UID = Number(process.env.WK_TOPIC_CONVERSATION_DELETE_UID || 1);
const TOPIC_CLEANUP_ON_START = !/^(0|false|no)$/i.test(String(process.env.WK_TOPIC_CLEANUP_ON_START || 'true'));
const TOPIC_PUBLIC_CIDS = String(process.env.WK_TOPIC_PUBLIC_CIDS || process.env.CP_WUKONG_TOPIC_CIDS || '7').split(',').map(x => String(x).trim()).filter(Boolean);
const TOPIC_PUBLIC_LIST_LIMIT = clampInt(process.env.WK_TOPIC_PUBLIC_LIST_LIMIT, 1, 500, 120);
const MEDIA_UPLOAD_DIR = path.resolve(PLUGIN_ROOT, '../../public/uploads/wukong-chat');
const MEDIA_PUBLIC_PREFIX = '/assets/uploads/wukong-chat';
const MEDIA_CLEANUP_TZ_OFFSET_MS = Number(process.env.WK_MEDIA_CLEANUP_TZ_OFFSET_MS || 8 * 60 * 60 * 1000);
const MEDIA_CLEANUP_HOUR = Number(process.env.WK_MEDIA_CLEANUP_HOUR || 2);
const MEDIA_CLEANUP_JITTER_MS = Number(process.env.WK_MEDIA_CLEANUP_JITTER_MS || 60 * 60 * 1000);
const MEDIA_CLEANUP_ON_START = /^(1|true|yes)$/i.test(String(process.env.WK_MEDIA_CLEANUP_ON_START || 'false'));
let mediaCleanupTimer = null;
let topicConversationCleanupTimer = null;


const USER_PROFILE_FIELDS = [
  'uid',
  'username',
  'userslug',
  'displayname',
  'fullname',
  'picture',
  'uploadedpicture',
  'icon:text',
  'icon:bgColor',
  'icontext',
  'iconbgColor',
  'status',
  'language',
  'language_flag',
  'languageFlag',
  'countryFlag',
  'country_flag',
  'flag',
  'nationality',
  'country',
  'localeCountry',
];

const MAX_BATCH_USERS = 80;

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return defaultValue;
}

function parseInteger(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function configuredTopicCategoryId() {
  return clampInt(
    process.env.CP_WK_CATEGORY_ID || process.env.CP_WK_BOARD_ID || TOPIC_PUBLIC_CIDS[0] || 7,
    1,
    999999,
    7
  );
}

function normalizeUidList(input, max = MAX_BATCH_USERS) {
  return String(input || '')
    .split(/[\s,]+/)
    .map(uid => parseInteger(uid, 0))
    .filter((uid, index, arr) => uid > 0 && arr.indexOf(uid) === index)
    .slice(0, max)
    .map(uid => String(uid));
}

function isDeepSeekAIRequest(endpoint, model) {
  return /deepseek/i.test(String(endpoint || '')) || /deepseek/i.test(String(model || ''));
}

function buildAIRequestBody({ model, temperature, messages, endpoint }) {
  const body = {
    model,
    temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.3,
    messages,
    stream: false,
  };

  if (isDeepSeekAIRequest(endpoint, model)) {
    body.thinking = { type: 'disabled' };
  }

  return body;
}

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

function readConversationState() {
  const data = readJsonFile(CONVERSATION_STATE_FILE, {});
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { users: {}, globalRooms: {} };
  data.users = data.users && typeof data.users === 'object' && !Array.isArray(data.users) ? data.users : {};
  data.globalRooms = data.globalRooms && typeof data.globalRooms === 'object' && !Array.isArray(data.globalRooms) ? data.globalRooms : {};
  return data;
}

function writeConversationState(data) {
  const safe = data && typeof data === 'object' ? data : { users: {}, globalRooms: {} };
  safe.users = safe.users && typeof safe.users === 'object' && !Array.isArray(safe.users) ? safe.users : {};
  safe.globalRooms = safe.globalRooms && typeof safe.globalRooms === 'object' && !Array.isArray(safe.globalRooms) ? safe.globalRooms : {};
  writeJsonFile(CONVERSATION_STATE_FILE, safe);
}

function getConversationUserState(store, uid) {
  const id = String(uid || '').trim();
  if (!store.users[id] || typeof store.users[id] !== 'object') {
    store.users[id] = {
      rooms: {},
      readAt: {},
      updatedAt: Date.now(),
    };
  }
  const st = store.users[id];
  st.rooms = st.rooms && typeof st.rooms === 'object' && !Array.isArray(st.rooms) ? st.rooms : {};
  st.readAt = st.readAt && typeof st.readAt === 'object' && !Array.isArray(st.readAt) ? st.readAt : {};
  st.readVersions = st.readVersions && typeof st.readVersions === 'object' && !Array.isArray(st.readVersions) ? st.readVersions : {};
  return st;
}

function getConversationGlobalRooms(store) {
  store.globalRooms = store.globalRooms && typeof store.globalRooms === 'object' && !Array.isArray(store.globalRooms) ? store.globalRooms : {};
  return store.globalRooms;
}

function compactPublicUser(input, fallbackUid = '') {
  const u = input && typeof input === 'object' ? input : {};
  const uid = String(u.uid || u.userId || u.id || fallbackUid || '').trim();
  if (!uid) return null;
  return {
    uid,
    username: firstNonEmpty(u.username, u.userslug, u.displayname, uid),
    userslug: firstNonEmpty(u.userslug, u.slug, u.username, ''),
    displayname: firstNonEmpty(u.displayname, u.fullname, u.name, u.username, ''),
    picture: firstNonEmpty(u.picture, u.uploadedpicture, u.avatar, ''),
    icontext: firstNonEmpty(u.icontext, u.username, u.displayname, ''),
    iconbgColor: firstNonEmpty(u.iconbgColor, u.iconBgColor, ''),
    language_flag: firstNonEmpty(u.language_flag, u.country, u.nationality, u.language, ''),
  };
}

function normalizeRecentRoomMembers(list, nowMs = Date.now()) {
  const out = [];
  const seen = new Set();
  const arr = Array.isArray(list) ? list : [];
  for (const item of arr) {
    const u = compactPublicUser(item, item && item.uid);
    if (!u || seen.has(u.uid)) continue;
    const activeAt = Number(item && (item.active_at || item.activeAt || item.ts || item.updated_at || item.updatedAt || 0)) || nowMs;
    if (RECENT_ROOM_MEMBERS_TTL_MS > 0 && nowMs - activeAt > RECENT_ROOM_MEMBERS_TTL_MS) continue;
    seen.add(u.uid);
    out.push({ ...u, active_at: activeAt });
    if (out.length >= RECENT_ROOM_MEMBERS_LIMIT) break;
  }
  return out;
}

function mergeRecentRoomMembers(oldList, member, activeAt = Date.now()) {
  const nowMs = Date.now();
  const base = normalizeRecentRoomMembers(oldList, nowMs);
  const u = compactPublicUser(member, member && member.uid);
  if (!u) return base.slice(0, RECENT_ROOM_MEMBERS_LIMIT);
  const filtered = base.filter(item => String(item.uid) !== String(u.uid));
  return [{ ...u, active_at: Number(activeAt || nowMs) || nowMs }, ...filtered].slice(0, RECENT_ROOM_MEMBERS_LIMIT);
}

function conversationRoomKey(channelId, channelType) {
  return `${normalizeChannelType(channelType, 1)}:${String(channelId || '').trim()}`;
}

function conversationExtractList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.conversations)) return data.conversations;
  if (data && Array.isArray(data.list)) return data.list;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && data.data && Array.isArray(data.data.conversations)) return data.data.conversations;
  if (data && data.data && Array.isArray(data.data.list)) return data.data.list;
  return [];
}

function parseMaybeJson(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return value;
  const s = value.trim();
  if (!s) return '';
  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      return JSON.parse(s);
    } catch (err) {
      return value;
    }
  }
  return value;
}

const CALL_SIGNAL_PREFIXES = ['__cp_harmony_call__:', '__wkcall__:', '__wkcall__：'];
const CALL_RECORD_PREFIX = '__wkcall_record__:';

function callTextKind(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return '';
  if (s.indexOf(CALL_RECORD_PREFIX) === 0) return 'record';
  for (const p of CALL_SIGNAL_PREFIXES) {
    if (s.indexOf(p) === 0) return 'signal';
  }
  return '';
}

function callRecordPreview(value) {
  try {
    const data = JSON.parse(String(value).slice(CALL_RECORD_PREFIX.length));
    return String(data && data.mode) === 'video' ? '[视频通话]' : '[语音通话]';
  } catch (err) {
    return '[通话]';
  }
}

function conversationPayloadText(value) {
  const raw = parseMaybeJson(value);
  if (raw && typeof raw === 'object') {
    const type = firstNonEmpty(raw.type, raw.content_type, raw.contentType, '');
    const text = firstNonEmpty(raw.text, raw.content, raw.body, raw.msg, raw.message, '');
    const url = firstNonEmpty(raw.url, raw.remoteUrl, raw.remote_url, raw.path, raw.src, '');

    const callKind = callTextKind(text);
    if (callKind === 'signal') return '';
    if (callKind === 'record') return callRecordPreview(text);

    if (String(type) === '1006' || raw.revoke || raw.recalled) return '此消息已被撤回';
    if (/image/i.test(String(type)) || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(String(url))) return '[图片]';
    if (/video/i.test(String(type)) || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(String(url))) return '[视频]';
    if (/voice|audio/i.test(String(type)) || /\.(mp3|wav|ogg|aac|m4a)(\?|$)/i.test(String(url))) return '[语音]';
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const sCallKind = callTextKind(s);
  if (sCallKind === 'signal') return '';
  if (sCallKind === 'record') return callRecordPreview(s);
  if (/!\[[^\]]*\]\([^)]+\)/.test(s)) return '[图片]';
  if (/\[(?:视频|video)\]\([^)]+\)/i.test(s)) return '[视频]';
  if (/\[(?:语音消息|voice|audio)\]\([^)]+\)/i.test(s)) return '[语音]';
  return s.slice(0, 200);
}

function conversationChannelId(item) {
  let channel = firstNonEmpty(item.channel_id, item.channelId, item.channelID, item.channel, '');
  if (channel && typeof channel === 'object') {
    channel = firstNonEmpty(channel.channel_id, channel.channelId, channel.channelID, channel.id, '');
  }
  return String(channel || '').trim();
}

function conversationTimestamp(item) {
  let n = Number(firstNonEmpty(
    item.last_msg_at,
    item.lastMsgAt,
    item.last_message_at,
    item.timestamp,
    item.updated_at,
    item.updatedAt,
    item.time,
    item.created_at,
    item.createdAt,
    item.lastTimestamp,
    item.last_timestamp,
    0
  ));
  if (n && n < 10000000000) n *= 1000;
  return n || 0;
}

function conversationPayload(item) {
  return firstNonEmpty(
    item.last_msg,
    item.lastMsg,
    item.last_message,
    item.lastMessage,
    item.message,
    item.payload,
    item.content,
    item.text,
    item.body,
    item.msg,
    ''
  );
}


function normalizeActivityTimestampMs(value) {
  let n = Number(value || 0);
  if (!n || !Number.isFinite(n)) return 0;
  if (n < 10000000000) n *= 1000;
  return n;
}

function topicRoomLastActivityAt(room) {
  if (!room || typeof room !== 'object') return 0;

  // Physical topic cleanup is based on real discussion/chat activity, not on
  // local cache refresh time. Do not use updated_at here, because sync jobs touch
  // it even when nobody replied or chatted.
  const candidates = [
    room.last_chat_at,
    room.lastChatAt,
    room.topic_lastposttime,
    room.lastposttime,
    room.lastPostTime,
    room.ts,
    room.timestamp,
    room.created_at,
    room.createdAt,
  ];

  for (const value of candidates) {
    const ts = normalizeActivityTimestampMs(value);
    if (ts) return ts;
  }

  return 0;
}

function isExpiredTopicConversation(room, nowMs = Date.now()) {
  if (!room || !room.is_topic) return false;
  const ttl = Number(TOPIC_CONVERSATION_IDLE_DELETE_MS || 0);
  if (!ttl) return false;
  const ts = topicRoomLastActivityAt(room);
  if (!ts) return false;
  return nowMs - ts > ttl;
}


async function deleteNodeBBTopicForExpiredConversation(room) {
  if (!TOPIC_CONVERSATION_DELETE_TOPIC) return { ok: false, skipped: true, reason: 'disabled' };
  const tid = String(room && room.tid || topicIdFromChannelId(room && room.channel_id) || '').trim();
  if (!/^\d+$/.test(tid)) return { ok: false, skipped: true, reason: 'invalid_tid', tid };
  if (!topics) return { ok: false, skipped: true, reason: 'topics_module_missing', tid };

  const actorUid = Number(room && (room.uid || room.poster_uid || room.peer_uid) || TOPIC_CONVERSATION_DELETE_UID || 1);
  const mode = TOPIC_CONVERSATION_DELETE_MODE === 'purge' ? 'purge' : 'delete';

  try {
    if (mode === 'purge') {
      if (typeof topics.purge === 'function') {
        await topics.purge(tid, actorUid);
        return { ok: true, tid, mode: 'purge' };
      }
      if (typeof topics.purgeTopic === 'function') {
        await topics.purgeTopic(tid, actorUid);
        return { ok: true, tid, mode: 'purgeTopic' };
      }
    }

    if (typeof topics.delete === 'function') {
      await topics.delete(tid, actorUid);
      return { ok: true, tid, mode: 'delete' };
    }
    if (typeof topics.deleteTopic === 'function') {
      await topics.deleteTopic(tid, actorUid);
      return { ok: true, tid, mode: 'deleteTopic' };
    }

    return { ok: false, skipped: true, reason: 'no_delete_api', tid };
  } catch (err) {
    console.warn('[wukong-chat] expired topic delete failed:', { tid, mode, error: err.message });
    return { ok: false, tid, mode, error: err.message };
  }
}

async function cleanupExpiredTopicConversations() {
  const store = readConversationState();
  const nowMs = Date.now();
  let checked = 0;
  let expired = 0;
  let deletedTopics = 0;
  let removedRooms = 0;
  const topicDeleteTried = new Set();
  const globalRooms = getConversationGlobalRooms(store);

  async function removeRoom(key, room) {
    expired += 1;
    const tid = String(room && room.tid || topicIdFromChannelId(room && room.channel_id) || '').trim();
    if (tid && !topicDeleteTried.has(tid)) {
      topicDeleteTried.add(tid);
      const result = await deleteNodeBBTopicForExpiredConversation(room);
      if (result && result.ok) deletedTopics += 1;
    }
    removedRooms += 1;
    return key;
  }

  for (const [key, room] of Object.entries(globalRooms)) {
    if (!room || !room.is_topic) continue;
    checked += 1;
    const topic = await getTopicPublic(room.tid || topicIdFromChannelId(room.channel_id));
    if (!topic || isExpiredTopicConversation(room, nowMs)) {
      await removeRoom(key, room);
      delete globalRooms[key];
    }
  }

  for (const [uid, userState] of Object.entries(store.users || {})) {
    if (!userState || typeof userState !== 'object') continue;
    userState.rooms = userState.rooms && typeof userState.rooms === 'object' && !Array.isArray(userState.rooms) ? userState.rooms : {};
    userState.readAt = userState.readAt && typeof userState.readAt === 'object' && !Array.isArray(userState.readAt) ? userState.readAt : {};
    userState.readVersions = userState.readVersions && typeof userState.readVersions === 'object' && !Array.isArray(userState.readVersions) ? userState.readVersions : {};

    for (const [key, room] of Object.entries(userState.rooms)) {
      checked += 1;
      if (!room || !room.is_topic) continue;
      const topic = await getTopicPublic(room.tid || topicIdFromChannelId(room.channel_id));
      if (topic && !isExpiredTopicConversation(room, nowMs)) continue;
      await removeRoom(key, room);
      delete userState.rooms[key];
      delete userState.readAt[key];
      delete userState.readVersions[key];
    }
  }

  writeConversationState(store);
  return { ok: true, checked, expired, deletedTopics, removedRooms, ttl_ms: TOPIC_CONVERSATION_IDLE_DELETE_MS };
}

function scheduleNextTopicConversationCleanup() {
  const delay = getNextBeijingCleanupDelay();
  topicConversationCleanupTimer = setTimeout(async () => {
    try {
      const result = await cleanupExpiredTopicConversations();
      console.log('[wukong-chat] expired topic conversation cleanup:', result);
    } catch (err) {
      console.warn('[wukong-chat] expired topic conversation cleanup failed:', err.message);
    } finally {
      topicConversationCleanupTimer = null;
      scheduleNextTopicConversationCleanup();
    }
  }, delay);
  if (topicConversationCleanupTimer && typeof topicConversationCleanupTimer.unref === 'function') {
    topicConversationCleanupTimer.unref();
  }
}

function startTopicConversationCleanupTimer() {
  if (topicConversationCleanupTimer) return;
  if (TOPIC_CLEANUP_ON_START) {
    cleanupExpiredTopicConversations()
      .then(result => console.log('[wukong-chat] initial expired topic conversation cleanup:', result))
      .catch(err => console.warn('[wukong-chat] initial expired topic conversation cleanup failed:', err.message));
  }
  scheduleNextTopicConversationCleanup();
}

function normalizeConversationItem(item, currentUid) {
  const channelId = conversationChannelId(item);
  if (!channelId) return null;

  const defaultType = channelId.startsWith(TOPIC_CHANNEL_PREFIX) ? TOPIC_CHANNEL_TYPE : 1;
  const channelType = normalizeChannelType(firstNonEmpty(item.channel_type, item.channelType, defaultType), defaultType);
  const isTopic = channelType === TOPIC_CHANNEL_TYPE || channelId.startsWith(TOPIC_CHANNEL_PREFIX);
  const peerUid = isTopic ? '' : channelId.replace(/[^\d]/g, '');
  const tid = isTopic ? topicIdFromChannelId(channelId) : '';
  const text = conversationPayloadText(conversationPayload(item));
  const ts = conversationTimestamp(item) || Date.now();
  const unread = clampInt(firstNonEmpty(item.unread, item.unread_count, item.unreadCount, item.unread_cnt, 0), 0, 999999, 0);
  const lastFromUid = String(firstNonEmpty(
    item.from_uid,
    item.fromUid,
    item.fromUID,
    item.last_from_uid,
    item.lastFromUid,
    item.sender_uid,
    item.senderUid,
    ''
  )).trim();
  const lastFromName = String(firstNonEmpty(
    item.from_name,
    item.fromName,
    item.last_from_name,
    item.lastFromName,
    item.sender_name,
    item.senderName,
    ''
  )).trim();

  return {
    key: conversationRoomKey(channelId, channelType),
    channel_id: channelId,
    channel_type: channelType,
    is_topic: isTopic,
    peer_uid: peerUid,
    tid,
    ts,
    unread,
    text,
    last_from_uid: lastFromUid,
    last_from_name: lastFromName,
  };
}


function isTopicDeletedFields(fields) {
  if (!fields || typeof fields !== 'object') return true;
  return /^(1|true|yes)$/i.test(String(fields.deleted || fields.isDeleted || fields.deletedAt || ''));
}

function topicRoomFromPublicTopic(topic, oldRoom) {
  oldRoom = oldRoom && typeof oldRoom === 'object' ? oldRoom : {};
  const channelId = `${TOPIC_CHANNEL_PREFIX}${topic.tid}`;
  const channelType = TOPIC_CHANNEL_TYPE;
  const key = conversationRoomKey(channelId, channelType);
  const topicTs = Number(topic.lastposttime || topic.timestamp || 0) || Date.now();
  const oldTopicTs = Number(oldRoom.topic_lastposttime || oldRoom.lastposttime || oldRoom.ts || 0) || 0;
  const hasOldRoom = !!oldRoom.channel_id;
  const versionBump = hasOldRoom && topicTs > oldTopicTs ? 1 : 0;
  return {
    ...oldRoom,
    key,
    channel_id: channelId,
    channel_type: channelType,
    is_topic: true,
    peer_uid: '',
    tid: String(topic.tid),
    title: topic.title,
    wukong_tag: topic.wukong_tag || oldRoom.wukong_tag || '',
    wukong_lang: topic.wukong_lang || oldRoom.wukong_lang || '',
    ts: Math.max(Number(oldRoom.ts || 0), topicTs),
    topic_lastposttime: topicTs,
    text: conversationPayloadText(oldRoom.text || ''),
    last_from_uid: String(oldRoom.last_from_uid || topic.uid || ''),
    last_from_name: String(oldRoom.last_from_name || (topic.poster && (topic.poster.displayname || topic.poster.username)) || ''),
    version: Number(oldRoom.version || 0) + versionBump,
    updated_at: Date.now(),
  };
}

async function getPublicTopicIds(limit = TOPIC_PUBLIC_LIST_LIMIT) {
  const ids = [];
  const seen = new Set();
  if (!db) return ids;

  function addTid(tid) {
    tid = String(tid || '').trim();
    if (!/^\d+$/.test(tid) || seen.has(tid)) return;
    seen.add(tid);
    ids.push(tid);
  }

  for (const cid of TOPIC_PUBLIC_CIDS) {
    if (ids.length >= limit) break;
    if (!/^\d+$/.test(String(cid))) continue;
    const keys = [`cid:${cid}:tids`, `cid:${cid}:topics`];
    for (const key of keys) {
      if (ids.length >= limit) break;
      try {
        let tids = [];
        if (typeof db.getSortedSetRevRange === 'function') tids = await db.getSortedSetRevRange(key, 0, limit - 1);
        else if (typeof db.getSortedSetRange === 'function') tids = (await db.getSortedSetRange(key, 0, limit - 1)).reverse();
        (tids || []).forEach(addTid);
        if (ids.length) break;
      } catch (err) {
        // Best-effort. Different NodeBB versions use slightly different sets.
      }
    }
  }
  return ids.slice(0, limit);
}

async function syncPublicTopicRooms(store) {
  const globalRooms = getConversationGlobalRooms(store);
  const removedKeys = [];
  const activeKeys = new Set();
  const nowMs = Date.now();
  const topicDeleteTried = new Set();

  for (const tid of await getPublicTopicIds(TOPIC_PUBLIC_LIST_LIMIT)) {
    const topic = await getTopicPublic(tid);
    if (!topic) continue;
    const key = conversationRoomKey(`${TOPIC_CHANNEL_PREFIX}${tid}`, TOPIC_CHANNEL_TYPE);
    const candidate = topicRoomFromPublicTopic(topic, globalRooms[key]);
    if (isExpiredTopicConversation(candidate, nowMs)) {
      if (!topicDeleteTried.has(tid)) {
        topicDeleteTried.add(tid);
        await deleteNodeBBTopicForExpiredConversation(candidate);
      }
      delete globalRooms[key];
      removedKeys.push(key);
      continue;
    }
    globalRooms[key] = candidate;
    activeKeys.add(key);
  }

  for (const [key, room] of Object.entries(globalRooms)) {
    if (!room || !room.is_topic) continue;
    const tid = String(room.tid || topicIdFromChannelId(room.channel_id) || '').trim();
    const topic = await getTopicPublic(tid);
    if (!topic || isExpiredTopicConversation(room, nowMs)) {
      if (tid && !topicDeleteTried.has(tid)) {
        topicDeleteTried.add(tid);
        if (topic) await deleteNodeBBTopicForExpiredConversation(room);
      }
      delete globalRooms[key];
      removedKeys.push(key);
      continue;
    }
    activeKeys.add(key);
  }

  return { activeKeys, removedKeys };
}

async function pruneInvalidTopicRooms(store, userState, activeKeys) {
  const removedKeys = [];
  const globalRooms = getConversationGlobalRooms(store);

  for (const [key, room] of Object.entries(userState.rooms || {})) {
    if (!room || !room.is_topic) continue;
    const tid = String(room.tid || topicIdFromChannelId(room.channel_id) || '').trim();
    const active = activeKeys && activeKeys.has(key);
    const topic = active ? true : await getTopicPublic(tid);
    if (!topic || isExpiredTopicConversation(room)) {
      delete userState.rooms[key];
      delete userState.readAt[key];
      if (userState.readVersions) delete userState.readVersions[key];
      removedKeys.push(key);
    }
  }

  for (const key of removedKeys) {
    if (globalRooms[key]) delete globalRooms[key];
  }
  return removedKeys;
}

async function getTopicPostIds(tid, limit = 12) {
  tid = String(tid || '').trim();
  if (!/^\d+$/.test(tid) || !db) return [];

  const key = `tid:${tid}:posts`;
  const stop = Math.max(0, Number(limit || 12) - 1);
  try {
    if (typeof db.getSortedSetRevRange === 'function') {
      const pids = await db.getSortedSetRevRange(key, 0, stop);
      return (pids || []).map(x => String(x)).filter(Boolean);
    }
    if (typeof db.getSortedSetRange === 'function') {
      const pids = await db.getSortedSetRange(key, 0, stop);
      return (pids || []).map(x => String(x)).filter(Boolean).reverse();
    }
  } catch (err) {
    console.warn('[wukong-chat] get topic post ids failed:', tid, err.message);
  }
  return [];
}

async function getPostFieldsBatch(pids, fields) {
  pids = Array.isArray(pids) ? pids.map(pid => String(pid || '').trim()).filter(Boolean) : [];
  fields = Array.isArray(fields) ? fields : [];
  if (!pids.length) return [];

  if (posts && typeof posts.getPostsFields === 'function') {
    try {
      const rows = await posts.getPostsFields(pids, fields);
      if (Array.isArray(rows)) return rows;
    } catch (err) {
      console.warn('[wukong-chat] get posts fields batch failed:', err.message);
    }
  }

  if (db && typeof db.getObjectsFields === 'function') {
    try {
      const rows = await db.getObjectsFields(pids.map(pid => `post:${pid}`), fields);
      if (Array.isArray(rows)) return rows;
    } catch (err) {
      // Fall through to per-post fetch for older NodeBB/database adapters.
    }
  }

  const rows = [];
  if (posts && typeof posts.getPostFields === 'function') {
    for (const pid of pids) {
      try {
        rows.push(await posts.getPostFields(pid, fields));
      } catch (err) {
        rows.push(null);
      }
    }
  }
  return rows;
}

function isPostDeletedFields(fields) {
  if (!fields || typeof fields !== 'object') return false;
  return /^(1|true|yes)$/i.test(String(fields.deleted || fields.isDeleted || fields.deletedAt || ''));
}

async function getTopicParticipantUsers(tid, posterUid, limit = TOPIC_COMMENTER_MEMBER_LIMIT) {
  const maxMembers = clampInt(limit, 1, 20, TOPIC_COMMENTER_MEMBER_LIMIT);
  const seen = new Set();
  const uids = [];
  const poster = String(posterUid || '').trim();

  function addCommenterUid(uid) {
    uid = String(uid || '').trim();
    if (!/^\d+$/.test(uid)) return;
    // The poster is returned separately as topic.poster. Keep members as the
    // latest unique commenters so the card can render: poster + commenters.
    if (poster && uid === poster) return;
    if (seen.has(uid)) return;
    seen.add(uid);
    uids.push(uid);
  }

  const scanLimit = Math.max(TOPIC_COMMENTER_POST_SCAN_LIMIT, maxMembers * 8);
  const pids = await getTopicPostIds(tid, scanLimit);
  const rows = await getPostFieldsBatch(pids, ['uid', 'deleted', 'isDeleted', 'deletedAt']);

  for (const fields of rows) {
    if (uids.length >= maxMembers) break;
    if (isPostDeletedFields(fields)) continue;
    addCommenterUid(fields && fields.uid);
  }

  const users = [];
  for (const uid of uids.slice(0, maxMembers)) {
    const u = await fetchNodeBBUserPublic(uid);
    if (u) users.push(u);
  }
  return users;
}

function stripTopicActiveMemberFields(room) {
  if (!room || typeof room !== 'object' || !room.is_topic) return room;
  const clean = { ...room };
  delete clean.recent_members;
  delete clean.recentMembers;
  delete clean.active_members;
  delete clean.activeMembers;
  delete clean.recent_count;
  delete clean.recentCount;
  delete clean.active_count;
  delete clean.activeCount;
  return clean;
}

async function getTopicPublic(tid) {
  tid = String(tid || '').trim();
  if (!/^\d+$/.test(tid) || !topics || !topics.getTopicFields) return null;

  try {
    const fields = await topics.getTopicFields(tid, [
      'tid',
      'uid',
      'cid',
      'title',
      'slug',
      'timestamp',
      'lastposttime',
      'wukong_tag',
      'wukong_lang',
      'deleted',
      'isDeleted',
      'deletedAt',
    ]);

    if (!fields || !fields.tid || isTopicDeletedFields(fields)) return null;

    const posterUid = String(fields.uid || '').trim();
    const poster = posterUid ? await fetchNodeBBUserPublic(posterUid) : null;
    const members = await getTopicParticipantUsers(tid, posterUid, TOPIC_COMMENTER_MEMBER_LIMIT);

    return {
      tid: String(fields.tid),
      cid: String(fields.cid || ''),
      title: firstNonEmpty(fields.title, `聊天室 ${tid}`),
      slug: firstNonEmpty(fields.slug),
      uid: posterUid,
      poster,
      members,
      timestamp: Number(fields.timestamp || 0),
      lastposttime: Number(fields.lastposttime || 0),
      wukong_tag: firstNonEmpty(fields.wukong_tag),
      wukong_lang: firstNonEmpty(fields.wukong_lang),
    };
  } catch (err) {
    console.warn('[wukong-chat] get topic failed:', tid, err.message);
    return null;
  }
}

async function buildConversationListForUser(current, rawData) {
  const uid = String(current.uid);
  const store = readConversationState();
  const userState = getConversationUserState(store, uid);
  const globalRooms = getConversationGlobalRooms(store);
  const incoming = conversationExtractList(rawData).map(item => normalizeConversationItem(item, uid)).filter(Boolean);
  const removedKeys = [];

  const synced = await syncPublicTopicRooms(store);
  synced.removedKeys.forEach(key => removedKeys.push(key));
  const activeTopicKeys = synced.activeKeys || new Set();

  for (const room of incoming) {
    const old = userState.rooms[room.key] && typeof userState.rooms[room.key] === 'object' ? userState.rooms[room.key] : {};

    if (!room.text && old.text) room.text = old.text;
    if (!room.ts && old.ts) room.ts = old.ts;

    const readAt = Number(userState.readAt[room.key] || 0);
    if (readAt && Number(room.ts || 0) <= readAt) room.unread = 0;
    if (!room.unread && old.unread && Number(room.ts || 0) > readAt) room.unread = old.unread;

    userState.rooms[room.key] = {
      ...old,
      ...room,
      updated_at: Date.now(),
    };
  }

  // Merge public topic rooms into every user's list. This fixes new accounts seeing an empty room list.
  for (const [key, globalRoom] of Object.entries(globalRooms)) {
    if (!globalRoom || !globalRoom.is_topic) continue;
    const old = userState.rooms[key] && typeof userState.rooms[key] === 'object' ? userState.rooms[key] : {};
    const globalVersion = Number(globalRoom.version || 0);
    let readVersion = Number(userState.readVersions[key] || 0);

    // New users should see existing public rooms, but should not get unread badges for old messages.
    if (!old.channel_id && !readVersion) {
      readVersion = globalVersion;
      userState.readVersions[key] = globalVersion;
      userState.readAt[key] = Math.max(Number(userState.readAt[key] || 0), Number(globalRoom.ts || 0));
    }

    const unreadByVersion = Math.max(0, globalVersion - readVersion);
    userState.rooms[key] = {
      ...globalRoom,
      ...old,
      text: globalRoom.text || old.text || '',
      ts: Number(globalRoom.ts || 0) || Number(old.ts || 0) || Date.now(),
      last_from_uid: globalRoom.last_from_uid || old.last_from_uid || '',
      last_from_name: globalRoom.last_from_name || old.last_from_name || '',
      unread: unreadByVersion,
      version: globalVersion,
      updated_at: Date.now(),
    };
  }

  userState.updatedAt = Date.now();

  const pruned = await pruneInvalidTopicRooms(store, userState, activeTopicKeys);
  pruned.forEach(key => removedKeys.push(key));

  const nowForTopicCleanup = Date.now();
  const rooms = Object.values(userState.rooms)
    .filter(room => room && room.channel_id && !isExpiredTopicConversation(room, nowForTopicCleanup))
    .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))
    .slice(0, 500);

  const directUids = rooms
    .filter(room => !room.is_topic && /^\d+$/.test(String(room.peer_uid || '')))
    .map(room => String(room.peer_uid))
    .filter((x, i, arr) => arr.indexOf(x) === i)
    .slice(0, 100);

  const topicTids = rooms
    .filter(room => room.is_topic && /^\d+$/.test(String(room.tid || '')))
    .map(room => String(room.tid))
    .filter((x, i, arr) => arr.indexOf(x) === i)
    .slice(0, 100);

  const users = {};
  for (const directUid of directUids) {
    const u = await fetchNodeBBUserPublic(directUid);
    if (u) users[directUid] = u;
  }

  const topicMap = {};
  for (const tid of topicTids) {
    const topic = await getTopicPublic(tid);
    if (topic) {
      topicMap[tid] = topic;
      if (topic.poster && topic.poster.uid) users[String(topic.poster.uid)] = topic.poster;
      for (const field of ['members', 'recent_members', 'active_members']) {
        if (Array.isArray(topic[field])) {
          for (const member of topic[field]) {
            if (member && member.uid) users[String(member.uid)] = member;
          }
        }
      }
    } else {
      const key = conversationRoomKey(`${TOPIC_CHANNEL_PREFIX}${tid}`, TOPIC_CHANNEL_TYPE);
      delete userState.rooms[key];
      delete userState.readAt[key];
      delete userState.readVersions[key];
      delete globalRooms[key];
      removedKeys.push(key);
    }
  }

  writeConversationState(store);

  return {
    ok: true,
    rooms: rooms.map(stripTopicActiveMemberFields),
    users,
    topics: topicMap,
    removed_keys: Array.from(new Set(removedKeys)),
    topic_room_keys: rooms.filter(room => room.is_topic).map(room => room.key),
    serverTime: Date.now(),
  };
}

function normalizeConversationUpsertBody(body, currentUid) {
  const channelId = String(firstNonEmpty(body.channel_id, body.channelId, '')).trim();
  const defaultType = channelId.startsWith(TOPIC_CHANNEL_PREFIX) ? TOPIC_CHANNEL_TYPE : 1;
  const channelType = normalizeChannelType(firstNonEmpty(body.channel_type, body.channelType, defaultType), defaultType);
  const isTopic = channelType === TOPIC_CHANNEL_TYPE || channelId.startsWith(TOPIC_CHANNEL_PREFIX);
  const peerUid = isTopic ? '' : channelId.replace(/[^\d]/g, '');
  const tid = isTopic ? topicIdFromChannelId(channelId) : '';

  if (!channelId) return null;
  if (!isTopic && !peerUid) return null;

  const lastFromUid = String(firstNonEmpty(body.last_from_uid, body.lastFromUid, body.from_uid, body.fromUid, body.fromUID, '')).trim();
  const lastFromName = String(firstNonEmpty(body.last_from_name, body.lastFromName, body.from_name, body.fromName, '')).trim();

  return {
    key: conversationRoomKey(channelId, channelType),
    channel_id: channelId,
    channel_type: channelType,
    is_topic: isTopic,
    peer_uid: peerUid,
    tid,
    ts: Number(body.ts || body.timestamp || Date.now()) || Date.now(),
    text: conversationPayloadText(firstNonEmpty(body.text, body.last_msg, body.lastMsg, body.payload, '')),
    incoming: !!body.incoming,
    last_from_uid: lastFromUid,
    last_from_name: lastFromName,
    is_self: /^(1|true|yes)$/i.test(String(body.is_self || body.self || '')),
  };
}

function upsertConversationForUser(uid, room, currentUser = null) {
  const store = readConversationState();
  const userState = getConversationUserState(store, uid);
  const globalRooms = getConversationGlobalRooms(store);
  const old = userState.rooms[room.key] && typeof userState.rooms[room.key] === 'object' ? userState.rooms[room.key] : {};
  const readAt = Number(userState.readAt[room.key] || 0);
  const roomTs = Number(room.ts || Date.now());

  let next = {
    ...old,
    ...room,
    ts: roomTs,
    unread: room.incoming && roomTs > readAt ? Number(old.unread || 0) + 1 : Number(old.unread || 0),
    updated_at: Date.now(),
  };

  if (!room.text && old.text) next.text = old.text;

  // Topic rooms are public. Store one global latest-message state so offline users and new accounts
  // can see the latest room preview without needing a personal upsert.
  if (room.is_topic) {
    const globalOld = globalRooms[room.key] && typeof globalRooms[room.key] === 'object' ? globalRooms[room.key] : {};
    const senderName = firstNonEmpty(
      room.last_from_name && room.last_from_name !== '我' ? room.last_from_name : '',
      currentUser && currentUser.displayname,
      currentUser && currentUser.username,
      room.last_from_uid ? `user${room.last_from_uid}` : ''
    );
    const versionBump = room.text && (room.text !== globalOld.text || roomTs > Number(globalOld.ts || 0)) ? 1 : 0;
    const senderUid = String(room.last_from_uid || (currentUser && currentUser.uid) || '').trim();
    const senderMember = compactPublicUser(currentUser, senderUid) || (senderUid ? { uid: senderUid, username: senderName || `user${senderUid}`, displayname: senderName || '' } : null);
    const recentMembers = mergeRecentRoomMembers(globalOld.recent_members || globalOld.active_members || [], senderMember, roomTs);
    const globalNext = {
      ...globalOld,
      ...room,
      text: room.text || globalOld.text || '',
      ts: roomTs || Number(globalOld.ts || 0) || Date.now(),
      unread: 0,
      last_from_uid: room.last_from_uid || globalOld.last_from_uid || '',
      last_from_name: senderName || globalOld.last_from_name || '',
      recent_members: recentMembers,
      active_members: recentMembers,
      recent_count: Math.max(recentMembers.length, Number(globalOld.recent_count || globalOld.active_count || recentMembers.length)),
      active_count: Math.max(recentMembers.length, Number(globalOld.recent_count || globalOld.active_count || recentMembers.length)),
      version: Number(globalOld.version || 0) + versionBump,
      updated_at: Date.now(),
    };
    delete globalNext.incoming;
    delete globalNext.is_self;
    globalRooms[room.key] = globalNext;

    next = {
      ...globalNext,
      ...next,
      text: globalNext.text || next.text || '',
      ts: globalNext.ts || next.ts,
      last_from_uid: globalNext.last_from_uid || next.last_from_uid || '',
      last_from_name: room.is_self ? '我' : (globalNext.last_from_name || next.last_from_name || ''),
      version: globalNext.version,
    };
  }

  // Own messages must still update the last-message preview, but must not add unread.
  if (!room.incoming || room.is_self) {
    next.unread = 0;
    userState.readAt[room.key] = Math.max(Number(userState.readAt[room.key] || 0), roomTs);
    if (room.is_topic && next.version) userState.readVersions[room.key] = Number(next.version || 0);
  }

  if (!next.last_from_uid && old.last_from_uid) next.last_from_uid = old.last_from_uid;
  if (!next.last_from_name && old.last_from_name) next.last_from_name = old.last_from_name;

  delete next.incoming;
  delete next.is_self;
  userState.rooms[room.key] = next;
  userState.updatedAt = Date.now();
  writeConversationState(store);

  return next;
}

function markConversationRead(uid, channelId, channelType) {
  const store = readConversationState();
  const userState = getConversationUserState(store, uid);
  const globalRooms = getConversationGlobalRooms(store);
  const key = conversationRoomKey(channelId, channelType);
  const nowTs = Date.now();

  userState.readAt[key] = nowTs;
  if (globalRooms[key] && globalRooms[key].is_topic) {
    userState.readVersions[key] = Number(globalRooms[key].version || 0);
  }
  if (userState.rooms[key]) {
    userState.rooms[key].unread = 0;
    userState.rooms[key].read_at = nowTs;
    userState.rooms[key].updated_at = nowTs;
    if (globalRooms[key] && globalRooms[key].version) userState.rooms[key].version = Number(globalRooms[key].version || 0);
  }

  userState.updatedAt = nowTs;
  writeConversationState(store);

  return userState.rooms[key] || { key, channel_id: channelId, channel_type: channelType, unread: 0, read_at: nowTs };
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

  let fields = null;

  if (user && typeof user.getUserFields === 'function') {
    try {
      fields = await user.getUserFields(uid, USER_PROFILE_FIELDS);
    } catch (err) {
      fields = null;
    }
  }

  // Some custom public profile fields, especially language/country flags, can live
  // directly in user:<uid>. Read only this whitelist and never expose private fields.
  if (db && typeof db.getObjectFields === 'function') {
    try {
      const direct = await db.getObjectFields(`user:${uid}`, USER_PROFILE_FIELDS);
      fields = Object.assign({}, fields || {}, direct || {});
    } catch (err) {}
  }

  if (!fields) return null;
  fields.uid = fields.uid || uid;
  if (!fields.uid) return null;

  return {
    uid: String(fields.uid),
    username: firstNonEmpty(fields.username, fields.userslug, `user${uid}`),
    userslug: firstNonEmpty(fields.userslug, fields.slug, fields.username),
    displayname: firstNonEmpty(fields.displayname, fields.fullname, fields.username, `user${uid}`),
    fullname: firstNonEmpty(fields.fullname),
    picture: firstNonEmpty(fields.picture, fields.uploadedpicture),
    icontext: firstNonEmpty(fields.icontext, fields['icon:text'], fields.username ? String(fields.username).charAt(0).toUpperCase() : ''),
    iconbgColor: firstNonEmpty(fields.iconbgColor, fields['icon:bgColor'], '#72a5f2'),
    status: firstNonEmpty(fields.status),
    language: firstNonEmpty(fields.language),
    language_flag: firstNonEmpty(
      fields.language_flag,
      fields.languageFlag,
      fields.countryFlag,
      fields.country_flag,
      fields.flag,
      fields.nationality,
      fields.country,
      fields.localeCountry,
      fields.language
    ),
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


function getMediaKind(mime) {
  mime = String(mime || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'voice';
  return 'file';
}

function safeMediaExt(file) {
  const original = String(file && file.originalname || '').toLowerCase();
  const fromName = path.extname(original).replace(/[^.a-z0-9]/g, '').slice(0, 12);
  if (fromName) return fromName;

  const mime = String(file && file.mimetype || '').toLowerCase();
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('quicktime')) return '.mov';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('mpeg')) return '.mp3';
  if (mime.includes('wav')) return '.wav';
  if (mime.includes('aac')) return '.aac';
  return '.bin';
}

function assertAllowedMediaFile(file) {
  const mime = String(file && file.mimetype || 'application/octet-stream').toLowerCase();
  const kind = getMediaKind(mime);

  if (!['image', 'video', 'voice'].includes(kind)) {
    const err = new Error('unsupported_media_type');
    err.status = 400;
    err.detail = { mimetype: mime, filename: file && file.originalname };
    throw err;
  }

  return kind;
}

function saveWukongMediaFiles(files, uid) {
  const now = Date.now();
  const expiresAt = now + MEDIA_TTL_MS;
  const day = new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
  const dir = path.join(MEDIA_UPLOAD_DIR, day);

  fs.mkdirSync(dir, { recursive: true });

  return files.slice(0, 10).map((file) => {
    const kind = assertAllowedMediaFile(file);
    const ext = safeMediaExt(file);
    const name = [
      String(uid || '0').replace(/[^\d]/g, '') || '0',
      now,
      crypto.randomBytes(6).toString('hex'),
    ].join('_') + ext;

    const abs = path.join(dir, name);
    fs.writeFileSync(abs, file.buffer);

    const rel = `${MEDIA_PUBLIC_PREFIX}/${day}/${name}`;
    const meta = {
      ok: true,
      url: rel,
      path: rel,
      name,
      filename: file.originalname || name,
      kind,
      type: kind,
      mimetype: file.mimetype || 'application/octet-stream',
      size: file.size || (file.buffer && file.buffer.length) || 0,
      created_at: now,
      createdAt: now,
      expires_at: expiresAt,
      expiresAt,
      ttl_ms: MEDIA_TTL_MS,
      ttlMs: MEDIA_TTL_MS,
    };

    try {
      fs.writeFileSync(abs + '.json', JSON.stringify(meta, null, 2), 'utf8');
    } catch (err) {
      console.warn('[wukong-chat] write media sidecar failed:', err.message);
    }

    return meta;
  });
}

function cleanupExpiredWukongMedia() {
  const now = Date.now();
  let checked = 0;
  let deleted = 0;

  function removePair(file) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        deleted += 1;
      }
    } catch (err) {
      console.warn('[wukong-chat] delete expired media failed:', file, err.message);
    }
  }

  if (!fs.existsSync(MEDIA_UPLOAD_DIR)) return { ok: true, checked, deleted, dir: MEDIA_UPLOAD_DIR };

  for (const day of fs.readdirSync(MEDIA_UPLOAD_DIR)) {
    const dir = path.join(MEDIA_UPLOAD_DIR, day);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;

    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith('.json')) continue;
      const metaPath = path.join(dir, entry);
      checked += 1;

      let meta = null;
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch (err) {
        continue;
      }

      const expiresAt = Number(meta && (meta.expires_at || meta.expiresAt || 0));
      if (!expiresAt || expiresAt > now) continue;

      const mediaPath = path.join(dir, entry.replace(/\.json$/, ''));
      removePair(mediaPath);
      removePair(metaPath);
    }

    try {
      if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);
    } catch (err) {}
  }

  return { ok: true, checked, deleted, dir: MEDIA_UPLOAD_DIR };
}

function getNextBeijingCleanupDelay(nowMs = Date.now()) {
  const offset = Number.isFinite(MEDIA_CLEANUP_TZ_OFFSET_MS) ? MEDIA_CLEANUP_TZ_OFFSET_MS : 8 * 60 * 60 * 1000;
  const hour = Math.max(0, Math.min(23, Number.isFinite(MEDIA_CLEANUP_HOUR) ? MEDIA_CLEANUP_HOUR : 2));
  const jitter = Math.max(0, Math.min(60 * 60 * 1000, Number.isFinite(MEDIA_CLEANUP_JITTER_MS) ? MEDIA_CLEANUP_JITTER_MS : 60 * 60 * 1000));

  // Convert current UTC timestamp to Beijing-local calendar by adding +08:00 offset.
  const bjNow = new Date(nowMs + offset);
  let targetUtcMs = Date.UTC(
    bjNow.getUTCFullYear(),
    bjNow.getUTCMonth(),
    bjNow.getUTCDate(),
    hour,
    0,
    0,
    0
  ) - offset;

  if (targetUtcMs <= nowMs) {
    targetUtcMs += 24 * 60 * 60 * 1000;
  }

  // Randomize inside 02:00-03:00 Beijing time by default.
  return Math.max(1000, targetUtcMs - nowMs + Math.floor(Math.random() * jitter));
}

function scheduleNextWukongMediaCleanup() {
  if (mediaCleanupTimer) clearTimeout(mediaCleanupTimer);

  const delay = getNextBeijingCleanupDelay();
  mediaCleanupTimer = setTimeout(() => {
    try {
      cleanupExpiredWukongMedia();
    } catch (err) {
      console.warn('[wukong-chat] media cleanup failed:', err.message);
    } finally {
      scheduleNextWukongMediaCleanup();
    }
  }, delay);

  if (typeof mediaCleanupTimer.unref === 'function') mediaCleanupTimer.unref();
}

function startWukongMediaCleanupTimer() {
  if (mediaCleanupTimer) return;

  if (MEDIA_CLEANUP_ON_START) {
    try {
      cleanupExpiredWukongMedia();
    } catch (err) {
      console.warn('[wukong-chat] initial media cleanup failed:', err.message);
    }
  }

  scheduleNextWukongMediaCleanup();
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


function sendPluginTemplate(res, filename) {
  const file = path.join(PLUGIN_ROOT, 'templates', filename);
  let html = '';
  try {
    html = fs.readFileSync(file, 'utf8');
  } catch (err) {
    console.warn('[wukong-chat] read template failed:', file, err.message);
    res.status(500).type('html').send('<!doctype html><meta charset="utf-8"><title>悟空</title><div>Template missing: ' + filename + '</div>');
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(html);
}

function registerPageRoutes(router, middleware) {
  async function renderWukongConversationsPage(req, res) {
    // Send the plugin template directly so this standalone page does not fail
    // with "Failed to lookup view" when NodeBB template compilation is stale.
    sendPluginTemplate(res, 'wukong-conversations.tpl');
  }

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
  router.get('/wukong/conversations', middleware.ensureLoggedIn, asyncHandler(renderWukongConversationsPage));
  router.get('/wukong/conversation', middleware.ensureLoggedIn, asyncHandler(renderWukongConversationsPage));
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
      media_ttl_ms: MEDIA_TTL_MS,
      topic_conversation_idle_delete_ms: TOPIC_CONVERSATION_IDLE_DELETE_MS,
      topic_conversation_delete_topic: TOPIC_CONVERSATION_DELETE_TOPIC,
      topic_conversation_delete_mode: TOPIC_CONVERSATION_DELETE_MODE,
      topic_public_cids: TOPIC_PUBLIC_CIDS,
      media_cleanup: {
        hour_beijing: MEDIA_CLEANUP_HOUR,
        jitter_ms: MEDIA_CLEANUP_JITTER_MS,
        on_start: MEDIA_CLEANUP_ON_START,
      },
    });
  });

  router.get('/cp-wukong-topic-chat/health', (req, res) => {
    res.json({
      ok: true,
      plugin: 'nodebb-plugin-wukong-chat',
      mergedModule: 'cp-wukong-topic-chat-core',
      enabled: parseBoolean(process.env.CP_WK_TOPIC_CHAT_ENABLED, true),
      categoryId: configuredTopicCategoryId(),
      apiBase: api,
      bridgeCompatibility: true,
      userBatchApi: true,
      userCacheTtlMs: USER_PROFILE_CACHE_TTL_MS,
      topicConversationIdleDeleteMs: TOPIC_CONVERSATION_IDLE_DELETE_MS,
      topicConversationIdleDeleteHours: TOPIC_CONVERSATION_IDLE_DELETE_MS / (60 * 60 * 1000),
    });
  });

  router.get(`${api}/page-check`, ensureLogin, asyncHandler(async (req, res) => {
    const current = await getCurrentUser(req);
    res.json({
      ok: true,
      uid: current && current.uid,
      pageRoutes: ['/wukong', '/wukong/conversations', '/wukong/conversation', '/wukong/:uid'],
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

  async function singleUserHandler(req, res) {
    const uid = String(req.params.uid || '').trim();
    if (!/^\d+$/.test(uid)) return res.status(400).json({ error: 'invalid_uid' });

    const u = await fetchNodeBBUserPublic(uid);
    if (!u) return res.status(404).json({ error: 'user_not_found' });

    res.setHeader('Cache-Control', 'private, max-age=60');
    res.json(u);
  }

  async function usersBatchHandler(req, res) {
    const uids = normalizeUidList(req.query.uids || req.query.uid || '', MAX_BATCH_USERS);
    const users = [];
    for (const uid of uids) {
      const u = await fetchNodeBBUserPublic(uid);
      if (u) users.push(u);
    }

    res.setHeader('Cache-Control', 'private, max-age=60');
    res.json({ users, cacheTtlMs: USER_PROFILE_CACHE_TTL_MS });
  }

  router.get(`${api}/user/:uid`, ensureLogin, asyncHandler(singleUserHandler));
  router.get(`${api}/users`, ensureLogin, asyncHandler(usersBatchHandler));

  // Compatibility aliases for the topic-page chat module and quick browser tests.
  router.get('/nodebb-user/:uid', ensureLogin, asyncHandler(singleUserHandler));
  router.get('/nodebb-users', ensureLogin, asyncHandler(usersBatchHandler));
  router.get('/bridge/nodebb-user/:uid', ensureLogin, asyncHandler(singleUserHandler));
  router.get('/bridge/nodebb-users', ensureLogin, asyncHandler(usersBatchHandler));

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


  router.post(`${api}/conversations/list`, ensureLogin, asyncHandler(async (req, res) => {
    const current = await getCurrentUser(req);
    if (!current) return res.status(401).json({ error: 'unauthorized' });

    let rawData = [];
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const payload = {
        uid: String(current.uid),
        version: clampInt(body.version, 0, 999999999, 0),
        msg_count: clampInt(body.msg_count || body.msgCount, 1, 100, 1),
      };
      rawData = await wkPostAny(['/conversation/sync', '/v1/conversation/sync'], payload, 5000, []);
    } catch (err) {
      console.warn('[wukong-chat] conversation list sync failed, using local cache:', err.message);
    }

    const data = await buildConversationListForUser(current, rawData);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(data);
  }));

  router.post(`${api}/conversations/upsert`, ensureLogin, asyncHandler(async (req, res) => {
    const current = await getCurrentUser(req);
    if (!current) return res.status(401).json({ error: 'unauthorized' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const room = normalizeConversationUpsertBody(body, current.uid);
    if (!room) return res.status(400).json({ error: 'invalid_conversation' });

    const saved = upsertConversationForUser(String(current.uid), room, current);
    res.json({ ok: true, room: saved });
  }));

  router.post(`${api}/conversations/read`, ensureLogin, asyncHandler(async (req, res) => {
    const current = await getCurrentUser(req);
    if (!current) return res.status(401).json({ error: 'unauthorized' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const channelId = String(firstNonEmpty(body.channel_id, body.channelId, '')).trim();
    if (!channelId) return res.status(400).json({ error: 'missing_channel_id' });

    const defaultType = channelId.startsWith(TOPIC_CHANNEL_PREFIX) ? TOPIC_CHANNEL_TYPE : 1;
    const channelType = normalizeChannelType(firstNonEmpty(body.channel_type, body.channelType, defaultType), defaultType);
    const room = markConversationRead(String(current.uid), channelId, channelType);

    res.json({ ok: true, room });
  }));




  router.post(`${api}/topics/create`, ensureLogin, asyncHandler(async (req, res) => {
    const current = await getCurrentUser(req);
    if (!current) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'not logged in' });
    if (!topics || typeof topics.post !== 'function') return res.status(500).json({ ok: false, error: 'topics_module_missing' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const cid = clampInt(body.cid || body.category_id || body.categoryId, 1, 999999, 7);
    const title = String(body.title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const content = String(body.content || body.body || title || '').trim() || title;
    const allowedTags = new Set(['学习', '交友', '闲谈', '工作', '游戏', '影视']);
    const rawTag = String(body.tag || body.room_tag || '').trim();
    const tag = allowedTags.has(rawTag) ? rawTag : '交友';
    const allowedLangs = new Set(['CN', 'EN', 'MY', 'VI', 'TH', 'JP', 'KR']);
    const rawLang = String(body.language || body.lang || body.room_lang || 'CN').trim().toUpperCase();
    const language = allowedLangs.has(rawLang) ? rawLang : 'CN';

    if (!title) return res.status(400).json({ ok: false, error: 'missing_title', message: 'missing title' });

    if (privileges && privileges.categories && typeof privileges.categories.can === 'function') {
      const canCreate = await privileges.categories.can('topics:create', cid, Number(current.uid));
      if (!canCreate) return res.status(403).json({ ok: false, error: 'no_privilege', message: 'no privilege to create topic' });
    }

    const result = await topics.post({
      uid: Number(current.uid),
      cid,
      title,
      content,
      tags: [tag],
      req,
    });

    const topicData = result && (result.topicData || result.topic || result);
    const tid = String(topicData && topicData.tid || '').trim();
    const slug = String(topicData && topicData.slug || '').trim();

    if (tid && db) {
      try {
        if (typeof db.setObjectFields === 'function') await db.setObjectFields(`topic:${tid}`, { wukong_tag: tag, wukong_lang: language });
        else if (typeof db.setObjectField === 'function') {
          await db.setObjectField(`topic:${tid}`, 'wukong_tag', tag);
          await db.setObjectField(`topic:${tid}`, 'wukong_lang', language);
        }
      } catch (err) {
        console.warn('[wukong-chat] save topic room meta failed:', tid, err.message);
      }
    }

    if (tid) {
      const store = readConversationState();
      const topic = await getTopicPublic(tid);
      if (topic) {
        const globalRooms = getConversationGlobalRooms(store);
        const key = conversationRoomKey(`${TOPIC_CHANNEL_PREFIX}${tid}`, TOPIC_CHANNEL_TYPE);
        globalRooms[key] = topicRoomFromPublicTopic(topic, globalRooms[key]);
        const creatorMember = compactPublicUser(current, current.uid);
        const creatorRecentMembers = mergeRecentRoomMembers(globalRooms[key].recent_members || globalRooms[key].active_members || [], creatorMember, Date.now());
        globalRooms[key].recent_members = creatorRecentMembers;
        globalRooms[key].active_members = creatorRecentMembers;
        globalRooms[key].recent_count = creatorRecentMembers.length;
        globalRooms[key].active_count = creatorRecentMembers.length;

        const userState = getConversationUserState(store, current.uid);
        userState.readAt[key] = Math.max(Number(userState.readAt[key] || 0), Number(globalRooms[key].ts || Date.now()));
        userState.readVersions[key] = Number(globalRooms[key].version || 0);
        userState.rooms[key] = { ...globalRooms[key], unread: 0, updated_at: Date.now() };
        userState.updatedAt = Date.now();
        writeConversationState(store);
      }
    }

    res.json({
      ok: true,
      tid,
      cid,
      slug,
      tag,
      language,
      url: tid ? (`/topic/${encodeURIComponent(tid)}${slug ? '/' + encodeURIComponent(slug) : ''}`) : '',
      topic: topicData || null,
    });
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
      limits: {
        fileSize: 80 * 1024 * 1024,
        files: 10,
      },
    }).any();

    upload(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          error: 'upload_parse_failed',
          message: err.message,
          code: err.code,
        });
      }
      next();
    });
  }, asyncHandler(async (req, res) => {
    const current = await getCurrentUser(req);
    if (!current) return res.status(401).json({ error: 'unauthorized' });

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ error: 'missing_file' });

    let saved;
    try {
      saved = saveWukongMediaFiles(files, current.uid);
    } catch (err) {
      return res.status(err.status || 500).json({
        error: err.message || 'upload_failed',
        detail: err.detail,
      });
    }

    const first = saved[0] || null;
    res.json({
      ok: true,
      ttl_ms: MEDIA_TTL_MS,
      ttlMs: MEDIA_TTL_MS,
      expires_at: first && first.expires_at,
      expiresAt: first && first.expiresAt,
      url: first && first.url,
      path: first && first.path,
      files: saved,
      uploads: saved,
      response: {
        images: saved,
        files: saved,
      },
    });
  }));

  router.post(`${api}/media-cleanup/run`, ensureLogin, asyncHandler(async (req, res) => {
    const result = cleanupExpiredWukongMedia();
    res.json(result);
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
    const endpoint = String(body.endpoint || process.env.CP_WK_AI_ENDPOINT || AI_PROXY_ENDPOINT || '').trim().replace(/\/+$/, '');
    const apiKey = String(body.apiKey || process.env.CP_WK_AI_API_KEY || AI_PROXY_API_KEY || '').trim();
    const model = String(body.model || process.env.CP_WK_AI_MODEL || AI_PROXY_MODEL || 'gpt-4o-mini').trim();
    const temperature = Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.3;
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
        body: JSON.stringify(buildAIRequestBody({ model, temperature, messages, endpoint })),
      },
      20000
    );

    if (r.status < 200 || r.status >= 300) {
      return res.status(502).json({ error: 'ai_upstream_failed', status: r.status, detail: r.data });
    }

    res.json(r.data);
  }));


  // Backward-compatible /bridge/* proxy. The old topic-page chat frontend used
  // /bridge routes; the merged Wukong backend owns /api/wukong/*. Keep this
  // lightweight rewrite so cached old clients and the next frontend merge keep working.
  router.use('/bridge', ensureLogin, (req, res, next) => {
    const originalUrl = req.url || '/';
    let target = originalUrl;

    if (/^\/nodebb-users(?:$|[/?])/.test(target)) {
      target = target.replace(/^\/nodebb-users/, '/users');
    } else if (/^\/nodebb-user\//.test(target)) {
      target = target.replace(/^\/nodebb-user\//, '/user/');
    }

    const savedUrl = req.url;
    req.url = `${api}${target}`;
    router.handle(req, res, (err) => {
      req.url = savedUrl;
      next(err);
    });
  });
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


plugin.getConfig = async function getConfig(config) {
  config = config || {};
  config.cpWukongTopicChat = Object.assign({}, config.cpWukongTopicChat || {}, {
    enabled: parseBoolean(process.env.CP_WK_TOPIC_CHAT_ENABLED, true),
    categoryId: configuredTopicCategoryId(),
    localeFallback: process.env.CP_WK_LOCALE_FALLBACK || 'en-GB',
    pluginId: 'nodebb-plugin-wukong-chat',
    apiBase: '/api/wukong',
    userBatchUrl: '/api/wukong/users',
    legacyUserBatchUrl: '/nodebb-users',
    userCacheTtlMs: USER_PROFILE_CACHE_TTL_MS,
    topicChannelPrefix: TOPIC_CHANNEL_PREFIX,
    topicChannelType: TOPIC_CHANNEL_TYPE,
    topicIdleDeleteMs: TOPIC_CONVERSATION_IDLE_DELETE_MS,
    topicIdleDeleteHours: TOPIC_CONVERSATION_IDLE_DELETE_MS / (60 * 60 * 1000),
    topicPhysicalDelete: TOPIC_CONVERSATION_DELETE_TOPIC,
    sdkUrl: '/plugins/nodebb-plugin-wukong-chat/static/vendor/wukongimjssdk.umd.js',
  });

  return config;
};

plugin.addNavigation = async function addNavigation(header) {
  header = header || [];
  header.push({
    route: '/wukong/conversations',
    title: '悟空会话',
    iconClass: 'fa-comments',
    text: '悟空会话',
  });
  return header;
};

plugin.init = async function init(params) {
  const { router, middleware } = params;

  console.log(`[wukong-chat] init start. wkHost=${WK_HOST} wkws=${WK_WS_PUBLIC_ADDR} syncUser=${SYNC_WUKONG_USER}`);

  registerPageRoutes(router, middleware);
  registerApiRoutes(router, middleware);
  startWukongMediaCleanupTimer();
  startTopicConversationCleanupTimer();

  console.log('[wukong-chat] routes registered: /wukong, /wukong/conversations, /wukong/conversation, /wukong/:uid, /api/wukong/healthz');
};

module.exports = plugin;
