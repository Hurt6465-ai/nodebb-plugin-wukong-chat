(function () {
  "use strict";

  // ============================================================
  // CP Harmony Peer Call v7 — 现代化语音 / 视频通话
  // - 现代 SVG 图标（无 FontAwesome 依赖）
  // - 完整通话音效（呼出 / 来电 / 接通 / 挂断 / 拒绝）
  // - 前后摄像头切换（replaceTrack，无需重协商）
  // - 可拖动本地小窗 + 点击放大 / 全屏切换（仿微信）
  // - 断线自动重连 + ICE 状态监控，连接更稳定
  // - 全局监听：不在聊天窗口也能接听来电
  // ============================================================

  try {
    if (
      window.CPHarmonyCall &&
      /^v[1-6]-/.test(String(window.CPHarmonyCall.version || "")) &&
      typeof window.CPHarmonyCall.destroy === "function"
    ) {
      window.CPHarmonyCall.destroy();
    }
  } catch (_) {}

  if (window.__cpHarmonyPeerCallInitedV7) return;
  window.__cpHarmonyPeerCallInitedV7 = true;

  // ----------------------------------------------------------------
  // 配置
  // ----------------------------------------------------------------
  var DEFAULTS = {
    enabled: true,
    debug: false,
    signalPrefix: "__cp_harmony_call__:",
    protocol: "cp-harmony-peer-call-v7",
    personChannel: 1,
    peerjsUrl: "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js",
    wkSdkUrl: "/plugins/nodebb-plugin-wukong-chat/static/vendor/wukongimjssdk.umd.js?v=28",
    wkSdkFallbackUrl: "https://cdn.jsdelivr.net/npm/wukongimjssdk@latest/lib/wukongimjssdk.umd.js",
    tokenPath: "/api/wukong/token",
    tokenFallbackPath: "/bridge/token",
    wkWsPath: "/wkws/",
    wkAddr: "",
    callTimeoutMs: 30000,    // 振铃 / 无应答超时
    connectTimeoutMs: 35000, // 接通前的协商超时
    signalTtlMs: 45000,      // 信令有效期
    reconnectMaxTries: 5,    // PeerJS 信令断线重连次数
    iceReconnectGraceMs: 8000, // ICE 进入 disconnected 后的容忍时间
    enableVideo: true,
    showButton: true,
    globalListen: true,
    autoConnectWukong: true,
    peerOptions: {},
    iceServers: null
  };

  var CFG = Object.assign({}, DEFAULTS, window.CPHarmonyCallConfig || {});
  if (CFG.enabled === false) return;

  var SIGNAL_PREFIX = CFG.signalPrefix;
  var CALL_PROTOCOL = CFG.protocol;
  var PERSON_CHANNEL = CFG.personChannel;
  var SIGNAL_TTL_MS = Number(CFG.signalTtlMs);
  var CALL_TIMEOUT_MS = Number(CFG.callTimeoutMs);
  var CONNECT_TIMEOUT_MS = Number(CFG.connectTimeoutMs);
  var CLOSED_CALLS_KEY = "cp_harmony_closed_calls_v7";
  var RING_UNLOCKED_KEY = "__cpHarmonyCallAudioUnlockedV7";

  // ----------------------------------------------------------------
  // 状态
  // ----------------------------------------------------------------
  var State = {
    wkReady: false,
    wkConnected: false,
    wkReadyPromise: null,
    wkToken: "",
    wkAddr: "",
    myUid: "",

    peer: null,
    peerId: "",
    peerReadyPromise: null,
    peerScriptPromise: null,
    reconnectTries: 0,

    mediaCall: null,
    localStream: null,
    remoteStream: null,
    pendingMode: "audio",

    callId: "",
    direction: "",
    mode: "audio",
    connected: false,
    incomingInvite: null,

    facingMode: "user",       // user | environment
    switchingCamera: false,

    remoteUser: { uid: "", name: "好友", avatar: "" },

    callTimer: null,
    timeoutTimer: null,
    connectTimer: null,
    iceGraceTimer: null,
    sec: 0,

    isMicOn: true,
    isCamOn: false,
    pipExpanded: false,
    ending: false,

    seenSignals: {},
    domObserver: null,
    injectTimer: null,
    started: false
  };

  var AudioFX = {
    ctx: null,
    stops: [],
    unlocked: !!window[RING_UNLOCKED_KEY],
    bound: false,
    mode: ""
  };

  // ----------------------------------------------------------------
  // 工具
  // ----------------------------------------------------------------
  function noop() {}
  function warn(scope, err) { if (CFG.debug) { try { console.warn("[cp-call][" + scope + "]", err); } catch (_) {} } }
  function byId(id) { return document.getElementById(id); }
  function now() { return Date.now(); }

  function relativePath() { return (window.config && window.config.relative_path) || ""; }
  function withRelativePath(path) {
    path = String(path || "");
    if (/^https?:\/\//i.test(path) || /^wss?:\/\//i.test(path)) return path;
    if (!path) return relativePath() || "/";
    if (path.charAt(0) !== "/") path = "/" + path;
    return relativePath() + path;
  }

  function pageInfo() { return window.__NBB_WUKONG_PAGE__ || {}; }
  function cfgObj() { return (window.CPChatHarmony && window.CPChatHarmony.config) || {}; }

  function routeTargetUid() {
    var p = pageInfo(), cfg = cfgObj();
    var direct = p.targetUid || cfg.targetUid || cfg.uid || "";
    if (direct) return String(direct).trim();
    var root = byId("nodebb-wukong-root");
    if (root && root.getAttribute("data-target-uid")) return String(root.getAttribute("data-target-uid") || "").trim();
    try {
      var q = new URLSearchParams(location.search || "");
      direct = q.get("uid") || q.get("to_uid") || q.get("targetUid") || "";
      if (direct) return String(direct).trim();
    } catch (_) {}
    var m = String(location.pathname || "").match(/\/wukong\/([^/?#]+)/i);
    if (m && m[1]) { try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; } }
    return "";
  }

  function routeChannelType() {
    var p = pageInfo(), cfg = cfgObj();
    var root = byId("nodebb-wukong-root");
    var raw = p.channelType || cfg.channelType || (root && root.getAttribute("data-channel-type")) || "1";
    return Number(raw || 1) || 1;
  }

  function isPrivateWukongChat() {
    var p = pageInfo(), cfg = cfgObj();
    if (p.tid || cfg.tid) return false;
    if (routeChannelType() !== 1) return false;
    var target = routeTargetUid();
    return !!target && target !== "0";
  }

  function isChatContext() {
    if (!isPrivateWukongChat()) return false;
    return !!(
      document.querySelector("#cp-chat-root .cp-header") ||
      document.querySelector('[component="chat/messages"]') ||
      document.querySelector('[component="chat/main-wrapper"]')
    );
  }

  function uid() {
    var cfg = cfgObj();
    return String(
      State.myUid ||
      cfg.uid ||
      (window.app && window.app.user && window.app.user.uid) ||
      (window.ajaxify && ajaxify.data && ajaxify.data.loggedInUser && ajaxify.data.loggedInUser.uid) ||
      ""
    );
  }
  function myName() { return String((window.app && window.app.user && window.app.user.username) || "我"); }
  function myAvatar() { return String((window.app && window.app.user && window.app.user.picture) || ""); }

  function createId() { return "call_" + now() + "_" + Math.random().toString(36).slice(2, 8); }

  function escAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function showToast(text) {
    if (!text) return;
    var n = byId("cp-call-toast");
    if (!n) {
      n = document.createElement("div");
      n.id = "cp-call-toast";
      n.style.cssText =
        "position:fixed;left:50%;top:14%;transform:translateX(-50%);" +
        "z-index:2147483647;background:rgba(20,22,28,.86);color:#fff;" +
        "padding:11px 18px;border-radius:14px;font-size:14px;font-weight:600;" +
        "max-width:80vw;text-align:center;pointer-events:none;backdrop-filter:blur(10px);" +
        "box-shadow:0 8px 24px rgba(0,0,0,.25);opacity:0;transition:opacity .2s ease;";
      document.body.appendChild(n);
    }
    n.textContent = String(text);
    n.style.display = "block";
    requestAnimationFrame(function () { n.style.opacity = "1"; });
    clearTimeout(n._timer);
    n._timer = setTimeout(function () {
      n.style.opacity = "0";
      setTimeout(function () { if (n) n.style.display = "none"; }, 220);
    }, 2400);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var exists = document.querySelector('script[src="' + src + '"]');
      if (exists) {
        if (exists.getAttribute("data-loaded") === "1") return resolve();
        exists.addEventListener("load", resolve, { once: true });
        exists.addEventListener("error", reject, { once: true });
        return;
      }
      var s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = function () { s.setAttribute("data-loaded", "1"); resolve(); };
      s.onerror = function () { reject(new Error("脚本加载失败：" + src)); };
      document.head.appendChild(s);
    });
  }

  // ----------------------------------------------------------------
  // 已结束通话记录（防止过期/已挂断的 invite 重新振铃）
  // ----------------------------------------------------------------
  function getClosedCalls() {
    try { return JSON.parse(sessionStorage.getItem(CLOSED_CALLS_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveClosedCalls(map) {
    try { sessionStorage.setItem(CLOSED_CALLS_KEY, JSON.stringify(map || {})); } catch (e) {}
  }
  function markClosedCall(callId) {
    if (!callId) return;
    var map = getClosedCalls();
    map[String(callId)] = now();
    var cutoff = now() - 10 * 60 * 1000;
    Object.keys(map).forEach(function (k) { if (map[k] < cutoff) delete map[k]; });
    saveClosedCalls(map);
  }
  function isClosedCall(callId) {
    if (!callId) return false;
    var map = getClosedCalls();
    var ts = map[String(callId)];
    if (!ts) return false;
    if (now() - ts > 10 * 60 * 1000) { delete map[String(callId)]; saveClosedCalls(map); return false; }
    return true;
  }

  // ----------------------------------------------------------------
  // 信令校验 / 去重
  // ----------------------------------------------------------------
  function normalizeOutgoingSignal(packet) {
    packet = packet || {};
    packet.protocol = CALL_PROTOCOL;
    packet.sentAt = packet.sentAt || now();
    if (packet.type === "invite") packet.expiresAt = packet.expiresAt || now() + SIGNAL_TTL_MS;
    return packet;
  }
  function isExpiredSignal(packet) {
    if (!packet) return true;
    var sentAt = Number(packet.sentAt || packet.ts || 0);
    var expiresAt = Number(packet.expiresAt || 0);
    if (expiresAt && now() > expiresAt) return true;
    if (sentAt && now() - sentAt > SIGNAL_TTL_MS) return true;
    return false;
  }
  function isValidCallSignal(packet) {
    if (!packet || !packet.type || !packet.callId) return false;
    if (packet.protocol !== CALL_PROTOCOL) return false;
    if (packet.to && String(packet.to) !== uid()) return false;
    if (packet.from && String(packet.from) === uid()) return false;
    return true;
  }
  function signalKey(p) {
    if (!p) return "";
    return [p.type || "", p.callId || "", p.from || "", p.to || "", p.ts || "", p.sentAt || ""].join("|");
  }
  function rememberSignal(packet) {
    var k = signalKey(packet);
    if (!k) return false;
    if (State.seenSignals[k]) return true;
    State.seenSignals[k] = now();
    var keys = Object.keys(State.seenSignals);
    if (keys.length > 200) {
      var cutoff = now() - 5 * 60 * 1000;
      keys.forEach(function (kk) { if (State.seenSignals[kk] < cutoff) delete State.seenSignals[kk]; });
    }
    return false;
  }

  // ----------------------------------------------------------------
  // 音效系统
  // ----------------------------------------------------------------
  function ensureAudioContext() {
    if (!AudioFX.ctx) {
      try { AudioFX.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    if (AudioFX.ctx.state === "suspended") AudioFX.ctx.resume().catch(noop);
    return AudioFX.ctx;
  }
  function unlockAudioNow() { AudioFX.unlocked = true; window[RING_UNLOCKED_KEY] = true; ensureAudioContext(); }
  function unlockAudioOnGesture() {
    if (window[RING_UNLOCKED_KEY]) { AudioFX.unlocked = true; return; }
    if (AudioFX.bound) return;
    AudioFX.bound = true;
    function unlock() {
      unlockAudioNow();
      document.removeEventListener("click", unlock, true);
      document.removeEventListener("touchstart", unlock, true);
      document.removeEventListener("keydown", unlock, true);
    }
    document.addEventListener("click", unlock, true);
    document.addEventListener("touchstart", unlock, true);
    document.addEventListener("keydown", unlock, true);
  }
  function playTone(freq, delay, duration, volume, type) {
    var ctx = ensureAudioContext();
    if (!ctx) return noop;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var startAt = ctx.currentTime + (delay || 0);
    var endAt = startAt + (duration || 0.18);
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, startAt);
    osc.connect(gain); gain.connect(ctx.destination);
    var v = Math.min(0.2, volume || 0.05);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(v, startAt + 0.03);
    gain.gain.setValueAtTime(v, Math.max(startAt + 0.04, endAt - 0.04));
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    osc.start(startAt); osc.stop(endAt + 0.03);
    return function () { try { osc.stop(); } catch (e) {} };
  }
  function stopRing() {
    while (AudioFX.stops.length) { try { AudioFX.stops.pop()(); } catch (e) {} }
    AudioFX.mode = "";
    if (navigator.vibrate) { try { navigator.vibrate(0); } catch (e) {} }
  }
  function playOutgoingRing() {
    stopRing(); AudioFX.mode = "outgoing";
    if (!AudioFX.unlocked || !ensureAudioContext()) return;
    var stopped = false, timers = [];
    function cycle() {
      if (stopped) return;
      playTone(440, 0.0, 0.4, 0.045, "sine");
    }
    cycle();
    timers.push(setInterval(cycle, 3000));
    AudioFX.stops.push(function () { stopped = true; timers.forEach(clearInterval); });
  }
  function playIncomingRing() {
    stopRing(); AudioFX.mode = "incoming";
    if (!AudioFX.unlocked || !ensureAudioContext()) {
      if (navigator.vibrate) { try { navigator.vibrate([260, 120, 260, 800]); } catch (e) {} }
      return;
    }
    var stopped = false, timers = [];
    function cycle() {
      if (stopped) return;
      playTone(659, 0.00, 0.22, 0.075, "triangle");
      playTone(784, 0.26, 0.22, 0.072, "triangle");
      playTone(988, 0.52, 0.30, 0.070, "triangle");
      playTone(784, 0.92, 0.22, 0.066, "triangle");
      if (navigator.vibrate) { try { navigator.vibrate([200, 90, 200, 700]); } catch (e) {} }
    }
    cycle();
    timers.push(setInterval(cycle, 2200));
    AudioFX.stops.push(function () {
      stopped = true; timers.forEach(clearInterval);
      if (navigator.vibrate) { try { navigator.vibrate(0); } catch (e) {} }
    });
  }
  function playConnectedTone() {
    stopRing();
    if (!AudioFX.unlocked) return;
    playTone(784, 0.00, 0.12, 0.06, "sine");
    playTone(1175, 0.12, 0.16, 0.05, "sine");
  }
  function playHangupTone() {
    if (!AudioFX.unlocked) return;
    playTone(523, 0.00, 0.14, 0.05, "sine");
    playTone(392, 0.13, 0.20, 0.045, "sine");
  }

  // ----------------------------------------------------------------
  // 悟空 IM 信令通道
  // ----------------------------------------------------------------
  async function fetchBridgeToken() {
    var paths = [];
    if (CFG.tokenPath) paths.push(CFG.tokenPath);
    if (CFG.tokenFallbackPath) paths.push(CFG.tokenFallbackPath);
    paths.push("/api/wukong/token", "/bridge/token");
    var tried = {};
    for (var i = 0; i < paths.length; i++) {
      var path = paths[i];
      if (!path || tried[path]) continue;
      tried[path] = true;
      try {
        var res = await fetch(withRelativePath(path), {
          credentials: "same-origin", headers: { accept: "application/json" }
        });
        if (!res.ok) continue;
        var json = await res.json();
        var data = json && json.data && typeof json.data === "object" ? json.data : json;
        if (data && (data.token || data.uid || data.wkUid)) return data;
      } catch (e) { warn("token-endpoint", { path: path, error: e }); }
    }
    return {};
  }

  function extractWkPayload(m) {
    try {
      if (!m) return null;
      if (m.payload) {
        if (typeof m.payload === "object") return m.payload;
        if (typeof m.payload === "string") {
          if (m.payload.charAt(0) === "{") return JSON.parse(m.payload);
          var raw = atob(m.payload);
          var decoded = decodeURIComponent(raw.split("").map(function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(""));
          return JSON.parse(decoded);
        }
      }
      if (m.content && typeof m.content === "object") return m.content;
      if (typeof m.content === "string") return JSON.parse(m.content);
    } catch (e) {}
    return null;
  }

  function parseSignalFromWkMessage(m) {
    var payload = extractWkPayload(m);
    if (!payload) return null;
    var text = payload.text || payload.content || payload.body || "";
    if (typeof text !== "string") return null;
    if (text.indexOf(SIGNAL_PREFIX) !== 0) return null;
    try { return JSON.parse(text.slice(SIGNAL_PREFIX.length)); } catch (e) { return null; }
  }

  async function waitForWukongConnected(timeoutMs) {
    timeoutMs = timeoutMs || 2500;
    if (State.wkConnected) return;
    await new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(); } }, timeoutMs);
      try {
        var sdk = window.wk && window.wk.WKSDK && window.wk.WKSDK.shared();
        if (!sdk || !sdk.connectManager || !sdk.connectManager.addConnectStatusListener) {
          clearTimeout(timer); return resolve();
        }
        sdk.connectManager.addConnectStatusListener(function (status) {
          if (status === 1 || status === "connected" || status === "CONNECTED") {
            State.wkConnected = true;
            if (!done) { done = true; clearTimeout(timer); resolve(); }
          }
        });
      } catch (e) { clearTimeout(timer); resolve(); }
    });
  }

  async function ensureWukong() {
    if (State.wkReady && window.wk && window.wk.WKSDK) { await waitForWukongConnected(1200); return; }
    if (State.wkReadyPromise) { await State.wkReadyPromise; return; }

    State.wkReadyPromise = (async function () {
      if (!window.wk || !window.wk.WKSDK) {
        try { await loadScript(CFG.wkSdkUrl); }
        catch (e) {
          if (CFG.wkSdkFallbackUrl) await loadScript(CFG.wkSdkFallbackUrl);
          else throw e;
        }
      }
      var tokenData = await fetchBridgeToken();
      State.myUid = String(tokenData.uid || tokenData.wkUid || uid() || "");
      State.wkToken = String(tokenData.token || "");
      State.wkAddr = CFG.wkAddr ||
        ((location.protocol === "https:" ? "wss://" : "ws://") + location.host + (CFG.wkWsPath || "/wkws/"));

      if (!State.myUid) throw new Error("没有获取到当前用户 UID");
      if (!State.wkToken) throw new Error("没有获取到悟空 IM token");

      var sdk = window.wk.WKSDK.shared();
      sdk.config.uid = State.myUid;
      sdk.config.token = State.wkToken;
      sdk.config.addr = State.wkAddr;

      if (!window.__cpHarmonyCallWkListenerBoundV7) {
        window.__cpHarmonyCallWkListenerBoundV7 = true;
        sdk.chatManager.addMessageListener(function (message) {
          var packet = parseSignalFromWkMessage(message);
          if (packet) handleSignal(packet);
        });
        if (sdk.connectManager && sdk.connectManager.addConnectStatusListener) {
          sdk.connectManager.addConnectStatusListener(function (status) {
            if (status === 1 || status === "connected" || status === "CONNECTED") State.wkConnected = true;
            else if (status === 0 || status === "disconnected" || status === "DISCONNECTED") State.wkConnected = false;
          });
        }
      }
      try { sdk.connectManager.connect(); } catch (e) {}
      State.wkReady = true;
      await waitForWukongConnected(2500);
    })().catch(function (err) {
      State.wkReady = false; State.wkReadyPromise = null; throw err;
    });

    await State.wkReadyPromise;
  }

  function sendSignal(packet) {
    return ensureWukong().then(function () {
      var toUid = packet.to || State.remoteUser.uid;
      if (!toUid) throw new Error("缺少对方 UID");
      if (!window.wk || !window.wk.WKSDK) throw new Error("悟空 IM 不可用");
      packet = normalizeOutgoingSignal(packet);
      packet.from = packet.from || uid();
      packet.to = String(toUid);
      packet.ts = packet.ts || now();
      var channel = new window.wk.Channel(String(toUid), PERSON_CHANNEL);
      var content = new window.wk.MessageText(SIGNAL_PREFIX + JSON.stringify(packet));
      return window.wk.WKSDK.shared().chatManager.send(content, channel);
    });
  }

  // ----------------------------------------------------------------
  // PeerJS 连接（含断线重连）
  // ----------------------------------------------------------------
  function ensurePeerJS() {
    if (window.Peer) return Promise.resolve();
    if (!State.peerScriptPromise) {
      State.peerScriptPromise = loadScript(CFG.peerjsUrl).catch(function (err) {
        State.peerScriptPromise = null; throw err;
      });
    }
    return State.peerScriptPromise;
  }
  function getIceServers() {
    return CFG.iceServers || [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" }
    ];
  }
  function resetPeer() {
    if (State.peer) { try { State.peer.destroy(); } catch (e) {} }
    State.peer = null; State.peerId = ""; State.peerReadyPromise = null;
  }

  function tryReconnectPeer() {
    if (!State.peer || State.peer.destroyed) return;
    if (State.reconnectTries >= CFG.reconnectMaxTries) {
      if (State.callId) { showToast("网络连接中断"); endCall(false); }
      return;
    }
    State.reconnectTries++;
    try { State.peer.reconnect(); } catch (e) { warn("peer-reconnect", e); }
  }

  async function initPeer() {
    if (State.peer && State.peerId && !State.peer.destroyed && !State.peer.disconnected) return State.peerId;
    if (State.peer && (State.peer.destroyed || State.peer.disconnected)) {
      // 信令断开但 peer 对象在，尝试快速 reconnect
      if (State.peer.disconnected && !State.peer.destroyed) {
        try {
          State.peer.reconnect();
          await new Promise(function (r) { setTimeout(r, 800); });
          if (State.peerId && !State.peer.disconnected) return State.peerId;
        } catch (e) {}
      }
      resetPeer();
    }
    if (State.peerReadyPromise) return State.peerReadyPromise;

    State.peerReadyPromise = (async function () {
      await ensurePeerJS();
      return await new Promise(function (resolve, reject) {
        var peerOptions = Object.assign({}, CFG.peerOptions || {}, {
          debug: CFG.debug ? 1 : 0,
          config: Object.assign({}, (CFG.peerOptions && CFG.peerOptions.config) || {}, {
            iceServers: getIceServers()
          })
        });
        State.peer = new window.Peer(peerOptions);

        State.peer.on("open", function (id) {
          State.peerId = id; State.reconnectTries = 0; resolve(id);
        });

        // 作为「被叫」收到媒体呼叫：仅在我是 outgoing 发起方时接受
        State.peer.on("call", function (call) {
          var meta = call.metadata || {};
          if (!State.callId || meta.callId !== State.callId || State.direction !== "outgoing") {
            try { call.close(); } catch (e) {}
            return;
          }
          State.mediaCall = call;
          getMedia(State.mode).then(function (stream) {
            call.answer(stream);
            bindMediaCall(call);
            setStatus("连接中…");
            startConnectGuard();
          }).catch(function (err) {
            warn("answer-media", err);
            try { call.close(); } catch (e) {}
            endCall(true);
          });
        });

        State.peer.on("disconnected", function () {
          // 信令服务器断开，但 P2P 媒体可能仍在。尝试重连信令。
          if (State.peer && !State.peer.destroyed) tryReconnectPeer();
          else if (State.callId) { showToast("信令断开"); endCall(false); }
        });

        State.peer.on("error", function (err) {
          warn("peer-error", err);
          var type = err && err.type;
          if (!State.peerId) {
            // 初始化阶段失败
            if (type === "network" || type === "server-error" || type === "socket-error") {
              // 让 reject 触发上层重试
            }
            reject(err); return;
          }
          if (type === "peer-unavailable") {
            if (State.callId && !State.connected) { showToast("对方暂时不可达"); }
            return;
          }
          if (State.callId && !State.connected && type !== "network") {
            showToast("连接失败"); endCall(false);
          }
        });
      });
    })().catch(function (err) { resetPeer(); throw err; });

    return State.peerReadyPromise;
  }

  // ----------------------------------------------------------------
  // 媒体流
  // ----------------------------------------------------------------
  function audioConstraints() {
    return { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  }
  function videoConstraints(facing) {
    return {
      facingMode: facing ? { ideal: facing } : "user",
      width: { ideal: 1280 }, height: { ideal: 720 },
      frameRate: { ideal: 24, max: 30 }
    };
  }

  async function getMedia(mode) {
    if (State.localStream) return State.localStream;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("当前浏览器不支持音视频通话");
    }
    var wantsVideo = mode === "video";
    try {
      State.localStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints(),
        video: wantsVideo ? videoConstraints(State.facingMode) : false
      });
    } catch (err) {
      if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        throw new Error("请允许麦克风/摄像头权限后再通话");
      }
      if (wantsVideo) {
        State.mode = "audio";
        State.localStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: false });
        showToast("摄像头不可用，已切换语音");
      } else throw err;
    }
    State.isMicOn = !!State.localStream.getAudioTracks()[0];
    State.isCamOn = !!State.localStream.getVideoTracks()[0];
    bindLocalStream();
    syncButtons();
    return State.localStream;
  }

  function stopTracks(stream) {
    if (!stream || !stream.getTracks) return;
    stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
  }

  // 切换前后摄像头（不重协商，replaceTrack）
  async function switchCamera() {
    if (State.mode !== "video" || !State.localStream || State.switchingCamera) return;
    if (!State.mediaCall || !State.mediaCall.peerConnection) { showToast("通话未就绪"); return; }
    State.switchingCamera = true;
    var newFacing = State.facingMode === "user" ? "environment" : "user";
    try {
      var ns = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints(newFacing) });
      var newTrack = ns.getVideoTracks()[0];
      if (!newTrack) throw new Error("no video track");

      var pc = State.mediaCall.peerConnection;
      var sender = pc.getSenders().filter(function (s) { return s.track && s.track.kind === "video"; })[0];
      if (sender) await sender.replaceTrack(newTrack);

      var oldTrack = State.localStream.getVideoTracks()[0];
      if (oldTrack) { State.localStream.removeTrack(oldTrack); try { oldTrack.stop(); } catch (e) {} }
      State.localStream.addTrack(newTrack);
      newTrack.enabled = State.isCamOn;

      State.facingMode = newFacing;
      bindLocalStream();
      showToast(newFacing === "user" ? "前置摄像头" : "后置摄像头");
    } catch (err) {
      warn("switch-camera", err);
      showToast("无法切换摄像头");
    } finally {
      State.switchingCamera = false;
    }
  }

  function bindLocalStream() {
    var local = byId("cp-call-local-video");
    var wrap = byId("cp-call-local-wrap");
    if (local) {
      local.srcObject = State.localStream || null;
      // 后置摄像头不镜像
      local.style.transform = State.facingMode === "environment" ? "none" : "scaleX(-1)";
    }
    if (wrap) {
      wrap.style.display =
        State.localStream && State.mode === "video" && State.localStream.getVideoTracks().length ? "block" : "none";
    }
  }

  function bindRemoteStream(stream) {
    var remoteVideo = byId("cp-call-remote-video");
    var remoteAudio = byId("cp-call-remote-audio");
    var hasVideo = stream && stream.getVideoTracks && stream.getVideoTracks().length;
    if (remoteVideo) {
      remoteVideo.srcObject = stream || null;
      remoteVideo.style.display = hasVideo ? "block" : "none";
    }
    if (remoteAudio) remoteAudio.srcObject = stream || null;
  }

  function bindMediaCall(call) {
    State.mediaCall = call;
    call.on("stream", function (remoteStream) {
      State.remoteStream = remoteStream;
      bindRemoteStream(remoteStream);
      markConnected();
    });
    call.on("close", function () { if (State.callId) endCall(true); });
    call.on("error", function (err) { warn("media-call", err); if (State.callId) endCall(true); });

    // ICE 状态监控：disconnected 给一段宽限期等待自动恢复，failed 直接结束
    try {
      var pc = call.peerConnection;
      if (pc) {
        pc.oniceconnectionstatechange = function () {
          var st = pc.iceConnectionState;
          if (st === "connected" || st === "completed") {
            clearTimeout(State.iceGraceTimer);
            markConnected();
          } else if (st === "disconnected") {
            clearTimeout(State.iceGraceTimer);
            State.iceGraceTimer = setTimeout(function () {
              if (State.callId && pc.iceConnectionState === "disconnected") {
                showToast("网络不稳定，正在重连…");
              }
            }, 1500);
          } else if (st === "failed") {
            clearTimeout(State.iceGraceTimer);
            State.iceGraceTimer = setTimeout(function () {
              if (State.callId && pc.iceConnectionState === "failed") {
                showToast("连接已断开"); endCall(false);
              }
            }, CFG.iceReconnectGraceMs);
            // 尝试 ICE 重启
            try { if (pc.restartIce) pc.restartIce(); } catch (e) {}
          }
        };
      }
    } catch (e) { warn("ice-monitor", e); }
  }

  // ----------------------------------------------------------------
  // 计时 / 状态
  // ----------------------------------------------------------------
  function startConnectGuard() {
    clearTimeout(State.connectTimer);
    State.connectTimer = setTimeout(function () {
      if (State.callId && !State.connected) { showToast("连接超时"); endCall(false); }
    }, CONNECT_TIMEOUT_MS);
  }
  function startTimer() {
    clearInterval(State.callTimer);
    State.sec = 0; setStatus("00:00");
    State.callTimer = setInterval(function () {
      State.sec += 1;
      var m = String(Math.floor(State.sec / 60)).padStart(2, "0");
      var s = String(State.sec % 60).padStart(2, "0");
      setStatus(m + ":" + s);
    }, 1000);
  }
  function markConnected() {
    if (State.connected) return;
    State.connected = true;
    clearTimeout(State.timeoutTimer);
    clearTimeout(State.connectTimer);
    startTimer();
    setMainConnectedMode();
    playConnectedTone();
  }
  function setStatus(text) { var el = byId("cp-call-status"); if (el) el.textContent = text || ""; }

  // ----------------------------------------------------------------
  // 对端信息提取
  // ----------------------------------------------------------------
  function getPeerUid() {
    var direct = routeTargetUid();
    if (direct && direct !== "0") return String(direct);
    var me = uid();
    if (window.ajaxify && ajaxify.data && Array.isArray(ajaxify.data.users)) {
      for (var i = 0; i < ajaxify.data.users.length; i++) {
        var u = ajaxify.data.users[i];
        if (String(u.uid) !== me && String(u.uid) !== "0") return String(u.uid);
      }
    }
    var row = document.querySelector('[component="chat/user/list"] [data-uid]:not([data-uid="' + me + '"])');
    if (row) return String(row.getAttribute("data-uid") || "");
    var native = document.querySelector('[component="chat/messages"] [component="chat/message"][data-uid]');
    if (native && String(native.getAttribute("data-uid") || "") !== me) return String(native.getAttribute("data-uid") || "");
    return "";
  }
  function getPeerName() {
    var el = document.querySelector("#cp-peer-info a, #cp-peer-info");
    if (el && el.textContent.trim()) return el.textContent.trim();
    if (window.ajaxify && ajaxify.data && Array.isArray(ajaxify.data.users)) {
      var me = uid();
      for (var i = 0; i < ajaxify.data.users.length; i++) {
        var u = ajaxify.data.users[i];
        if (String(u.uid) !== me && String(u.uid) !== "0" && u.username) return String(u.username);
      }
    }
    return State.remoteUser.name || "好友";
  }
  function getPeerAvatar() {
    var img = document.querySelector("#cp-peer-avatar img");
    if (img && img.getAttribute("src")) return img.getAttribute("src");
    if (window.ajaxify && ajaxify.data && Array.isArray(ajaxify.data.users)) {
      var me = uid();
      for (var i = 0; i < ajaxify.data.users.length; i++) {
        var u = ajaxify.data.users[i];
        if (String(u.uid) !== me && String(u.uid) !== "0" && u.picture) return String(u.picture);
      }
    }
    return "";
  }

  // ----------------------------------------------------------------
  // SVG 图标
  // ----------------------------------------------------------------
  var ICON = {
    phone: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    hangup: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.99.99 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48a.989.989 0 0 1-.71.29c-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.66-1.85.998.998 0 0 1-.56-.9v-3.1A14.7 14.7 0 0 0 12 9z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    video: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
    videoOff: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
    flip: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 8h7a2 2 0 0 1 2 2v6"/><path d="M13 16H6a2 2 0 0 1-2-2V8"/><polyline points="8 5 11 8 8 11"/><polyline points="16 13 13 16 16 19"/></svg>'
  };

  // ----------------------------------------------------------------
  // UI
  // ----------------------------------------------------------------
  function setRemoteInfo() {
    var name = State.remoteUser.name || "好友";
    var avatar = State.remoteUser.avatar || "";
    var nameEl = byId("cp-call-name");
    var inName = byId("cp-call-in-name");
    var avatarEl = byId("cp-call-avatar");
    var inAvatar = byId("cp-call-in-avatar");
    var bg = byId("cp-call-bg");
    if (nameEl) nameEl.textContent = name;
    if (inName) inName.textContent = name;
    [avatarEl, inAvatar].forEach(function (el) {
      if (!el) return;
      if (avatar) el.src = avatar; else el.removeAttribute("src");
      el.style.display = avatar ? "block" : "none";
    });
    if (bg) bg.style.backgroundImage = avatar ? 'url("' + escAttr(avatar) + '")' : "";
  }

  function showMainUI() {
    mountUI();
    var root = byId("cp-call-root"), main = byId("cp-call-main"), incoming = byId("cp-call-incoming");
    if (root) root.style.display = "block";
    if (main) main.style.display = "block";
    if (incoming) incoming.style.display = "none";
    setRemoteInfo(); syncButtons();
  }
  function showIncomingUI(packet) {
    mountUI();
    var root = byId("cp-call-root"), main = byId("cp-call-main"), incoming = byId("cp-call-incoming");
    var tip = byId("cp-call-in-tip");
    if (root) root.style.display = "block";
    if (main) main.style.display = "none";
    if (incoming) incoming.style.display = "flex";
    if (tip) tip.textContent = packet.mode === "video" ? "邀请你视频通话" : "邀请你语音通话";
    setRemoteInfo(); playIncomingRing();
  }
  function hideUI() {
    var root = byId("cp-call-root"), main = byId("cp-call-main"), incoming = byId("cp-call-incoming");
    if (root) root.style.display = "none";
    if (main) main.style.display = "none";
    if (incoming) incoming.style.display = "none";
  }
  function setMainConnectedMode() {
    var main = byId("cp-call-main");
    if (!main) return;
    main.classList.toggle("is-video", State.mode === "video");
    main.classList.toggle("is-audio", State.mode !== "video");
  }

  function cleanupCall() {
    stopRing();
    clearInterval(State.callTimer);
    clearTimeout(State.timeoutTimer);
    clearTimeout(State.connectTimer);
    clearTimeout(State.iceGraceTimer);
    if (State.mediaCall) { try { State.mediaCall.close(); } catch (e) {} }
    stopTracks(State.localStream);
    stopTracks(State.remoteStream);

    var local = byId("cp-call-local-video"), remote = byId("cp-call-remote-video");
    var audio = byId("cp-call-remote-audio"), bg = byId("cp-call-bg");
    var wrap = byId("cp-call-local-wrap");
    if (local) local.srcObject = null;
    if (remote) remote.srcObject = null;
    if (audio) audio.srcObject = null;
    if (bg) bg.style.backgroundImage = "";
    if (wrap) { wrap.style.left = ""; wrap.style.top = ""; wrap.style.right = "14px"; wrap.classList.remove("expanded"); }

    State.mediaCall = null; State.localStream = null; State.remoteStream = null;
    State.callId = ""; State.direction = ""; State.mode = "audio";
    State.connected = false; State.incomingInvite = null;
    State.remoteUser = { uid: "", name: "好友", avatar: "" };
    State.facingMode = "user"; State.switchingCamera = false;
    State.sec = 0; State.isMicOn = true; State.isCamOn = false;
    State.pipExpanded = false; State.ending = false;
    syncButtons();
  }

  function endCall(remoteEnded) {
    if (State.ending) return;
    State.ending = true;
    var oldCallId = State.callId, oldRemoteUid = State.remoteUser.uid;
    var type = State.direction === "outgoing" && !State.connected ? "cancel" : "end";
    if (oldCallId) markClosedCall(oldCallId);
    if (!remoteEnded && oldCallId && oldRemoteUid) {
      sendSignal({ type: type, callId: oldCallId, to: oldRemoteUid }).catch(noop);
    }
    playHangupTone();
    cleanupCall();
    hideUI();
  }

  // ----------------------------------------------------------------
  // 呼叫流程
  // ----------------------------------------------------------------
  async function startOutgoingCall(mode) {
    if (State.callId) { showToast("当前已有通话"); return; }
    await ensureWukong();
    var peerUid = getPeerUid();
    if (!peerUid) { showToast("请先进入私聊窗口"); return; }

    var peerId = await initPeer();
    State.callId = createId();
    State.direction = "outgoing";
    State.mode = mode || "audio";
    State.connected = false;
    State.remoteUser.uid = String(peerUid);
    State.remoteUser.name = getPeerName();
    State.remoteUser.avatar = getPeerAvatar();

    showMainUI();
    setMainConnectedMode();
    setStatus(State.mode === "video" ? "准备视频通话…" : "准备语音通话…");

    try {
      // 先拿媒体权限，失败则不向对方振铃
      await getMedia(State.mode);
      await sendSignal({
        type: "invite", callId: State.callId, mode: State.mode,
        to: State.remoteUser.uid, fromName: myName(), fromAvatar: myAvatar(), peerId: peerId
      });
      setStatus(State.mode === "video" ? "等待对方接听…" : "正在呼叫…");
      playOutgoingRing();
    } catch (err) {
      if (State.callId) markClosedCall(State.callId);
      cleanupCall(); hideUI();
      throw err;
    }

    clearTimeout(State.timeoutTimer);
    State.timeoutTimer = setTimeout(function () {
      if (State.callId && !State.connected) { showToast("对方无应答"); endCall(false); }
    }, CALL_TIMEOUT_MS);
  }

  async function acceptCall() {
    if (!State.incomingInvite) return;
    var invite = State.incomingInvite;
    if (!invite.peerId) throw new Error("缺少对方 Peer ID");

    stopRing(); unlockAudioNow();
    await ensureWukong();
    await initPeer();

    State.direction = "incoming";
    State.mode = invite.mode || "audio";
    showMainUI();
    setMainConnectedMode();
    setStatus("连接中…");

    var stream = await getMedia(State.mode);
    await sendSignal({ type: "accept", callId: State.callId, to: State.remoteUser.uid });

    var call = State.peer.call(invite.peerId, stream, {
      metadata: { callId: State.callId, from: uid(), mode: State.mode }
    });
    bindMediaCall(call);
    startConnectGuard();

    clearTimeout(State.timeoutTimer);
    State.timeoutTimer = setTimeout(function () {
      if (State.callId && !State.connected) { showToast("连接超时"); endCall(false); }
    }, CONNECT_TIMEOUT_MS);
  }

  function rejectCall() {
    if (!State.incomingInvite) return;
    if (State.callId) markClosedCall(State.callId);
    stopRing();
    sendSignal({ type: "reject", callId: State.callId, to: State.remoteUser.uid }).catch(noop);
    cleanupCall(); hideUI();
  }

  function handleSignal(packet) {
    if (!isValidCallSignal(packet)) return;
    if (rememberSignal(packet)) return;

    if (packet.type === "invite") {
      if (isExpiredSignal(packet) || isClosedCall(packet.callId)) return;
    }
    if (["cancel", "end", "reject", "busy"].indexOf(packet.type) >= 0) markClosedCall(packet.callId);

    if (packet.type === "invite") {
      if (State.callId && State.callId !== packet.callId) {
        sendSignal({ type: "busy", callId: packet.callId, to: packet.from }).catch(noop);
        return;
      }
      State.callId = packet.callId;
      State.direction = "incoming";
      State.mode = packet.mode || "audio";
      State.connected = false;
      State.incomingInvite = packet;
      State.remoteUser.uid = String(packet.from || "");
      State.remoteUser.name = packet.fromName || "好友";
      State.remoteUser.avatar = packet.fromAvatar || "";
      showIncomingUI(packet);
      clearTimeout(State.timeoutTimer);
      State.timeoutTimer = setTimeout(function () {
        if (State.callId && !State.connected) {
          markClosedCall(State.callId); stopRing(); cleanupCall(); hideUI();
        }
      }, CALL_TIMEOUT_MS);
      return;
    }

    if (!State.callId || packet.callId !== State.callId) return;

    if (packet.type === "accept") {
      clearTimeout(State.timeoutTimer);
      stopRing();
      setStatus("对方已接听，连接中…");
      startConnectGuard();
      return;
    }
    if (packet.type === "reject") { showToast("对方已拒绝"); endCall(true); return; }
    if (packet.type === "busy") { showToast("对方忙线中"); endCall(true); return; }
    if (packet.type === "cancel" || packet.type === "end") { endCall(true); return; }
  }

  // ----------------------------------------------------------------
  // 控制按钮
  // ----------------------------------------------------------------
  function toggleMic() {
    if (!State.localStream) return;
    var t = State.localStream.getAudioTracks()[0];
    if (!t) return;
    State.isMicOn = !State.isMicOn;
    t.enabled = State.isMicOn;
    syncButtons();
  }
  function toggleCamera() {
    if (!State.localStream || State.mode !== "video") return;
    var t = State.localStream.getVideoTracks()[0];
    if (!t) return;
    State.isCamOn = !State.isCamOn;
    t.enabled = State.isCamOn;
    bindLocalStream();
    syncButtons();
  }

  function syncButtons() {
    var mic = byId("cp-call-btn-mic");
    var cam = byId("cp-call-btn-cam");
    var flip = byId("cp-call-btn-flip");
    if (mic) {
      mic.classList.toggle("off", !State.isMicOn);
      mic.querySelector(".cp-call-ic").innerHTML = State.isMicOn ? ICON.mic : ICON.micOff;
      mic.querySelector(".cp-call-lbl").textContent = State.isMicOn ? "静音" : "已静音";
    }
    if (cam) {
      cam.style.display = State.mode === "video" ? "inline-flex" : "none";
      cam.classList.toggle("off", !State.isCamOn);
      cam.querySelector(".cp-call-ic").innerHTML = State.isCamOn ? ICON.video : ICON.videoOff;
      cam.querySelector(".cp-call-lbl").textContent = State.isCamOn ? "摄像头" : "已关闭";
    }
    if (flip) flip.style.display = State.mode === "video" ? "inline-flex" : "none";
  }

  // ----------------------------------------------------------------
  // 本地小窗拖动 + 点击放大
  // ----------------------------------------------------------------
  function enablePipInteractions() {
    var wrap = byId("cp-call-local-wrap");
    if (!wrap || wrap._cpBound) return;
    wrap._cpBound = true;

    var dragging = false, moved = false, startX = 0, startY = 0, baseLeft = 0, baseTop = 0;

    function onDown(e) {
      if (wrap.classList.contains("expanded")) return;
      var p = e.touches ? e.touches[0] : e;
      dragging = true; moved = false;
      startX = p.clientX; startY = p.clientY;
      var rect = wrap.getBoundingClientRect();
      baseLeft = rect.left; baseTop = rect.top;
      wrap.style.right = "auto";
      wrap.style.left = baseLeft + "px";
      wrap.style.top = baseTop + "px";
      wrap.style.transition = "none";
      document.addEventListener("mousemove", onMove, { passive: false });
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchend", onUp);
    }
    function onMove(e) {
      if (!dragging) return;
      var p = e.touches ? e.touches[0] : e;
      var dx = p.clientX - startX, dy = p.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      if (e.cancelable) e.preventDefault();
      var w = wrap.offsetWidth, h = wrap.offsetHeight;
      var nl = Math.min(Math.max(6, baseLeft + dx), window.innerWidth - w - 6);
      var nt = Math.min(Math.max(60, baseTop + dy), window.innerHeight - h - 100);
      wrap.style.left = nl + "px";
      wrap.style.top = nt + "px";
    }
    function onUp() {
      dragging = false;
      wrap.style.transition = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
      if (!moved) togglePipExpand();
    }

    wrap.addEventListener("mousedown", onDown);
    wrap.addEventListener("touchstart", onDown, { passive: true });
  }

  // 点击小窗：本地放大全屏，远端缩到小窗（仿微信切换主画面）
  function togglePipExpand() {
    if (State.mode !== "video") return;
    var wrap = byId("cp-call-local-wrap");
    var local = byId("cp-call-local-video");
    var remote = byId("cp-call-remote-video");
    if (!wrap || !local) return;
    State.pipExpanded = !State.pipExpanded;
    if (State.pipExpanded) {
      // 本地占满，远端放到小窗
      wrap.classList.add("expanded");
      wrap.style.left = ""; wrap.style.top = ""; wrap.style.right = "";
      // 交换：把远端流绑到小窗的视频上方便预览（用一个浮层简单处理：放大本地，远端仍在底层）
    } else {
      wrap.classList.remove("expanded");
      wrap.style.right = "14px"; wrap.style.left = ""; wrap.style.top = "";
    }
  }

  // ----------------------------------------------------------------
  // 样式
  // ----------------------------------------------------------------
  function injectStyle() {
    if (byId("cp-harmony-call-style")) return;
    var css = `
      #cp-call-root *{box-sizing:border-box;}
      .cp-harmony-call-slot{position:relative;flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-left:auto;margin-right:2px;z-index:30;}
      .cp-harmony-call-entry{width:38px;height:38px;min-width:38px;padding:0;border:none;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 4px 14px rgba(37,99,235,.35);-webkit-tap-highlight-color:transparent;transition:transform .15s ease,box-shadow .15s ease;}
      .cp-harmony-call-entry:hover{box-shadow:0 6px 18px rgba(37,99,235,.45);}
      .cp-harmony-call-entry:active{transform:scale(.9);}
      .cp-harmony-call-entry svg{width:19px;height:19px;}
      .cp-harmony-call-pop{position:absolute;right:0;top:46px;width:188px;padding:7px;border-radius:18px;background:rgba(255,255,255,.99);backdrop-filter:blur(20px) saturate(1.3);-webkit-backdrop-filter:blur(20px) saturate(1.3);border:1px solid rgba(0,0,0,.05);box-shadow:0 18px 44px rgba(15,23,42,.22);z-index:2147483450;animation:cp-pop-in .18s cubic-bezier(.2,.8,.2,1);}
      .cp-harmony-call-pop[hidden]{display:none!important;}
      @keyframes cp-pop-in{from{opacity:0;transform:translateY(-8px) scale(.95);}to{opacity:1;transform:translateY(0) scale(1);}}
      .cp-harmony-call-pop::before{content:"";position:absolute;right:22px;top:-6px;width:12px;height:12px;background:#fff;border-left:1px solid rgba(0,0,0,.05);border-top:1px solid rgba(0,0,0,.05);transform:rotate(45deg);}
      .cp-harmony-call-pop button{width:100%;height:50px;border:none;background:transparent;border-radius:14px;padding:8px 10px;display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left;color:#0f172a;transition:background .12s ease;}
      .cp-harmony-call-pop button:hover{background:#f1f5f9;}
      .cp-harmony-call-pop button:active{transform:scale(.98);}
      .cp-harmony-call-pop-icon{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;color:#fff;flex-shrink:0;}
      .cp-harmony-call-pop-icon svg{width:18px;height:18px;}
      .cp-harmony-call-pop-icon.audio{background:linear-gradient(135deg,#22c55e,#16a34a);}
      .cp-harmony-call-pop-icon.video{background:linear-gradient(135deg,#8b5cf6,#6d28d9);}
      .cp-harmony-call-pop-main b{display:block;font-size:14px;font-weight:700;color:#0f172a;}

      #cp-call-root{position:fixed;inset:0;z-index:2147483500;display:none;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Segoe UI",sans-serif;-webkit-tap-highlight-color:transparent;}
      #cp-call-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(40px) brightness(.42);transform:scale(1.12);background-color:#0f1620;}
      #cp-call-mask{position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,23,42,.15),rgba(8,12,20,.82));}
      #cp-call-main{position:absolute;inset:0;display:none;overflow:hidden;background:#070b11;}
      #cp-call-remote-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#070b11;display:none;}
      #cp-call-main.is-audio #cp-call-remote-video{display:none!important;}

      #cp-call-top{position:absolute;top:0;left:0;right:0;z-index:3;padding:calc(54px + env(safe-area-inset-top)) 20px 0;display:flex;flex-direction:column;align-items:center;text-align:center;pointer-events:none;}
      #cp-call-avatar{width:108px;height:108px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.16);box-shadow:0 16px 40px rgba(0,0,0,.4);background:#334155;}
      #cp-call-name{margin-top:20px;font-size:27px;font-weight:800;letter-spacing:.5px;text-shadow:0 2px 8px rgba(0,0,0,.3);}
      #cp-call-status{margin-top:10px;font-size:15px;opacity:.78;font-variant-numeric:tabular-nums;}
      #cp-call-main.is-video #cp-call-top{padding-top:calc(30px + env(safe-area-inset-top));background:linear-gradient(180deg,rgba(0,0,0,.45),rgba(0,0,0,0));padding-bottom:20px;}
      #cp-call-main.is-video #cp-call-avatar{display:none!important;}
      #cp-call-main.is-video #cp-call-name{font-size:20px;}

      #cp-call-local-wrap{position:absolute;right:14px;top:calc(96px + env(safe-area-inset-top));width:108px;height:152px;border-radius:18px;overflow:hidden;background:#000;display:none;z-index:8;box-shadow:0 16px 36px rgba(0,0,0,.4);border:1.5px solid rgba(255,255,255,.18);cursor:grab;transition:all .28s cubic-bezier(.2,.8,.2,1);}
      #cp-call-local-wrap:active{cursor:grabbing;}
      #cp-call-local-wrap.expanded{right:0!important;left:0!important;top:0!important;width:100%!important;height:100%!important;border-radius:0;border:none;box-shadow:none;z-index:4;cursor:zoom-out;}
      #cp-call-local-video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);}

      #cp-call-controls{position:absolute;left:0;right:0;bottom:0;z-index:9;padding:24px 18px calc(28px + env(safe-area-inset-bottom));display:flex;align-items:flex-end;justify-content:center;gap:18px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.5));}
      .cp-call-btn{display:inline-flex;flex-direction:column;align-items:center;gap:8px;background:none;border:none;cursor:pointer;color:#fff;-webkit-tap-highlight-color:transparent;}
      .cp-call-btn .cp-call-ic{width:60px;height:60px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.16);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);transition:transform .15s ease,background .15s ease;}
      .cp-call-btn:active .cp-call-ic{transform:scale(.9);}
      .cp-call-btn.off .cp-call-ic{background:#fff;color:#111;}
      .cp-call-btn .cp-call-lbl{font-size:12px;opacity:.85;font-weight:600;}
      .cp-call-btn.danger .cp-call-ic{background:#ef4444;box-shadow:0 8px 22px rgba(239,68,68,.45);}
      .cp-call-btn.danger:active .cp-call-ic{background:#dc2626;}

      #cp-call-incoming{position:absolute;inset:0;z-index:10;display:none;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:18vh;background:rgba(8,12,20,.55);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);text-align:center;}
      #cp-call-in-avatar{width:116px;height:116px;border-radius:50%;object-fit:cover;background:#334155;border:2px solid rgba(255,255,255,.16);box-shadow:0 16px 44px rgba(0,0,0,.4);animation:cp-pulse 2s ease-in-out infinite;}
      @keyframes cp-pulse{0%,100%{box-shadow:0 16px 44px rgba(0,0,0,.4),0 0 0 0 rgba(59,130,246,.4);}50%{box-shadow:0 16px 44px rgba(0,0,0,.4),0 0 0 18px rgba(59,130,246,0);}}
      #cp-call-in-name{margin-top:24px;font-size:28px;font-weight:800;}
      #cp-call-in-tip{margin-top:12px;font-size:15px;opacity:.78;}
      #cp-call-in-actions{position:absolute;bottom:calc(56px + env(safe-area-inset-bottom));left:0;right:0;display:flex;gap:64px;align-items:center;justify-content:center;}
      .cp-call-in-action{display:inline-flex;flex-direction:column;align-items:center;gap:10px;cursor:pointer;color:#fff;font-size:14px;font-weight:600;background:none;border:none;}
      .cp-call-in-circle{width:66px;height:66px;border-radius:50%;display:grid;place-items:center;color:#fff;transition:transform .15s ease;}
      .cp-call-in-action:active .cp-call-in-circle{transform:scale(.9);}
      .cp-call-in-circle.red{background:#ef4444;box-shadow:0 10px 28px rgba(239,68,68,.45);}
      .cp-call-in-circle.green{background:#22c55e;box-shadow:0 10px 28px rgba(34,197,94,.45);animation:cp-bounce 1.4s ease-in-out infinite;}
      @keyframes cp-bounce{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}
      .cp-call-in-circle svg{width:26px;height:26px;}
      .cp-call-in-circle.red svg{transform:rotate(135deg);}
      .cp-call-hidden-signal{display:none!important;}
    `;
    var st = document.createElement("style");
    st.id = "cp-harmony-call-style";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function mountUI() {
    if (byId("cp-call-root")) return;
    injectStyle();
    var root = document.createElement("div");
    root.id = "cp-call-root";
    root.innerHTML =
      '<div id="cp-call-bg"></div>' +
      '<div id="cp-call-mask"></div>' +
      '<div id="cp-call-main">' +
        '<video id="cp-call-remote-video" autoplay playsinline></video>' +
        '<audio id="cp-call-remote-audio" autoplay></audio>' +
        '<div id="cp-call-top">' +
          '<img id="cp-call-avatar" src="" alt="">' +
          '<div id="cp-call-name">好友</div>' +
          '<div id="cp-call-status">连接中…</div>' +
        '</div>' +
        '<div id="cp-call-local-wrap"><video id="cp-call-local-video" autoplay muted playsinline></video></div>' +
        '<div id="cp-call-controls">' +
          '<button type="button" class="cp-call-btn" id="cp-call-btn-mic"><span class="cp-call-ic">' + ICON.mic + '</span><span class="cp-call-lbl">静音</span></button>' +
          '<button type="button" class="cp-call-btn danger" id="cp-call-btn-end"><span class="cp-call-ic">' + ICON.hangup + '</span><span class="cp-call-lbl">挂断</span></button>' +
          '<button type="button" class="cp-call-btn" id="cp-call-btn-cam"><span class="cp-call-ic">' + ICON.video + '</span><span class="cp-call-lbl">摄像头</span></button>' +
          '<button type="button" class="cp-call-btn" id="cp-call-btn-flip" style="display:none"><span class="cp-call-ic">' + ICON.flip + '</span><span class="cp-call-lbl">翻转</span></button>' +
        '</div>' +
      '</div>' +
      '<div id="cp-call-incoming">' +
        '<img id="cp-call-in-avatar" src="" alt="">' +
        '<div id="cp-call-in-name">好友</div>' +
        '<div id="cp-call-in-tip">邀请你通话</div>' +
        '<div id="cp-call-in-actions">' +
          '<button type="button" class="cp-call-in-action" id="cp-call-reject"><span class="cp-call-in-circle red">' + ICON.phone + '</span><span>拒绝</span></button>' +
          '<button type="button" class="cp-call-in-action" id="cp-call-accept"><span class="cp-call-in-circle green">' + ICON.phone + '</span><span>接听</span></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);

    byId("cp-call-btn-end").addEventListener("click", function () { endCall(false); });
    byId("cp-call-btn-mic").addEventListener("click", toggleMic);
    byId("cp-call-btn-cam").addEventListener("click", toggleCamera);
    byId("cp-call-btn-flip").addEventListener("click", function () { switchCamera(); });
    byId("cp-call-accept").addEventListener("click", function () {
      acceptCall().catch(function (err) {
        warn("accept", err);
        showToast(err && err.message ? err.message : "接听失败");
        endCall(true);
      });
    });
    byId("cp-call-reject").addEventListener("click", rejectCall);

    enablePipInteractions();
  }

  // ----------------------------------------------------------------
  // 头部通话按钮注入
  // ----------------------------------------------------------------
  function injectHeaderButton() {
    if (CFG.showButton === false) return;
    if (!isChatContext()) return;
    injectStyle();
    var header = document.querySelector("#cp-chat-root .cp-header");
    var actions = document.querySelector("#cp-chat-root .cp-header-actions");
    if (!header || !actions) return;
    var existing = byId("cp-harmony-call-slot");
    if (existing && existing.parentNode === header) return;
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var slot = document.createElement("div");
    slot.id = "cp-harmony-call-slot";
    slot.className = "cp-harmony-call-slot";

    var videoButton = CFG.enableVideo === false ? "" :
      '<button type="button" data-mode="video">' +
        '<span class="cp-harmony-call-pop-icon video">' + ICON.video + '</span>' +
        '<span class="cp-harmony-call-pop-main"><b>视频通话</b></span>' +
      '</button>';

    slot.innerHTML =
      '<button type="button" class="cp-harmony-call-entry" id="cp-harmony-call-entry" aria-label="通话" title="通话">' + ICON.phone + '</button>' +
      '<div class="cp-harmony-call-pop" id="cp-harmony-call-pop" hidden>' +
        '<button type="button" data-mode="audio">' +
          '<span class="cp-harmony-call-pop-icon audio">' + ICON.phone + '</span>' +
          '<span class="cp-harmony-call-pop-main"><b>语音通话</b></span>' +
        '</button>' + videoButton +
      '</div>';

    header.insertBefore(slot, actions);

    var entry = byId("cp-harmony-call-entry");
    var pop = byId("cp-harmony-call-pop");
    entry.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      unlockAudioNow();
      pop.hidden = !pop.hidden;
    });
    pop.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-mode]");
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();
      unlockAudioNow();
      var mode = btn.getAttribute("data-mode") || "audio";
      pop.hidden = true;
      startOutgoingCall(mode).catch(function (err) {
        warn("start-call", err);
        showToast(err && err.message ? err.message : "发起通话失败");
        endCall(true);
      });
    });

    if (!window.__cpHarmonyCallPopOutsideBoundV7) {
      window.__cpHarmonyCallPopOutsideBoundV7 = true;
      document.addEventListener("click", function (e) {
        var p = byId("cp-harmony-call-pop");
        if (!p || p.hidden) return;
        if (!e.target.closest("#cp-harmony-call-pop") && !e.target.closest("#cp-harmony-call-entry")) p.hidden = true;
      });
    }
  }

  function removeHeaderButton() {
    var slot = byId("cp-harmony-call-slot");
    if (slot && slot.parentNode) { try { slot.parentNode.removeChild(slot); } catch (_) {} }
  }

  function hideSignalMessagesInDom() {
    if (!isChatContext()) return;
    var rows = document.querySelectorAll(
      "#cp-msg-list .cp-row, " + '[component="chat/messages"] [component="chat/message"]'
    );
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if ((row.textContent || "").indexOf(SIGNAL_PREFIX) < 0) continue;
      row.classList.add("cp-call-hidden-signal");
    }
  }

  function refreshChatBindings() {
    if (isChatContext()) { injectHeaderButton(); hideSignalMessagesInDom(); }
    else removeHeaderButton();
  }

  function destroy() {
    if (State.domObserver) { try { State.domObserver.disconnect(); } catch (e) {} State.domObserver = null; }
    clearTimeout(State.injectTimer);
    cleanupCall(); hideUI();
    removeHeaderButton();
    var root = byId("cp-call-root");
    if (root && root.parentNode) root.parentNode.removeChild(root);
    State.started = false;
  }

  // ----------------------------------------------------------------
  // 启动
  // ----------------------------------------------------------------
  function boot() {
    if (State.started) { refreshChatBindings(); return; }
    State.started = true;

    mountUI();
    refreshChatBindings();
    unlockAudioOnGesture();

    // 全局监听：无论在哪个页面都建立悟空连接以接听来电
    if (CFG.globalListen !== false && CFG.autoConnectWukong !== false) {
      ensureWukong().catch(function (err) { warn("global-ensure-wukong", err); });
    }

    if (!State.domObserver) {
      State.domObserver = new MutationObserver(function () {
        clearTimeout(State.injectTimer);
        State.injectTimer = setTimeout(refreshChatBindings, 80);
      });
      State.domObserver.observe(document.body, { childList: true, subtree: true });
    }

    if (!window.__cpHarmonyCallBeforeUnloadBoundV7) {
      window.__cpHarmonyCallBeforeUnloadBoundV7 = true;
      window.addEventListener("beforeunload", function () {
        if (State.callId && State.remoteUser.uid) {
          markClosedCall(State.callId);
          sendSignal({
            type: State.connected ? "end" : "cancel",
            callId: State.callId, to: State.remoteUser.uid
          }).catch(noop);
        }
      });
    }

    if (window.jQuery && !window.__cpHarmonyCallJqueryEventsBoundV7) {
      window.__cpHarmonyCallJqueryEventsBoundV7 = true;
      window.jQuery(window).on(
        "action:ajaxify.end action:chat.loaded action:chat.switched action:ajaxify.contentLoaded",
        function () { setTimeout(refreshChatBindings, 80); }
      );
    }
  }

  window.CPHarmonyCall = {
    version: "v7-modern-wukong-call",
    boot: boot,
    refresh: function () { injectHeaderButton(); hideSignalMessagesInDom(); return !!byId("cp-harmony-call-entry"); },
    start: function (mode) { unlockAudioNow(); return startOutgoingCall(mode || "audio"); },
    end: function () { return endCall(false); },
    switchCamera: switchCamera,
    getPeerId: function () { return State.peerId; },
    isActive: function () { return !!State.callId; },
    hideSignals: hideSignalMessagesInDom,
    destroy: destroy,
    config: CFG
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
