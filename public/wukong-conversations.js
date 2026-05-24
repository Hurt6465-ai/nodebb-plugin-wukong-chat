/* Wukong independent conversation list v6 - virtual list + drawer */
(function () {
  "use strict";

  var D = document;
  var W = window;
  var root = null;
  var els = {};
  var cfg = {};
  var i18n = {};
  var ro = null;

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
    touchX: 0,
    touchY: 0,
    edgeTouchX: 0,
    edgeTouchY: 0,
    messageListener: null,
    conversationListener: null,
    connectListener: null,
    lastSyncAt: 0,
    visibleRooms: [],
    heightMap: {},
    virtual: {
      start: 0,
      end: 0,
      top: 0,
      bottom: 0,
      avg: 66
    }
  };

  function ensureViewport() {
    var meta = D.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = D.createElement("meta");
      meta.name = "viewport";
      D.head.appendChild(meta);
    }
    meta.content = "width=device-width, initial-scale=1.0, viewport-fit=cover";
  }

  function rel() {
    return (W.config && config.relative_path) || "";
  }

  function c() {
    return Object.assign({
      apiBase: "/api/wukong",
      chatBase: "/wukong",
      topicBase: "/topic",
      wkSdkUrl: "/plugins/nodebb-plugin-wukong-chat/static/vendor/wukongimjssdk.umd.js?v=1",
      i18nBase: "/plugins/nodebb-plugin-wukong-chat/static/i18n",
      maxConversations: 500,
      openTopicPage: true,
      virtualOverscan: 10,
      defaultRowHeight: 66
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

  function locale() {
    var raw = String(
      (W.app && app.user && (app.user.language || app.user.locale)) ||
      (navigator.languages && navigator.languages[0]) ||
      navigator.language ||
      "zh-CN"
    );
    if (/^my/i.test(raw)) return "my";
    if (/^en/i.test(raw)) return "en-US";
    return "zh-CN";
  }

  async function loadI18n() {
    var loc = locale();
    try {
      var res = await fetch(cfg.i18nBase.replace(/\/+$/, "") + "/wukong-conversations." + loc + ".json?v=6", {
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      if (res.ok) i18n = await res.json();
    } catch (_) {}
  }

  function storageKey() {
    return "nbb_wukong_conversations_v6:" + (state.uid || "0");
  }

  function loadLocal() {
    try {
      var data = JSON.parse(localStorage.getItem(storageKey()) || "{}");
      state.hiddenRooms = data.hiddenRooms || {};
      state.pinnedRooms = data.pinnedRooms || {};
      state.remarks = data.remarks || {};
      state.rooms = Array.isArray(data.rooms) ? data.rooms : [];
      state.users = data.users || {};
      state.topics = data.topics || {};
      state.heightMap = data.heightMap || {};
    } catch (_) {}
  }

  function saveLocal() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify({
        hiddenRooms: state.hiddenRooms,
        pinnedRooms: state.pinnedRooms,
        remarks: state.remarks,
        rooms: state.rooms.slice(0, cfg.maxConversations || 500),
        users: state.users,
        topics: state.topics,
        heightMap: state.heightMap
      }));
    } catch (_) {}
  }

  function now() {
    return Date.now();
  }

  function get(obj, keys, fallback) {
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var val = obj && obj[key];
      if (val !== undefined && val !== null && String(val).trim() !== "") return val;
    }
    return fallback;
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
        var decoded = decodeURIComponent(Array.prototype.map.call(atob(s), function (c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
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

  function parsePayloadText(raw, fallbackType) {
    raw = parseJsonMaybe(raw);
    if (raw && typeof raw === "object") {
      var type = get(raw, ["type", "content_type", "contentType"], fallbackType || "");
      var text = get(raw, ["conversationDigest", "_conversationDigest", "text", "content", "body", "msg", "message"], "");
      var url = get(raw, ["url", "remoteUrl", "remote_url", "path", "src"], "");
      if (String(type) === "1006" || raw.revoke || raw.recalled) return t("recalled", "此消息已被撤回");
      if (String(type).match(/image/i) || String(url).match(/\.(png|jpe?g|webp|gif)(\?|$)/i)) return t("image", "[图片]");
      if (String(type).match(/video/i) || String(url).match(/\.(mp4|webm|mov|m4v)(\?|$)/i)) return t("video", "[视频]");
      if (String(type).match(/voice|audio/i) || String(url).match(/\.(mp3|wav|ogg|aac|m4a)(\?|$)/i)) return t("voice", "[语音]");
      if (text) return String(text).replace(/\s+/g, " ").trim().slice(0, 180);
      return t("message", "[消息]");
    }

    var s = String(raw == null ? "" : raw).trim();
    if (!s) return "";
    if (/!\[[^\]]*\]\([^)]+\)/.test(s)) return t("image", "[图片]");
    if (/\[(?:视频|video)\]\([^)]+\)/i.test(s)) return t("video", "[视频]");
    if (/\[(?:语音消息|voice|audio)\]\([^)]+\)/i.test(s)) return t("voice", "[语音]");
    return s.replace(/\s+/g, " ").slice(0, 180);
  }

  async function fetchJson(url, opts) {
    var res = await fetch(url, Object.assign({
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" }
    }, opts || {}));
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

  async function ensureToken() {
    if (state.uid && state.token) return;
    var data = await fetchJson(cfg.apiBase + "/token");
    state.uid = String(data.uid || data.wkUid || "");
    state.token = String(data.token || "");
    state.addr = String(data.addr || data.wsAddr || data.wkws || "");
    loadLocal();
  }

  async function syncList(reason) {
    if (state.loading) return;
    state.loading = true;
    setStatus(t("syncing", "同步中..."));
    try {
      await ensureToken();
      var data = await fetchJson(cfg.apiBase + "/conversations/list", {
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
      setStatus(err.message || "error");
      render();
    } finally {
      state.loading = false;
    }
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
        if (data.topics[tid]) {
          state.topics[String(tid)] = data.topics[tid];
          if (data.topics[tid].poster && data.topics[tid].poster.uid) {
            state.users[String(data.topics[tid].poster.uid)] = data.topics[tid].poster;
          }
        }
      });
    }

    var map = {};
    state.rooms.forEach(function (r) { map[roomKey(r)] = r; });

    (data.rooms || []).forEach(function (r) {
      var key = roomKey(r);
      var old = map[key] || {};
      if (!r.text && old.text) r.text = old.text;
      if (!r.ts && old.ts) r.ts = old.ts;
      map[key] = Object.assign({}, old, r);
    });

    state.rooms = Object.keys(map).map(function (k) { return map[k]; }).slice(0, cfg.maxConversations || 500);
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

    var text = parsePayloadText(contentText || payloadObj || m.payload || "", m && m.contentType);
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
      peer_uid: isTopic ? "" : String(channelId).replace(/[^\d]/g, ""),
      tid: tid,
      ts: ts,
      text: text || t("message", "[消息]"),
      unread: incoming ? 1 : 0,
      incoming: incoming
    };
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

    if (old) {
      old.ts = room.ts || old.ts || now();
      if (room.text) old.text = room.text;
      old.unread = Number(old.unread || 0) + Number(room.unread || 0);
    } else {
      state.rooms.unshift(Object.assign({}, room));
    }

    saveLocal();
    render();

    if (saveRemote) {
      fetchJson(cfg.apiBase + "/conversations/upsert", {
        method: "POST",
        body: JSON.stringify({
          channel_id: room.channel_id,
          channel_type: room.channel_type,
          ts: room.ts,
          text: room.text,
          incoming: room.incoming
        })
      }).catch(function () {});
    }
  }

  async function markRead(room) {
    if (!room) return;
    var key = roomKey(room);
    for (var i = 0; i < state.rooms.length; i++) {
      if (roomKey(state.rooms[i]) === key) state.rooms[i].unread = 0;
    }
    saveLocal();
    render();

    try {
      await fetchJson(cfg.apiBase + "/conversations/read", {
        method: "POST",
        body: JSON.stringify({
          channel_id: room.channel_id,
          channel_type: room.channel_type
        })
      });
    } catch (_) {}
  }

  async function loadSdk() {
    if (D.getElementById("wkconv-sdk")) return true;
    return new Promise(function (resolve) {
      var s = D.createElement("script");
      s.id = "wkconv-sdk";
      s.async = true;
      s.src = cfg.wkSdkUrl;
      s.onload = function () { resolve(true); };
      s.onerror = function () { resolve(false); };
      (D.head || D.documentElement).appendChild(s);
    });
  }

  function sdkShared() {
    try {
      if (W.wk && W.wk.WKSDK && typeof W.wk.WKSDK.shared === "function") return W.wk.WKSDK.shared();
      if (W.WKSDK && typeof W.WKSDK.shared === "function") return W.WKSDK.shared();
    } catch (_) {}
    return null;
  }

  async function startRealtime() {
    try {
      await ensureToken();
      await loadSdk();
      var sdk = sdkShared();
      if (!sdk || !sdk.config) return;

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
            if (room) upsertLocalRoom(room, true);
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
    } catch (_) {}
  }

  function normalizeConversationWrap(c) {
    if (!c) return null;
    var channel = c.channel || {};
    var channelId = get(channel, ["channelID", "channelId", "channel_id", "id"], "");
    var channelType = Number(get(channel, ["channelType", "channel_type"], channelId && String(channelId).indexOf("nbb_topic_") === 0 ? 2 : 1)) || 1;
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

    return {
      key: String(channelType) + ":" + String(channelId),
      channel_id: String(channelId),
      channel_type: channelType,
      is_topic: channelType === 2 || String(channelId).indexOf("nbb_topic_") === 0,
      peer_uid: channelType === 1 ? String(channelId).replace(/[^\d]/g, "") : "",
      tid: channelType === 2 ? String(channelId).replace("nbb_topic_", "").replace(/[^\d]/g, "") : "",
      ts: ts || now(),
      text: text || "",
      unread: Number(c.unread || 0) || 0
    };
  }

  function topicTid(room) {
    return String(room.tid || room.channel_id || "").replace("nbb_topic_", "").replace(/[^\d]/g, "");
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
    var u = state.users[String(uid)];
    return (state.remarks[uid] || (u && (u.displayname || u.username || u.userslug)) || ("User-" + uid));
  }

  function avatarHtmlForUser(u, fallbackText) {
    if (u && u.picture) return '<img src="' + esc(u.picture) + '" alt="">';
    var txt = String((u && (u.icontext || u.username)) || fallbackText || "?").charAt(0).toUpperCase();
    var bg = (u && u.iconbgColor) || "#dbeafe";
    return '<span style="background:' + esc(bg) + ';display:grid;place-items:center;">' + esc(txt) + '</span>';
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
    return userName(room.peer_uid || room.id);
  }

  function groupAvatarHtml(room) {
    var tid = topicTid(room);
    var topic = state.topics[tid] || {};
    var users = [];

    if (Array.isArray(topic.members)) users = topic.members.slice(0);
    if (Array.isArray(topic.users)) users = users.concat(topic.users);
    if (Array.isArray(topic.avatars)) {
      users = users.concat(topic.avatars.map(function (x) {
        return typeof x === "string" ? { picture: x } : x;
      }));
    }
    if (topic.poster) users.unshift(topic.poster);

    var seen = {};
    users = users.filter(function (u) {
      var key = String((u && (u.uid || u.picture || u.username)) || Math.random());
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).slice(0, 4);

    while (users.length < 4) {
      users.push({ icontext: "#", iconbgColor: users.length % 2 ? "#dbeafe" : "#e0f2fe" });
    }

    return '<div class="wkconv-group-avatar">' + users.slice(0, 4).map(function (u) {
      if (u && u.picture) return '<img src="' + esc(u.picture) + '" alt="">';
      var txt = String((u && (u.icontext || u.username)) || "#").charAt(0).toUpperCase();
      var bg = (u && u.iconbgColor) || "#dbeafe";
      return '<span style="background:' + esc(bg) + ';">' + esc(txt) + '</span>';
    }).join("") + '</div>';
  }

  function roomAvatar(room) {
    if (room.is_topic || room.isTopic) return groupAvatarHtml(room);
    return avatarHtmlForUser(state.users[String(room.peer_uid || room.id)] || {}, userName(room.peer_uid || room.id));
  }

  function roomFlag(room) {
    if (room.is_topic || room.isTopic) return "";
    return userFlag(state.users[String(room.peer_uid || room.id)]);
  }

  function roomOnline(room) {
    if (room.is_topic || room.isTopic) return isOnlineUser(topicPoster(room));
    return isOnlineUser(state.users[String(room.peer_uid || room.id)]);
  }

  function previewText(room) {
    if (room.is_topic || room.isTopic) {
      return room.text || t("roomLabel", "聊天室");
    }
    return room.text || "";
  }

  function openUrl(room) {
    if (room.is_topic || room.isTopic) {
      var tid = topicTid(room);
      if (cfg.openTopicPage !== false) return rel() + cfg.topicBase + "/" + encodeURIComponent(tid);
      return rel() + cfg.chatBase + "?tid=" + encodeURIComponent(tid);
    }
    return rel() + cfg.chatBase + "/" + encodeURIComponent(room.peer_uid || room.id);
  }

  function fmtTime(ts) {
    if (!ts) return "";
    var d = new Date(ts);
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
      if (state.hiddenRooms[roomKey(room)]) return false;
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
    if (ro) ro.disconnect();

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
  }

  function render() {
    if (!els.items) return;
    updateTabs();

    var rooms = getFiltered();
    state.visibleRooms = rooms;
    computeVirtual(rooms);

    if (state.error && !rooms.length) {
      els.topSpacer.style.height = "0px";
      els.bottomSpacer.style.height = "0px";
      els.items.innerHTML = '<div class="wkconv-error"><div><strong>' + esc(t("errorTitle", "加载失败")) + '</strong></div></div>';
      return;
    }

    if (!rooms.length) {
      els.topSpacer.style.height = "0px";
      els.bottomSpacer.style.height = "0px";
      var title = state.tab === "rooms" ? t("emptyRoomsTitle", "暂无聊天室") : t("emptyTitle", "暂无消息");
      var desc = state.tab === "rooms" ? t("emptyRoomsDesc", "后续板块帖子聊天室会显示在这里。") : t("emptyDesc", "打开个人主页，点击聊天即可开始。");
      els.items.innerHTML = '<div class="wkconv-empty"><div><strong>' + esc(title) + '</strong><div>' + esc(desc) + '</div></div></div>';
      return;
    }

    var slice = rooms.slice(state.virtual.start, state.virtual.end);
    els.topSpacer.style.height = state.virtual.top + "px";
    els.bottomSpacer.style.height = state.virtual.bottom + "px";

    els.items.innerHTML = slice.map(function (room) {
      var key = roomKey(room);
      var pinned = !!state.pinnedRooms[key];
      var unread = Number(room.unread || 0);
      var isTopic = room.is_topic || room.isTopic;
      var name = roomName(room);
      var flag = roomFlag(room);
      var online = roomOnline(room);
      var titleHtml = isTopic ?
        '<span class="wkconv-topic-prefix">#</span>' + esc(name) :
        esc(name);

      return '<div class="wkconv-item' + (pinned ? " is-pinned" : "") + (unread ? " has-unread" : "") + (online ? " is-online" : "") + '" data-key="' + esc(key) + '">' +
        '<div class="wkconv-avatar">' +
          '<div class="wkconv-avatar-inner">' + roomAvatar(room) + '</div>' +
          (isTopic ? '<span class="wkconv-topic-badge">#</span>' : '') +
          '<span class="wkconv-online"></span><span class="wkconv-flag">' + esc(flag) + '</span>' +
        '</div>' +
        '<div class="wkconv-main">' +
          '<div class="wkconv-top"><div class="wkconv-name">' + titleHtml + '</div><div class="wkconv-time">' + esc(fmtTime(room.ts)) + '</div></div>' +
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

  async function openRoom(room) {
    if (!room) return;
    await markRead(room);
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
      '<button data-menu="pin">' + esc(pinned ? t("unpin", "取消置顶") : t("pin", "置顶会话")) + '</button>' +
      '<button data-menu="remark">' + esc(remark ? t("editRemark", "修改备注") : t("remark", "添加备注")) + '</button>' +
      (remark ? '<button data-menu="clearRemark">' + esc(t("clearRemark", "清除备注")) + '</button>' : '') +
      '<button class="danger" data-menu="hide">' + esc(hidden ? t("restore", "恢复会话") : t("hide", "删除会话")) + '</button>' +
      '<button data-menu="cancel">' + esc(t("cancel", "取消")) + '</button>';
    els.menuMask.setAttribute("data-open", "1");
    setBlur(true);
  }

  function closeMenu() {
    els.menuMask.removeAttribute("data-open");
    state.menuRoom = null;
    setBlur(false);
  }

  function openDrawer() {
    els.drawerMask.setAttribute("data-open", "1");
    setBlur(true);
  }

  function closeDrawer() {
    els.drawerMask.removeAttribute("data-open");
    setBlur(false);
  }

  function setStatus(text) {
    if (els.status) els.status.textContent = text || "";
  }

  function setTab(tab) {
    if (tab !== "direct" && tab !== "rooms") return;
    if (state.tab === tab) return;
    state.tab = tab;
    if (els.listWrap) els.listWrap.scrollTop = 0;
    render();
  }

  function currentUser() {
    return (W.app && app.user) || (W.ajaxify && ajaxify.data && ajaxify.data.loggedInUser) || {};
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
    if (u.picture) return '<img src="' + esc(u.picture) + '" alt="">';
    return esc(String(u.username || u.uid || "?").charAt(0).toUpperCase());
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

  function bind() {
    els.tabs.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tab]");
      if (btn) setTab(btn.getAttribute("data-tab"));
    });

    els.drawerOpen.addEventListener("click", openDrawer);
    els.drawerMask.addEventListener("click", function (e) {
      if (e.target === els.drawerMask) closeDrawer();
    });

    if (els.edgeSwipe) {
      els.edgeSwipe.addEventListener("touchstart", function (e) {
        var p = e.touches && e.touches[0];
        if (!p) return;
        state.edgeTouchX = p.clientX;
        state.edgeTouchY = p.clientY;
      }, { passive: true });

      els.edgeSwipe.addEventListener("touchend", function (e) {
        var p = e.changedTouches && e.changedTouches[0];
        if (!p) return;
        var dx = p.clientX - state.edgeTouchX;
        var dy = p.clientY - state.edgeTouchY;
        if (dx > 42 && Math.abs(dx) > Math.abs(dy) * 1.15) openDrawer();
      }, { passive: true });
    }

    D.addEventListener("touchstart", function (e) {
      var p = e.touches && e.touches[0];
      if (!p) return;
      state.edgeTouchX = p.clientX;
      state.edgeTouchY = p.clientY;
    }, { passive: true });

    D.addEventListener("touchend", function (e) {
      var p = e.changedTouches && e.changedTouches[0];
      if (!p) return;
      var dx = p.clientX - state.edgeTouchX;
      var dy = p.clientY - state.edgeTouchY;
      if (state.edgeTouchX < 60 && dx > 55 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        openDrawer();
      }
    }, { passive: true });

    els.listWrap.addEventListener("scroll", function () {
      scheduleRender();
    }, { passive: true });

    els.listWrap.addEventListener("touchstart", function (e) {
      var p = e.touches && e.touches[0];
      if (!p) return;
      state.touchX = p.clientX;
      state.touchY = p.clientY;
    }, { passive: true });

    els.listWrap.addEventListener("touchend", function (e) {
      var p = e.changedTouches && e.changedTouches[0];
      if (!p) return;
      var dx = p.clientX - state.touchX;
      var dy = p.clientY - state.touchY;
      if (Math.abs(dx) > 58 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        setTab(dx < 0 ? "rooms" : "direct");
      }
    }, { passive: true });

    els.items.addEventListener("click", function (e) {
      var item = e.target.closest(".wkconv-item");
      if (!item) return;
      openRoom(findRoomByKey(item.getAttribute("data-key")));
    });

    var longTimer = 0;
    els.items.addEventListener("touchstart", function (e) {
      var item = e.target.closest(".wkconv-item");
      if (!item) return;
      longTimer = setTimeout(function () {
        openMenu(findRoomByKey(item.getAttribute("data-key")));
      }, 520);
    }, { passive: true });

    ["touchend", "touchmove", "touchcancel"].forEach(function (name) {
      els.items.addEventListener(name, function () {
        clearTimeout(longTimer);
      }, { passive: true });
    });

    els.items.addEventListener("contextmenu", function (e) {
      var item = e.target.closest(".wkconv-item");
      if (!item) return;
      e.preventDefault();
      openMenu(findRoomByKey(item.getAttribute("data-key")));
    });

    els.menuMask.addEventListener("click", function (e) {
      if (e.target === els.menuMask) closeMenu();
    });

    els.menuList.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-menu]");
      if (!btn || !state.menuRoom) return;
      var act = btn.getAttribute("data-menu");
      var key = roomKey(state.menuRoom);

      if (act === "pin") {
        state.pinnedRooms[key] = !state.pinnedRooms[key];
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
        state.hiddenRooms[key] = !state.hiddenRooms[key];
      } else if (act === "cancel") {
        closeMenu();
        return;
      }

      saveLocal();
      closeMenu();
      render();
    });

    D.addEventListener("visibilitychange", function () {
      if (!D.hidden && now() - state.lastSyncAt > 3000) syncList("visible");
    });

    W.addEventListener("online", function () {
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
            '<div class="wkconv-status">' + esc(t("loading", "正在加载消息...")) + '</div>' +
            '<button class="wkconv-drawer-open" type="button" aria-label="menu"><span></span></button>' +
          '</div>' +
        '</header>' +
        '<main class="wkconv-list-wrap">' +
          '<div class="wkconv-list" role="list">' +
            '<div class="wkconv-spacer wkconv-top-spacer"></div>' +
            '<div class="wkconv-items"></div>' +
            '<div class="wkconv-spacer wkconv-bottom-spacer"></div>' +
          '</div>' +
        '</main>' +
      '</div>' +
      '<div class="wkconv-menu-mask"><div class="wkconv-menu"><div class="wkconv-menu-title"></div><div class="wkconv-menu-list"></div></div></div>' +
      '<div class="wkconv-drawer-mask"><aside class="wkconv-drawer"><div class="wkconv-drawer-head"></div><nav class="wkconv-drawer-links"></nav></aside></div>' +
      '<div class="wkconv-edge-swipe" aria-hidden="true"></div>';

    els = {
      app: D.getElementById("wkconv-app"),
      status: root.querySelector(".wkconv-status"),
      tabs: root.querySelector(".wkconv-tabs"),
      drawerOpen: root.querySelector(".wkconv-drawer-open"),
      listWrap: root.querySelector(".wkconv-list-wrap"),
      list: root.querySelector(".wkconv-list"),
      topSpacer: root.querySelector(".wkconv-top-spacer"),
      bottomSpacer: root.querySelector(".wkconv-bottom-spacer"),
      items: root.querySelector(".wkconv-items"),
      menuMask: root.querySelector(".wkconv-menu-mask"),
      menuTitle: root.querySelector(".wkconv-menu-title"),
      menuList: root.querySelector(".wkconv-menu-list"),
      drawerMask: root.querySelector(".wkconv-drawer-mask"),
      edgeSwipe: root.querySelector(".wkconv-edge-swipe"),
      drawerHead: root.querySelector(".wkconv-drawer-head"),
      drawerLinks: root.querySelector(".wkconv-drawer-links")
    };

    renderDrawerLinks();
  }

  async function boot() {
    ensureViewport();
    cfg = c();
    root = D.getElementById("nodebb-wukong-conversations-root");
    if (!root) return;

    D.body.classList.add("wkconv-page");
    await loadI18n();
    await ensureToken().catch(function () {});
    loadLocal();
    updateAverageHeight();
    mountHtml();
    bind();
    render();

    syncList("boot");
    startRealtime();

    W.WukongConversations = {
      version: "v7-virtual-drawer-clean",
      sync: syncList,
      setTab: setTab,
      openDrawer: openDrawer,
      dump: function () { return state; }
    };
  }

  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
