/* Wukong independent conversation list v5 - mobile, NodeBB profile-first, windowed list */
(function () {
  "use strict";

  var D = document;
  var W = window;
  var root = null;
  var els = {};
  var cfg = {};
  var i18n = {};
  var state = {
    uid: "",
    token: "",
    rooms: [],
    users: {},
    topics: {},
    tab: "direct",
    loading: false,
    error: false,
    pollTimer: 0,
    raf: 0,
    menuRoom: null,
    hiddenRooms: {},
    pinnedRooms: {},
    remarks: {},
    roomSnapshots: {},
    touchX: 0,
    touchY: 0,
    virtualItemHeight: 64,
    virtualBuffer: 8
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
      bridgeBase: "/bridge",
      chatBase: "/wukong",
      topicBase: "/topic",
      i18nBase: "/plugins/nodebb-plugin-wukong-chat/static/i18n",
      syncInterval: 8000,
      maxConversations: 500,
      openTopicPage: true
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
      var res = await fetch(cfg.i18nBase.replace(/\/+$/, "") + "/wukong-conversations." + loc + ".json?v=4", {
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      if (res.ok) i18n = await res.json();
    } catch (_) {}
  }

  function storageKey() {
    return "nbb_wukong_conversations_v5:" + (state.uid || "0");
  }

  function loadLocal() {
    try {
      var data = JSON.parse(localStorage.getItem(storageKey()) || "{}");
      state.hiddenRooms = data.hiddenRooms || {};
      state.pinnedRooms = data.pinnedRooms || {};
      state.remarks = data.remarks || {};
      state.roomSnapshots = data.roomSnapshots || {};
      state.topics = data.topics || {};
      state.users = data.users || {};
      var snapshots = state.roomSnapshots || {};
      state.rooms = Object.keys(snapshots).map(function (k) { return snapshots[k]; }).filter(Boolean);
    } catch (_) {}
  }

  function saveLocal() {
    try {
      var snapshots = {};
      state.rooms.slice(0, cfg.maxConversations || 500).forEach(function (r) {
        snapshots[roomKey(r)] = {
          id: r.id,
          channelId: r.channelId,
          channelType: r.channelType,
          isTopic: r.isTopic,
          ts: r.ts,
          unread: r.unread,
          text: r.text,
          name: r.name,
          username: r.username,
          avatarUrl: r.avatarUrl,
          icontext: r.icontext,
          iconbgColor: r.iconbgColor,
          country: r.country,
          countryCode: r.countryCode,
          countryFlagUrl: r.countryFlagUrl,
          language_flag: r.language_flag,
          publisher: r.publisher,
          topicTitle: r.topicTitle
        };
      });

      localStorage.setItem(storageKey(), JSON.stringify({
        hiddenRooms: state.hiddenRooms,
        pinnedRooms: state.pinnedRooms,
        remarks: state.remarks,
        roomSnapshots: snapshots,
        topics: state.topics,
        users: state.users
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

  function isUrlLike(value) {
    return /^https?:\/\//i.test(String(value || ""));
  }

  function normalizeLanguageFlag(value) {
    return String(value || "").trim();
  }


  function getDeep(obj, paths, fallback) {
    for (var i = 0; i < paths.length; i++) {
      var parts = String(paths[i]).split(".");
      var cur = obj;
      for (var j = 0; j < parts.length; j++) {
        if (!cur || cur[parts[j]] === undefined || cur[parts[j]] === null) {
          cur = undefined;
          break;
        }
        cur = cur[parts[j]];
      }
      if (cur !== undefined && cur !== null && String(cur).trim() !== "") return cur;
    }
    return fallback;
  }

  function normalizeProfile(raw) {
    if (!raw || typeof raw !== "object") return null;
    var uid = String(get(raw, ["uid", "id"], "") || "").trim();
    return {
      uid: uid,
      username: String(get(raw, ["username", "userslug"], "") || ""),
      userslug: String(get(raw, ["userslug", "username"], "") || ""),
      displayname: String(get(raw, ["displayname", "displayName", "name", "username"], "") || ""),
      picture: String(get(raw, ["picture", "avatarUrl", "avatar", "uploadedpicture"], "") || ""),
      avatarUrl: String(get(raw, ["avatarUrl", "picture", "avatar", "uploadedpicture"], "") || ""),
      icontext: String(get(raw, ["icontext", "iconText", "icon:text", "username"], "") || ""),
      iconbgColor: String(get(raw, ["iconbgColor", "iconBgColor", "icon:bgColor"], "#dbeafe") || "#dbeafe"),
      status: String(get(raw, ["status", "presence", "onlineStatus"], "") || ""),
      online: raw.online === true || raw.isOnline === true,
      language_flag: normalizeLanguageFlag(get(raw, ["language_flag"], "")),
      country: normalizeLanguageFlag(get(raw, ["language_flag"], "")),
      countryCode: normalizeLanguageFlag(get(raw, ["language_flag"], "")),
      countryFlagUrl: isUrlLike(get(raw, ["language_flag"], "")) ? normalizeLanguageFlag(get(raw, ["language_flag"], "")) : ""
    };
  }

  function conversationProfile(item) {
    return normalizeProfile(getDeep(item, ["nbbUser", "nodebbUser", "user", "peer", "profile", "targetUser", "member"], null));
  }

  function publisherProfile(item) {
    return normalizeProfile(getDeep(item, ["publisher", "lastPublisher", "author", "lastUser", "sender", "fromUser"], null));
  }

  function parseJsonMaybe(value) {
    if (value && typeof value === "object") return value;
    if (typeof value !== "string") return value;
    var s = value.trim();
    if (!s) return "";
    if (s.charAt(0) === "{" || s.charAt(0) === "[") {
      try { return JSON.parse(s); } catch (_) {}
    }
    return value;
  }

  function parsePayloadText(raw) {
    raw = parseJsonMaybe(raw);
    if (raw && typeof raw === "object") {
      var type = get(raw, ["type", "content_type", "contentType"], "");
      var text = get(raw, ["text", "content", "body", "msg", "message"], "");
      var url = get(raw, ["url", "remoteUrl", "remote_url", "path", "src"], "");
      if (String(type) === "1006" || raw.revoke || raw.recalled) return t("recalled", "此消息已被撤回");
      if (String(type).match(/image/i) || String(url).match(/\.(png|jpe?g|webp|gif)(\?|$)/i)) return t("image", "[图片]");
      if (String(type).match(/video/i) || String(url).match(/\.(mp4|webm|mov)(\?|$)/i)) return t("video", "[视频]");
      if (String(type).match(/voice|audio/i) || String(url).match(/\.(mp3|wav|ogg|aac|m4a)(\?|$)/i)) return t("voice", "[语音]");
      if (text) return String(text);
      return t("file", "[文件]");
    }

    var s = String(raw == null ? "" : raw).trim();
    if (!s) return "";
    if (/!\[[^\]]*\]\([^)]+\)/.test(s)) return t("image", "[图片]");
    if (/\[(?:视频|video)\]\([^)]+\)/i.test(s)) return t("video", "[视频]");
    if (/\[(?:语音消息|voice|audio)\]\([^)]+\)/i.test(s)) return t("voice", "[语音]");
    return s.replace(/\s+/g, " ").slice(0, 180);
  }

  function channelOf(item) {
    var ch = get(item, ["channel_id", "channelId", "channelID", "channel"], "");
    if (ch && typeof ch === "object") {
      ch = get(ch, ["channel_id", "channelId", "channelID", "id"], "");
    }
    return String(ch || "").trim();
  }

  function typeOf(item, channelId) {
    return Number(get(item, ["channel_type", "channelType"], channelId.indexOf("nbb_topic_") === 0 ? 2 : 1)) || 1;
  }

  function timestampOf(item) {
    var val = get(item, [
      "last_msg_at", "lastMsgAt", "last_message_at", "timestamp", "updated_at", "updatedAt",
      "time", "created_at", "createdAt", "lastTimestamp", "last_timestamp"
    ], 0);
    var n = Number(val);
    if (n && n < 10000000000) n *= 1000;
    return n || 0;
  }

  function unreadOf(item) {
    return Number(get(item, ["unread", "unread_count", "unreadCount", "unread_cnt", "badge"], 0)) || 0;
  }

  function payloadOf(item) {
    return get(item, [
      "last_msg", "lastMsg", "last_message", "lastMessage", "message", "payload",
      "content", "text", "body", "msg"
    ], "");
  }

  function normalizeRoom(item) {
    var channelId = channelOf(item);
    if (!channelId) return null;
    var channelType = typeOf(item, channelId);
    var isTopic = channelType === 2 || channelId.indexOf("nbb_topic_") === 0;
    var id = isTopic ? channelId : channelId.replace(/[^\d]/g, "");
    if (!id) id = channelId;

    var profile = conversationProfile(item);
    var publisher = publisherProfile(item);
    var topic = getDeep(item, ["topic"], null) || {};

    return {
      id: String(id),
      channelId: channelId,
      channelType: channelType,
      isTopic: isTopic,
      ts: timestampOf(item) || now(),
      unread: unreadOf(item),
      text: parsePayloadText(payloadOf(item)),
      name: String(get(item, ["displayName", "displayname", "name", "username", "title"], "") || (profile && profile.displayname) || (profile && profile.username) || ""),
      username: String(get(item, ["username", "userslug"], "") || (profile && profile.username) || ""),
      avatarUrl: String(get(item, ["avatarUrl", "picture", "avatar", "logo"], "") || (profile && (profile.avatarUrl || profile.picture)) || ""),
      icontext: String(get(item, ["icontext", "iconText", "icon:text"], "") || (profile && profile.icontext) || ""),
      iconbgColor: String(get(item, ["iconbgColor", "iconBgColor", "icon:bgColor"], "") || (profile && profile.iconbgColor) || "#dbeafe"),
      language_flag: normalizeLanguageFlag(get(item, ["language_flag"], "") || (profile && profile.language_flag) || ""),
      country: normalizeLanguageFlag(get(item, ["language_flag"], "") || (profile && profile.language_flag) || ""),
      countryCode: normalizeLanguageFlag(get(item, ["language_flag"], "") || (profile && profile.language_flag) || ""),
      countryFlagUrl: isUrlLike(get(item, ["language_flag"], "") || (profile && profile.language_flag)) ? normalizeLanguageFlag(get(item, ["language_flag"], "") || (profile && profile.language_flag) || "") : "",
      publisher: publisher || item.publisher || null,
      topicTitle: String(get(topic, ["title", "name"], "") || get(item, ["topicTitle", "title"], "") || ""),
      raw: item
    };
  }

  function extractList(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.conversations)) return data.conversations;
    if (data && Array.isArray(data.list)) return data.list;
    if (data && Array.isArray(data.data)) return data.data;
    if (data && data.data && Array.isArray(data.data.conversations)) return data.data.conversations;
    if (data && data.data && Array.isArray(data.data.list)) return data.data.list;
    return [];
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

  async function fetchAny(paths, opts) {
    var last = null;
    for (var i = 0; i < paths.length; i++) {
      try {
        return await fetchJson(paths[i], opts);
      } catch (err) {
        last = err;
        if (err.status !== 404) throw err;
      }
    }
    throw last || new Error("not_found");
  }

  async function ensureToken() {
    if (state.uid && state.token) return;
    var data = await fetchAny([cfg.apiBase + "/token", cfg.bridgeBase + "/token"]);
    state.uid = String(data.uid || data.wkUid || "");
    state.token = String(data.token || "");
    loadLocal();
  }

  async function sync() {
    if (state.loading) return;
    state.loading = true;
    setStatus(t("syncing", "同步中..."));
    try {
      await ensureToken();
      var data = await fetchAny([cfg.apiBase + "/conversation/sync", cfg.bridgeBase + "/conversation/sync"], {
        method: "POST",
        body: JSON.stringify({ uid: state.uid, version: 0, msg_count: 1 })
      });
      var list = extractList(data).map(normalizeRoom).filter(Boolean);
      mergeRooms(list);
      await Promise.all([hydrateUsers(), hydrateTopics()]);
      state.error = false;
      setStatus(t("connected", "已连接"));
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
    return String(room.channelType) + ":" + String(room.channelId || room.id);
  }

  function mergeRooms(list) {
    var map = {};
    state.rooms.forEach(function (r) { map[roomKey(r)] = r; });

    list.forEach(function (r) {
      var k = roomKey(r);
      var old = map[k];

      if (old) {
        if (!r.text && old.text) r.text = old.text;
        if (!r.ts && old.ts) r.ts = old.ts;
        // Do not preserve old unread when server says 0. Server is the truth.
        map[k] = Object.assign(old, r);
      } else {
        map[k] = r;
      }
    });

    state.rooms = Object.keys(map).map(function (k) { return map[k]; }).slice(0, cfg.maxConversations || 500);
  }

  async function hydrateUsers() {
    var uids = state.rooms
      .filter(function (r) { return !r.isTopic && /^\d+$/.test(r.id) && !state.users[r.id]; })
      .map(function (r) { return r.id; })
      .filter(function (v, i, arr) { return arr.indexOf(v) === i; })
      .slice(0, 80);

    if (!uids.length) return;

    try {
      var data = await fetchJson(cfg.apiBase + "/users?uids=" + encodeURIComponent(uids.join(",")));
      var users = data.users || [];
      users.forEach(function (u) {
        if (u && u.uid) state.users[String(u.uid)] = u;
      });
      scheduleRender();
    } catch (_) {}
  }

  function topicTid(room) {
    return String(room.channelId || "").replace("nbb_topic_", "").replace(/[^\d]/g, "");
  }

  async function hydrateTopics() {
    var tids = state.rooms
      .filter(function (r) { return r.isTopic; })
      .map(topicTid)
      .filter(Boolean)
      .filter(function (tid) { return !state.topics[tid]; })
      .filter(function (v, i, arr) { return arr.indexOf(v) === i; })
      .slice(0, 40);

    await Promise.all(tids.map(async function (tid) {
      try {
        var data = await fetchAny([rel() + "/api/topic/" + encodeURIComponent(tid), rel() + "/api/v3/topics/" + encodeURIComponent(tid)]);
        var topic = data && (data.topic || data.response || data);
        var title = topic && (topic.title || topic.name || topic.topic_title);
        if (title) state.topics[tid] = { title: String(title), slug: topic.slug || topic.titleRaw || "" };
      } catch (_) {}
    }));

    scheduleRender();
  }

  function flagEmoji(input) {
    var raw = String(input || "").trim();
    if (!raw) return "";
    var s = raw.toLowerCase();

    var map = {
      cn: "🇨🇳", china: "🇨🇳", "中国": "🇨🇳", chinese: "🇨🇳",
      mm: "🇲🇲", my: "🇲🇲", burma: "🇲🇲", myanmar: "🇲🇲", "缅甸": "🇲🇲",
      us: "🇺🇸", usa: "🇺🇸", america: "🇺🇸", "美国": "🇺🇸",
      jp: "🇯🇵", japan: "🇯🇵", "日本": "🇯🇵",
      kr: "🇰🇷", korea: "🇰🇷", "韩国": "🇰🇷",
      th: "🇹🇭", thailand: "🇹🇭", "泰国": "🇹🇭",
      vn: "🇻🇳", vietnam: "🇻🇳", "越南": "🇻🇳",
      la: "🇱🇦", laos: "🇱🇦", "老挝": "🇱🇦",
      kh: "🇰🇭", cambodia: "🇰🇭", "柬埔寨": "🇰🇭",
      id: "🇮🇩", indonesia: "🇮🇩", "印尼": "🇮🇩",
      ph: "🇵🇭", philippines: "🇵🇭", "菲律宾": "🇵🇭",
      in: "🇮🇳", india: "🇮🇳", "印度": "🇮🇳",
      bd: "🇧🇩", bangladesh: "🇧🇩", "孟加拉": "🇧🇩"
    };

    if (map[s]) return map[s];
    if (/^[a-z]{2}$/.test(s)) {
      var a = s.toUpperCase().charCodeAt(0) - 65 + 0x1F1E6;
      var b = s.toUpperCase().charCodeAt(1) - 65 + 0x1F1E6;
      return String.fromCodePoint(a, b);
    }
    return "";
  }

  function userLanguageFlag(u) {
    if (!u) return "";
    return u.language_flag || "";
  }

  function userCountry(u) {
    return userLanguageFlag(u);
  }

  function isOnlineUser(u) {
    if (!u) return false;
    var st = String(u.status || u.presence || u.onlineStatus || "").toLowerCase();
    return u.online === true || u.isOnline === true || st === "online";
  }

  function userName(uid, room) {
    var u = state.users[String(uid)] || null;
    return (
      (room && room.name) ||
      state.remarks[uid] ||
      (u && (u.displayname || u.username || u.userslug)) ||
      (uid ? ("User-" + uid) : t("unknown", "未知用户"))
    );
  }

  function avatarFromProfile(profile, fallbackName) {
    if (profile && (profile.avatarUrl || profile.picture)) {
      return '<img src="' + esc(profile.avatarUrl || profile.picture) + '" alt="">';
    }
    var name = String(fallbackName || (profile && (profile.icontext || profile.username || profile.displayname)) || "?");
    var txt = name.charAt(0).toUpperCase();
    var bg = (profile && profile.iconbgColor) || "#dbeafe";
    return '<span style="background:' + esc(bg) + ';display:grid;place-items:center;">' + esc(txt) + '</span>';
  }

  function avatar(uid, room) {
    if (room && room.isTopic && room.publisher) return avatarFromProfile(room.publisher, room.publisher.displayname || room.publisher.username || roomName(room));
    if (room && room.avatarUrl) return '<img src="' + esc(room.avatarUrl) + '" alt="">';
    var u = state.users[String(uid)];
    return avatarFromProfile(u, userName(uid, room));
  }

  function roomName(room) {
    if (state.remarks[roomKey(room)]) return state.remarks[roomKey(room)];
    if (room.isTopic) {
      var tid = topicTid(room);
      return room.topicTitle || (state.topics[tid] && state.topics[tid].title) || (t("topic", "聊天室") + " #" + tid);
    }
    return userName(room.id, room);
  }

  function openUrl(room) {
    if (room.isTopic) {
      var tid = topicTid(room);
      if (cfg.openTopicPage !== false) return rel() + cfg.topicBase + "/" + encodeURIComponent(tid);
      return rel() + cfg.chatBase + "?tid=" + encodeURIComponent(tid);
    }
    return rel() + cfg.chatBase + "/" + encodeURIComponent(room.id);
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
      if (state.tab === "direct" && room.isTopic) return false;
      if (state.tab === "rooms" && !room.isTopic) return false;
      return true;
    }).sort(function (a, b) {
      var pa = state.pinnedRooms[roomKey(a)] ? 1 : 0;
      var pb = state.pinnedRooms[roomKey(b)] ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return Number(b.ts || 0) - Number(a.ts || 0);
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
    if (!els.list) return;
    updateTabs();

    var rooms = getFiltered();

    if (state.error && !rooms.length) {
      els.list.innerHTML = '<div class="wkconv-error"><div><strong>' + esc(t("errorTitle", "加载失败")) + '</strong></div></div>';
      return;
    }

    if (!rooms.length) {
      var title = state.tab === "rooms" ? t("emptyRoomsTitle", "暂无聊天室") : t("emptyTitle", "暂无消息");
      var desc = state.tab === "rooms" ? t("emptyRoomsDesc", "以后板块帖子聊天室会显示在这里。") : t("emptyDesc", "打开个人主页，点击聊天即可开始。");
      els.list.innerHTML = '<div class="wkconv-empty"><div><strong>' + esc(title) + '</strong><div>' + esc(desc) + '</div></div></div>';
      return;
    }

    var itemHeight = state.virtualItemHeight || 64;
    var scrollTop = els.listWrap ? els.listWrap.scrollTop : 0;
    var viewport = els.listWrap ? els.listWrap.clientHeight : 0;
    var useVirtual = rooms.length > 80 && viewport > 0;
    var start = 0;
    var end = rooms.length;
    var topPad = 0;
    var bottomPad = 0;

    if (useVirtual) {
      start = Math.max(0, Math.floor(scrollTop / itemHeight) - state.virtualBuffer);
      end = Math.min(rooms.length, Math.ceil((scrollTop + viewport) / itemHeight) + state.virtualBuffer);
      topPad = start * itemHeight;
      bottomPad = Math.max(0, (rooms.length - end) * itemHeight);
    }

    var visibleRooms = rooms.slice(start, end);
    var html = '';
    if (topPad) html += '<li class="wkconv-spacer" style="height:' + topPad + 'px"></li>';
    html += visibleRooms.map(function (room) {
      var key = roomKey(room);
      var pinned = !!state.pinnedRooms[key];
      var unread = Number(room.unread || 0);
      var name = roomName(room);
      var u = room.isTopic ? null : state.users[String(room.id)];
      var pub = room.publisher || null;
      var flagSource = room.isTopic ? (pub && (pub.language_flag || pub.countryFlagUrl || pub.countryCode || pub.country)) : (room.language_flag || room.countryFlagUrl || room.countryCode || room.country || userLanguageFlag(u));
      var flag = isUrlLike(flagSource) ? "" : (flagEmoji(flagSource) || String(flagSource || ""));
      var flagImg = isUrlLike(flagSource) ? '<img src="' + esc(flagSource) + '" alt="">' : esc(flag);
      var online = !room.isTopic && isOnlineUser(u);
      return '<li class="wkconv-item' + (pinned ? " is-pinned" : "") + (unread ? " has-unread" : "") + (online ? " is-online" : "") + (room.isTopic ? " is-topic" : "") + '" data-key="' + esc(key) + '">' +
        '<div class="wkconv-avatar">' +
          '<div class="wkconv-avatar-inner">' + avatar(room.id, room) + '</div>' +
          '<span class="wkconv-online"></span><span class="wkconv-flag">' + flagImg + '</span>' +
        '</div>' +
        '<div class="wkconv-main">' +
          '<div class="wkconv-top"><div class="wkconv-name">' + esc(name) + '</div><div class="wkconv-time">' + esc(fmtTime(room.ts)) + '</div></div>' +
          '<div class="wkconv-bottom"><span class="wkconv-pin">' + esc(t("pinned", "置顶")) + '</span><div class="wkconv-preview">' + esc(room.text || "") + '</div><div class="wkconv-badge">' + esc(unread > 99 ? "99+" : unread) + '</div></div>' +
        '</div>' +
      '</li>';
    }).join("");
    if (bottomPad) html += '<li class="wkconv-spacer" style="height:' + bottomPad + 'px"></li>';
    els.list.innerHTML = html;
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
    room.unread = 0;
    saveLocal();
    location.href = openUrl(room);
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
  }

  function closeMenu() {
    els.menuMask.removeAttribute("data-open");
    state.menuRoom = null;
  }

  function startPoll() {
    clearTimeout(state.pollTimer);
    function loop() {
      sync().finally(function () {
        state.pollTimer = setTimeout(loop, cfg.syncInterval || 8000);
      });
    }
    state.pollTimer = setTimeout(loop, 1200);
  }

  function setStatus(text) {
    if (els.status) els.status.textContent = text || "";
  }

  function setTab(tab) {
    if (tab !== "direct" && tab !== "rooms") return;
    if (state.tab === tab) return;
    state.tab = tab;
    render();
  }

  function bind() {
    els.tabs.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tab]");
      if (btn) setTab(btn.getAttribute("data-tab"));
    });

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

    els.listWrap.addEventListener("scroll", function () {
      if (state.rooms.length > 80) scheduleRender();
    }, { passive: true });

    els.list.addEventListener("click", function (e) {
      var item = e.target.closest(".wkconv-item");
      if (!item) return;
      openRoom(findRoomByKey(item.getAttribute("data-key")));
    });

    var longTimer = 0;
    els.list.addEventListener("touchstart", function (e) {
      var item = e.target.closest(".wkconv-item");
      if (!item) return;
      longTimer = setTimeout(function () {
        openMenu(findRoomByKey(item.getAttribute("data-key")));
      }, 520);
    }, { passive: true });

    ["touchend", "touchmove", "touchcancel"].forEach(function (name) {
      els.list.addEventListener(name, function () {
        clearTimeout(longTimer);
      }, { passive: true });
    });

    els.list.addEventListener("contextmenu", function (e) {
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
  }

  function mountHtml() {
    root.innerHTML =
      '<div id="wkconv-app" class="wkconv-shell">' +
        '<header class="wkconv-header">' +
          '<div class="wkconv-tabs" role="tablist">' +
            '<button class="wkconv-tab is-active" data-tab="direct" role="tab" type="button">' + esc(t("messages", "消息")) + '</button>' +
            '<button class="wkconv-tab" data-tab="rooms" role="tab" type="button">' + esc(t("chatrooms", "聊天室")) + '</button>' +
            '<div class="wkconv-status">' + esc(t("loading", "正在加载消息...")) + '</div>' +
          '</div>' +
        '</header>' +
        '<main class="wkconv-list-wrap"><ul class="wkconv-list"></ul></main>' +
      '</div>' +
      '<div class="wkconv-menu-mask"><div class="wkconv-menu"><div class="wkconv-menu-title"></div><div class="wkconv-menu-list"></div></div></div>';

    els = {
      app: D.getElementById("wkconv-app"),
      status: root.querySelector(".wkconv-status"),
      tabs: root.querySelector(".wkconv-tabs"),
      listWrap: root.querySelector(".wkconv-list-wrap"),
      list: root.querySelector(".wkconv-list"),
      menuMask: root.querySelector(".wkconv-menu-mask"),
      menuTitle: root.querySelector(".wkconv-menu-title"),
      menuList: root.querySelector(".wkconv-menu-list")
    };
  }

  async function boot() {
    ensureViewport();
    cfg = c();
    root = D.getElementById("nodebb-wukong-conversations-root");
    if (!root) return;

    D.body.classList.add("wkconv-page");
    await loadI18n();
    mountHtml();
    bind();

    await ensureToken().catch(function () {});
    loadLocal();
    // Do not immediately render incomplete local snapshots that only contain raw
    // WuKong ids. If cached profiles exist, render instantly; otherwise keep the
    // loading state until the first server-enriched sync returns.
    if (Object.keys(state.users || {}).length || state.rooms.some(function (r) { return r.name || r.avatarUrl || (r.publisher && (r.publisher.avatarUrl || r.publisher.picture)); })) {
      render();
    }

    sync();
    startPoll();

    W.WukongConversations = {
      version: "v5-profile-first-windowed",
      sync: sync,
      setTab: setTab,
      dump: function () { return state; }
    };
  }

  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
