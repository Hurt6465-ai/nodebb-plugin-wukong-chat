/* Wukong independent conversation list v1 */
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
    addr: "",
    rooms: [],
    users: {},
    query: "",
    loading: false,
    error: false,
    sdkReady: false,
    syncTimer: 0,
    pollTimer: 0,
    raf: 0,
    menuRoom: null,
    hiddenRooms: {},
    pinnedRooms: {},
    remarks: {}
  };

  function rel() {
    return (W.config && config.relative_path) || "";
  }

  function c() {
    return Object.assign({
      apiBase: "/api/wukong",
      chatBase: "/wukong",
      wkSdkUrl: "/plugins/nodebb-plugin-wukong-chat/static/vendor/wukongimjssdk.umd.js?v=1",
      i18nBase: "/plugins/nodebb-plugin-wukong-chat/static/i18n",
      syncIntervalConnected: 45000,
      syncIntervalFallback: 30000,
      maxConversations: 300
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
      var res = await fetch(cfg.i18nBase.replace(/\/+$/, "") + "/wukong-conversations." + loc + ".json?v=1", {
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      if (res.ok) i18n = await res.json();
    } catch (_) {}
  }

  function storageKey() {
    return "nbb_wukong_conversations_v1:" + (state.uid || "0");
  }

  function loadLocal() {
    try {
      var data = JSON.parse(localStorage.getItem(storageKey()) || "{}");
      state.hiddenRooms = data.hiddenRooms || {};
      state.pinnedRooms = data.pinnedRooms || {};
      state.remarks = data.remarks || {};
    } catch (_) {}
  }

  function saveLocal() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify({
        hiddenRooms: state.hiddenRooms,
        pinnedRooms: state.pinnedRooms,
        remarks: state.remarks
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
    return Number(get(item, ["channel_type", "channelType", "channelType"], channelId.indexOf("nbb_topic_") === 0 ? 2 : 1)) || 1;
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
    var id = channelType === 2 ? channelId : channelId.replace(/[^\d]/g, "");
    if (!id) id = channelId;

    return {
      id: String(id),
      channelId: channelId,
      channelType: channelType,
      isTopic: channelType === 2 || channelId.indexOf("nbb_topic_") === 0,
      ts: timestampOf(item) || now(),
      unread: unreadOf(item),
      text: parsePayloadText(payloadOf(item)),
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

  async function ensureToken() {
    if (state.uid && state.token) return;
    var data = await fetchJson(cfg.apiBase + "/token");
    state.uid = String(data.uid || data.wkUid || "");
    state.token = String(data.token || "");
    state.addr = String(data.addr || data.wsAddr || data.wkws || "");
    loadLocal();
  }

  async function sync(reason) {
    if (state.loading) return;
    state.loading = true;
    setStatus(t("syncing", "同步中...") + (reason ? " " + reason : ""));
    try {
      await ensureToken();
      var data = await fetchJson(cfg.apiBase + "/conversation/sync", {
        method: "POST",
        body: JSON.stringify({ uid: state.uid, version: 0, msg_count: 1 })
      });
      var list = extractList(data).map(normalizeRoom).filter(Boolean);
      mergeRooms(list, true);
      await hydrateUsers();
      state.error = false;
      setStatus(state.sdkReady ? t("connected", "已连接") : t("offline", "离线同步"));
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

  function mergeRooms(list, replace) {
    var map = {};
    if (!replace) {
      state.rooms.forEach(function (r) { map[roomKey(r)] = r; });
    }

    list.forEach(function (r) {
      var k = roomKey(r);
      var old = map[k];
      if (old) {
        Object.assign(old, r);
      } else {
        map[k] = r;
      }
    });

    state.rooms = Object.keys(map).map(function (k) { return map[k]; }).slice(0, cfg.maxConversations || 300);
  }

  function patchRoomFromMessage(msg) {
    var channelId = String(get(msg, ["channel_id", "channelId", "channelID"], "") || "");
    var fromUid = String(get(msg, ["from_uid", "fromUid", "fromUID", "uid"], "") || "");
    var toUid = String(get(msg, ["to_uid", "toUid", "toUID"], "") || "");
    var self = state.uid || "";
    var type = Number(get(msg, ["channel_type", "channelType"], channelId.indexOf("nbb_topic_") === 0 ? 2 : 1)) || 1;

    if (type === 1) {
      if (!channelId || channelId === self) channelId = fromUid === self ? toUid : fromUid;
    }

    if (!channelId) return false;

    var room = normalizeRoom(Object.assign({}, msg, {
      channel_id: channelId,
      channel_type: type,
      last_msg: payloadOf(msg) || msg.payload || msg.content || msg.text || "",
      timestamp: now(),
      unread: fromUid && fromUid !== self ? 1 : 0
    }));
    if (!room) return false;

    var existing = state.rooms.filter(function (r) { return roomKey(r) === roomKey(room); })[0];
    if (existing) {
      existing.ts = room.ts;
      existing.text = room.text;
      if (room.unread) existing.unread = Number(existing.unread || 0) + 1;
    } else {
      state.rooms.unshift(room);
    }

    hydrateUsers();
    scheduleRender();
    return true;
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
    } catch (_) {}
  }

  function userName(uid) {
    var u = state.users[String(uid)];
    return (state.remarks[uid] || (u && (u.displayname || u.username || u.userslug)) || ("User-" + uid));
  }

  function avatar(uid) {
    var u = state.users[String(uid)];
    if (u && u.picture) return '<img src="' + esc(u.picture) + '" alt="">';
    var name = userName(uid);
    var txt = String((u && (u.icontext || u.username)) || name || "?").charAt(0).toUpperCase();
    var bg = (u && u.iconbgColor) || "#dbeafe";
    return '<span style="background:' + esc(bg) + ';width:100%;height:100%;display:grid;place-items:center;border-radius:50%;">' + esc(txt) + '</span>';
  }

  function roomName(room) {
    if (state.remarks[roomKey(room)]) return state.remarks[roomKey(room)];
    if (room.isTopic) return t("topic", "主题聊天室") + " " + String(room.channelId).replace("nbb_topic_", "#");
    return userName(room.id);
  }

  function openUrl(room) {
    if (room.isTopic) {
      var tid = String(room.channelId).replace("nbb_topic_", "");
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
    var q = String(state.query || "").trim().toLowerCase();
    return state.rooms.filter(function (room) {
      if (state.hiddenRooms[roomKey(room)]) return false;
      if (!q) return true;
      return (roomName(room) + " " + room.text).toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) {
      var pa = state.pinnedRooms[roomKey(a)] ? 1 : 0;
      var pb = state.pinnedRooms[roomKey(b)] ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return Number(b.ts || 0) - Number(a.ts || 0);
    });
  }

  function render() {
    if (!els.list) return;

    var rooms = getFiltered();

    if (state.error && !rooms.length) {
      els.list.innerHTML =
        '<div class="wkconv-error"><div><strong>' + esc(t("errorTitle", "加载失败")) + '</strong>' +
        '<button class="wkconv-refresh" data-act="retry" style="margin:12px auto 0;">↻</button></div></div>';
      return;
    }

    if (!rooms.length) {
      els.list.innerHTML =
        '<div class="wkconv-empty"><div><strong>' + esc(t("emptyTitle", "暂无会话")) + '</strong>' +
        '<div>' + esc(t("emptyDesc", "打开个人主页，点击聊天即可开始。")) + '</div></div></div>';
      return;
    }

    els.list.innerHTML = rooms.map(function (room) {
      var key = roomKey(room);
      var pinned = !!state.pinnedRooms[key];
      var unread = Number(room.unread || 0);
      var name = roomName(room);
      return '<li class="wkconv-item' + (pinned ? " is-pinned" : "") + (unread ? " has-unread" : "") + '" data-key="' + esc(key) + '">' +
        '<div class="wkconv-avatar">' + (room.isTopic ? '<span>#</span>' : avatar(room.id)) + '</div>' +
        '<div class="wkconv-main">' +
          '<div class="wkconv-top"><div class="wkconv-name">' + esc(name) + '</div><div class="wkconv-time">' + esc(fmtTime(room.ts)) + '</div></div>' +
          '<div class="wkconv-bottom"><span class="wkconv-pin">置顶</span><div class="wkconv-preview">' + esc(room.text || "") + '</div><div class="wkconv-badge">' + esc(unread > 99 ? "99+" : unread) + '</div></div>' +
        '</div>' +
      '</li>';
    }).join("");
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
    location.href = openUrl(room);
  }

  function toast(msg) {
    var old = D.querySelector(".wkconv-toast");
    if (old) old.remove();
    var el = D.createElement("div");
    el.className = "wkconv-toast";
    el.textContent = msg;
    D.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("show"); });
    setTimeout(function () {
      el.classList.remove("show");
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }, 1900);
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
        sdk.chatManager.addMessageListener(function (m) {
          patchRoomFromMessage(sdkMessageToPayload(m));
        });
      }

      if (sdk.connectManager && typeof sdk.connectManager.addConnectStatusListener === "function") {
        sdk.connectManager.addConnectStatusListener(function (status) {
          var st = String(status && (status.status || status.value || status) || "").toLowerCase();
          state.sdkReady = status === 1 || status === "1" || st === "connected" || st === "connect" || st === "online";
          setStatus(state.sdkReady ? t("connected", "已连接") : t("connecting", "正在连接..."));
        });
      }

      if (sdk.connectManager && typeof sdk.connectManager.connect === "function") {
        sdk.connectManager.connect();
      }
    } catch (_) {}
  }

  function sdkMessageToPayload(m) {
    m = m || {};
    var channel = m.channel || m.channelInfo || {};
    var channelId = typeof channel === "object" ? get(channel, ["channelID", "channelId", "channel_id", "id"], "") : channel;
    var payload = m.payload || m.messagePayload || m.message_payload || m.content || m.messageContent || m.message_content || m.body || "";
    return {
      channel_id: channelId,
      channel_type: get(channel, ["channelType", "channel_type"], m.channelType || m.channel_type || 1),
      from_uid: get(m, ["fromUID", "fromUid", "from_uid", "uid"], ""),
      to_uid: get(m, ["toUID", "toUid", "to_uid", "targetUid"], ""),
      payload: payload,
      timestamp: get(m, ["timestamp", "time", "createdAt"], now())
    };
  }

  function startPoll() {
    clearTimeout(state.pollTimer);
    function loop() {
      sync(state.sdkReady ? "poll" : "fallback").finally(function () {
        state.pollTimer = setTimeout(loop, state.sdkReady ? cfg.syncIntervalConnected : cfg.syncIntervalFallback);
      });
    }
    state.pollTimer = setTimeout(loop, 1200);
  }

  function setStatus(text) {
    if (els.status) els.status.textContent = text || "";
  }

  function bind() {
    els.search.addEventListener("input", function () {
      state.query = this.value || "";
      scheduleRender();
    });

    els.refresh.addEventListener("click", function () {
      sync("manual");
    });

    els.newChat.addEventListener("click", function () {
      var uid = prompt(t("enterUid", "输入 NodeBB 用户 UID"), "");
      uid = String(uid || "").trim();
      if (!/^\d+$/.test(uid)) {
        if (uid) toast(t("invalidUid", "请输入有效 UID"));
        return;
      }
      location.href = rel() + cfg.chatBase + "/" + encodeURIComponent(uid);
    });

    els.back.addEventListener("click", function () {
      if (history.length > 1) history.back();
      else location.href = rel() + "/";
    });

    els.list.addEventListener("click", function (e) {
      var item = e.target.closest(".wkconv-item");
      if (!item) {
        if (e.target.closest('[data-act="retry"]')) sync("retry");
        return;
      }
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
          '<div class="wkconv-head-row">' +
            '<button class="wkconv-back" type="button">‹</button>' +
            '<div class="wkconv-title"><h1>' + esc(t("title", "悟空会话")) + '</h1><div class="wkconv-status">' + esc(t("loading", "正在加载会话...")) + '</div></div>' +
            '<button class="wkconv-refresh" type="button">↻</button>' +
            '<button class="wkconv-new" type="button">＋</button>' +
          '</div>' +
          '<div class="wkconv-search-wrap"><span class="wkconv-search-icon">⌕</span><input class="wkconv-search" type="search" placeholder="' + esc(t("search", "搜索会话")) + '"></div>' +
        '</header>' +
        '<main class="wkconv-list-wrap"><ul class="wkconv-list"></ul></main>' +
      '</div>' +
      '<div class="wkconv-menu-mask"><div class="wkconv-menu"><div class="wkconv-menu-title"></div><div class="wkconv-menu-list"></div></div></div>';

    els = {
      app: D.getElementById("wkconv-app"),
      status: root.querySelector(".wkconv-status"),
      search: root.querySelector(".wkconv-search"),
      list: root.querySelector(".wkconv-list"),
      back: root.querySelector(".wkconv-back"),
      refresh: root.querySelector(".wkconv-refresh"),
      newChat: root.querySelector(".wkconv-new"),
      menuMask: root.querySelector(".wkconv-menu-mask"),
      menuTitle: root.querySelector(".wkconv-menu-title"),
      menuList: root.querySelector(".wkconv-menu-list")
    };
  }

  async function boot() {
    cfg = c();
    root = D.getElementById("nodebb-wukong-conversations-root");
    if (!root) return;

    D.body.classList.add("wkconv-page");
    await loadI18n();
    mountHtml();
    bind();

    sync("boot");
    startRealtime();
    startPoll();

    W.WukongConversations = {
      version: "v1",
      sync: sync,
      dump: function () { return state; }
    };
  }

  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
