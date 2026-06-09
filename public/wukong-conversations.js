/* Wukong independent conversation list v31 - low-pressure active room users + stable room cards */
(function () {
  "use strict";

  var D = document;
  var W = window;
  var root = null;
  var els = {};
  var cfg = {};
  var i18n = {};
  var ro = null;
  var sdkLoadPromise = null;
  var realtimeStarted = false;
  var booted = false;
  var cleanups = [];

  var state = {
    uid: "",
    token: "",
    addr: "",
    rooms: [],
    users: {},
    topics: {},
    tab: "direct",
    loading: false,
    error: false,
    sdkReady: false,
    raf: 0,
    menuRoom: null,
    hiddenRooms: {},
    pinnedRooms: {},
    remarks: {},
    renderSig: "",
    roomBgPreloaded: false,
    roomBgPreloads: [],
    composeSubmitting: false,
    touchX: 0,
    touchY: 0,
    edgeTouchX: 0,
    edgeTouchY: 0,
    drawerDragging: false,
    drawerStartX: 0,
    drawerCurrentX: 0,
    messageListener: null,
    conversationListener: null,
    connectListener: null,
    lastSyncAt: 0,
    notificationUnread: false,
    notificationCount: 0,
    notificationCheckInFlight: false,
    notificationTimer: 0,
    listSyncTimer: 0,
    notificationSeenIds: {},
    notificationSuppressUntil: 0,
    notifications: [],
    notificationsLoaded: false,
    notificationsLoading: false,
    notificationsError: "",
    eventSeen: {},
    visibleRooms: [],
    heightMap: {},
    virtual: {
      start: 0,
      end: 0,
      top: 0,
      bottom: 0,
      avg: 70
    }
  };

  if (W.WukongConversations && typeof W.WukongConversations.destroy === "function") {
    try { W.WukongConversations.destroy(); } catch (_) {}
  }

  function now() {
    return Date.now();
  }

  function rel() {
    return (W.config && W.config.relative_path) || "";
  }

  function c() {
    return Object.assign({
      apiBase: "/api/wukong",
      chatBase: "/wukong",
      topicBase: "/topic",
      wkSdkUrl: "/plugins/nodebb-plugin-wukong-chat/static/vendor/wukongimjssdk.umd.js?v=1",
      i18nBase: "/plugins/nodebb-plugin-wukong-chat/static/i18n",
      notificationUrl: "/notifications",
      notificationApi: "/api/notifications",
      maxNotifications: 80,
      maxConversations: 500,
      openTopicPage: true,
      virtualOverscan: 10,
      defaultRowHeight: 70,
      roomBgBase: "/plugins/nodebb-plugin-wukong-chat/static/images/rooms",
      roomBgCount: 20,
      preloadRoomBackgrounds: true,
      recentMembersTtlMs: 10 * 60 * 1000,
      composeTags: ["学习", "交友", "闲谈", "工作", "游戏", "影视"],
      composeLanguages: ["CN", "EN", "MY", "VI", "TH", "JP", "KR"],
      composeApi: "/api/wukong/topics/create",
      composeMode: "api",
      createTopicCid: 7,
      allowExternalNotificationUrls: false
    }, (W.NBBWukongConversations && W.NBBWukongConversations.config) || {});
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }

  function t(key, fallback) {
    return i18n[key] || fallback || key;
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function objectMap(value) {
    return isPlainObject(value) ? value : {};
  }

  function get(obj, keys, fallback) {
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var val = obj && obj[key];
      if (val === undefined || val === null) continue;
      if (typeof val === "object") continue;
      if (typeof val === "string" && val.trim() === "") continue;
      return val;
    }
    return fallback;
  }

  function numberFromAny(value) {
    if (typeof value === "number") return isFinite(value) && value > 0 ? value : 0;
    var s = String(value == null ? "" : value).trim();
    var m = s.match(/\d+/);
    if (!m) return 0;
    var n = Number(m[0]);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function withRelativePath(path) {
    path = String(path || "");
    var base = rel().replace(/\/+$/, "");
    if (!base) return path;
    if (path === base || path.indexOf(base + "/") === 0) return path;
    return base + (path.charAt(0) === "/" ? path : "/" + path);
  }

  function csrfToken() {
    try {
      return String(
        (W.config && (W.config.csrf_token || W.config.csrfToken)) ||
        (D.querySelector('meta[name="csrf-token"]') && D.querySelector('meta[name="csrf-token"]').getAttribute("content")) ||
        (D.querySelector('input[name="_csrf"]') && D.querySelector('input[name="_csrf"]').value) ||
        ""
      );
    } catch (_) {
      return "";
    }
  }

  function absoluteAppUrl(url, allowExternal) {
    var s = String(url || "").trim();
    if (!s) return "#";

    try {
      if (/^(?:https?:)?\/\//i.test(s)) {
        var u = new URL(s, location.href);
        if (!/^https?:$/.test(u.protocol)) return "#";
        if (u.origin !== location.origin && !allowExternal) return "#";
        if (u.origin === location.origin) return u.pathname + u.search + u.hash;
        return u.href;
      }
    } catch (_) {
      return "#";
    }

    if (s.charAt(0) !== "/") s = "/" + s;
    return withRelativePath(s);
  }

  function safeAssetUrl(url) {
    var s = String(url || "").trim();
    if (!s) return "";

    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(s)) return s;

    try {
      if (/^(?:https?:)?\/\//i.test(s)) {
        var u = new URL(s, location.href);
        return /^https?:$/.test(u.protocol) ? u.href : "";
      }
    } catch (_) {
      return "";
    }

    if (s.charAt(0) !== "/") s = "/" + s;
    return withRelativePath(s);
  }

  function safeColor(value, fallback) {
    var s = String(value || "").trim();
    fallback = fallback || "#dbeafe";
    if (
      /^#[0-9a-f]{3,8}$/i.test(s) ||
      /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(s) ||
      /^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(s) ||
      /^[a-z]+$/i.test(s)
    ) {
      return s;
    }
    return fallback;
  }

  function stripHtml(html) {
    var text = String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ");

    try {
      var ta = D.createElement("textarea");
      ta.innerHTML = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      text = ta.value || text;
    } catch (_) {}

    return text.replace(/\s+/g, " ").trim();
  }

  function hashString(input) {
    var s = String(input || "");
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return String(Math.abs(h));
  }

  function peerIdFromChannelId(channelId) {
    var s = String(channelId || "");
    if (!s) return "";
    var numeric = s.replace(/[^\d]/g, "");
    return numeric || s;
  }

  function directRoomId(room) {
    return String((room && (room.peer_uid || room.peerUid || room.uid || room.id || room.channel_id || room.channelId)) || "");
  }

  function listen(target, name, handler, options) {
    if (!target || !target.addEventListener) return;
    target.addEventListener(name, handler, options || false);
    cleanups.push(function () {
      try { target.removeEventListener(name, handler, options || false); } catch (_) {}
    });
  }

  function listenSocket(sock, name, handler) {
    if (!sock || typeof sock.on !== "function") return;
    sock.on(name, handler);
    cleanups.push(function () {
      try {
        if (typeof sock.off === "function") sock.off(name, handler);
        else if (typeof sock.removeListener === "function") sock.removeListener(name, handler);
      } catch (_) {}
    });
  }

  function disconnectResizeObserver() {
    if (ro) {
      try { ro.disconnect(); } catch (_) {}
      ro = null;
    }
  }

  function ensureViewport() {
    var meta = D.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = D.createElement("meta");
      meta.name = "viewport";
      D.head.appendChild(meta);
    }
    meta.content = "width=device-width, initial-scale=1.0, viewport-fit=cover";
  }

  function locale() {
    var raw = String(
      (W.app && W.app.user && (W.app.user.language || W.app.user.locale)) ||
      (navigator.languages && navigator.languages[0]) ||
      navigator.language ||
      "zh-CN"
    );
    if (/^(my|mm)/i.test(raw)) return "my";
    if (/^en/i.test(raw)) return "en-US";
    if (/^(vi|vn)/i.test(raw)) return "vi";
    if (/^th/i.test(raw)) return "th";
    if (/^(ja|jp)/i.test(raw)) return "jp";
    if (/^(ko|kr)/i.test(raw)) return "kr";
    return "zh-CN";
  }

  async function loadI18n() {
    var loc = locale();
    try {
      var base = String(cfg.i18nBase || "").replace(/\/+$/, "");
      var urls = [
        base + "/" + loc + ".json?v=29",
        base + "/wukong-conversations." + loc + ".json?v=29"
      ];
      for (var i = 0; i < urls.length; i++) {
        var res = await fetch(urls[i], {
          credentials: "same-origin",
          headers: { Accept: "application/json" }
        });
        if (!res.ok) continue;
        var data = await res.json();
        if (isPlainObject(data)) {
          i18n = data;
          return;
        }
      }
    } catch (_) {}
  }

  function storageKey() {
    return "nbb_wukong_conversations_v7:" + (state.uid || "0");
  }

  function oldStorageKey() {
    return "nbb_wukong_conversations_v6:" + (state.uid || "0");
  }

  function readStorageJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "{}");
    } catch (_) {
      return {};
    }
  }

  function loadLocal() {
    var data = readStorageJson(storageKey());
    if (!Object.keys(data).length) data = readStorageJson(oldStorageKey());

    state.hiddenRooms = objectMap(data.hiddenRooms);
    state.pinnedRooms = objectMap(data.pinnedRooms);
    state.remarks = objectMap(data.remarks);
    state.rooms = Array.isArray(data.rooms) ? data.rooms : [];
    state.users = objectMap(data.users);
    state.topics = objectMap(data.topics);
    state.heightMap = objectMap(data.heightMap);
  }

  function sortRoomsForStorage(rooms) {
    return (rooms || []).filter(function (room) {
      return !!(room && (room.channel_id || room.channelId || room.id));
    }).sort(function (a, b) {
      var pa = state.pinnedRooms[roomKey(a)] ? 1 : 0;
      var pb = state.pinnedRooms[roomKey(b)] ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return Number(b.ts || 0) - Number(a.ts || 0);
    });
  }

  function pruneRooms() {
    state.rooms = sortRoomsForStorage(state.rooms).slice(0, Number(cfg.maxConversations || 500));
  }

  function saveLocal() {
    try {
      pruneRooms();
      localStorage.setItem(storageKey(), JSON.stringify({
        hiddenRooms: state.hiddenRooms,
        pinnedRooms: state.pinnedRooms,
        remarks: state.remarks,
        rooms: state.rooms,
        users: state.users,
        topics: state.topics,
        heightMap: state.heightMap
      }));
    } catch (_) {}
  }

  function notificationSeenStorageKey() {
    return "nbb_wukong_notification_seen_v3:" + (state.uid || "0");
  }

  function oldNotificationSeenStorageKey() {
    return "nbb_wukong_notification_seen_v2:" + (state.uid || "0");
  }

  function loadNotificationSeen() {
    try {
      var data = readStorageJson(notificationSeenStorageKey());
      if (!Object.keys(data).length) data = readStorageJson(oldNotificationSeenStorageKey());
      state.notificationSeenIds = isPlainObject(data) ? data : {};
    } catch (_) {
      state.notificationSeenIds = {};
    }
  }

  function saveNotificationSeen() {
    try {
      var nowTs = now();
      var keys = Object.keys(state.notificationSeenIds || {});
      keys.forEach(function (id) {
        if (!state.notificationSeenIds[id] || nowTs - Number(state.notificationSeenIds[id]) > 30 * 24 * 3600 * 1000) {
          delete state.notificationSeenIds[id];
        }
      });
      keys = Object.keys(state.notificationSeenIds || {});
      if (keys.length > 600) {
        keys.sort(function (a, b) { return Number(state.notificationSeenIds[a] || 0) - Number(state.notificationSeenIds[b] || 0); });
        keys.slice(0, keys.length - 600).forEach(function (id) { delete state.notificationSeenIds[id]; });
      }
      localStorage.setItem(notificationSeenStorageKey(), JSON.stringify(state.notificationSeenIds || {}));
    } catch (_) {}
  }

  function isNotificationSeenId(id) {
    id = String(id || "");
    return !!(id && state.notificationSeenIds && state.notificationSeenIds[id]);
  }

  function markNotificationSeenId(id) {
    id = String(id || "");
    if (!id) return;
    if (!state.notificationSeenIds) state.notificationSeenIds = {};
    state.notificationSeenIds[id] = now();
  }

  function parseJsonMaybe(value) {
    if (value && typeof value === "object") return value;
    if (typeof value !== "string") return value;
    var s = value.trim();
    if (!s) return "";
    if (s.charAt(0) === "{" || s.charAt(0) === "[") {
      try { return JSON.parse(s); } catch (_) {}
    }
    try {
      if (/^[A-Za-z0-9+/=]+$/.test(s) && s.length > 8) {
        var decoded = decodeURIComponent(Array.prototype.map.call(atob(s), function (ch) {
          return "%" + ("00" + ch.charCodeAt(0).toString(16)).slice(-2);
        }).join(""));
        return JSON.parse(decoded);
      }
    } catch (_) {}
    return value;
  }

  function extractWkPayload(m) {
    try {
      if (!m) return {};
      if (m.payload) return parseJsonMaybe(m.payload) || {};
      if (m.content && typeof m.content === "object") return m.content;
      if (m.content) return parseJsonMaybe(m.content) || {};
    } catch (_) {}
    return {};
  }

  function textFromContentObject(content) {
    if (!content) return "";
    if (typeof content === "string") return content;
    return get(content, [
      "conversationDigest", "_conversationDigest", "text", "content", "body", "msg", "message", "title", "name"
    ], "");
  }

  var CALL_CONTROL_PREFIXES = ["__cp_harmony_call__:", "__wkcall__:", "__wkcall__："];
  var CALL_RECORD_PREFIXES = ["__cp_harmony_call_record__:", "__cp_harmony_call_record__："];

  function startsWithAnyPrefix(text, prefixes) {
    text = String(text || "").trim();
    for (var i = 0; i < prefixes.length; i++) {
      if (text.indexOf(prefixes[i]) === 0) return prefixes[i];
    }
    return "";
  }

  function parseJsonTextLoose(text) {
    text = String(text || "").trim();
    if (!text) return null;
    try { return JSON.parse(text); } catch (_) {}
    try { return JSON.parse(decodeURIComponent(text)); } catch (_) {}
    return null;
  }

  function formatCallDuration(sec) {
    sec = Math.max(0, Math.floor(Number(sec || 0) || 0));
    if (!sec) return "";
    if (sec < 60) return sec + "秒";
    var min = Math.floor(sec / 60);
    var rest = sec % 60;
    return min + "分" + (rest ? rest + "秒" : "");
  }

  function normalizeCallRecordObject(info) {
    if (!info || typeof info !== "object") return null;

    var hasCallMark =
      info.callId !== undefined || info.call_id !== undefined ||
      info.callKind !== undefined || info.call_kind !== undefined ||
      info.callMode !== undefined || info.call_mode !== undefined ||
      info.durationSec !== undefined || info.duration_sec !== undefined ||
      info.durationSeconds !== undefined ||
      info.kind === "completed" || info.kind === "canceled" || info.kind === "no_answer" ||
      info.kind === "rejected" || info.kind === "busy" || info.kind === "missed" || info.kind === "declined";

    if (!hasCallMark) return null;

    return {
      kind: String(info.callKind || info.call_kind || info.kind || info.status || ""),
      mode: String(info.callMode || info.call_mode || info.mode || info.media || "audio"),
      durationSec: Number(info.durationSec || info.duration_sec || info.durationSeconds || info.duration || 0) || 0
    };
  }

  function callRecordLabel(info) {
    info = normalizeCallRecordObject(info);
    if (!info) return "";

    var isVideo = /video|视频/i.test(info.mode);
    var base = isVideo ? "视频通话" : "语音通话";
    var dur = formatCallDuration(info.durationSec);

    switch (info.kind) {
      case "completed": return base + (dur ? " " + dur : "");
      case "canceled": return "已取消";
      case "no_answer": return "对方无应答";
      case "rejected": return "对方已拒绝";
      case "busy": return "对方忙线中";
      case "missed": return "未接听";
      case "declined": return "已拒绝";
      default: return base;
    }
  }

  function callRecordPreviewFromText(text) {
    var s = String(text || "").trim();
    var prefix = startsWithAnyPrefix(s, CALL_RECORD_PREFIXES);
    if (!prefix) return "";
    var payload = s.slice(prefix.length).trim();
    var obj = parseJsonTextLoose(payload);
    return callRecordLabel(obj) || "通话记录";
  }

  function callRecordPreviewFromAny(value) {
    if (!value) return "";
    if (typeof value === "string") return callRecordPreviewFromText(value);
    if (typeof value !== "object") return "";

    var direct = callRecordLabel(value);
    if (direct) return direct;

    var text = get(value, ["conversationDigest", "_conversationDigest", "text", "content", "body", "msg", "message"], "");
    return callRecordPreviewFromText(text);
  }

  function isCallSignalText(text) {
    text = String(text || "").trim();
    return !!startsWithAnyPrefix(text, CALL_CONTROL_PREFIXES);
  }

  function isCallControlPayload(value) {
    var raw = parseJsonMaybe(value);

    if (raw && typeof raw === "object") {
      var text = get(raw, ["conversationDigest", "_conversationDigest", "text", "content", "body", "msg", "message"], "");
      if (isCallSignalText(text)) return true;
      if (text && text !== raw) return isCallControlPayload(text);
      return false;
    }

    return isCallSignalText(raw);
  }

  function parsePayloadText(raw, fallbackType) {
    raw = parseJsonMaybe(raw);
    var callPreview = callRecordPreviewFromAny(raw);
    if (callPreview) return callPreview;

    if (raw && typeof raw === "object") {
      var type = get(raw, ["type", "content_type", "contentType"], fallbackType || "");
      var text = get(raw, ["conversationDigest", "_conversationDigest", "text", "content", "body", "msg", "message"], "");
      callPreview = callRecordPreviewFromText(text);
      if (callPreview) return callPreview;
      var url = get(raw, ["url", "remoteUrl", "remote_url", "path", "src"], "");
      if (String(type) === "1006" || raw.revoke || raw.recalled) return t("recalled", "此消息已被撤回");
      if (String(type).match(/image/i) || String(url).match(/\.(png|jpe?g|webp|gif)(\?|$)/i)) return t("image", "[图片]");
      if (String(type).match(/video/i) || String(url).match(/\.(mp4|webm|mov|m4v)(\?|$)/i)) return t("video", "[视频]");
      if (String(type).match(/voice|audio/i) || String(url).match(/\.(mp3|wav|ogg|aac|m4a)(\?|$)/i)) return t("voice", "[语音]");
      if (text) return String(text).replace(/\s+/g, " ").trim().slice(0, 180);
      return t("message", "[消息]");
    }

    var s = String(raw == null ? "" : raw).trim();
    callPreview = callRecordPreviewFromText(s);
    if (callPreview) return callPreview;
    if (isCallSignalText(s)) return "";
    if (!s) return "";
    if (/!\[[^\]]*\]\([^)]+\)/.test(s)) return t("image", "[图片]");
    if (/\[(?:视频|video)\]\([^)]+\)/i.test(s)) return t("video", "[视频]");
    if (/\[(?:语音消息|voice|audio)\]\([^)]+\)/i.test(s)) return t("voice", "[语音]");
    return s.replace(/\s+/g, " ").slice(0, 180);
  }

  function isBadPreviewText(text) {
    text = String(text || "").replace(/\s+/g, " ").trim();
    return isCallSignalText(text) || !text || text === t("roomLabel", "聊天室") || text === t("topic", "聊天室") || text === "聊天室";
  }

  function cleanPreviewText(text) {
    text = String(text || "").replace(/\s+/g, " ").trim();
    var callPreview = callRecordPreviewFromText(text);
    if (callPreview) return callPreview;
    return isBadPreviewText(text) ? "" : text;
  }

  async function fetchJson(url, opts) {
    opts = opts || {};
    var headers = Object.assign({ "Content-Type": "application/json", Accept: "application/json" }, opts.headers || {});
    var csrf = csrfToken();
    if (csrf && !headers["x-csrf-token"] && !headers["X-CSRF-Token"]) {
      headers["x-csrf-token"] = csrf;
    }

    var res = await fetch(url, Object.assign({
      credentials: "same-origin",
      headers: headers
    }, opts, { headers: headers }));
    var data = null;
    try { data = await res.json(); } catch (_) { data = {}; }
    if (!res.ok) {
      var err = new Error((data && (data.message || data.error)) || ("HTTP " + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function humanErrorMessage(err, fallback) {
    if (!err) return fallback || "error";
    var data = err.data || {};
    var value = (data && (data.message || data.error || data.reason)) || err.message || fallback || "error";
    if (value && typeof value === "object") {
      try { value = JSON.stringify(value); } catch (_) { value = fallback || "error"; }
    }
    return String(value || fallback || "error");
  }

  async function ensureToken() {
    if (state.uid && state.token) return;
    var data = await fetchJson(withRelativePath(cfg.apiBase) + "/token");
    state.uid = String(data.uid || data.wkUid || "");
    state.token = String(data.token || "");
    state.addr = String(data.addr || data.wsAddr || data.wkws || "");
    loadLocal();
    loadNotificationSeen();
  }

  function roomKey(room) {
    return String(room.channel_type || room.channelType || 1) + ":" + String(room.channel_id || room.channelId || room.id || "");
  }

  function mergeServerList(data) {
    data = data || {};
    if (data.users) {
      Object.keys(data.users).forEach(function (uid) {
        if (data.users[uid]) state.users[String(uid)] = data.users[uid];
      });
    }

    if (data.topics) {
      Object.keys(data.topics).forEach(function (tid) {
        if (!data.topics[tid]) return;
        state.topics[String(tid)] = data.topics[tid];

        if (data.topics[tid].poster && data.topics[tid].poster.uid) {
          state.users[String(data.topics[tid].poster.uid)] = data.topics[tid].poster;
        }

        ["members", "active_members", "activeMembers", "recent_members", "recentMembers"].forEach(function (field) {
          if (Array.isArray(data.topics[tid][field])) {
            data.topics[tid][field].forEach(function (u) {
              if (u && u.uid) state.users[String(u.uid)] = u;
            });
          }
        });
      });
    }

    var map = {};
    state.rooms.forEach(function (r) {
      if (r && (r.channel_id || r.channelId || r.id)) map[roomKey(r)] = r;
    });

    (data.removed_keys || data.removedKeys || []).forEach(function (key) {
      key = String(key || "");
      if (key) delete map[key];
    });

    if (Array.isArray(data.topic_room_keys) || Array.isArray(data.topicRoomKeys)) {
      var activeTopicKeys = {};
      (data.topic_room_keys || data.topicRoomKeys || []).forEach(function (key) {
        activeTopicKeys[String(key)] = 1;
      });

      Object.keys(map).forEach(function (key) {
        var r = map[key] || {};
        if ((r.is_topic || r.isTopic || Number(r.channel_type || r.channelType) === 2) && !activeTopicKeys[key]) {
          delete map[key];
        }
      });
    }

    (data.rooms || []).forEach(function (r) {
      if (!r) return;
      var key = roomKey(r);
      var old = map[key] || {};
      r.text = cleanPreviewText(r.text);

      if (!r.text && old.text && !isBadPreviewText(old.text)) r.text = old.text;
      if (!r.ts && old.ts) r.ts = old.ts;

      map[key] = Object.assign({}, old, r);
      map[key].text = cleanPreviewText(map[key].text);

      ["members", "active_members", "activeMembers", "recent_members", "recentMembers"].forEach(function (field) {
        if (Array.isArray(r[field])) {
          r[field].forEach(function (u) {
            if (u && u.uid) state.users[String(u.uid)] = u;
          });
        }
      });

      if (r.unread_abs) map[key].unread = Number(r.unread || 0);
    });

    state.rooms = sortRoomsForStorage(Object.keys(map).map(function (k) {
      return map[k];
    })).slice(0, cfg.maxConversations || 500);
  }

  async function syncList(reason) {
    if (state.loading) return;
    state.loading = true;
    setStatus(t("syncing", "同步中..."));

    try {
      await ensureToken();
      var data = await fetchJson(withRelativePath(cfg.apiBase) + "/conversations/list", {
        method: "POST",
        body: JSON.stringify({ version: 0, msg_count: 1, reason: reason || "" })
      });

      mergeServerList(data);
      state.error = false;
      state.lastSyncAt = now();
      setStatus(state.sdkReady ? t("connected", "已连接") : t("offline", "离线"));
      saveLocal();
      render();
    } catch (err) {
      state.error = true;
      setStatus(err && err.message ? err.message : "error");
      render();
    } finally {
      state.loading = false;
    }
  }

  function normalizeMessageToRoom(m) {
    var payloadObj = extractWkPayload(m);
    var channel = m && (m.channel || m.channelInfo || {});
    var channelId = typeof channel === "object" ? get(channel, ["channelID", "channelId", "channel_id", "id"], "") : channel;
    var channelType = Number(
      (typeof channel === "object" ? get(channel, ["channelType", "channel_type"], "") : "") ||
      get(m, ["channelType", "channel_type"], channelId && String(channelId).indexOf("nbb_topic_") === 0 ? 2 : 1)
    ) || 1;

    var fromUid = String(get(m, ["fromUID", "fromUid", "from_uid", "uid"], ""));
    var toUid = String(get(m, ["toUID", "toUid", "to_uid", "targetUid"], ""));
    var self = String(state.uid || "");
    var isTopic = channelType === 2 || String(channelId).indexOf("nbb_topic_") === 0;

    if (!isTopic && (!channelId || String(channelId) === self)) {
      channelId = fromUid === self ? toUid : fromUid;
    }

    if (!channelId) return null;

    var contentText =
      textFromContentObject(m && m.content) ||
      textFromContentObject(payloadObj) ||
      textFromContentObject(m && m.messageContent) ||
      textFromContentObject(m && m.payload);

    var rawPreviewSource = contentText || payloadObj || (m && m.payload) || "";
    if (isCallControlPayload(rawPreviewSource)) return null;

    var text = parsePayloadText(rawPreviewSource, m && m.contentType);
    if (isCallSignalText(text)) return null;

    var ts = Number(get(m, ["timestamp", "time", "createdAt"], 0));
    if (ts && ts < 10000000000) ts *= 1000;
    if (!ts) ts = now();

    var tid = isTopic ? String(channelId).replace("nbb_topic_", "").replace(/[^\d]/g, "") : "";
    var incoming = !!fromUid && fromUid !== self;

    return {
      key: String(channelType) + ":" + String(channelId),
      channel_id: String(channelId),
      channel_type: channelType,
      is_topic: isTopic,
      peer_uid: isTopic ? "" : peerIdFromChannelId(channelId),
      tid: tid,
      ts: ts,
      text: cleanPreviewText(text) || t("message", "[消息]"),
      unread: incoming ? 1 : 0,
      incoming: incoming,
      last_from_uid: fromUid || (incoming ? "" : self),
      last_from_name: incoming ? userName(fromUid) : "我",
      is_self: !incoming,
      event_id: String(get(m, ["messageID", "messageId", "clientMsgNo", "client_msg_no", "clientSeq", "client_seq", "messageSeq"], "")) || ""
    };
  }

  function normalizeConversationWrap(c) {
    if (!c) return null;

    var channel = c.channel || {};
    var channelId = get(channel, ["channelID", "channelId", "channel_id", "id"], "");
    if (!channelId) return null;

    var channelType = Number(
      get(channel, ["channelType", "channel_type"], String(channelId).indexOf("nbb_topic_") === 0 ? 2 : 1)
    ) || 1;

    var last = c.lastMessage || c.last_message || {};
    var payload = extractWkPayload(last);

    var text = parsePayloadText(
      textFromContentObject(last.content) ||
      textFromContentObject(payload) ||
      textFromContentObject(c.remoteExtra && c.remoteExtra.draft) ||
      payload,
      last.contentType
    );

    var ts = Number(c.timestamp || c.updatedAt || now());
    if (ts && ts < 10000000000) ts *= 1000;

    var isTopic = channelType === 2 || String(channelId).indexOf("nbb_topic_") === 0;
    var lastFromUid = String(get(last, ["fromUID", "fromUid", "from_uid"], ""));

    return {
      key: String(channelType) + ":" + String(channelId),
      channel_id: String(channelId),
      channel_type: channelType,
      is_topic: isTopic,
      peer_uid: isTopic ? "" : peerIdFromChannelId(channelId),
      tid: isTopic ? String(channelId).replace("nbb_topic_", "").replace(/[^\d]/g, "") : "",
      ts: ts || now(),
      text: cleanPreviewText(text) || "",
      unread: Number(c.unread || 0) || 0,
      unread_abs: true,
      event_id: String(get(last, ["messageID", "messageId", "clientMsgNo", "client_msg_no", "clientSeq", "client_seq", "messageSeq"], "")) || "",
      last_from_uid: lastFromUid,
      last_from_name: String(get(last, ["fromName", "from_name"], "")),
      is_self: lastFromUid === String(state.uid || "")
    };
  }

  function roomEventId(room) {
    if (!room) return "";
    return room.event_id ? String(room.event_id) : "";
  }

  function hasStableEventId(room) {
    return !!(room && room.event_id);
  }

  function rememberEvent(eventId) {
    if (!eventId) return false;
    var n = now();
    var existed = !!state.eventSeen[eventId];
    state.eventSeen[eventId] = n;
    Object.keys(state.eventSeen).forEach(function (k) {
      if (n - state.eventSeen[k] > 2 * 60 * 1000) delete state.eventSeen[k];
    });
    return existed;
  }

  function upsertLocalRoom(room, saveRemote) {
    if (!room || !room.channel_id) return;

    var key = roomKey(room);
    var old = null;

    for (var i = 0; i < state.rooms.length; i++) {
      if (roomKey(state.rooms[i]) === key) {
        old = state.rooms[i];
        break;
      }
    }

    var eventId = roomEventId(room);
    var duplicate = hasStableEventId(room) ? rememberEvent(eventId) : false;
    var isSelf = !!room.is_self || (!!room.last_from_uid && String(room.last_from_uid) === String(state.uid || ""));
    var nextUnread = old ? Number(old.unread || 0) : 0;

    if (isSelf) {
      nextUnread = 0;
    } else if (room.unread_abs) {
      nextUnread = Number(room.unread || 0);
    } else if (room.incoming && Number(room.unread || 0) > 0 && !duplicate) {
      nextUnread += Number(room.unread || 0);
    }

    if (old) {
      old.ts = room.ts || old.ts || now();
      room.text = cleanPreviewText(room.text);
      if (room.text) old.text = room.text;
      if (room.last_from_uid) old.last_from_uid = room.last_from_uid;
      if (room.last_from_name) old.last_from_name = room.last_from_name;
      old.unread = Math.max(0, nextUnread);
      if (room.participant_uids) old.participant_uids = room.participant_uids;
    } else {
      state.rooms.unshift(Object.assign({}, room, { unread: Math.max(0, nextUnread) }));
    }

    pruneRooms();
    saveLocal();
    render();

    if (saveRemote && !duplicate) {
      fetchJson(withRelativePath(cfg.apiBase) + "/conversations/upsert", {
        method: "POST",
        body: JSON.stringify({
          channel_id: room.channel_id,
          channel_type: room.channel_type,
          ts: room.ts,
          text: room.text,
          incoming: room.incoming,
          is_self: !!isSelf,
          unread: room.unread_abs ? Number(room.unread || 0) : undefined,
          unread_abs: !!room.unread_abs,
          event_id: eventId,
          last_from_uid: room.last_from_uid || "",
          last_from_name: room.last_from_name || ""
        })
      }).catch(function () {});
    }
  }

  function markReadLocal(room) {
    if (!room) return;

    var key = roomKey(room);
    for (var i = 0; i < state.rooms.length; i++) {
      if (roomKey(state.rooms[i]) === key) state.rooms[i].unread = 0;
    }

    saveLocal();
    render();
  }

  async function markReadRemote(room) {
    if (!room) return;

    try {
      await fetchJson(withRelativePath(cfg.apiBase) + "/conversations/read", {
        method: "POST",
        body: JSON.stringify({
          channel_id: room.channel_id,
          channel_type: room.channel_type
        })
      });
    } catch (_) {}
  }

  async function markRead(room) {
    markReadLocal(room);
    await markReadRemote(room);
  }

  function sdkShared() {
    try {
      if (W.wk && W.wk.WKSDK && typeof W.wk.WKSDK.shared === "function") return W.wk.WKSDK.shared();
      if (W.WKSDK && typeof W.WKSDK.shared === "function") return W.WKSDK.shared();
    } catch (_) {}
    return null;
  }

  async function loadSdk() {
    if (sdkShared()) return true;
    if (sdkLoadPromise) return sdkLoadPromise;

    sdkLoadPromise = new Promise(function (resolve) {
      var settled = false;

      function finish(ok) {
        if (settled) return;
        settled = true;
        if (!ok) sdkLoadPromise = null;
        resolve(!!ok);
      }

      var existing = D.getElementById("wkconv-sdk");
      if (existing) {
        existing.addEventListener("load", function () {
          existing.setAttribute("data-loaded", "1");
          finish(!!sdkShared());
        }, { once: true });
        existing.addEventListener("error", function () { finish(false); }, { once: true });
        W.setTimeout(function () { finish(!!sdkShared()); }, 8000);
        return;
      }

      var s = D.createElement("script");
      s.id = "wkconv-sdk";
      s.async = true;
      s.src = cfg.wkSdkUrl;
      s.onload = function () {
        s.setAttribute("data-loaded", "1");
        finish(!!sdkShared());
      };
      s.onerror = function () { finish(false); };
      (D.head || D.documentElement).appendChild(s);
    });

    return sdkLoadPromise;
  }

  async function startRealtime() {
    if (realtimeStarted) return;
    realtimeStarted = true;

    try {
      await ensureToken();
      var loaded = await loadSdk();
      if (!loaded) {
        realtimeStarted = false;
        return;
      }

      var sdk = sdkShared();
      if (!sdk || !sdk.config) {
        realtimeStarted = false;
        return;
      }

      sdk.config.uid = state.uid;
      sdk.config.token = state.token;
      sdk.config.addr = state.addr || cfg.wsAddr || "";

      if (sdk.chatManager && typeof sdk.chatManager.addMessageListener === "function") {
        state.messageListener = function (m) {
          var room = normalizeMessageToRoom(m);
          if (room) upsertLocalRoom(room, true);
        };
        sdk.chatManager.addMessageListener(state.messageListener);
      }

      if (W.wk && W.wk.ConversationManager && W.wk.ConversationManager.shared) {
        try {
          var cm = W.wk.ConversationManager.shared();
          state.conversationListener = function (conversation) {
            var room = normalizeConversationWrap(conversation);
            if (room) upsertLocalRoom(room, false);
          };
          if (cm && typeof cm.addConversationListener === "function") {
            cm.addConversationListener(state.conversationListener);
          }
        } catch (_) {}
      }

      if (sdk.connectManager && typeof sdk.connectManager.addConnectStatusListener === "function") {
        state.connectListener = function (status) {
          var st = String(status && (status.status || status.value || status) || "").toLowerCase();
          state.sdkReady = status === 1 || status === "1" || st === "connected" || st === "connect" || st === "online";
          setStatus(state.sdkReady ? t("connected", "已连接") : t("connecting", "连接中"));
          if (state.sdkReady && now() - state.lastSyncAt > 3000) syncList("connect");
        };
        sdk.connectManager.addConnectStatusListener(state.connectListener);
      }

      if (sdk.connectManager && typeof sdk.connectManager.connect === "function") {
        sdk.connectManager.connect();
      }
    } catch (_) {
      realtimeStarted = false;
    }
  }

  function topicTid(room) {
    return String((room && (room.tid || room.channel_id)) || "").replace("nbb_topic_", "").replace(/[^\d]/g, "");
  }

  function flagEmoji(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    if (/[\u{1F1E6}-\u{1F1FF}]/u.test(raw)) return raw;
    var s = raw.toLowerCase();
    var map = {
      cn: "🇨🇳", china: "🇨🇳", "中国": "🇨🇳", chinese: "🇨🇳", zh: "🇨🇳",
      mm: "🇲🇲", my: "🇲🇲", burma: "🇲🇲", myanmar: "🇲🇲", "缅甸": "🇲🇲",
      us: "🇺🇸", usa: "🇺🇸", america: "🇺🇸", "美国": "🇺🇸", en: "🇺🇸",
      jp: "🇯🇵", japan: "🇯🇵", "日本": "🇯🇵",
      kr: "🇰🇷", korea: "🇰🇷", "韩国": "🇰🇷",
      th: "🇹🇭", thailand: "🇹🇭", "泰国": "🇹🇭",
      vn: "🇻🇳", vietnam: "🇻🇳", "越南": "🇻🇳",
      la: "🇱🇦", laos: "🇱🇦", "老挝": "🇱🇦",
      kh: "🇰🇭", cambodia: "🇰🇭", "柬埔寨": "🇰🇭",
      id: "🇮🇩", indonesia: "🇮🇩", "印尼": "🇮🇩",
      ph: "🇵🇭", philippines: "🇵🇭", "菲律宾": "🇵🇭",
      in: "🇮🇳", india: "🇮🇳", "印度": "🇮🇳"
    };
    if (map[s]) return map[s];
    if (/^[a-z]{2}$/.test(s)) {
      return String.fromCodePoint(s.toUpperCase().charCodeAt(0) - 65 + 0x1F1E6, s.toUpperCase().charCodeAt(1) - 65 + 0x1F1E6);
    }
    return "";
  }

  function userFlag(u) {
    return flagEmoji(u && (u.language_flag || u.country || u.nationality || u.locationCountry || u.location || u.language));
  }

  function isOnlineUser(u) {
    if (!u) return false;
    var st = String(u.status || u.presence || u.onlineStatus || "").toLowerCase();
    return u.online === true || u.isOnline === true || st === "online";
  }

  function userName(uid) {
    uid = String(uid || "");
    var u = state.users[uid];
    return (state.remarks[uid] || (u && (u.displayname || u.username || u.userslug)) || (uid ? ("User-" + uid) : t("unknownUser", "未知用户")));
  }

  function avatarHtmlForUser(u, fallbackText) {
    var picture = safeAssetUrl(u && u.picture);
    if (picture) return '<img src="' + esc(picture) + '" alt="">';

    var txt = String((u && (u.icontext || u.username)) || fallbackText || "我").charAt(0).toUpperCase();
    var bg = safeColor(u && u.iconbgColor, "#dbeafe");
    return '<span style="background:' + esc(bg) + ';display:grid;place-items:center;">' + esc(txt) + '</span>';
  }



  function pad2(n) {
    n = Number(n || 0) || 0;
    return n < 10 ? "0" + n : String(n);
  }

  function stableNumber(input) {
    var s = String(input || "");
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  function topicBackgroundUrl(room) {
    var count = Math.max(1, Number(cfg.roomBgCount || 20) || 20);
    var seed = topicTid(room) || (room && (room.channel_id || room.channelId || room.id)) || roomKey(room);
    var index = stableNumber(seed) % count + 1;
    var base = String(cfg.roomBgBase || "/plugins/nodebb-plugin-wukong-chat/static/images/rooms").replace(/\/+$/, "");
    return safeAssetUrl(base + "/room-" + pad2(index) + ".webp");
  }

  function topicData(room) {
    return state.topics[topicTid(room)] || {};
  }

  function userListFrom(value) {
    return Array.isArray(value) ? value : [];
  }

  function freshRecentUserList(value) {
    var ttl = Number(cfg.recentMembersTtlMs || 0) || 0;
    var n = now();
    return userListFrom(value).filter(function (u) {
      if (!ttl || !u || typeof u !== "object") return true;
      var ts = Number(u.active_at || u.activeAt || u.ts || u.updated_at || u.updatedAt || 0) || 0;
      return !ts || n - ts <= ttl;
    });
  }

  function firstUserList() {
    for (var i = 0; i < arguments.length; i++) {
      var list = userListFrom(arguments[i]);
      if (list.length) return list;
    }
    return [];
  }

  function topicRecentMembers(room) {
    var topic = topicData(room);
    return firstUserList(
      freshRecentUserList(room && room.active_members),
      freshRecentUserList(room && room.activeMembers),
      freshRecentUserList(room && room.recent_members),
      freshRecentUserList(room && room.recentMembers),
      freshRecentUserList(topic && topic.active_members),
      freshRecentUserList(topic && topic.activeMembers),
      freshRecentUserList(topic && topic.recent_members),
      freshRecentUserList(topic && topic.recentMembers)
    );
  }

  function publicUserId(u) {
    if (!u) return "";
    return String(u.uid || u.userId || u.id || "").trim();
  }

  function userListSig(list) {
    return userListFrom(list).map(function (u) {
      if (!u) return "";
      if (typeof u !== "object") return String(u);
      return [publicUserId(u), u.username || "", u.displayname || "", u.picture || "", u.active_at || u.activeAt || ""].join("/");
    }).filter(Boolean).join(",");
  }

  function topicMemberSignature(room) {
    var topic = topicData(room);
    return [
      userListSig(topicRecentMembers(room)),
      userListSig(topic && topic.members),
      userListSig(room && room.members),
      userListSig(room && room.participant_uids),
      userListSig(room && room.member_uids)
    ].join("|");
  }

  function preloadRoomBackgrounds() {
    if (state.roomBgPreloaded || cfg.preloadRoomBackgrounds === false) return;
    state.roomBgPreloaded = true;

    var count = Math.max(1, Number(cfg.roomBgCount || 20) || 20);
    var base = String(cfg.roomBgBase || "/plugins/nodebb-plugin-wukong-chat/static/images/rooms").replace(/\/+$/, "");
    state.roomBgPreloads = [];

    for (var i = 1; i <= count; i++) {
      var src = safeAssetUrl(base + "/room-" + pad2(i) + ".webp");
      if (!src) continue;
      try {
        var img = new Image();
        img.decoding = "async";
        img.loading = "eager";
        img.src = src;
        state.roomBgPreloads.push(img);
      } catch (_) {}
    }
  }


  function topicTag(room) {
    var topic = topicData(room);
    var value = get(topic, ["wukong_tag", "wukongTag", "room_tag", "roomTag", "tag", "categoryTag"], "");
    if (!value && Array.isArray(topic.tags) && topic.tags.length) {
      var first = topic.tags[0];
      value = typeof first === "string" ? first : get(first, ["value", "name", "tag"], "");
    }
    return String(value || "").trim();
  }

  function topicLanguage(room) {
    var topic = topicData(room);
    var value = get(topic, ["wukong_lang", "wukongLang", "room_lang", "roomLang", "language", "lang"], "");
    return String(value || "").trim().toUpperCase();
  }

  function langLabel(value) {
    var s = String(value || "").trim().toUpperCase();
    var map = {
      CN: "CN", ZH: "CN", "ZH-CN": "CN", 中文: "CN",
      EN: "EN", MY: "MY", MM: "MY", VI: "VI", VN: "VI", TH: "TH", JP: "JP", JA: "JP", KR: "KR", KO: "KR"
    };
    return map[s] || s;
  }

  function uiLocaleKey() {
    var raw = String(locale() || "zh-CN").toLowerCase();
    if (/^en/.test(raw)) return "en";
    if (/^(my|mm)/.test(raw)) return "my";
    if (/^(vi|vn)/.test(raw)) return "vi";
    if (/^th/.test(raw)) return "th";
    if (/^(ja|jp)/.test(raw)) return "jp";
    if (/^(ko|kr)/.test(raw)) return "kr";
    return "zh";
  }

  var WKCONV_UI = {
    zh: {
      composeTitle: "发布聊天室话题", titlePlaceholder: "话题标题", contentPlaceholder: "说点什么，可留空",
      tagLabel: "标签", langLabel: "聊天室语言", cancel: "取消", publish: "发布", posting: "发布中...",
      tags: { "学习": "学习", "交友": "交友", "闲谈": "闲谈", "工作": "工作", "游戏": "游戏", "影视": "影视" },
      langs: { CN: "中文", EN: "英语", MY: "缅语", VI: "越南语", TH: "泰语", JP: "日语", KR: "韩语" }
    },
    en: {
      composeTitle: "Create room topic", titlePlaceholder: "Topic title", contentPlaceholder: "Say something, optional",
      tagLabel: "Tag", langLabel: "Room language", cancel: "Cancel", publish: "Post", posting: "Posting...",
      tags: { "学习": "Study", "交友": "Friends", "闲谈": "Chat", "工作": "Work", "游戏": "Games", "影视": "Movies" },
      langs: { CN: "Chinese", EN: "English", MY: "Burmese", VI: "Vietnamese", TH: "Thai", JP: "Japanese", KR: "Korean" }
    },
    my: {
      composeTitle: "စကားဝိုင်းခေါင်းစဉ် တင်ရန်", titlePlaceholder: "ခေါင်းစဉ်", contentPlaceholder: "ပြောချင်တာ ရေးပါ၊ မရေးလည်းရသည်",
      tagLabel: "အမျိုးအစား", langLabel: "စကားဝိုင်းဘာသာစကား", cancel: "မလုပ်တော့", publish: "တင်မယ်", posting: "တင်နေသည်...",
      tags: { "学习": "လေ့လာ", "交友": "မိတ်ဆွေ", "闲谈": "စကားပြော", "工作": "အလုပ်", "游戏": "ဂိမ်း", "影视": "ရုပ်ရှင်" },
      langs: { CN: "တရုတ်", EN: "အင်္ဂလိပ်", MY: "မြန်မာ", VI: "ဗီယက်နမ်", TH: "ထိုင်း", JP: "ဂျပန်", KR: "ကိုရီးယား" }
    },
    vi: {
      composeTitle: "Đăng chủ đề phòng chat", titlePlaceholder: "Tiêu đề", contentPlaceholder: "Viết gì đó, có thể để trống",
      tagLabel: "Nhãn", langLabel: "Ngôn ngữ phòng", cancel: "Hủy", publish: "Đăng", posting: "Đang đăng...",
      tags: { "学习": "Học tập", "交友": "Kết bạn", "闲谈": "Trò chuyện", "工作": "Công việc", "游戏": "Game", "影视": "Phim" },
      langs: { CN: "Trung", EN: "Anh", MY: "Myanmar", VI: "Việt", TH: "Thái", JP: "Nhật", KR: "Hàn" }
    },
    th: {
      composeTitle: "สร้างหัวข้อห้องแชต", titlePlaceholder: "ชื่อหัวข้อ", contentPlaceholder: "เขียนอะไรสักอย่าง หรือเว้นว่างได้",
      tagLabel: "แท็ก", langLabel: "ภาษาห้อง", cancel: "ยกเลิก", publish: "โพสต์", posting: "กำลังโพสต์...",
      tags: { "学习": "เรียน", "交友": "เพื่อน", "闲谈": "คุยเล่น", "工作": "งาน", "游戏": "เกม", "影视": "หนัง" },
      langs: { CN: "จีน", EN: "อังกฤษ", MY: "พม่า", VI: "เวียดนาม", TH: "ไทย", JP: "ญี่ปุ่น", KR: "เกาหลี" }
    },
    jp: {
      composeTitle: "チャットルーム投稿", titlePlaceholder: "タイトル", contentPlaceholder: "内容は任意です",
      tagLabel: "タグ", langLabel: "ルーム言語", cancel: "取消", publish: "投稿", posting: "投稿中...",
      tags: { "学习": "学習", "交友": "友達", "闲谈": "雑談", "工作": "仕事", "游戏": "ゲーム", "影视": "映像" },
      langs: { CN: "中国語", EN: "英語", MY: "ミャンマー語", VI: "ベトナム語", TH: "タイ語", JP: "日本語", KR: "韓国語" }
    },
    kr: {
      composeTitle: "채팅방 주제 올리기", titlePlaceholder: "제목", contentPlaceholder: "내용은 비워도 됩니다",
      tagLabel: "태그", langLabel: "채팅방 언어", cancel: "취소", publish: "등록", posting: "등록 중...",
      tags: { "学习": "학습", "交友": "친구", "闲谈": "잡담", "工作": "업무", "游戏": "게임", "影视": "영상" },
      langs: { CN: "중국어", EN: "영어", MY: "미얀마어", VI: "베트남어", TH: "태국어", JP: "일본어", KR: "한국어" }
    }
  };

  function i18nObject(key) {
    var obj = i18n && i18n[key];
    return isPlainObject(obj) ? obj : {};
  }

  function uiText(key, fallback) {
    var i18nKey = "wkconv_" + key;
    var fromFile = i18n && i18n[i18nKey];
    if (fromFile !== undefined && fromFile !== null && String(fromFile).trim() !== "") return String(fromFile);
    var pack = WKCONV_UI[uiLocaleKey()] || WKCONV_UI.zh;
    return (pack && pack[key]) || (WKCONV_UI.zh && WKCONV_UI.zh[key]) || fallback || key;
  }

  function tagLabel(value) {
    value = String(value || "").trim();
    var tagMap = i18nObject("wkconv_tags");
    if (tagMap[value]) return String(tagMap[value]);
    var pack = WKCONV_UI[uiLocaleKey()] || WKCONV_UI.zh;
    return (pack.tags && pack.tags[value]) || (WKCONV_UI.zh.tags && WKCONV_UI.zh.tags[value]) || value;
  }

  function roomLangLabel(value) {
    var code = langLabel(value);
    var langMap = i18nObject("wkconv_languages");
    if (langMap[code]) return String(langMap[code]);
    var pack = WKCONV_UI[uiLocaleKey()] || WKCONV_UI.zh;
    return (pack.langs && pack.langs[code]) || (WKCONV_UI.zh.langs && WKCONV_UI.zh.langs[code]) || code;
  }

  function roomChipHtml(room) {
    var lang = langLabel(topicLanguage(room));
    var tag = topicTag(room);
    var html = "";
    if (lang) html += '<span class="wkconv-room-chip wkconv-room-lang">' + esc(roomLangLabel(lang)) + '</span>';
    if (tag) html += '<span class="wkconv-room-chip wkconv-room-tag"># ' + esc(tagLabel(tag)) + '</span>';
    return html ? '<div class="wkconv-room-chips">' + html + '</div>' : '';
  }

  function topicMemberResult(room) {
    var topic = topicData(room);
    var posterUid = String(topic && topic.poster && topic.poster.uid || "");
    var raw = topicRecentMembers(room);
    var isRecent = raw.length > 0;

    if (!raw.length && Array.isArray(topic.members)) raw = topic.members;
    else if (!raw.length && Array.isArray(room && room.members)) raw = room.members;
    else if (!raw.length && Array.isArray(room && room.participant_uids)) {
      raw = room.participant_uids.map(function (uid) {
        return state.users[String(uid)] || { uid: uid };
      });
    } else if (!raw.length && Array.isArray(room && room.member_uids)) {
      raw = room.member_uids.map(function (uid) {
        return state.users[String(uid)] || { uid: uid };
      });
    }

    var seen = {};
    var list = [];

    raw.forEach(function (u) {
      if (!u) return;
      if (typeof u !== "object") u = state.users[String(u)] || { uid: u };
      var uid = publicUserId(u);
      if (uid && uid === posterUid) return;
      var key = uid || String(u.username || u.userslug || u.displayname || "");
      if (!key || seen[key]) return;
      seen[key] = 1;
      list.push(u);
    });

    var explicitTotal = Number(
      (isRecent && (room.active_count || room.activeCount || room.recent_count || room.recentCount || topic.active_count || topic.activeCount || topic.recent_count || topic.recentCount)) ||
      topic.member_count || topic.memberCount || topic.membersCount || topic.members_count || 0
    ) || 0;
    var shown = Math.min(list.length, 5);
    var total = explicitTotal > 0 ? Math.max(list.length, explicitTotal - (!isRecent && posterUid ? 1 : 0)) : list.length;
    var overflow = Math.max(0, total - shown);

    return { list: list.slice(0, 5), total: total, overflow: overflow, recent: isRecent };
  }

  function avatarFlagBadge(u) {
    var flag = userFlag(u);
    return flag ? '<span class="wkconv-avatar-flag-badge" aria-hidden="true">' + esc(flag) + '</span>' : '';
  }

  function flaggedPosterAvatarHtml(u, fallbackText) {
    return '<span class="wkconv-avatar-flag-wrap wkconv-avatar-flag-wrap-poster"><span class="wkconv-avatar-photo">' + avatarHtmlForUser(u, fallbackText) + '</span>' + avatarFlagBadge(u) + '</span>';
  }

  function flaggedMemberAvatarHtml(u, fallbackText) {
    return '<span class="wkconv-avatar-flag-wrap wkconv-avatar-flag-wrap-member"><span class="wkconv-avatar-photo">' + avatarHtmlForUser(u, fallbackText) + '</span>' + avatarFlagBadge(u) + '</span>';
  }

  function roomPublishedTs(room) {
    var topic = topicData(room);
    var ts = Number(
      topic.timestamp || topic.lastposttime || topic.posttime || topic.create_time || topic.createdAt || topic.created_at || room.ts || 0
    );
    if (ts && ts < 10000000000) ts *= 1000;
    return ts || Number(room.ts || 0) || now();
  }

  function topicMembersHtml(room) {
    var result = topicMemberResult(room);
    var html = result.list.map(function (u) {
      var name = u && (u.displayname || u.username || u.userslug || "成员");
      return '<span class="wkconv-room-member-avatar" title="' + esc(name) + '">' + flaggedMemberAvatarHtml(u, name) + '</span>';
    }).join("");

    if (result.overflow > 0) {
      html += '<span class="wkconv-room-member-more">+' + esc(result.overflow > 99 ? "99" : result.overflow) + '</span>';
    }

    if (html && result.recent) {
      return '<span class="wkconv-room-members-active" aria-label="最近活跃">' + html + '</span>';
    }

    return html || '';
  }

  function originalTopicTitle(room) {
    return roomName(room);
  }

  function roomCardHtml(room, key, pinned, unread) {
    var poster = topicPoster(room) || {};
    var posterName = topicPosterName(room) || poster.displayname || poster.username || poster.userslug || t("unknownUser", "未知用户");
    var title = originalTopicTitle(room);
    var bg = topicBackgroundUrl(room);
    var membersHtml = topicMembersHtml(room);
    var unreadText = unread > 99 ? "99+" : String(unread || "");
    var notice = unread ? cleanPreviewText(previewText(room)) : "";

    return '<div class="wkconv-item is-topic wkconv-room-card' +
      (pinned ? " is-pinned" : "") +
      (unread ? " has-unread" : "") +
      '" data-key="' + esc(key) + '" role="button" tabindex="0">' +
        '<div class="wkconv-room-bg" style="--wk-room-bg:url(&quot;' + esc(bg) + '&quot;)"></div>' +
        '<div class="wkconv-room-frost"></div>' +
        (unread ? '<span class="wkconv-room-unread" aria-label="未读消息">' + esc(unreadText) + '</span>' : '') +
        '<div class="wkconv-room-content">' +
          roomChipHtml(room) +
          '<div class="wkconv-room-title-row">' +
            '<div class="wkconv-room-title">' + esc(title) + '</div>' +
          '</div>' +
          (notice ? '<div class="wkconv-room-new">' + esc(notice) + '</div>' : '') +
          '<div class="wkconv-room-people-row">' +
            '<div class="wkconv-room-poster-avatar" title="' + esc(posterName) + '">' + flaggedPosterAvatarHtml(poster, posterName) + '</div>' +
            '<div class="wkconv-room-members" aria-label="成员头像">' + membersHtml + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }


  function composeOptionLabel(item, attr) {
    if (attr === "compose-tag") return tagLabel(item);
    if (attr === "compose-lang") return roomLangLabel(item);
    return String(item || "");
  }

  function composeOptionsHtml(items, attr, defaultValue) {
    items = Array.isArray(items) ? items : [];
    return items.map(function (item, idx) {
      item = String(item || "").trim();
      if (!item) return "";
      var active = item === defaultValue || (!defaultValue && idx === 0);
      return '<button class="wkconv-compose-pill' + (active ? ' is-active' : '') + '" type="button" data-' + attr + '="' + esc(item) + '">' + esc(composeOptionLabel(item, attr)) + '</button>';
    }).join("");
  }

  function selectedComposeValue(selector, dataAttr, fallback) {
    var el = els.composeMask && els.composeMask.querySelector(selector + ' .wkconv-compose-pill.is-active');
    return String((el && el.getAttribute(dataAttr)) || fallback || "").trim();
  }

  function openCompose() {
    if (!els.composeMask) return;
    if (state.tab !== "rooms") setTab("rooms");
    els.composeError.textContent = "";
    els.composeTitle.value = "";
    if (els.composeContent) els.composeContent.value = "";
    if (els.composeTags) els.composeTags.innerHTML = composeOptionsHtml(cfg.composeTags, "compose-tag", "交友");
    if (els.composeLangs) els.composeLangs.innerHTML = composeOptionsHtml(cfg.composeLanguages, "compose-lang", "CN");
    els.composeMask.setAttribute("data-open", "1");
    setBlur(true);
    W.setTimeout(function () { try { els.composeTitle.focus(); } catch (_) {} }, 60);
  }

  function closeCompose(force) {
    if (!els.composeMask) return;
    if (state.composeSubmitting && !force) return;
    els.composeMask.removeAttribute("data-open");
    setBlur(false);
  }

  async function submitCompose() {
    if (!els.composeMask || state.composeSubmitting) return;

    var title = String(els.composeTitle.value || "").trim();
    var content = title;
    var cid = Number(cfg.createTopicCid || cfg.topicCid || 0) || 0;

    if (!title) {
      els.composeError.textContent = t("inputTitle", "请输入标题");
      return;
    }

    if (!cid) {
      els.composeError.textContent = t("missingCid", "请先配置 createTopicCid，也就是发帖默认板块 cid");
      return;
    }

    state.composeSubmitting = true;
    els.composeSubmit.disabled = true;
    els.composeSubmit.textContent = uiText("posting", t("posting", "发布中..."));
    els.composeError.textContent = "";

    try {
      var tag = selectedComposeValue(".wkconv-compose-tags", "data-compose-tag", "交友");
      var language = selectedComposeValue(".wkconv-compose-langs", "data-compose-lang", "CN");
      await fetchJson(withRelativePath(cfg.composeApi || "/api/wukong/topics/create"), {
        method: "POST",
        body: JSON.stringify({ cid: cid, title: title, content: content || title, tag: tag, language: language })
      });

      state.composeSubmitting = false;
      els.composeSubmit.disabled = false;
      els.composeSubmit.textContent = uiText("publish", t("publish", "发布"));
      closeCompose(true);
      setTab("rooms");
      await syncList("compose");
    } catch (err) {
      var msg = humanErrorMessage(err, t("postFailed", "发布失败，请稍后重试"));
      if (err && err.status === 404) msg = "后端缺少 /api/wukong/topics/create 路由，请先替换 ZIP 里的 library.js";
      els.composeError.textContent = msg;
    } finally {
      state.composeSubmitting = false;
      els.composeSubmit.disabled = false;
      els.composeSubmit.textContent = uiText("publish", t("publish", "发布"));
    }
  }

  function topicPoster(room) {
    var tid = topicTid(room);
    return (state.topics[tid] && state.topics[tid].poster) || {};
  }

  function topicPosterName(room) {
    var poster = topicPoster(room);
    return poster.displayname || poster.username || poster.userslug || "";
  }

  function roomName(room) {
    if (state.remarks[roomKey(room)]) return state.remarks[roomKey(room)];
    if (room.is_topic || room.isTopic) {
      var tid = topicTid(room);
      return (state.topics[tid] && state.topics[tid].title) || (t("topic", "聊天室") + " #" + tid);
    }
    return userName(directRoomId(room));
  }

  function topicAvatarHtml() {
    return '<div class="wkconv-topic-avatar"><i></i><b></b></div>';
  }

  function roomAvatar(room) {
    if (room.is_topic || room.isTopic) return topicAvatarHtml(room);
    var id = directRoomId(room);
    return avatarHtmlForUser(state.users[String(id)] || {}, userName(id));
  }

  function roomFlag(room) {
    if (room.is_topic || room.isTopic) return "";
    return userFlag(state.users[String(directRoomId(room))]);
  }

  function roomOnline(room) {
    if (room.is_topic || room.isTopic) return false;
    return isOnlineUser(state.users[String(directRoomId(room))]);
  }

  function previewText(room) {
    var text = cleanPreviewText(room.text || "");
    var fromUid = String(room.last_from_uid || "");
    var fromName = String(room.last_from_name || "");
    var self = String(state.uid || "");

    if (fromUid && fromUid === self) fromName = "我";
    if (!fromName && room.is_self) fromName = "我";
    if (!fromName && fromUid) fromName = userName(fromUid);

    if (room.is_topic || room.isTopic) {
      return fromName && text ? (fromName + ": " + text) : text;
    }
    if ((fromName === "我" || fromUid === self || room.is_self) && text) return "我: " + text;
    return text;
  }

  function openUrl(room) {
    if (room.is_topic || room.isTopic) {
      var tid = topicTid(room);
      var back = encodeURIComponent("/wukong/conversations?tab=rooms");
      if (cfg.openTopicPage !== false) return rel() + cfg.topicBase + "/" + encodeURIComponent(tid) + "?return=" + back;
      return rel() + cfg.chatBase + "?tid=" + encodeURIComponent(tid) + "&return=" + back;
    }

    var id = directRoomId(room);
    if (!id) return rel() + cfg.chatBase;
    return rel() + cfg.chatBase + "/" + encodeURIComponent(id);
  }

  function fmtTime(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    var today = new Date();

    if (d.toDateString() === today.toDateString()) {
      return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    }

    var yest = new Date(today.getTime() - 86400000);
    if (d.toDateString() === yest.toDateString()) return "昨天";

    return (d.getMonth() + 1) + "/" + d.getDate();
  }

  function getFiltered() {
    return state.rooms.filter(function (room) {
      if (!room || state.hiddenRooms[roomKey(room)]) return false;
      var isTopic = room.is_topic || room.isTopic;
      if (state.tab === "direct" && isTopic) return false;
      if (state.tab === "rooms" && !isTopic) return false;
      return true;
    }).sort(function (a, b) {
      var pa = state.pinnedRooms[roomKey(a)] ? 1 : 0;
      var pb = state.pinnedRooms[roomKey(b)] ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return Number(b.ts || 0) - Number(a.ts || 0);
    });
  }

  function estimateHeight(key) {
    return Number(state.heightMap[key] || state.virtual.avg || cfg.defaultRowHeight || 58);
  }

  function computeVirtual(rooms) {
    var scrollTop = els.listWrap ? els.listWrap.scrollTop : 0;
    var viewport = els.listWrap ? els.listWrap.clientHeight : 600;
    var overscan = Number(cfg.virtualOverscan || 10);
    var avg = Number(state.virtual.avg || cfg.defaultRowHeight || 58);
    var startPx = Math.max(0, scrollTop - overscan * avg);
    var endPx = scrollTop + viewport + overscan * avg;

    var y = 0;
    var start = 0;
    var end = rooms.length;

    for (var i = 0; i < rooms.length; i++) {
      var h = estimateHeight(roomKey(rooms[i]));
      if (y + h < startPx) start = i + 1;
      if (y <= endPx) end = i + 1;
      y += h;
    }

    var top = 0;
    for (var a = 0; a < start; a++) top += estimateHeight(roomKey(rooms[a]));

    var visibleHeight = 0;
    for (var b = start; b < end; b++) visibleHeight += estimateHeight(roomKey(rooms[b]));

    state.virtual.start = start;
    state.virtual.end = Math.max(start, end);
    state.virtual.top = top;
    state.virtual.bottom = Math.max(0, y - top - visibleHeight);
  }

  function updateAverageHeight() {
    var keys = Object.keys(state.heightMap);
    if (!keys.length) return;

    var sum = 0;
    var count = 0;

    keys.slice(-120).forEach(function (k) {
      var h = Number(state.heightMap[k]);
      if (h > 30 && h < 180) {
        sum += h;
        count++;
      }
    });

    if (count) state.virtual.avg = Math.round(sum / count);
  }

  function observeRenderedHeights() {
    if (!W.ResizeObserver || !els.items) return;
    disconnectResizeObserver();

    ro = new ResizeObserver(function (entries) {
      var changed = false;

      entries.forEach(function (entry) {
        var el = entry.target;
        var key = el.getAttribute("data-key");
        var h = Math.ceil(entry.contentRect.height || el.offsetHeight || 0);

        if (!key || !h) return;

        if (Math.abs(Number(state.heightMap[key] || 0) - h) > 1) {
          state.heightMap[key] = h;
          changed = true;
        }
      });

      if (changed) {
        updateAverageHeight();
        saveLocal();
        scheduleRender();
      }
    });

    els.items.querySelectorAll(".wkconv-item").forEach(function (el) {
      ro.observe(el);
    });
  }

  function updateTabs() {
    if (!els.tabs) return;

    els.tabs.querySelectorAll(".wkconv-tab").forEach(function (btn) {
      var active = btn.getAttribute("data-tab") === state.tab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (els.composeFab) {
      els.composeFab.style.display = state.tab === "rooms" ? "grid" : "none";
    }
  }

  function render() {
    if (!els.items) return;

    if (state.tab === "notifications") {
      disconnectResizeObserver();
      renderNotifications();
      return;
    }

    updateTabs();

    var rooms = getFiltered();
    state.visibleRooms = rooms;
    computeVirtual(rooms);

    if (state.error && !rooms.length) {
      disconnectResizeObserver();
      els.topSpacer.style.height = "0px";
      els.bottomSpacer.style.height = "0px";
      state.renderSig = "error:" + state.tab;
      els.items.innerHTML = '<div class="wkconv-error"><div><strong>' + esc(t("errorTitle", "加载失败")) + '</strong></div></div>';
      return;
    }

    if (!rooms.length) {
      disconnectResizeObserver();
      els.topSpacer.style.height = "0px";
      els.bottomSpacer.style.height = "0px";

      var title = state.tab === "rooms" ? t("emptyRoomsTitle", "暂无聊天室") : t("emptyTitle", "暂无消息");
      var desc = state.tab === "rooms" ? t("emptyRoomsDesc", "后续板块帖子聊天室会显示在这里。") : t("emptyDesc", "打开个人主页，点击聊天即可开始。");

      state.renderSig = "empty:" + state.tab;
      els.items.innerHTML = '<div class="wkconv-empty"><div><strong>' + esc(title) + '</strong><div>' + esc(desc) + '</div></div></div>';
      return;
    }

    var slice = rooms.slice(state.virtual.start, state.virtual.end);
    els.topSpacer.style.height = state.virtual.top + "px";
    els.bottomSpacer.style.height = state.virtual.bottom + "px";

    var renderSig = [
      state.tab,
      state.virtual.start,
      state.virtual.end,
      state.virtual.top,
      state.virtual.bottom
    ].concat(slice.map(function (room) {
      return [
        roomKey(room),
        Number(room.unread || 0),
        Number(room.ts || 0),
        Number(!!state.pinnedRooms[roomKey(room)]),
        room.text || "",
        roomName(room),
        topicMemberSignature(room)
      ].join(":");
    })).join("|");

    if (state.renderSig === renderSig) return;
    state.renderSig = renderSig;

    els.items.innerHTML = slice.map(function (room) {
      var key = roomKey(room);
      var pinned = !!state.pinnedRooms[key];
      var unread = Number(room.unread || 0);
      var isTopic = room.is_topic || room.isTopic;
      if (isTopic) {
        return roomCardHtml(room, key, pinned, unread);
      }

      var name = roomName(room);
      var flag = roomFlag(room);
      var online = roomOnline(room);

      return '<div class="wkconv-item' +
        (pinned ? " is-pinned" : "") +
        (unread ? " has-unread" : "") +
        (online ? " is-online" : "") +
        '" data-key="' + esc(key) + '" role="button" tabindex="0">' +
          '<div class="wkconv-avatar">' +
            '<div class="wkconv-avatar-inner">' + roomAvatar(room) + '</div>' +
            '<span class="wkconv-online"></span><span class="wkconv-flag">' + esc(flag) + '</span>' +
          '</div>' +
          '<div class="wkconv-main">' +
            '<div class="wkconv-top"><div class="wkconv-name">' + esc(name) + '</div><div class="wkconv-time">' + esc(fmtTime(room.ts)) + '</div></div>' +
            '<div class="wkconv-bottom"><span class="wkconv-pin">' + esc(t("pinned", "置顶")) + '</span><div class="wkconv-preview">' + esc(previewText(room)) + '</div><div class="wkconv-badge">' + esc(unread > 99 ? "99+" : unread) + '</div></div>' +
          '</div>' +
        '</div>';
    }).join("");

    observeRenderedHeights();
  }

  function scheduleRender() {
    if (state.raf) return;

    state.raf = requestAnimationFrame(function () {
      state.raf = 0;
      render();
    });
  }

  function findRoomByKey(key) {
    return state.rooms.filter(function (r) { return roomKey(r) === key; })[0] || null;
  }

  function openRoom(room) {
    if (!room) return;

    markReadLocal(room);
    markReadRemote(room).catch(function () {});

    if (room.is_topic || room.isTopic) {
      try { sessionStorage.setItem("wkconv_preferred_tab", "rooms"); } catch (_) {}
    }

    location.href = openUrl(room);
  }

  function setBlur(on) {
    if (!els.app) return;
    els.app.classList.toggle("is-blurred", !!on);
  }

  function openMenu(room) {
    if (!room) return;

    state.menuRoom = room;
    var key = roomKey(room);
    var pinned = !!state.pinnedRooms[key];
    var hidden = !!state.hiddenRooms[key];
    var remark = state.remarks[key] || "";

    els.menuTitle.textContent = roomName(room);
    els.menuList.innerHTML =
      '<button data-menu="pin" type="button">' + esc(pinned ? t("unpin", "取消置顶") : t("pin", "置顶会话")) + '</button>' +
      '<button data-menu="remark" type="button">' + esc(remark ? t("editRemark", "修改备注") : t("remark", "添加备注")) + '</button>' +
      (remark ? '<button data-menu="clearRemark" type="button">' + esc(t("clearRemark", "清除备注")) + '</button>' : '') +
      '<button class="danger" data-menu="hide" type="button">' + esc(hidden ? t("restore", "恢复会话") : t("hide", "删除会话")) + '</button>' +
      '<button data-menu="cancel" type="button">' + esc(t("cancel", "取消")) + '</button>';

    els.menuMask.setAttribute("data-open", "1");
    setBlur(true);
  }

  function closeMenu() {
    if (els.menuMask) els.menuMask.removeAttribute("data-open");
    state.menuRoom = null;
    setBlur(false);
  }

  function openDrawer() {
    if (els.drawerMask) els.drawerMask.setAttribute("data-open", "1");
    setBlur(true);
  }

  function closeDrawer() {
    if (els.drawerMask) {
      els.drawerMask.removeAttribute("data-open");
      els.drawerMask.removeAttribute("data-dragging");
      els.drawerMask.style.removeProperty("--wk-drawer-dx");
    }
    state.drawerDragging = false;
    setBlur(false);
  }

  function setStatus() {
    // Hidden by design. Keep this no-op to avoid connection/sync hints in the header.
  }

  function notificationHref() {
    return absoluteAppUrl(cfg.notificationUrl || "/notifications", !!cfg.allowExternalNotificationUrls);
  }

  function extractNotificationCount(data) {
    if (!data) return 0;
    if (typeof data === "number") return numberFromAny(data);
    if (typeof data !== "object") return 0;

    var keys = [
      "unread", "unreadCount", "unread_count",
      "notifications_unread", "unreadNotifications"
    ];

    for (var i = 0; i < keys.length; i++) {
      if (data[keys[i]] !== undefined && data[keys[i]] !== null) return numberFromAny(data[keys[i]]);
    }

    var nestedCountContainers = [data.counts, data.count, data.meta, data.pagination, data.result];
    for (var cidx = 0; cidx < nestedCountContainers.length; cidx++) {
      var cobj = nestedCountContainers[cidx];
      if (cobj && typeof cobj === "object") {
        var cn = extractNotificationCount(cobj);
        if (cn > 0) return cn;
      }
    }

    var list = extractNotificationList(data);
    if (list.length) {
      var total = 0;
      list.forEach(function (n) {
        if (notificationUnread(n)) total++;
      });
      return total;
    }

    if (data.data && typeof data.data === "object") return extractNotificationCount(data.data);
    if (data.payload && typeof data.payload === "object") return extractNotificationCount(data.payload);
    return 0;
  }

  function readNotificationCountFromGlobals() {
    try {
      var badge = D.querySelector(
        '[component="notifications/icon"] [data-content],' +
        '[component="notifications/icon"] [data-count],' +
        '[component="notifications/icon"] .badge,' +
        '[component="notifications"] .badge,' +
        '.notifications .badge'
      );

      if (badge) {
        return numberFromAny(
          badge.getAttribute("data-content") ||
          badge.getAttribute("data-count") ||
          badge.textContent || ""
        );
      }
    } catch (_) {}

    return 0;
  }

  function firstText(obj, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = obj && obj[keys[i]];
      if (v !== undefined && v !== null && String(v).trim()) return stripHtml(v);
    }
    return "";
  }

  function extractNotificationList(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.notifications)) return data.notifications;
    if (Array.isArray(data.list)) return data.list;
    if (Array.isArray(data.items)) return data.items;

    if (data.data) {
      var nested = extractNotificationList(data.data);
      if (nested.length) return nested;
    }

    if (data.payload) {
      var nested2 = extractNotificationList(data.payload);
      if (nested2.length) return nested2;
    }

    return [];
  }

  function notificationUnread(n) {
    if (!n) return false;

    function hasOwn(obj, key) {
      return Object.prototype.hasOwnProperty.call(obj, key);
    }

    function truthyValue(v) {
      if (v === true || v === 1) return true;
      var s = String(v == null ? "" : v).trim().toLowerCase();
      return s === "1" || s === "true" || s === "yes" || s === "y" || s === "unread" || s === "new";
    }

    function falsyReadValue(v) {
      if (v === false || v === 0 || v === null) return true;
      var s = String(v == null ? "" : v).trim().toLowerCase();
      return s === "" || s === "0" || s === "false" || s === "no" || s === "n" || s === "unread" || s === "new";
    }

    if (truthyValue(n.unread) || truthyValue(n.isUnread) || truthyValue(n.is_unread)) return true;
    if (hasOwn(n, "read") && falsyReadValue(n.read)) return true;
    if (hasOwn(n, "is_read") && falsyReadValue(n.is_read)) return true;
    if (hasOwn(n, "isRead") && falsyReadValue(n.isRead)) return true;
    if (hasOwn(n, "readAt") && falsyReadValue(n.readAt)) return true;
    if (hasOwn(n, "read_at") && falsyReadValue(n.read_at)) return true;
    if (hasOwn(n, "read_at_iso") && falsyReadValue(n.read_at_iso)) return true;
    if (truthyValue(n.new) || truthyValue(n.isNew)) return true;

    return false;
  }

  function notificationId(n) {
    return String(get(n, ["nid", "id", "notificationId", "notification_id", "uuid"], ""));
  }

  function rawNotificationUrl(n) {
    var url = get(n, ["url", "path", "href", "link", "targetUrl", "target_url"], "");

    if (!url && n && n.tid) url = "/topic/" + encodeURIComponent(String(n.tid));
    if (!url && n && n.pid) url = "/post/" + encodeURIComponent(String(n.pid));

    return String(url || "");
  }

  function stableNotificationId(n, idx) {
    var explicit = notificationId(n);
    if (explicit) return explicit;

    var raw = [
      get(n, ["datetime", "timestamp", "time", "createdAt", "created_at"], ""),
      rawNotificationUrl(n),
      firstText(n, ["title", "bodyShort", "body", "bodyLong", "message", "text"]),
      get(n, ["type", "notificationType", "notification_type"], "")
    ].join("|");

    return raw.replace(/\|/g, "").trim() ? "fp:" + hashString(raw) : "idx:" + String(idx);
  }

  function notificationTarget(n) {
    var url = rawNotificationUrl(n);
    return absoluteAppUrl(url || cfg.notificationUrl || "/notifications", !!cfg.allowExternalNotificationUrls);
  }

  function notificationAvatar(n) {
    var u = (n && (n.user || n.from || n.sender || n.fromUser || n.userData)) || {};
    var pic = get(u, ["picture", "uploadedpicture", "avatar", "image"], "") || get(n, ["image", "picture", "avatar"], "");
    pic = safeAssetUrl(pic);

    if (pic) return '<img src="' + esc(pic) + '" alt="">';

    var name = get(u, ["displayname", "username", "userslug", "name"], "") || firstText(n, ["title", "bodyShort", "body", "bodyLong"]);
    var txt = String(name || "通").charAt(0).toUpperCase();
    return '<span>' + esc(txt || "通") + '</span>';
  }

  function notificationKind(n) {
    var hay = [
      get(n, ["type", "notificationType", "notification_type", "nid"], ""),
      get(n, ["path", "url", "href"], ""),
      firstText(n, ["title", "bodyShort", "body", "bodyLong", "message", "text"])
    ].join(" ").toLowerCase();

    if (/digest|email|mail|badge|award|reputation|声望|徽章|newsletter|cron|job|debug|任务|后台/.test(hay)) return "noise";
    if (/mention|@|提到|at-user/.test(hay)) return "mention";
    if (/reply|repl|回复|comment|post|pid|quote|引用/.test(hay)) return "reply";
    if (/like|upvote|vote|点赞|收藏|bookmark|favourite|favorite/.test(hay)) return "like";
    if (/follow|关注|follower/.test(hay)) return "follow";
    if (/topic|thread|tid|主题|帖子|new-topic|new_post/.test(hay)) return "topic";
    if (/admin|system|moderator|系统|管理员|封禁|警告|审核/.test(hay)) return "system";
    return "other";
  }

  function isCommonNotification(n) {
    var kind = notificationKind(n);
    if (kind === "noise") return false;
    if (kind !== "other") return true;

    var txt = firstText(n, ["title", "bodyShort", "body", "bodyLong", "message", "text"]);
    var rawTarget = rawNotificationUrl(n);
    var target = absoluteAppUrl(rawTarget, !!cfg.allowExternalNotificationUrls);

    return !!txt && !!rawTarget && target !== "#" && !/\/admin\/plugins|\/api\//.test(target);
  }

  function normalizeNotification(n, idx) {
    var kind = notificationKind(n);
    var title = firstText(n, ["title", "bodyShort", "body", "bodyLong", "message", "text"]);
    var body = firstText(n, ["bodyLong", "body", "message", "text", "description"]);

    if (!title) {
      title = kind === "mention" ? t("noticeMention", "有人提到了你") :
        kind === "reply" ? t("noticeReply", "有人回复了你") :
        kind === "like" ? t("noticeLike", "有人与你互动") :
        kind === "follow" ? t("noticeFollow", "有人关注了你") :
        kind === "system" ? t("noticeSystem", "系统通知") :
        t("notice", "通知");
    }

    if (body === title) body = "";

    var ts = Number(get(n, ["datetime", "timestamp", "time", "createdAt", "created_at"], 0));
    if (ts && ts < 10000000000) ts *= 1000;

    var id = stableNotificationId(n, idx);

    return {
      raw: n,
      id: id,
      kind: kind,
      title: title,
      body: body,
      url: notificationTarget(n),
      unread: notificationUnread(n) && !isNotificationSeenId(id),
      ts: ts || 0,
      avatar: notificationAvatar(n)
    };
  }

  function countUnreadNotifications() {
    return state.notifications.filter(function (n) { return n && n.unread; }).length;
  }

  function notifyServerNotificationsRead(ids, markAll) {
    ids = (ids || []).filter(Boolean);

    try {
      var sock = W.socket || (W.app && W.app.socket);
      if (sock && typeof sock.emit === "function") {
        if (markAll) {
          sock.emit("notifications.markAllRead");
          sock.emit("notifications.markAllRead", {});
          sock.emit("event:notifications.read");
        }

        ids.forEach(function (id) {
          sock.emit("notifications.markRead", id);
          sock.emit("event:notifications.read", id);
        });
      }
    } catch (_) {}
  }

  function markVisibleNotificationsRead(reason) {
    if (!state.notifications || !state.notifications.length) {
      if (state.tab === "notifications") setNotificationDot(0);
      return;
    }

    var ids = [];

    state.notifications.forEach(function (n) {
      if (!n || !n.unread) return;
      n.unread = false;
      if (n.id) {
        markNotificationSeenId(n.id);
        ids.push(n.id);
      }
    });

    if (ids.length) {
      saveNotificationSeen();
      notifyServerNotificationsRead(ids, true);
    } else if (state.tab === "notifications") {
      notifyServerNotificationsRead([], true);
    }

    if (state.tab === "notifications") {
      state.notificationSuppressUntil = now() + 15000;
      setNotificationDot(0);
    } else {
      setNotificationDot(countUnreadNotifications());
    }
  }

  async function loadNotifications(reason) {
    if (state.notificationsLoading) return;
    state.notificationsLoading = true;
    state.notificationsError = "";

    if (state.tab === "notifications") render();

    try {
      var api = absoluteAppUrl(cfg.notificationApi || "/api/notifications");
      var res = await fetch(api, {
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      var data = null;

      try { data = await res.json(); } catch (_) { data = {}; }
      if (!res.ok) throw new Error((data && (data.message || data.error)) || ("HTTP " + res.status));

      var list = extractNotificationList(data).filter(isCommonNotification).map(normalizeNotification);
      list.sort(function (a, b) { return Number(b.ts || 0) - Number(a.ts || 0); });

      state.notifications = list.slice(0, Number(cfg.maxNotifications || 80));
      state.notificationsLoaded = true;

      if (state.tab === "notifications") markVisibleNotificationsRead(reason || "load");
      else setNotificationDot(Math.max(extractNotificationCount(data), countUnreadNotifications()));
    } catch (err) {
      state.notificationsError = err && err.message ? err.message : String(err || "error");
      state.notificationsLoaded = true;
    } finally {
      state.notificationsLoading = false;
      if (state.tab === "notifications") render();
    }
  }

  function noticeKindText(kind) {
    if (kind === "mention") return t("noticeMention", "有人提到了你");
    if (kind === "reply") return t("noticeReply", "有人回复了你");
    if (kind === "like") return t("noticeLike", "有人与你互动");
    if (kind === "follow") return t("noticeFollow", "有人关注了你");
    if (kind === "system") return t("noticeSystem", "系统通知");
    return t("notice", "通知");
  }

  function renderNotifications() {
    updateTabs();
    if (!els.items) return;

    els.topSpacer.style.height = "0px";
    els.bottomSpacer.style.height = "0px";

    if (state.notificationsLoading && !state.notifications.length) {
      els.items.innerHTML = '<div class="wkconv-empty wkconv-notice-loading"><div><strong>' + esc(t("loadingNotifications", "正在加载通知")) + '</strong></div></div>';
      return;
    }

    if (state.notificationsError && !state.notifications.length) {
      els.items.innerHTML = '<div class="wkconv-error"><div><strong>' + esc(t("noticeLoadFailed", "通知加载失败")) + '</strong><div>' + esc(state.notificationsError) + '</div></div></div>';
      return;
    }

    if (!state.notifications.length) {
      els.items.innerHTML = '<div class="wkconv-empty"><div><strong>' + esc(t("emptyNotificationsTitle", "暂无通知")) + '</strong><div>' + esc(t("emptyNotificationsDesc", "常用通知会显示在这里。")) + '</div></div></div>';
      return;
    }

    els.items.innerHTML = state.notifications.map(function (n, idx) {
      return '<div class="wkconv-notice-item' + (n.unread ? ' is-unread' : '') + '" data-notice-index="' + idx + '" role="button" tabindex="0">' +
        '<div class="wkconv-notice-avatar">' + n.avatar + '</div>' +
        '<div class="wkconv-notice-main">' +
          '<div class="wkconv-notice-top"><div class="wkconv-notice-title">' + esc(n.title) + '</div><div class="wkconv-time">' + esc(fmtTime(n.ts)) + '</div></div>' +
          '<div class="wkconv-notice-body">' + esc(n.body || noticeKindText(n.kind)) + '</div>' +
        '</div>' +
        '<span class="wkconv-notice-dot"></span>' +
      '</div>';
    }).join("");
  }

  function openNotificationByIndex(idx) {
    var n = state.notifications[Number(idx)];
    if (!n) return;

    if (n.id) {
      markNotificationSeenId(n.id);
      saveNotificationSeen();
    }

    n.unread = false;
    state.notificationSuppressUntil = now() + 15000;
    setNotificationDot(countUnreadNotifications());
    notifyServerNotificationsRead(n.id ? [n.id] : [], false);

    location.href = n.url || notificationHref();
  }

  function setNotificationDot(count) {
    count = numberFromAny(count);
    state.notificationCount = count;
    state.notificationUnread = count > 0;

    if (els.notifyTab) {
      els.notifyTab.classList.toggle("has-unread", state.notificationUnread);
      els.notifyTab.setAttribute("data-count", count ? String(count) : "");
    }

    if (!els.notifyLink) return;

    els.notifyLink.classList.toggle("has-unread", state.notificationUnread);
    els.notifyLink.setAttribute("data-count", count ? String(count) : "");
    els.notifyLink.setAttribute(
      "aria-label",
      count ? t("notificationsUnread", "有新通知") : t("notifications", "通知")
    );
  }

  async function updateNotificationBadge(reason) {
    var suppress = now() < Number(state.notificationSuppressUntil || 0);
    var localCount = readNotificationCountFromGlobals();

    if (localCount > 0 && !suppress) setNotificationDot(localCount);
    if (state.notificationCheckInFlight) return;

    state.notificationCheckInFlight = true;

    try {
      var api = absoluteAppUrl(cfg.notificationApi || "/api/notifications");
      var res = await fetch(api, {
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      var data = null;

      try { data = await res.json(); } catch (_) { data = {}; }

      if (res.ok) {
        var rawList = extractNotificationList(data);

        if (rawList.length) {
          var list = rawList.filter(isCommonNotification).map(normalizeNotification);
          list.sort(function (a, b) { return Number(b.ts || 0) - Number(a.ts || 0); });

          state.notifications = list.slice(0, Number(cfg.maxNotifications || 80));
          state.notificationsLoaded = true;

          if (state.tab === "notifications" && !state.notificationsLoading) {
            markVisibleNotificationsRead(reason || "badge");
            renderNotifications();
          } else {
            var apiUnread = suppress ? 0 : extractNotificationCount(data);
            setNotificationDot(Math.max(apiUnread, countUnreadNotifications()));
          }
        } else {
          setNotificationDot(suppress ? 0 : extractNotificationCount(data));
        }
      } else if (!localCount || suppress) {
        setNotificationDot(0);
      }
    } catch (_) {
      if (!localCount || suppress) setNotificationDot(0);
    } finally {
      state.notificationCheckInFlight = false;
    }
  }

  function bindNotificationEvents() {
    updateNotificationBadge("boot");

    try {
      var sock = W.socket || (W.app && W.app.socket);
      [
        "event:new_notification",
        "event:notification_pushed",
        "event:notifications.update",
        "event:notifications.read",
        "event:notifications.mark_read"
      ].forEach(function (name) {
        listenSocket(sock, name, function () {
          updateNotificationBadge(name);
        });
      });
    } catch (_) {}

    listen(W, "focus", function () {
      updateNotificationBadge("focus");
    });

    listen(D, "visibilitychange", function () {
      if (!D.hidden) updateNotificationBadge("visible");
    });

    if (!state.notificationTimer) {
      state.notificationTimer = W.setInterval(function () {
        if (!D.hidden) updateNotificationBadge("timer");
      }, 60000);

      cleanups.push(function () {
        if (state.notificationTimer) {
          W.clearInterval(state.notificationTimer);
          state.notificationTimer = 0;
        }
      });
    }
  }

  function roomSyncIntervalMs() {
    var n = Number(cfg.roomSyncInterval || cfg.syncIntervalConnected || cfg.syncIntervalFallback || cfg.syncInterval || 45000) || 45000;
    return Math.max(15000, n);
  }

  function startListSyncTimer() {
    if (state.listSyncTimer) return;
    state.listSyncTimer = W.setInterval(function () {
      if (D.hidden) return;
      if (state.tab !== "rooms" && state.tab !== "direct") return;
      if (now() - state.lastSyncAt < 12000) return;
      syncList("timer");
    }, roomSyncIntervalMs());
    cleanups.push(function () {
      if (state.listSyncTimer) {
        W.clearInterval(state.listSyncTimer);
        state.listSyncTimer = 0;
      }
    });
  }

  function tabOrder() {
    return ["direct", "rooms", "notifications"];
  }

  function adjacentTab(dir) {
    var order = tabOrder();
    var idx = order.indexOf(state.tab);
    if (idx < 0) idx = 0;
    idx = Math.max(0, Math.min(order.length - 1, idx + dir));
    return order[idx];
  }

  function initialTabFromUrl() {
    try {
      var q = new URLSearchParams(location.search || "");
      var raw = String(q.get("tab") || q.get("type") || q.get("view") || "").toLowerCase();
      var hash = String(location.hash || "").toLowerCase();
      var saved = "";
      try { saved = String(sessionStorage.getItem("wkconv_preferred_tab") || "").toLowerCase(); } catch (_) {}

      if (raw === "notifications" || raw === "notice" || raw === "notices" || hash === "#notifications" || hash === "#notice" || saved === "notifications") return "notifications";
      if (raw === "rooms" || raw === "chatrooms" || raw === "topics" || raw === "topic" || hash === "#rooms" || hash === "#chatrooms" || saved === "rooms") return "rooms";
      if (raw === "direct" || raw === "messages" || raw === "dm" || hash === "#direct" || saved === "direct") return "direct";
    } catch (_) {}

    return "direct";
  }

  function updateTabUrl(tab) {
    try {
      sessionStorage.setItem("wkconv_preferred_tab", tab);

      var url = new URL(location.href);
      url.searchParams.set("tab", tab);

      history.replaceState(history.state, document.title, url.pathname + url.search + url.hash);
    } catch (_) {}
  }

  function setTab(tab) {
    if (tab !== "direct" && tab !== "rooms" && tab !== "notifications") return;

    if (state.tab === tab) {
      if (tab === "notifications") {
        if (!state.notificationsLoaded) loadNotifications("tab");
        else {
          markVisibleNotificationsRead("tab-repeat");
          render();
        }
      }
      return;
    }

    state.tab = tab;
    updateTabUrl(tab);

    state.renderSig = "";
    if (els.listWrap) els.listWrap.scrollTop = 0;

    if (tab === "notifications") {
      if (!state.notificationsLoaded) loadNotifications("tab");
      else markVisibleNotificationsRead("tab");
    }

    render();
  }

  function currentUser() {
    return (W.app && W.app.user) || (W.ajaxify && W.ajaxify.data && W.ajaxify.data.loggedInUser) || {};
  }

  function resolveHref(href) {
    var u = currentUser();
    var relative = rel();
    var userslug = encodeURIComponent(String(u.userslug || u.slug || u.username || u.uid || ""));

    return String(href || "#")
      .replace(/\{relative_path\}/g, relative)
      .replace(/\{uid\}/g, encodeURIComponent(String(u.uid || "")))
      .replace(/\{userslug\}/g, userslug)
      .replace(/\{username\}/g, encodeURIComponent(String(u.username || "")))
      .replace(/\/+/g, function (m, offset, s) {
        return offset > 0 && s.charAt(offset - 1) !== ":" ? "/" : m;
      });
  }

  function drawerIconHtml(icon) {
    icon = String(icon || "").trim();
    if (!icon) return '<span class="wkconv-drawer-icon">•</span>';
    if (icon.indexOf("fa-") !== -1) return '<i class="' + esc(icon) + '"></i>';
    return '<span class="wkconv-drawer-icon">' + esc(icon) + '</span>';
  }

  function drawerAvatarHtml() {
    var u = currentUser();
    var cached = state.users[String(state.uid || (u && u.uid) || "")] || {};
    var pic = safeAssetUrl(u.picture || u.uploadedpicture || cached.picture || "");

    if (pic) return '<img src="' + esc(pic) + '" alt="">';

    var txt = String(u.displayname || u.username || u.userslug || cached.displayname || cached.username || state.uid || "我").charAt(0).toUpperCase();
    return esc(txt || "我");
  }

  function renderDrawerLinks() {
    var u = currentUser();
    var links = W.NBBWukongConversationSidebarLinks || [
      { id: "profile", labelKey: "profile", label: "个人主页", icon: "fa-regular fa-user", href: "{relative_path}/user/{userslug}" },
      { id: "settings", labelKey: "settings", label: "设置", icon: "fa-solid fa-gear", href: "{relative_path}/user/{userslug}/settings" },
      { id: "messages", labelKey: "messages", label: "消息", icon: "fa-regular fa-comments", href: "{relative_path}/wukong/conversations" }
    ];

    els.drawerHead.innerHTML =
      '<div class="wkconv-drawer-avatar">' + drawerAvatarHtml() + '</div>' +
      '<div class="wkconv-drawer-name">' + esc(u.displayname || u.username || u.userslug || "") + '</div>';

    els.drawerLinks.innerHTML = links.map(function (link) {
      var label = t(link.labelKey || "", link.label || link.id || "");
      return '<a class="wkconv-drawer-link" href="' + esc(resolveHref(link.href || "#")) + '">' +
        drawerIconHtml(link.icon) +
        '<span class="wkconv-drawer-text">' + esc(label) + '</span>' +
      '</a>';
    }).join("");
  }

  function setDrawerDragX(x) {
    x = Math.max(0, Math.min(x, Math.min(W.innerWidth * 0.76, 286)));
    state.drawerCurrentX = x;

    if (els.drawerMask) {
      els.drawerMask.setAttribute("data-open", "1");
      els.drawerMask.setAttribute("data-dragging", "1");
      els.drawerMask.style.setProperty("--wk-drawer-dx", x + "px");
    }

    setBlur(true);
  }

  function beginDrawerDrag(x, y) {
    state.drawerDragging = true;
    state.drawerStartX = x || 0;
    state.edgeTouchY = y || 0;
    setDrawerDragX(0);
  }

  function moveDrawerDrag(x, y) {
    if (!state.drawerDragging) return;

    var dx = Math.max(0, (x || 0) - state.drawerStartX);
    var dy = Math.abs((y || 0) - state.edgeTouchY);

    if (dy > dx * 1.4) return;

    setDrawerDragX(dx);
  }

  function endDrawerDrag(x) {
    if (!state.drawerDragging) return;

    var dx = Math.max(0, (x || 0) - state.drawerStartX);
    state.drawerDragging = false;

    if (els.drawerMask) {
      els.drawerMask.removeAttribute("data-dragging");
      els.drawerMask.style.removeProperty("--wk-drawer-dx");
    }

    if (dx > 88) openDrawer();
    else closeDrawer();
  }

  function handleItemClick(target) {
    var notice = target.closest && target.closest(".wkconv-notice-item");
    if (notice) {
      openNotificationByIndex(notice.getAttribute("data-notice-index"));
      return;
    }

    var item = target.closest && target.closest(".wkconv-item");
    if (!item) return;

    openRoom(findRoomByKey(item.getAttribute("data-key")));
  }

  function bind() {
    listen(els.tabs, "click", function (e) {
      var btn = e.target.closest("[data-tab]");
      if (btn) setTab(btn.getAttribute("data-tab"));
    });

    listen(els.drawerOpen, "click", openDrawer);
    listen(els.composeFab, "click", openCompose);

    listen(els.drawerMask, "click", function (e) {
      if (e.target === els.drawerMask) closeDrawer();
    });

    if (els.edgeSwipe) {
      listen(els.edgeSwipe, "touchstart", function (e) {
        var p = e.touches && e.touches[0];
        if (!p) return;
        beginDrawerDrag(p.clientX, p.clientY);
      }, { passive: true });

      listen(els.edgeSwipe, "touchmove", function (e) {
        var p = e.touches && e.touches[0];
        if (!p) return;
        moveDrawerDrag(p.clientX, p.clientY);
      }, { passive: true });

      listen(els.edgeSwipe, "touchend", function (e) {
        var p = e.changedTouches && e.changedTouches[0];
        if (!p) return;
        endDrawerDrag(p.clientX);
      }, { passive: true });
    }

    listen(D, "touchstart", function (e) {
      var p = e.touches && e.touches[0];
      if (!p) return;

      state.edgeTouchX = p.clientX;
      state.edgeTouchY = p.clientY;

      if (p.clientX < 26) beginDrawerDrag(p.clientX, p.clientY);
    }, { passive: true });

    listen(D, "touchmove", function (e) {
      var p = e.touches && e.touches[0];
      if (!p) return;
      moveDrawerDrag(p.clientX, p.clientY);
    }, { passive: true });

    listen(D, "touchend", function (e) {
      var p = e.changedTouches && e.changedTouches[0];
      if (!p) return;

      if (state.drawerDragging) {
        endDrawerDrag(p.clientX);
        return;
      }

      var dx = p.clientX - state.edgeTouchX;
      var dy = p.clientY - state.edgeTouchY;

      if (state.edgeTouchX < 60 && dx > 55 && Math.abs(dx) > Math.abs(dy) * 1.25) openDrawer();
    }, { passive: true });

    listen(els.listWrap, "scroll", function () {
      scheduleRender();
    }, { passive: true });

    listen(els.listWrap, "touchstart", function (e) {
      var p = e.touches && e.touches[0];
      if (!p) return;

      state.touchX = p.clientX;
      state.touchY = p.clientY;
    }, { passive: true });

    listen(els.listWrap, "touchend", function (e) {
      var p = e.changedTouches && e.changedTouches[0];
      if (!p) return;

      var dx = p.clientX - state.touchX;
      var dy = p.clientY - state.touchY;

      if (Math.abs(dx) > 58 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        setTab(adjacentTab(dx < 0 ? 1 : -1));
      }
    }, { passive: true });

    listen(els.items, "click", function (e) {

      handleItemClick(e.target);
    });


    listen(els.items, "keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;

      var target = e.target.closest(".wkconv-item,.wkconv-notice-item");
      if (!target) return;

      e.preventDefault();
      handleItemClick(target);
    });

    var longTimer = 0;

    listen(els.items, "touchstart", function (e) {
      if (e.target.closest(".wkconv-notice-item")) return;
      var item = e.target.closest(".wkconv-item");
      if (!item || item.classList.contains("wkconv-room-card")) return;

      longTimer = W.setTimeout(function () {
        openMenu(findRoomByKey(item.getAttribute("data-key")));
      }, 700);
    }, { passive: true });

    ["touchend", "touchmove", "touchcancel"].forEach(function (name) {
      listen(els.items, name, function () {
        W.clearTimeout(longTimer);
      }, { passive: true });
    });

    listen(els.items, "contextmenu", function (e) {
      if (e.target.closest(".wkconv-notice-item")) return;

      var item = e.target.closest(".wkconv-item");
      if (!item) return;

      e.preventDefault();
      openMenu(findRoomByKey(item.getAttribute("data-key")));
    });

    listen(els.menuMask, "click", function (e) {
      if (e.target === els.menuMask) closeMenu();
    });


    listen(els.composeMask, "click", function (e) {
      var pill = e.target.closest && e.target.closest(".wkconv-compose-pill");
      if (pill) {
        var group = pill.parentNode;
        if (group) {
          Array.prototype.forEach.call(group.querySelectorAll(".wkconv-compose-pill"), function (btn) { btn.classList.remove("is-active"); });
          pill.classList.add("is-active");
        }
        return;
      }
      if (e.target === els.composeMask || e.target.closest("[data-compose-cancel]")) closeCompose();
      if (e.target.closest("[data-compose-submit]")) submitCompose();
    });

    listen(els.composeTitle, "keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitCompose();
    });

    listen(els.composeContent, "keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitCompose();
    });

    listen(els.menuList, "click", function (e) {
      var btn = e.target.closest("[data-menu]");
      if (!btn || !state.menuRoom) return;

      var act = btn.getAttribute("data-menu");
      var key = roomKey(state.menuRoom);

      if (act === "pin") {
        if (state.pinnedRooms[key]) delete state.pinnedRooms[key];
        else state.pinnedRooms[key] = 1;
      } else if (act === "remark") {
        var val = prompt(t("inputRemark", "请输入备注，留空清除"), state.remarks[key] || "");
        if (val !== null) {
          val = String(val || "").trim();
          if (val) state.remarks[key] = val;
          else delete state.remarks[key];
        }
      } else if (act === "clearRemark") {
        delete state.remarks[key];
      } else if (act === "hide") {
        if (state.hiddenRooms[key]) delete state.hiddenRooms[key];
        else state.hiddenRooms[key] = 1;
      } else if (act === "cancel") {
        closeMenu();
        return;
      }

      saveLocal();
      closeMenu();
      render();
    });

    listen(D, "visibilitychange", function () {
      if (!D.hidden && now() - state.lastSyncAt > 3000) syncList("visible");
      if (!D.hidden && state.tab === "notifications") loadNotifications("visible");
    });

    listen(W, "online", function () {
      syncList("online");
    });
  }

  function mountHtml() {
    root.innerHTML =
      '<div id="wkconv-app" class="wkconv-shell">' +
        '<header class="wkconv-header">' +
          '<div class="wkconv-tabs" role="tablist">' +
            '<button class="wkconv-tab is-active" data-tab="direct" role="tab" type="button">' + esc(t("messages", "消息")) + '</button>' +
            '<button class="wkconv-tab" data-tab="rooms" role="tab" type="button">' + esc(t("chatrooms", "聊天室")) + '</button>' +
            '<button class="wkconv-tab wkconv-tab-notifications" data-tab="notifications" role="tab" type="button">' + esc(t("notifications", "通知")) + '</button>' +
            '<div class="wkconv-status"></div>' +
            '<div class="wkconv-actions">' +
              '<button class="wkconv-drawer-open" type="button" aria-label="menu"><span></span></button>' +
            '</div>' +
          '</div>' +
        '</header>' +
        '<main class="wkconv-list-wrap">' +
          '<div class="wkconv-list" role="list">' +
            '<div class="wkconv-spacer wkconv-top-spacer"></div>' +
            '<div class="wkconv-items"></div>' +
            '<div class="wkconv-spacer wkconv-bottom-spacer"></div>' +
          '</div>' +
        '</main>' +
        '<button class="wkconv-compose-fab" type="button" aria-label="发布聊天室话题"><span class="wkconv-compose-fab-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.2 19.4l1.25-5.1L15.25 4.5a2.15 2.15 0 0 1 3.05 0l1.2 1.2a2.15 2.15 0 0 1 0 3.05l-9.8 9.8-5.1 1.25a.78.78 0 0 1-.94-.94zM14.1 5.65l4.25 4.25M6.05 14.3l3.65 3.65" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button>' +
      '</div>' +
      '<div class="wkconv-menu-mask"><div class="wkconv-menu"><div class="wkconv-menu-title"></div><div class="wkconv-menu-list"></div></div></div>' +
      '<div class="wkconv-compose-mask"><div class="wkconv-compose-pop"><div class="wkconv-compose-title">' + esc(uiText("composeTitle", "发布聊天室话题")) + '</div><input class="wkconv-compose-input" type="text" maxlength="80" placeholder="' + esc(uiText("titlePlaceholder", "话题标题")) + '"><div class="wkconv-compose-field"><div class="wkconv-compose-label">' + esc(uiText("tagLabel", "标签")) + '</div><div class="wkconv-compose-pills wkconv-compose-tags"></div></div><div class="wkconv-compose-field"><div class="wkconv-compose-label">' + esc(uiText("langLabel", "聊天室语言")) + '</div><div class="wkconv-compose-pills wkconv-compose-langs"></div></div><div class="wkconv-compose-error"></div><div class="wkconv-compose-actions"><button class="wkconv-compose-cancel" type="button" data-compose-cancel>' + esc(uiText("cancel", "取消")) + '</button><button class="wkconv-compose-submit" type="button" data-compose-submit>' + esc(uiText("publish", "发布")) + '</button></div></div></div>' +
      '<div class="wkconv-drawer-mask"><aside class="wkconv-drawer"><div class="wkconv-drawer-head"></div><nav class="wkconv-drawer-links"></nav></aside></div>' +
      '<div class="wkconv-edge-swipe" aria-hidden="true"></div>';

    els = {
      app: D.getElementById("wkconv-app"),
      status: root.querySelector(".wkconv-status"),
      tabs: root.querySelector(".wkconv-tabs"),
      drawerOpen: root.querySelector(".wkconv-drawer-open"),
      notifyLink: root.querySelector(".wkconv-notify-link"),
      notifyTab: root.querySelector(".wkconv-tab-notifications"),
      notifyDot: root.querySelector(".wkconv-notify-dot"),
      listWrap: root.querySelector(".wkconv-list-wrap"),
      list: root.querySelector(".wkconv-list"),
      topSpacer: root.querySelector(".wkconv-top-spacer"),
      bottomSpacer: root.querySelector(".wkconv-bottom-spacer"),
      items: root.querySelector(".wkconv-items"),
      menuMask: root.querySelector(".wkconv-menu-mask"),
      menuTitle: root.querySelector(".wkconv-menu-title"),
      menuList: root.querySelector(".wkconv-menu-list"),
      composeFab: root.querySelector(".wkconv-compose-fab"),
      composeMask: root.querySelector(".wkconv-compose-mask"),
      composeTitle: root.querySelector(".wkconv-compose-input"),
      composeContent: root.querySelector(".wkconv-compose-textarea"),
      composeError: root.querySelector(".wkconv-compose-error"),
      composeSubmit: root.querySelector(".wkconv-compose-submit"),
      composeTags: root.querySelector(".wkconv-compose-tags"),
      composeLangs: root.querySelector(".wkconv-compose-langs"),
      drawerMask: root.querySelector(".wkconv-drawer-mask"),
      edgeSwipe: root.querySelector(".wkconv-edge-swipe"),
      drawerHead: root.querySelector(".wkconv-drawer-head"),
      drawerLinks: root.querySelector(".wkconv-drawer-links")
    };

    renderDrawerLinks();
  }

  function destroy() {
    cleanups.splice(0).forEach(function (fn) {
      try { fn(); } catch (_) {}
    });

    disconnectResizeObserver();

    if (state.raf) {
      try { cancelAnimationFrame(state.raf); } catch (_) {}
      state.raf = 0;
    }

    if (state.notificationTimer) {
      try { W.clearInterval(state.notificationTimer); } catch (_) {}
      state.notificationTimer = 0;
    }

    try {
      var sdk = sdkShared();

      if (sdk && sdk.chatManager && state.messageListener) {
        if (typeof sdk.chatManager.removeMessageListener === "function") {
          sdk.chatManager.removeMessageListener(state.messageListener);
        }
      }

      if (sdk && sdk.connectManager && state.connectListener) {
        if (typeof sdk.connectManager.removeConnectStatusListener === "function") {
          sdk.connectManager.removeConnectStatusListener(state.connectListener);
        }
      }

      if (W.wk && W.wk.ConversationManager && W.wk.ConversationManager.shared && state.conversationListener) {
        var cm = W.wk.ConversationManager.shared();
        if (cm && typeof cm.removeConversationListener === "function") {
          cm.removeConversationListener(state.conversationListener);
        }
      }
    } catch (_) {}

    state.messageListener = null;
    state.conversationListener = null;
    state.connectListener = null;
    realtimeStarted = false;
    booted = false;
  }

  async function boot() {
    if (booted) return;
    booted = true;

    ensureViewport();
    cfg = c();
    root = D.getElementById("nodebb-wukong-conversations-root");

    if (!root) {
      booted = false;
      return;
    }

    D.body.classList.add("wkconv-page");
    cleanups.push(function () {
      try { D.body.classList.remove("wkconv-page"); } catch (_) {}
    });

    await loadI18n();
    preloadRoomBackgrounds();
    await ensureToken().catch(function () {});

    state.tab = initialTabFromUrl();

    loadLocal();
    updateAverageHeight();
    mountHtml();
    bind();
    bindNotificationEvents();
    startListSyncTimer();
    render();

    if (state.tab === "notifications") loadNotifications("boot");

    syncList("boot");
    startRealtime();

    W.WukongConversations = {
      version: "v31-low-pressure-active-users-room-card-tune",
      sync: syncList,
      setTab: setTab,
      openDrawer: openDrawer,
      markRead: markRead,
      destroy: destroy,
      dump: function () { return state; }
    };
  }

  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
