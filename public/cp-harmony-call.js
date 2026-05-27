(function () {
  "use strict";

  try {
    if (window.CPHarmonyCall && /^v5-/.test(String(window.CPHarmonyCall.version || "")) && typeof window.CPHarmonyCall.destroy === "function") {
      window.CPHarmonyCall.destroy();
    }
  } catch (_) {}

  if (window.__cpHarmonyPeerCallInitedV6) return;
  window.__cpHarmonyPeerCallInitedV6 = true;

  var SIGNAL_PREFIX = "__cp_harmony_call__:";
  var CALL_PROTOCOL = "cp-harmony-peer-call-v6";
  var PERSON_CHANNEL = 1;

  var PEERJS_CDN = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
  var WK_SDK_CDN = "https://cdn.jsdelivr.net/npm/wukongimjssdk@latest/lib/wukongimjssdk.umd.js";

  var CALL_TIMEOUT_MS = 30000;
  var CONNECT_TIMEOUT_MS = 35000;
  var SIGNAL_TTL_MS = 45000;
  var CLOSED_CALLS_KEY = "cp_harmony_closed_calls_v6";
  var RING_UNLOCKED_KEY = "__cpHarmonyCallAudioUnlockedV6";

  // Optional: set window.CPHarmonyCallConfig before loading this file.
  // Example:
  // window.CPHarmonyCallConfig = {
  //   peerOptions: { host: location.hostname, port: 443, path: "/peerjs", secure: true },
  //   iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  // };
  var UserConfig = Object.assign({
    enabled: true,
    debug: false,
    signalPrefix: SIGNAL_PREFIX,
    protocol: CALL_PROTOCOL,
    peerjsUrl: PEERJS_CDN,
    wkSdkUrl: "/plugins/nodebb-plugin-wukong-chat/static/vendor/wukongimjssdk.umd.js?v=28",
    tokenPath: "/api/wukong/token",
    tokenFallbackPath: "/bridge/token",
    wkWsPath: "/wkws/",
    callTimeoutMs: CALL_TIMEOUT_MS,
    connectTimeoutMs: CONNECT_TIMEOUT_MS,
    signalTtlMs: SIGNAL_TTL_MS,
    enableVideo: true,
    showButton: true,
    globalListen: true,
    autoConnectWukong: true,
    peerOptions: {},
    iceServers: null
  }, window.CPHarmonyCallConfig || {});

  if (UserConfig.enabled === false) return;

  SIGNAL_PREFIX = UserConfig.signalPrefix || SIGNAL_PREFIX;
  CALL_PROTOCOL = UserConfig.protocol || CALL_PROTOCOL;
  PEERJS_CDN = UserConfig.peerjsUrl || PEERJS_CDN;
  WK_SDK_CDN = UserConfig.wkSdkUrl || WK_SDK_CDN;
  CALL_TIMEOUT_MS = Number(UserConfig.callTimeoutMs || CALL_TIMEOUT_MS);
  CONNECT_TIMEOUT_MS = Number(UserConfig.connectTimeoutMs || CONNECT_TIMEOUT_MS);
  SIGNAL_TTL_MS = Number(UserConfig.signalTtlMs || SIGNAL_TTL_MS);

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

    mediaCall: null,
    localStream: null,
    remoteStream: null,

    callId: "",
    direction: "",
    mode: "audio",
    connected: false,
    incomingInvite: null,

    remoteUser: {
      uid: "",
      name: "好友",
      avatar: ""
    },

    callTimer: null,
    timeoutTimer: null,
    connectTimer: null,
    sec: 0,

    isMicOn: true,
    isCamOn: false,
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

  function noop() {}

  function warn(scope, err) {
    try {
      console.warn("[cp-call][" + scope + "]", err);
    } catch (_) {}
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function now() {
    return Date.now ? Date.now() : new Date().getTime();
  }

  function relativePath() {
    return (window.config && window.config.relative_path) || "";
  }

  function withRelativePath(path) {
    path = String(path || "");
    if (/^https?:\/\//i.test(path) || /^wss?:\/\//i.test(path)) return path;
    if (!path) return relativePath() || "/";
    if (path.charAt(0) !== "/") path = "/" + path;
    return relativePath() + path;
  }

  function pageInfo() {
    return window.__NBB_WUKONG_PAGE__ || {};
  }

  function cfgObj() {
    return (window.CPChatHarmony && window.CPChatHarmony.config) || {};
  }

  function routeTargetUid() {
    var p = pageInfo();
    var cfg = cfgObj();
    var direct = p.targetUid || cfg.targetUid || cfg.uid || "";
    if (direct) return String(direct).trim();
    var root = document.getElementById("nodebb-wukong-root");
    if (root && root.getAttribute("data-target-uid")) return String(root.getAttribute("data-target-uid") || "").trim();
    try {
      var q = new URLSearchParams(location.search || "");
      direct = q.get("uid") || q.get("to_uid") || q.get("targetUid") || "";
      if (direct) return String(direct).trim();
    } catch (_) {}
    var m = String(location.pathname || "").match(/\/wukong\/([^/?#]+)/i);
    if (m && m[1]) {
      try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; }
    }
    return "";
  }

  function routeChannelType() {
    var p = pageInfo();
    var cfg = cfgObj();
    var root = document.getElementById("nodebb-wukong-root");
    var raw = p.channelType || cfg.channelType || (root && root.getAttribute("data-channel-type")) || "1";
    return Number(raw || 1) || 1;
  }

  function isPrivateWukongChat() {
    var p = pageInfo();
    var cfg = cfgObj();
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

  function myName() {
    return String(
      (window.app && window.app.user && window.app.user.username) ||
      "我"
    );
  }

  function myAvatar() {
    return String(
      (window.app && window.app.user && window.app.user.picture) ||
      ""
    );
  }

  function createId() {
    return "call_" + now() + "_" + Math.random().toString(36).slice(2, 8);
  }

  function escAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function showToast(text) {
    if (!text) return;
    var n = byId("cp-call-toast");

    if (!n) {
      n = document.createElement("div");
      n.id = "cp-call-toast";
      n.style.cssText =
        "position:fixed;left:50%;top:45%;transform:translate(-50%,-50%);" +
        "z-index:2147483647;background:rgba(0,0,0,.76);color:#fff;" +
        "padding:10px 16px;border-radius:18px;font-size:14px;" +
        "max-width:82vw;text-align:center;pointer-events:none;";
      document.body.appendChild(n);
    }

    n.textContent = String(text || "");
    n.style.display = "block";

    clearTimeout(n._timer);
    n._timer = setTimeout(function () {
      n.style.display = "none";
    }, 2200);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var exists = document.querySelector('script[src="' + src + '"]');

      if (exists) {
        if (exists.getAttribute("data-loaded") === "1") {
          resolve();
          return;
        }

        exists.addEventListener("load", resolve, { once: true });
        exists.addEventListener("error", reject, { once: true });
        return;
      }

      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () {
        s.setAttribute("data-loaded", "1");
        resolve();
      };
      s.onerror = function () {
        reject(new Error("脚本加载失败：" + src));
      };

      document.head.appendChild(s);
    });
  }

  function getClosedCalls() {
    try {
      return JSON.parse(sessionStorage.getItem(CLOSED_CALLS_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveClosedCalls(map) {
    try {
      sessionStorage.setItem(CLOSED_CALLS_KEY, JSON.stringify(map || {}));
    } catch (e) {}
  }

  function markClosedCall(callId) {
    if (!callId) return;

    var map = getClosedCalls();
    map[String(callId)] = now();

    var keys = Object.keys(map);
    var cutoff = now() - 10 * 60 * 1000;

    for (var i = 0; i < keys.length; i++) {
      if (map[keys[i]] < cutoff) delete map[keys[i]];
    }

    saveClosedCalls(map);
  }

  function isClosedCall(callId) {
    if (!callId) return false;

    var map = getClosedCalls();
    var ts = map[String(callId)];

    if (!ts) return false;

    if (now() - ts > 10 * 60 * 1000) {
      delete map[String(callId)];
      saveClosedCalls(map);
      return false;
    }

    return true;
  }

  function normalizeOutgoingSignal(packet) {
    packet = packet || {};
    packet.protocol = CALL_PROTOCOL;
    packet.sentAt = packet.sentAt || now();

    if (packet.type === "invite") {
      packet.expiresAt = packet.expiresAt || now() + SIGNAL_TTL_MS;
    }

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

  function signalKey(packet) {
    if (!packet) return "";

    return [
      packet.type || "",
      packet.callId || "",
      packet.from || "",
      packet.to || "",
      packet.ts || "",
      packet.sentAt || ""
    ].join("|");
  }

  function rememberSignal(packet) {
    var k = signalKey(packet);
    if (!k) return false;

    if (State.seenSignals[k]) return true;

    State.seenSignals[k] = now();

    var keys = Object.keys(State.seenSignals);
    if (keys.length > 200) {
      var cutoff = now() - 5 * 60 * 1000;

      for (var i = 0; i < keys.length; i++) {
        if (State.seenSignals[keys[i]] < cutoff) delete State.seenSignals[keys[i]];
      }
    }

    return false;
  }

  function ensureAudioContext() {
    if (!AudioFX.ctx) {
      try {
        AudioFX.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return null;
      }
    }

    if (AudioFX.ctx.state === "suspended") {
      AudioFX.ctx.resume().catch(noop);
    }

    return AudioFX.ctx;
  }

  function unlockAudioNow() {
    AudioFX.unlocked = true;
    window[RING_UNLOCKED_KEY] = true;
    ensureAudioContext();
  }

  function unlockAudioOnGesture() {
    if (window[RING_UNLOCKED_KEY]) {
      AudioFX.unlocked = true;
      return;
    }

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
    if (!ctx) return function () {};

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var startAt = ctx.currentTime + (delay || 0);
    var endAt = startAt + (duration || 0.18);

    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, startAt);
    osc.connect(gain);
    gain.connect(ctx.destination);

    var v = Math.min(0.18, volume || 0.045);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(v, startAt + 0.035);
    gain.gain.setValueAtTime(v, Math.max(startAt + 0.04, endAt - 0.035));
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    osc.start(startAt);
    osc.stop(endAt + 0.03);

    return function () {
      try { osc.stop(); } catch (e) {}
    };
  }

  function stopRing() {
    while (AudioFX.stops.length) {
      try { AudioFX.stops.pop()(); } catch (e) {}
    }

    AudioFX.mode = "";

    if (navigator.vibrate) {
      try { navigator.vibrate(0); } catch (e) {}
    }
  }

  function playOutgoingRing() {
    stopRing();
    AudioFX.mode = "outgoing";

    if (!AudioFX.unlocked || !ensureAudioContext()) return;

    var stopped = false;
    var timers = [];

    function cycle() {
      if (stopped) return;
      playTone(440, 0.00, 0.18, 0.04, "sine");
      playTone(660, 0.23, 0.18, 0.038, "sine");
    }

    cycle();
    timers.push(setInterval(cycle, 2700));

    AudioFX.stops.push(function () {
      stopped = true;
      timers.forEach(clearInterval);
    });
  }

  function playIncomingRing() {
    stopRing();
    AudioFX.mode = "incoming";

    if (!AudioFX.unlocked || !ensureAudioContext()) {
      if (navigator.vibrate) {
        try { navigator.vibrate([220, 100, 220, 800]); } catch (e) {}
      }
      return;
    }

    var stopped = false;
    var timers = [];

    function cycle() {
      if (stopped) return;
      playTone(784, 0.00, 0.20, 0.072, "triangle");
      playTone(988, 0.25, 0.20, 0.070, "triangle");
      playTone(784, 0.50, 0.18, 0.068, "triangle");
      playTone(880, 0.82, 0.20, 0.070, "triangle");
      playTone(1047, 1.07, 0.20, 0.068, "triangle");
      playTone(880, 1.32, 0.18, 0.066, "triangle");

      if (navigator.vibrate) {
        try { navigator.vibrate([180, 80, 180, 800]); } catch (e) {}
      }
    }

    cycle();
    timers.push(setInterval(cycle, 2000));

    AudioFX.stops.push(function () {
      stopped = true;
      timers.forEach(clearInterval);
      if (navigator.vibrate) {
        try { navigator.vibrate(0); } catch (e) {}
      }
    });
  }

  function playConnectedTone() {
    stopRing();
    if (!AudioFX.unlocked) return;
    playTone(880, 0.00, 0.10, 0.050, "sine");
    playTone(1175, 0.11, 0.10, 0.045, "sine");
  }

  async function fetchBridgeToken() {
    var paths = [];
    if (UserConfig.tokenPath) paths.push(UserConfig.tokenPath);
    if (UserConfig.tokenFallbackPath) paths.push(UserConfig.tokenFallbackPath);
    paths.push("/api/wukong/token");
    paths.push("/bridge/token");

    var tried = {};
    for (var i = 0; i < paths.length; i++) {
      var path = paths[i];
      if (!path || tried[path]) continue;
      tried[path] = true;
      try {
        var res = await fetch(withRelativePath(path), {
          credentials: "same-origin",
          headers: { accept: "application/json" }
        });
        if (!res.ok) continue;
        var json = await res.json();
        var data = json && json.data && typeof json.data === "object" ? json.data : json;
        if (data && (data.token || data.uid || data.wkUid)) return data;
      } catch (e) {
        warn("token-endpoint", { path: path, error: e });
      }
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
          var decoded = decodeURIComponent(
            raw.split("").map(function (c) {
              return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
            }).join("")
          );

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

    try {
      return JSON.parse(text.slice(SIGNAL_PREFIX.length));
    } catch (e) {
      return null;
    }
  }

  async function waitForWukongConnected(timeoutMs) {
    timeoutMs = timeoutMs || 2500;

    if (State.wkConnected) return;

    await new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve();
      }, timeoutMs);

      try {
        var sdk = window.wk && window.wk.WKSDK && window.wk.WKSDK.shared();
        if (!sdk || !sdk.connectManager || !sdk.connectManager.addConnectStatusListener) {
          clearTimeout(timer);
          resolve();
          return;
        }

        sdk.connectManager.addConnectStatusListener(function (status) {
          if (status === 1 || status === "connected" || status === "CONNECTED") {
            State.wkConnected = true;
            if (!done) {
              done = true;
              clearTimeout(timer);
              resolve();
            }
          }
        });
      } catch (e) {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  async function ensureWukong() {
    if (State.wkReady && window.wk && window.wk.WKSDK) {
      await waitForWukongConnected(1200);
      return;
    }

    if (State.wkReadyPromise) {
      await State.wkReadyPromise;
      return;
    }

    State.wkReadyPromise = (async function () {
      if (!window.wk || !window.wk.WKSDK) {
        await loadScript(UserConfig.wkSdkUrl || WK_SDK_CDN);
      }

      var tokenData = await fetchBridgeToken();

      State.myUid = String(tokenData.uid || uid() || "");
      State.wkToken = String(tokenData.token || "");
      State.wkAddr = UserConfig.wkAddr || ((location.protocol === "https:" ? "wss://" : "ws://") + location.host + (UserConfig.wkWsPath || "/wkws/"));

      if (!State.myUid) throw new Error("没有获取到当前用户 UID");
      if (!State.wkToken) throw new Error("没有获取到悟空 IM token");

      var sdk = window.wk.WKSDK.shared();

      sdk.config.uid = State.myUid;
      sdk.config.token = State.wkToken;
      sdk.config.addr = UserConfig.wkAddr || State.wkAddr;

      if (!window.__cpHarmonyCallWkListenerBoundV6) {
        window.__cpHarmonyCallWkListenerBoundV6 = true;

        sdk.chatManager.addMessageListener(function (message) {
          var packet = parseSignalFromWkMessage(message);
          if (!packet) return;
          handleSignal(packet);
        });

        if (sdk.connectManager && sdk.connectManager.addConnectStatusListener) {
          sdk.connectManager.addConnectStatusListener(function (status) {
            if (status === 1 || status === "connected" || status === "CONNECTED") {
              State.wkConnected = true;
            } else if (status === 0 || status === "disconnected" || status === "DISCONNECTED") {
              State.wkConnected = false;
            }
          });
        }
      }

      try {
        sdk.connectManager.connect();
      } catch (e) {}

      State.wkReady = true;
      await waitForWukongConnected(2500);
    })().catch(function (err) {
      State.wkReady = false;
      State.wkReadyPromise = null;
      throw err;
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

  function ensurePeerJS() {
    if (window.Peer) return Promise.resolve();

    if (!State.peerScriptPromise) {
      State.peerScriptPromise = loadScript(UserConfig.peerjsUrl || PEERJS_CDN).catch(function (err) {
        State.peerScriptPromise = null;
        throw err;
      });
    }

    return State.peerScriptPromise;
  }

  function getIceServers() {
    return UserConfig.iceServers || [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" }
    ];
  }

  function resetPeer() {
    if (State.peer) {
      try { State.peer.destroy(); } catch (e) {}
    }
    State.peer = null;
    State.peerId = "";
    State.peerReadyPromise = null;
  }

  async function initPeer() {
    if (
      State.peer &&
      State.peerId &&
      !State.peer.destroyed &&
      !State.peer.disconnected
    ) {
      return State.peerId;
    }

    if (State.peer && (State.peer.destroyed || State.peer.disconnected)) {
      resetPeer();
    }

    if (State.peerReadyPromise) return State.peerReadyPromise;

    State.peerReadyPromise = (async function () {
      await ensurePeerJS();

      return await new Promise(function (resolve, reject) {
        var peerOptions = Object.assign({}, UserConfig.peerOptions || {}, {
          debug: UserConfig.debug ? 1 : 0,
          config: Object.assign({}, (UserConfig.peerOptions && UserConfig.peerOptions.config) || {}, {
            iceServers: getIceServers()
          })
        });

        State.peer = new window.Peer(peerOptions);

        State.peer.on("open", function (id) {
          State.peerId = id;
          resolve(id);
        });

        State.peer.on("call", function (call) {
          var meta = call.metadata || {};

          if (!State.callId || meta.callId !== State.callId) {
            try { call.close(); } catch (e) {}
            return;
          }

          if (State.direction !== "outgoing") {
            try { call.close(); } catch (e) {}
            return;
          }

          State.mediaCall = call;

          getMedia(State.mode).then(function (stream) {
            call.answer(stream);
            bindMediaCall(call);
            setStatus("连接中...");
            startConnectGuard();
          }).catch(function (err) {
            warn("answer-media", err);
            try { call.close(); } catch (e) {}
            endCall(true);
          });
        });

        State.peer.on("disconnected", function () {
          if (State.callId) {
            showToast("通话信令断开，已结束");
            endCall(false);
          } else {
            resetPeer();
          }
        });

        State.peer.on("error", function (err) {
          warn("peer-error", err);

          if (!State.peerId) {
            reject(err);
            return;
          }

          if (State.callId && !State.connected) {
            showToast("通话连接失败");
            endCall(false);
          }
        });
      });
    })().catch(function (err) {
      resetPeer();
      throw err;
    });

    return State.peerReadyPromise;
  }

  async function getMedia(mode) {
    if (State.localStream) return State.localStream;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("当前浏览器不支持音视频通话");
    }

    var wantsVideo = mode === "video";

    try {
      State.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: wantsVideo ? {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 }
        } : false
      });
    } catch (err) {
      if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        throw new Error("请允许麦克风/摄像头权限后再通话");
      }

      if (wantsVideo) {
        State.mode = "audio";
        State.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        showToast("摄像头不可用，已切换语音");
      } else {
        throw err;
      }
    }

    State.isMicOn = !!State.localStream.getAudioTracks()[0];
    State.isCamOn = !!State.localStream.getVideoTracks()[0];

    bindLocalStream();
    syncButtons();

    return State.localStream;
  }

  function stopTracks(stream) {
    if (!stream || !stream.getTracks) return;

    stream.getTracks().forEach(function (t) {
      try { t.stop(); } catch (e) {}
    });
  }

  function bindLocalStream() {
    var local = byId("cp-call-local-video");
    var wrap = byId("cp-call-local-wrap");

    if (local) local.srcObject = State.localStream || null;

    if (wrap) {
      wrap.style.display =
        State.localStream &&
        State.mode === "video" &&
        State.localStream.getVideoTracks().length
          ? "block"
          : "none";
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

    if (remoteAudio) {
      remoteAudio.srcObject = stream || null;
    }
  }

  function bindMediaCall(call) {
    State.mediaCall = call;

    call.on("stream", function (remoteStream) {
      State.remoteStream = remoteStream;
      bindRemoteStream(remoteStream);
      markConnected();
    });

    call.on("close", function () {
      if (State.callId) endCall(true);
    });

    call.on("error", function (err) {
      warn("media-call", err);
      if (State.callId) endCall(true);
    });
  }

  function startConnectGuard() {
    clearTimeout(State.connectTimer);
    State.connectTimer = setTimeout(function () {
      if (State.callId && !State.connected) {
        showToast("连接超时");
        endCall(false);
      }
    }, CONNECT_TIMEOUT_MS);
  }

  function startTimer() {
    clearInterval(State.callTimer);
    State.sec = 0;
    setStatus("00:00");

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

  function setStatus(text) {
    var el = byId("cp-call-status");
    if (el) el.textContent = text || "";
  }

  function getPeerUid() {
    var direct = routeTargetUid();
    if (direct && direct !== "0") return String(direct);

    var me = uid();

    if (window.ajaxify && window.ajaxify.data && Array.isArray(window.ajaxify.data.users)) {
      for (var i = 0; i < window.ajaxify.data.users.length; i++) {
        var u = window.ajaxify.data.users[i];
        if (String(u.uid) !== me && String(u.uid) !== "0") return String(u.uid);
      }
    }

    var row = document.querySelector('[component="chat/user/list"] [data-uid]:not([data-uid="' + me + '"])');
    if (row) return String(row.getAttribute("data-uid") || "");

    var native = document.querySelector('[component="chat/messages"] [component="chat/message"][data-uid]');
    if (native && String(native.getAttribute("data-uid") || "") !== me) {
      return String(native.getAttribute("data-uid") || "");
    }

    return "";
  }

  function getPeerName() {
    var el = document.querySelector("#cp-peer-info a, #cp-peer-info");
    if (el && el.textContent.trim()) return el.textContent.trim();

    if (window.ajaxify && window.ajaxify.data && Array.isArray(window.ajaxify.data.users)) {
      var me = uid();

      for (var i = 0; i < window.ajaxify.data.users.length; i++) {
        var u = window.ajaxify.data.users[i];

        if (String(u.uid) !== me && String(u.uid) !== "0" && u.username) {
          return String(u.username);
        }
      }
    }

    return State.remoteUser.name || "好友";
  }

  function getPeerAvatar() {
    var img = document.querySelector("#cp-peer-avatar img");
    if (img && img.getAttribute("src")) return img.getAttribute("src");

    if (window.ajaxify && window.ajaxify.data && Array.isArray(window.ajaxify.data.users)) {
      var me = uid();

      for (var i = 0; i < window.ajaxify.data.users.length; i++) {
        var u = window.ajaxify.data.users[i];

        if (String(u.uid) !== me && String(u.uid) !== "0" && u.picture) {
          return String(u.picture);
        }
      }
    }

    return "";
  }

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

    if (avatarEl) {
      if (avatar) avatarEl.src = avatar;
      else avatarEl.removeAttribute("src");
      avatarEl.style.display = avatar ? "block" : "none";
    }

    if (inAvatar) {
      if (avatar) inAvatar.src = avatar;
      else inAvatar.removeAttribute("src");
      inAvatar.style.display = avatar ? "block" : "none";
    }

    if (bg) {
      bg.style.backgroundImage = avatar ? 'url("' + escAttr(avatar) + '")' : "";
    }
  }

  function showMainUI() {
    mountUI();

    var root = byId("cp-call-root");
    var main = byId("cp-call-main");
    var incoming = byId("cp-call-incoming");

    if (root) root.style.display = "block";
    if (main) main.style.display = "block";
    if (incoming) incoming.style.display = "none";

    setRemoteInfo();
    syncButtons();
  }

  function showIncomingUI(packet) {
    mountUI();

    var root = byId("cp-call-root");
    var main = byId("cp-call-main");
    var incoming = byId("cp-call-incoming");
    var tip = byId("cp-call-in-tip");

    if (root) root.style.display = "block";
    if (main) main.style.display = "none";
    if (incoming) incoming.style.display = "flex";

    if (tip) {
      tip.textContent = packet.mode === "video" ? "邀请你视频通话" : "邀请你语音通话";
    }

    setRemoteInfo();
    playIncomingRing();
  }

  function hideUI() {
    var root = byId("cp-call-root");
    var main = byId("cp-call-main");
    var incoming = byId("cp-call-incoming");

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

    if (State.mediaCall) {
      try { State.mediaCall.close(); } catch (e) {}
    }

    stopTracks(State.localStream);
    stopTracks(State.remoteStream);

    var local = byId("cp-call-local-video");
    var remote = byId("cp-call-remote-video");
    var audio = byId("cp-call-remote-audio");
    var bg = byId("cp-call-bg");

    if (local) local.srcObject = null;
    if (remote) remote.srcObject = null;
    if (audio) audio.srcObject = null;
    if (bg) bg.style.backgroundImage = "";

    State.mediaCall = null;
    State.localStream = null;
    State.remoteStream = null;

    State.callId = "";
    State.direction = "";
    State.mode = "audio";
    State.connected = false;
    State.incomingInvite = null;
    State.remoteUser.uid = "";
    State.remoteUser.name = "好友";
    State.remoteUser.avatar = "";

    State.sec = 0;
    State.isMicOn = true;
    State.isCamOn = false;
    State.ending = false;

    syncButtons();
  }

  function endCall(remoteEnded) {
    if (State.ending) return;
    State.ending = true;

    var oldCallId = State.callId;
    var oldRemoteUid = State.remoteUser.uid;
    var type = State.direction === "outgoing" && !State.connected ? "cancel" : "end";

    if (oldCallId) markClosedCall(oldCallId);

    if (!remoteEnded && oldCallId && oldRemoteUid) {
      sendSignal({
        type: type,
        callId: oldCallId,
        to: oldRemoteUid
      }).catch(noop);
    }

    cleanupCall();
    hideUI();
  }

  async function startOutgoingCall(mode) {
    if (State.callId) {
      showToast("当前已有通话");
      return;
    }

    await ensureWukong();

    var peerUid = getPeerUid();

    if (!peerUid) {
      showToast("请先进入私聊窗口");
      return;
    }

    var requestedMode = mode || "audio";
    var peerId = await initPeer();

    State.callId = createId();
    State.direction = "outgoing";
    State.mode = requestedMode;
    State.connected = false;

    State.remoteUser.uid = String(peerUid);
    State.remoteUser.name = getPeerName();
    State.remoteUser.avatar = getPeerAvatar();

    showMainUI();
    setMainConnectedMode();
    setStatus(State.mode === "video" ? "准备视频通话..." : "准备语音通话...");

    try {
      // Important: get media before invite, so a permission failure will not make the other side ring.
      await getMedia(State.mode);

      await sendSignal({
        type: "invite",
        callId: State.callId,
        mode: State.mode,
        to: State.remoteUser.uid,
        fromName: myName(),
        fromAvatar: myAvatar(),
        peerId: peerId
      });

      setStatus(State.mode === "video" ? "视频呼叫中..." : "语音呼叫中...");
      playOutgoingRing();
    } catch (err) {
      var failedCallId = State.callId;
      if (failedCallId) markClosedCall(failedCallId);
      cleanupCall();
      hideUI();
      throw err;
    }

    clearTimeout(State.timeoutTimer);
    State.timeoutTimer = setTimeout(function () {
      if (State.callId && !State.connected) {
        showToast("对方无应答");
        endCall(false);
      }
    }, CALL_TIMEOUT_MS);
  }

  async function acceptCall() {
    if (!State.incomingInvite) return;

    var invite = State.incomingInvite;

    if (!invite.peerId) {
      throw new Error("缺少对方 Peer ID");
    }

    stopRing();
    unlockAudioNow();

    await ensureWukong();
    await initPeer();

    State.direction = "incoming";
    State.mode = invite.mode || "audio";

    showMainUI();
    setMainConnectedMode();
    setStatus("连接中...");

    var stream = await getMedia(State.mode);

    await sendSignal({
      type: "accept",
      callId: State.callId,
      to: State.remoteUser.uid
    });

    var call = State.peer.call(invite.peerId, stream, {
      metadata: {
        callId: State.callId,
        from: uid(),
        mode: State.mode
      }
    });

    bindMediaCall(call);
    startConnectGuard();

    clearTimeout(State.timeoutTimer);
    State.timeoutTimer = setTimeout(function () {
      if (State.callId && !State.connected) {
        showToast("连接超时");
        endCall(false);
      }
    }, CONNECT_TIMEOUT_MS);
  }

  function rejectCall() {
    if (!State.incomingInvite) return;

    if (State.callId) markClosedCall(State.callId);

    stopRing();

    sendSignal({
      type: "reject",
      callId: State.callId,
      to: State.remoteUser.uid
    }).catch(noop);

    cleanupCall();
    hideUI();
  }

  function handleSignal(packet) {
    if (!isValidCallSignal(packet)) return;
    if (rememberSignal(packet)) return;

    if (packet.type === "invite") {
      if (isExpiredSignal(packet) || isClosedCall(packet.callId)) return;
    }

    if (
      packet.type === "cancel" ||
      packet.type === "end" ||
      packet.type === "reject" ||
      packet.type === "busy"
    ) {
      markClosedCall(packet.callId);
    }

    if (packet.type === "invite") {
      if (State.callId && State.callId !== packet.callId) {
        sendSignal({
          type: "busy",
          callId: packet.callId,
          to: packet.from
        }).catch(noop);
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
          markClosedCall(State.callId);
          stopRing();
          cleanupCall();
          hideUI();
        }
      }, CALL_TIMEOUT_MS);

      return;
    }

    if (!State.callId || packet.callId !== State.callId) return;

    if (packet.type === "accept") {
      clearTimeout(State.timeoutTimer);
      stopRing();
      setStatus("对方已接听，连接中...");
      startConnectGuard();
      return;
    }

    if (packet.type === "reject") {
      showToast("对方已拒绝");
      endCall(true);
      return;
    }

    if (packet.type === "busy") {
      showToast("对方忙线中");
      endCall(true);
      return;
    }

    if (packet.type === "cancel" || packet.type === "end") {
      endCall(true);
    }
  }

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

    syncButtons();
  }

  function syncButtons() {
    var mic = byId("cp-call-btn-mic");
    var cam = byId("cp-call-btn-cam");

    if (mic) {
      mic.classList.toggle("off", !State.isMicOn);
      mic.innerHTML = State.isMicOn
        ? '<i class="fa fa-microphone"></i><span>麦克风</span>'
        : '<i class="fa fa-microphone-slash"></i><span>静音</span>';
    }

    if (cam) {
      cam.style.display = State.mode === "video" ? "inline-flex" : "none";
      cam.classList.toggle("off", !State.isCamOn);
      cam.innerHTML = State.isCamOn
        ? '<i class="fa fa-video-camera"></i><span>摄像头</span>'
        : '<i class="fa fa-video-camera"></i><span>关闭</span>';
    }
  }

  function injectStyle() {
    if (byId("cp-harmony-call-style")) return;

    var css = `
      .cp-harmony-call-slot{position:relative;flex-shrink:0;display:flex;align-items:center;padding-bottom:3px;}
      .cp-harmony-call-entry{width:40px;height:40px;min-width:40px;padding:0;border:none;border-radius:999px;background:transparent;color:#111827;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:none;-webkit-tap-highlight-color:transparent;}
      .cp-harmony-call-entry:hover{opacity:.72;}
      .cp-harmony-call-entry:active{transform:scale(.92);}
      .cp-harmony-call-entry i{font-size:18px;line-height:1;}
      .cp-harmony-call-pop{position:absolute;right:0;top:42px;width:156px;padding:8px;border-radius:18px;background:rgba(255,255,255,.97);backdrop-filter:blur(14px);border:1px solid rgba(15,23,42,.08);box-shadow:0 18px 46px rgba(15,23,42,.18);z-index:2147483300;animation:cp-harmony-call-pop-in .16s cubic-bezier(.2,.8,.2,1);}
      .cp-harmony-call-pop[hidden]{display:none!important;}
      @keyframes cp-harmony-call-pop-in{from{opacity:0;transform:translateY(-6px) scale(.96);}to{opacity:1;transform:translateY(0) scale(1);}}
      .cp-harmony-call-pop::before{content:"";position:absolute;right:22px;top:-6px;width:12px;height:12px;background:rgba(255,255,255,.97);border-left:1px solid rgba(15,23,42,.06);border-top:1px solid rgba(15,23,42,.06);transform:rotate(45deg);}
      .cp-harmony-call-pop button{width:100%;border:none;background:transparent;border-radius:14px;padding:10px;display:flex;align-items:center;gap:10px;cursor:pointer;text-align:left;color:#111827;}
      .cp-harmony-call-pop button:hover{background:#f8fafc;}
      .cp-harmony-call-pop button:active{background:#f1f5f9;transform:scale(.98);}
      .cp-harmony-call-pop-icon{width:36px;height:36px;border-radius:14px;display:grid;place-items:center;color:#fff;flex-shrink:0;box-shadow:0 8px 18px rgba(0,0,0,.12);}
      .cp-harmony-call-pop-icon.audio{background:linear-gradient(135deg,#22c55e,#16a34a);}
      .cp-harmony-call-pop-icon.video{background:linear-gradient(135deg,#3b82f6,#8b5cf6);}
      .cp-harmony-call-pop-main{display:flex;flex-direction:column;min-width:0;}
      .cp-harmony-call-pop-main b{font-size:14px;line-height:1.2;color:#111827;}
      @media (max-width:390px){.cp-harmony-call-entry{width:34px;min-width:34px;}.cp-harmony-call-pop{right:-42px;}}
      #cp-call-root{position:fixed;inset:0;z-index:2147483500;display:none;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;-webkit-tap-highlight-color:transparent;}
      #cp-call-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(34px) brightness(.45);transform:scale(1.08);background-color:#101827;}
      #cp-call-mask{position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,23,42,.18),rgba(15,23,42,.78));}
      #cp-call-main{position:absolute;inset:0;display:none;overflow:hidden;background:#080d14;}
      #cp-call-remote-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#080d14;display:none;}
      #cp-call-main.is-audio #cp-call-remote-video{display:none!important;}
      #cp-call-top{position:absolute;top:0;left:0;right:0;z-index:3;padding:54px 20px 0;display:flex;flex-direction:column;align-items:center;text-align:center;pointer-events:none;}
      #cp-call-avatar{width:104px;height:104px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,.18);box-shadow:0 16px 40px rgba(0,0,0,.32);background:#334155;}
      #cp-call-name{margin-top:18px;font-size:26px;font-weight:900;text-shadow:0 2px 6px rgba(0,0,0,.25);}
      #cp-call-status{margin-top:8px;font-size:14px;opacity:.82;}
      #cp-call-main.is-video #cp-call-top{padding-top:28px;}
      #cp-call-main.is-video #cp-call-avatar,#cp-call-main.is-video #cp-call-name{display:none!important;}
      #cp-call-local-wrap{position:absolute;right:14px;top:92px;width:104px;height:148px;border-radius:18px;overflow:hidden;background:#000;display:none;z-index:5;box-shadow:0 16px 34px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.14);}
      #cp-call-local-video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);}
      #cp-call-controls{position:absolute;left:0;right:0;bottom:0;z-index:6;padding:20px 18px calc(22px + env(safe-area-inset-bottom));display:flex;align-items:center;justify-content:center;gap:16px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.42));}
      .cp-call-control{min-width:68px;height:54px;border:none;border-radius:999px;padding:0 14px;display:inline-flex;align-items:center;justify-content:center;gap:6px;background:rgba(255,255,255,.13);color:#fff;backdrop-filter:blur(10px);font-size:13px;font-weight:800;cursor:pointer;}
      .cp-call-control i{font-size:16px;}.cp-call-control.off{color:#ff8585;background:rgba(255,255,255,.10);}
      .cp-call-control.danger{width:68px;min-width:68px;height:68px;border-radius:999px;background:linear-gradient(180deg,#ff6d67,#ef4444);box-shadow:0 14px 30px rgba(239,68,68,.32);font-size:20px;}
      .cp-call-control:active{transform:scale(.96);}
      #cp-call-incoming{position:absolute;inset:0;z-index:7;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(8,13,20,.76);backdrop-filter:blur(20px);text-align:center;}
      #cp-call-in-avatar{width:112px;height:112px;border-radius:50%;object-fit:cover;background:#334155;border:1px solid rgba(255,255,255,.14);box-shadow:0 16px 40px rgba(0,0,0,.34);}
      #cp-call-in-name{margin-top:22px;font-size:27px;font-weight:900;}
      #cp-call-in-tip{margin-top:10px;font-size:15px;opacity:.78;}
      #cp-call-in-actions{display:flex;gap:72px;margin-top:54px;}
      .cp-call-in-action{display:flex;flex-direction:column;align-items:center;gap:10px;color:#fff;font-size:14px;font-weight:800;cursor:pointer;}
      .cp-call-in-circle{width:74px;height:74px;border-radius:999px;display:grid;place-items:center;font-size:28px;color:#fff;}
      .cp-call-in-circle.red{background:linear-gradient(180deg,#ff6d67,#ef4444);box-shadow:0 14px 30px rgba(239,68,68,.32);}
      .cp-call-in-circle.green{background:linear-gradient(180deg,#55df8a,#22c55e);box-shadow:0 14px 30px rgba(34,197,94,.26);}
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
          '<div id="cp-call-status">连接中...</div>' +
        '</div>' +
        '<div id="cp-call-local-wrap">' +
          '<video id="cp-call-local-video" autoplay muted playsinline></video>' +
        '</div>' +
        '<div id="cp-call-controls">' +
          '<button type="button" class="cp-call-control" id="cp-call-btn-mic"><i class="fa fa-microphone"></i><span>麦克风</span></button>' +
          '<button type="button" class="cp-call-control danger" id="cp-call-btn-end"><i class="fa fa-phone fa-rotate-135"></i></button>' +
          '<button type="button" class="cp-call-control" id="cp-call-btn-cam"><i class="fa fa-video-camera"></i><span>摄像头</span></button>' +
        '</div>' +
      '</div>' +
      '<div id="cp-call-incoming">' +
        '<img id="cp-call-in-avatar" src="" alt="">' +
        '<div id="cp-call-in-name">好友</div>' +
        '<div id="cp-call-in-tip">邀请你通话</div>' +
        '<div id="cp-call-in-actions">' +
          '<div class="cp-call-in-action" id="cp-call-reject"><div class="cp-call-in-circle red"><i class="fa fa-phone fa-rotate-135"></i></div><div>拒绝</div></div>' +
          '<div class="cp-call-in-action" id="cp-call-accept"><div class="cp-call-in-circle green"><i class="fa fa-phone"></i></div><div>接听</div></div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(root);

    byId("cp-call-btn-end").addEventListener("click", function () {
      endCall(false);
    });

    byId("cp-call-btn-mic").addEventListener("click", toggleMic);
    byId("cp-call-btn-cam").addEventListener("click", toggleCamera);

    byId("cp-call-accept").addEventListener("click", function () {
      acceptCall().catch(function (err) {
        warn("accept", err);
        showToast(err && err.message ? err.message : "接听失败");
        endCall(true);
      });
    });

    byId("cp-call-reject").addEventListener("click", rejectCall);
  }

  function injectHeaderButton() {
    if (UserConfig.showButton === false) return;
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

    var videoButton = UserConfig.enableVideo === false ? "" :
      '<button type="button" data-mode="video">' +
        '<span class="cp-harmony-call-pop-icon video"><i class="fa fa-video-camera"></i></span>' +
        '<span class="cp-harmony-call-pop-main"><b>视频通话</b></span>' +
      '</button>';

    slot.innerHTML =
      '<button type="button" class="cp-harmony-call-entry" id="cp-harmony-call-entry" aria-label="通话" title="通话">' +
        '<i class="fa fa-phone"></i>' +
      '</button>' +
      '<div class="cp-harmony-call-pop" id="cp-harmony-call-pop" hidden>' +
        '<button type="button" data-mode="audio">' +
          '<span class="cp-harmony-call-pop-icon audio"><i class="fa fa-phone"></i></span>' +
          '<span class="cp-harmony-call-pop-main"><b>语音通话</b></span>' +
        '</button>' +
        videoButton +
      '</div>';

    header.insertBefore(slot, actions);

    var entry = byId("cp-harmony-call-entry");
    var pop = byId("cp-harmony-call-pop");

    entry.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      unlockAudioNow();
      pop.hidden = !pop.hidden;
    });

    pop.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-mode]");
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();
      unlockAudioNow();

      var mode = btn.getAttribute("data-mode") || "audio";
      pop.hidden = true;

      startOutgoingCall(mode).catch(function (err) {
        warn("start-call", err);
        showToast(err && err.message ? err.message : "发起通话失败");
        endCall(true);
      });
    });

    if (!window.__cpHarmonyCallPopOutsideBoundV6) {
      window.__cpHarmonyCallPopOutsideBoundV6 = true;

      document.addEventListener("click", function (e) {
        var p = byId("cp-harmony-call-pop");
        if (!p || p.hidden) return;

        if (
          !e.target.closest("#cp-harmony-call-pop") &&
          !e.target.closest("#cp-harmony-call-entry")
        ) {
          p.hidden = true;
        }
      });
    }
  }

  function removeHeaderButton() {
    var slot = byId("cp-harmony-call-slot");
    if (slot && slot.parentNode) {
      try { slot.parentNode.removeChild(slot); } catch (_) {}
    }
  }

  function refreshChatBindings() {
    if (isChatContext()) {
      injectHeaderButton();
      hideSignalMessagesInDom();
    } else {
      removeHeaderButton();
    }
  }

  function hideSignalMessagesInDom() {
    if (!isChatContext()) return;
    var rows = document.querySelectorAll(
      "#cp-msg-list .cp-row, " +
      '[component="chat/messages"] [component="chat/message"]'
    );

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var text = row.textContent || "";

      if (text.indexOf(SIGNAL_PREFIX) < 0) continue;

      row.classList.add("cp-call-hidden-signal");
      // Never parse or handle call signals from DOM text.
    }
  }

  function destroy() {
    if (State.domObserver) {
      try { State.domObserver.disconnect(); } catch (e) {}
      State.domObserver = null;
    }

    clearTimeout(State.injectTimer);
    cleanupCall();
    hideUI();

    var slot = byId("cp-harmony-call-slot");
    if (slot && slot.parentNode) slot.parentNode.removeChild(slot);

    var root = byId("cp-call-root");
    if (root && root.parentNode) root.parentNode.removeChild(root);

    State.started = false;
  }

  function boot() {
    if (State.started) {
      refreshChatBindings();
      return;
    }

    State.started = true;

    // v6: global runtime. Keep the WebRTC/WuKong signal listener alive on every page,
    // but only inject the header call button inside a private /wukong/:uid chat window.
    mountUI();
    refreshChatBindings();
    unlockAudioOnGesture();

    if (UserConfig.globalListen !== false && UserConfig.autoConnectWukong !== false) {
      ensureWukong().catch(function (err) {
        warn("global-ensure-wukong", err);
      });
    }

    if (!State.domObserver) {
      State.domObserver = new MutationObserver(function () {
        clearTimeout(State.injectTimer);

        State.injectTimer = setTimeout(function () {
          refreshChatBindings();
        }, 80);
      });

      State.domObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    if (!window.__cpHarmonyCallBeforeUnloadBoundV6) {
      window.__cpHarmonyCallBeforeUnloadBoundV6 = true;

      window.addEventListener("beforeunload", function () {
        if (State.callId && State.remoteUser.uid) {
          markClosedCall(State.callId);
          sendSignal({
            type: State.connected ? "end" : "cancel",
            callId: State.callId,
            to: State.remoteUser.uid
          }).catch(noop);
        }
      });
    }

    if (window.jQuery && !window.__cpHarmonyCallJqueryEventsBoundV6) {
      window.__cpHarmonyCallJqueryEventsBoundV6 = true;

      window.jQuery(window).on("action:ajaxify.end action:chat.loaded action:chat.switched action:ajaxify.contentLoaded", function () {
        setTimeout(refreshChatBindings, 80);
      });
    }
  }

  window.CPHarmonyCall = {
    version: "v6-global-wukong-call",
    boot: boot,
    refresh: function () {
      injectHeaderButton();
      hideSignalMessagesInDom();
      return !!byId("cp-harmony-call-entry");
    },
    start: function (mode) {
      unlockAudioNow();
      return startOutgoingCall(mode || "audio");
    },
    end: function () {
      return endCall(false);
    },
    getPeerId: function () {
      return State.peerId;
    },
    isActive: function () {
      return !!State.callId;
    },
    hideSignals: hideSignalMessagesInDom,
    destroy: destroy,
    config: UserConfig
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
