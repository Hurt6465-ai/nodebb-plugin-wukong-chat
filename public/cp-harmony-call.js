(function () {
  "use strict";

  // ============================================================
  // CP Harmony Peer Call v8.0 — AppRTC UX enhanced 语音 / 视频通话
  // - 顶部按钮：黑/灰电话图标，无背景框
  // - 视频画面：点击小窗稳定切换到大屏，高清优先并保留远端画面卡顿自恢复
  // - 通话音效：呼出 public/bohao.mp3、来电 public/laidian.mp3，多路径自动探测，来电震动
  // - 前后摄像头切换（replaceTrack，无需重协商）
  // - 可拖动本地/远端小窗
  // - 断线自动重连 + ICE 状态监控
  // - 全局监听：不在聊天窗口也能接听来电
  // - 新增：通话中网络质量提示、屏幕常亮、音频输出设备、连接状态更稳
  // ============================================================

  try {
    if (window.CPHarmonyCall && typeof window.CPHarmonyCall.destroy === "function") {
      window.CPHarmonyCall.destroy();
    }
  } catch (_) {}

  try { window.__cpHarmonyPeerCallInitedV7 = false; } catch (_) {}
  if (window.__cpHarmonyPeerCallInitedV7) return;
  window.__cpHarmonyPeerCallInitedV7 = true;

  // ----------------------------------------------------------------
  // 配置
  // ----------------------------------------------------------------
  var DEFAULTS = {
    enabled: false,
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
    callTimeoutMs: 30000,
    connectTimeoutMs: 35000,
    signalTtlMs: 45000,
    reconnectMaxTries: 5,
    iceReconnectGraceMs: 8000,
    enableVideo: true,
    showButton: true,
    globalListen: true,
    autoConnectWukong: true,
    peerOptions: {},
    iceServers: null,

    // 音效文件放在 public 目录时，通常可用 /public/xxx.mp3；
    // 若项目把 public 目录映射到站点根目录，也会自动回退到 /xxx.mp3。
    outgoingRingUrl: "public/bohao.mp3",
    incomingRingUrl: "public/laidian.mp3",
    ringVolume: 0.86,
    // 你的音效文件如果不是站点根目录/public，可在 window.CPHarmonyCallConfig.audioBaseUrls 里追加目录。
    // 例如：window.CPHarmonyCallConfig = { audioBaseUrls: ["/plugins/nodebb-plugin-wukong-chat/static/public/"] }
    audioBaseUrls: [],

    // 高清优先：不再通过降低到 480p 解决卡顿。
    // 先请求 720p 高清，失败才自动回退；如需 1080p，可在外部配置 enableFullHd: true。
    enableFullHd: false,
    videoWidthIdeal: 1280,
    videoHeightIdeal: 720,
    videoWidthMin: 960,
    videoHeightMin: 540,
    videoWidthMax: 1920,
    videoHeightMax: 1080,
    videoFrameRateIdeal: 24,
    videoFrameRateMax: 30,
    videoMaxBitrate: 2600000,
    videoMaxFramerate: 30,
    videoContentHint: "detail",
    videoDegradationPreference: "maintain-resolution",
    videoAllowFallback: true,
    videoFreezeCheckMs: 1800,
    videoFreezeRecoverAfterMs: 4200,

    // AppRTC 思路：连接进入 active 后持续看 WebRTC stats，给用户一个简单可懂的网络状态。
    enableNetworkBadge: true,
    statsIntervalMs: 2200,
    qualityOkRttMs: 360,
    qualityPoorRttMs: 850,
    qualityOkPacketLoss: 0.035,
    qualityPoorPacketLoss: 0.09,

    // 移动端体验：通话期间尽量保持屏幕常亮；不支持的浏览器会自动忽略。
    keepScreenAwake: true,

    // Web 端可选音频输出设备。Chrome/Edge 支持 HTMLMediaElement.setSinkId。
    audioOutputDeviceId: "",
    autoHideControlsMs: 3500
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
    destroyed: false,

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

    callId: "",
    direction: "",
    mode: "audio",
    connected: false,
    incomingInvite: null,

    facingMode: "user",
    switchingCamera: false,

    // remote = 远端画面在大屏，本地画面在小窗；local = 反过来
    mainVideoSource: "remote",

    remoteUser: { uid: "", name: "好友", avatar: "" },

    callTimer: null,
    timeoutTimer: null,
    connectTimer: null,
    iceGraceTimer: null,
    controlsTimer: null,
    videoWatchTimer: null,
    videoWatchState: {},
    statsTimer: null,
    statsState: null,
    wakeLock: null,
    visibilityHandler: null,
    activeToken: "",
    sec: 0,

    isMicOn: true,
    isCamOn: false,
    ending: false,

    seenSignals: {},
    domObserver: null,
    injectTimer: null,
    started: false,
    outsideClickHandler: null
  };

  var AudioFX = {
    ctx: null,
    stops: [],
    unlocked: !!window[RING_UNLOCKED_KEY],
    bound: false,
    mode: "",
    primed: false
  };

  // ----------------------------------------------------------------
  // 工具
  // ----------------------------------------------------------------
  function noop() {}
  function warn(scope, err) {
    try {
      if (CFG.debug) console.warn("[cp-call][" + scope + "]", err);
    } catch (_) {}
  }
  function byId(id) { return document.getElementById(id); }
  function now() { return Date.now ? Date.now() : new Date().getTime(); }

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
    var p = pageInfo();
    var cfg = cfgObj();
    var direct = p.targetUid || cfg.targetUid || cfg.uid || "";
    if (direct) return String(direct).trim();

    var root = byId("nodebb-wukong-root");
    if (root && root.getAttribute("data-target-uid")) {
      return String(root.getAttribute("data-target-uid") || "").trim();
    }

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
    var root = byId("nodebb-wukong-root");
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
  function myName() { return String((window.app && window.app.user && window.app.user.username) || "我"); }
  function myAvatar() { return String((window.app && window.app.user && window.app.user.picture) || ""); }

  function createId() { return "call_" + now() + "_" + Math.random().toString(36).slice(2, 8); }

  function escAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function clamp(n, min, max) {
    n = Number(n || 0);
    return Math.min(max, Math.max(min, n));
  }

  function isActiveCallToken(token) {
    return !!token && token === State.activeToken && !!State.callId && !State.ending && !State.destroyed;
  }

  function friendlyMediaError(err, wantsVideo) {
    var name = err && (err.name || err.message || "") || "";
    if (/NotAllowed|PermissionDenied/i.test(name)) return wantsVideo ? "请允许麦克风和摄像头权限" : "请允许麦克风权限";
    if (/NotFound|DevicesNotFound/i.test(name)) return wantsVideo ? "没有找到可用麦克风或摄像头" : "没有找到可用麦克风";
    if (/NotReadable|TrackStart/i.test(name)) return "设备被其它应用占用，请关闭后重试";
    if (/Overconstrained|Constraint/i.test(name)) return "当前设备不支持所选清晰度，已尝试自动降级";
    if (/Security/i.test(name)) return "当前页面环境不允许访问音视频设备";
    return err && err.message ? err.message : "音视频设备打开失败";
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
        if (exists.getAttribute("data-loaded") === "1") { resolve(); return; }
        exists.addEventListener("load", resolve, { once: true });
        exists.addEventListener("error", reject, { once: true });
        return;
      }

      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () { s.setAttribute("data-loaded", "1"); resolve(); };
      s.onerror = function () { reject(new Error("脚本加载失败：" + src)); };
      document.head.appendChild(s);
    });
  }

  // ----------------------------------------------------------------
  // 已结束通话记录
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
    if (now() - ts > 10 * 60 * 1000) {
      delete map[String(callId)];
      saveClosedCalls(map);
      return false;
    }
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

  function scriptBaseUrls() {
    var list = [];
    function add(src) {
      try {
        if (!src) return;
        var u = new URL(src, location.href);
        var href = u.href.replace(/[^/]*$/, "");
        if (list.indexOf(href) < 0) list.push(href);
      } catch (e) {}
    }
    try { if (document.currentScript && document.currentScript.src) add(document.currentScript.src); } catch (e) {}
    try {
      var scripts = document.getElementsByTagName("script");
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || "";
        if (/cp-harmony-call|harmony|wukong|nodebb-plugin-wukong-chat/i.test(src)) add(src);
      }
    } catch (e) {}
    return list;
  }

  function mediaAssetUrls(path) {
    var raw = String(path || "").trim();
    if (!raw) return [];
    var list = [];
    var file = raw.split("?")[0].split("#")[0].split("/").pop() || raw;

    function add(u) {
      if (!u) return;
      try {
        var resolved = u;
        if (!/^https?:\/\//i.test(resolved) && !/^data:/i.test(resolved) && !/^blob:/i.test(resolved)) {
          resolved = withRelativePath(resolved.charAt(0) === "/" ? resolved : "/" + resolved);
        }
        if (list.indexOf(resolved) < 0) list.push(resolved);
      } catch (e) {}
    }

    function addAbs(u) {
      if (!u) return;
      try {
        var resolved = new URL(u, location.href).href;
        if (list.indexOf(resolved) < 0) list.push(resolved);
      } catch (e) { add(u); }
    }

    add(raw);
    if (raw.charAt(0) !== "/") add("/" + raw);
    if (/^public\//i.test(raw)) {
      add(raw.replace(/^public\//i, ""));
      add("/" + raw.replace(/^public\//i, ""));
    }

    // NodeBB / 插件静态目录常见位置，多试几个不会影响正常播放，404 会自动跳下一个。
    [
      "/public/" + file,
      "/assets/" + file,
      "/uploads/" + file,
      "/plugins/nodebb-plugin-wukong-chat/static/" + file,
      "/plugins/nodebb-plugin-wukong-chat/static/public/" + file,
      "/plugins/nodebb-plugin-wukong-chat/public/" + file,
      "/assets/plugins/nodebb-plugin-wukong-chat/" + file,
      "/assets/plugins/nodebb-plugin-wukong-chat/public/" + file
    ].forEach(add);

    if (Array.isArray(CFG.audioBaseUrls)) {
      CFG.audioBaseUrls.forEach(function (base) {
        base = String(base || "");
        if (!base) return;
        if (base.charAt(base.length - 1) !== "/") base += "/";
        add(base + file);
      });
    }

    scriptBaseUrls().forEach(function (base) {
      addAbs(new URL(file, base).href);
      addAbs(new URL("public/" + file, base).href);
      addAbs(new URL(raw, base).href);
    });

    return list;
  }

  function unlockAudioNow() {
    AudioFX.unlocked = true;
    window[RING_UNLOCKED_KEY] = true;
    ensureAudioContext();
    primeAudioFiles();
  }

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
    osc.connect(gain);
    gain.connect(ctx.destination);
    var v = Math.min(0.2, volume || 0.05);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(v, startAt + 0.03);
    gain.gain.setValueAtTime(v, Math.max(startAt + 0.04, endAt - 0.04));
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    osc.start(startAt);
    osc.stop(endAt + 0.03);
    return function () { try { osc.stop(); } catch (e) {} };
  }

  function startVibrate(pattern, repeatMs) {
    if (!navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) { return; }
    var timer = setInterval(function () {
      try { navigator.vibrate(pattern); } catch (e) {}
    }, repeatMs || 1800);
    AudioFX.stops.push(function () {
      clearInterval(timer);
      try { navigator.vibrate(0); } catch (e) {}
    });
  }

  function primeAudioFiles() {
    if (AudioFX.primed) return;
    AudioFX.primed = true;
    try {
      [CFG.outgoingRingUrl, CFG.incomingRingUrl].forEach(function (path) {
        var urls = mediaAssetUrls(path);
        // 只预加载前几个最可能命中的地址，避免大量 404。
        urls.slice(0, 5).forEach(function (u) {
          try {
            var a = new Audio();
            a.preload = "auto";
            a.muted = true;
            a.src = u;
            a.load();
          } catch (e) {}
        });
      });
    } catch (e) {}
  }

  function playLoopingAudioFile(urls, volume, fallback) {
    urls = urls || [];
    if (!urls.length || !AudioFX.unlocked) {
      if (typeof fallback === "function") fallback();
      return noop;
    }

    var audio = document.createElement("audio");
    var idx = 0;
    var stopped = false;
    var started = false;
    var fallbackUsed = false;
    audio.loop = true;
    audio.preload = "auto";
    audio.autoplay = true;
    audio.muted = false;
    audio.volume = Math.max(0, Math.min(1, Number(volume || CFG.ringVolume || 0.86)));
    audio.setAttribute("playsinline", "");
    audio.setAttribute("webkit-playsinline", "");
    audio.style.cssText = "position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;opacity:0;pointer-events:none;";
    try { document.body.appendChild(audio); } catch (e) {}

    function useFallback() {
      if (fallbackUsed) return;
      fallbackUsed = true;
      if (typeof fallback === "function") fallback();
    }

    function cleanupAudioOnly() {
      try { audio.pause(); } catch (e) {}
      try { audio.currentTime = 0; } catch (e) {}
      try { audio.removeAttribute("src"); audio.load(); } catch (e) {}
      try { if (audio.parentNode) audio.parentNode.removeChild(audio); } catch (e) {}
    }

    function tryNext(reason) {
      warn("ring-audio-next", { url: urls[idx], reason: reason });
      idx += 1;
      if (idx < urls.length) tryPlay();
      else useFallback();
    }

    function tryPlay() {
      if (stopped || started) return;
      audio.src = urls[idx];
      try { audio.load(); } catch (e) {}

      var playOnce = function () {
        if (stopped || started) return;
        var p = null;
        try { p = audio.play(); } catch (e) { p = Promise.reject(e); }
        if (p && typeof p.then === "function") {
          p.then(function () {
            started = true;
            warn("ring-audio-ok", audio.src);
          }).catch(function (err) {
            if (stopped || started) return;
            // NotAllowedError 说明浏览器拦了自动播放，只能用已解锁的 AudioContext 兜底。
            if (err && err.name === "NotAllowedError") useFallback();
            else tryNext(err && (err.name || err.message) || err);
          });
        } else {
          started = true;
        }
      };

      audio.onerror = function () {
        if (!stopped && !started) tryNext("error");
      };
      audio.oncanplay = playOnce;
      audio.oncanplaythrough = playOnce;
      setTimeout(playOnce, 180);
    }

    tryPlay();

    var stop = function () {
      stopped = true;
      cleanupAudioOnly();
    };
    AudioFX.stops.push(stop);
    return stop;
  }

  function stopRing() {
    while (AudioFX.stops.length) { try { AudioFX.stops.pop()(); } catch (e) {} }
    AudioFX.mode = "";
    if (navigator.vibrate) { try { navigator.vibrate(0); } catch (e) {} }
  }

  function playOutgoingRing() {
    stopRing();
    AudioFX.mode = "outgoing";
    playLoopingAudioFile(mediaAssetUrls(CFG.outgoingRingUrl), CFG.ringVolume, function () {
      if (!AudioFX.unlocked || !ensureAudioContext()) return;
      var stopped = false;
      var timers = [];
      function cycle() {
        if (stopped) return;
        playTone(440, 0.0, 0.4, 0.045, "sine");
      }
      cycle();
      timers.push(setInterval(cycle, 3000));
      AudioFX.stops.push(function () { stopped = true; timers.forEach(clearInterval); });
    });
  }

  function playIncomingRing() {
    stopRing();
    AudioFX.mode = "incoming";
    startVibrate([320, 120, 320, 900], 1700);
    playLoopingAudioFile(mediaAssetUrls(CFG.incomingRingUrl), CFG.ringVolume, function () {
      if (!AudioFX.unlocked || !ensureAudioContext()) return;
      var stopped = false;
      var timers = [];
      function cycle() {
        if (stopped) return;
        playTone(659, 0.00, 0.22, 0.075, "triangle");
        playTone(784, 0.26, 0.22, 0.072, "triangle");
        playTone(988, 0.52, 0.30, 0.070, "triangle");
        playTone(784, 0.92, 0.22, 0.066, "triangle");
      }
      cycle();
      timers.push(setInterval(cycle, 2200));
      AudioFX.stops.push(function () { stopped = true; timers.forEach(clearInterval); });
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
      var timer = setTimeout(function () {
        if (!done) { done = true; resolve(); }
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
            if (!done) { done = true; clearTimeout(timer); resolve(); }
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
          if (State.destroyed) return;
          var packet = parseSignalFromWkMessage(message);
          if (packet) handleSignal(packet);
        });
        if (sdk.connectManager && sdk.connectManager.addConnectStatusListener) {
          sdk.connectManager.addConnectStatusListener(function (status) {
            if (State.destroyed) return;
            if (status === 1 || status === "connected" || status === "CONNECTED") State.wkConnected = true;
            else if (status === 0 || status === "disconnected" || status === "DISCONNECTED") State.wkConnected = false;
          });
        }
      }

      try { sdk.connectManager.connect(); } catch (e) {}
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

  // ----------------------------------------------------------------
  // PeerJS 连接
  // ----------------------------------------------------------------
  function ensurePeerJS() {
    if (window.Peer) return Promise.resolve();
    if (!State.peerScriptPromise) {
      State.peerScriptPromise = loadScript(CFG.peerjsUrl).catch(function (err) {
        State.peerScriptPromise = null;
        throw err;
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
    State.peer = null;
    State.peerId = "";
    State.peerReadyPromise = null;
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
          State.peerId = id;
          State.reconnectTries = 0;
          resolve(id);
        });

        // 设计说明：被叫 accept 后主动 peer.call(invite.peerId)，发起方在这里 answer。
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
            boostOutboundQuality(call.peerConnection, "after-call");
            setStatus("连接中…");
            startConnectGuard();
          }).catch(function (err) {
            warn("answer-media", err);
            try { call.close(); } catch (e) {}
            endCall(true);
          });
        });

        State.peer.on("disconnected", function () {
          if (State.peer && !State.peer.destroyed) tryReconnectPeer();
          else if (State.callId) { showToast("信令断开"); endCall(false); }
        });

        State.peer.on("error", function (err) {
          warn("peer-error", err);
          var type = err && err.type;
          if (!State.peerId) { reject(err); return; }
          if (type === "peer-unavailable") {
            if (State.callId && !State.connected) showToast("对方暂时不可达");
            return;
          }
          if (State.callId && !State.connected && type !== "network") {
            showToast("连接失败");
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

  // ----------------------------------------------------------------
  // 媒体流
  // ----------------------------------------------------------------
  function audioConstraints() {
    return { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  }
  function isMobileLike() {
    return /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|MiuiBrowser|HuaweiBrowser/i.test(navigator.userAgent || "");
  }

  function videoConstraints(facing, tier) {
    tier = tier || "hd";
    var idealFps = Number(CFG.videoFrameRateIdeal || 24);
    var maxFps = Number(CFG.videoFrameRateMax || 30);
    var w = Number(CFG.videoWidthIdeal || 1280);
    var h = Number(CFG.videoHeightIdeal || 720);
    var minW = Number(CFG.videoWidthMin || 960);
    var minH = Number(CFG.videoHeightMin || 540);
    var maxW = Number(CFG.videoWidthMax || 1920);
    var maxH = Number(CFG.videoHeightMax || 1080);

    if (tier === "fhd") {
      w = 1920; h = 1080; minW = Math.max(minW, 1280); minH = Math.max(minH, 720);
      maxW = Math.max(maxW, 1920); maxH = Math.max(maxH, 1080);
    } else if (tier === "qhd") {
      w = 960; h = 540; minW = 640; minH = 360; maxW = Math.max(maxW, 1280); maxH = Math.max(maxH, 720);
    } else if (tier === "safe") {
      w = 640; h = 480; minW = 0; minH = 0; maxW = Math.max(maxW, 640); maxH = Math.max(maxH, 480);
      idealFps = Math.min(idealFps, 20); maxFps = Math.min(maxFps, 24);
    }

    var c = {
      facingMode: facing ? { ideal: facing } : "user",
      width: minW > 0 ? { min: minW, ideal: w, max: maxW } : { ideal: w, max: maxW },
      height: minH > 0 ? { min: minH, ideal: h, max: maxH } : { ideal: h, max: maxH },
      aspectRatio: { ideal: 16 / 9 },
      frameRate: { ideal: idealFps, max: maxFps }
    };
    try { c.resizeMode = { ideal: "none" }; } catch (e) {}
    return c;
  }

  function videoConstraintCandidates(facing) {
    var list = [];
    if (CFG.enableFullHd === true) list.push(videoConstraints(facing, "fhd"));
    list.push(videoConstraints(facing, "hd"));
    if (CFG.videoAllowFallback !== false) {
      list.push(videoConstraints(facing, "qhd"));
      list.push(videoConstraints(facing, "safe"));
    }
    return list;
  }

  async function getUserMediaWithVideoFallback(facing, audio) {
    var candidates = videoConstraintCandidates(facing);
    var lastErr = null;
    for (var i = 0; i < candidates.length; i++) {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: audio, video: candidates[i] });
      } catch (err) {
        lastErr = err;
        warn("video-constraint-fallback", { index: i, error: err && (err.name || err.message) || err });
      }
    }
    throw lastErr || new Error("摄像头不可用");
  }

  function localVideoSettings() {
    try {
      var t = State.localStream && State.localStream.getVideoTracks && State.localStream.getVideoTracks()[0];
      return t && t.getSettings ? t.getSettings() : {};
    } catch (e) { return {}; }
  }

  function prepareLocalMediaStream(stream) {
    if (!stream || !stream.getTracks) return stream;
    stream.getAudioTracks().forEach(function (t) {
      try { t.contentHint = "speech"; } catch (e) {}
    });
    stream.getVideoTracks().forEach(function (t) {
      try { t.contentHint = String(CFG.videoContentHint || "detail"); } catch (e) {}
      t.enabled = State.isCamOn !== false;
    });
    return stream;
  }

  async function getMedia(mode) {
    if (State.localStream) return State.localStream;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("当前浏览器不支持音视频通话");
    }
    var wantsVideo = mode === "video";
    try {
      if (wantsVideo) State.localStream = await getUserMediaWithVideoFallback(State.facingMode, audioConstraints());
      else State.localStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: false });
    } catch (err) {
      if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        throw new Error("请允许麦克风/摄像头权限后再通话");
      }
      if (wantsVideo) {
        State.mode = "audio";
        State.localStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: false });
        showToast("摄像头不可用，已切换语音");
      } else {
        throw err;
      }
    }
    State.isMicOn = !!State.localStream.getAudioTracks()[0];
    State.isCamOn = !!State.localStream.getVideoTracks()[0];
    prepareLocalMediaStream(State.localStream);
    if (wantsVideo) {
      var vs = localVideoSettings();
      warn("local-video-settings", vs);
      if (vs && vs.width && vs.height && (Number(vs.width) < 960 || Number(vs.height) < 540)) {
        showToast("摄像头实际输出 " + vs.width + "x" + vs.height + "，清晰度可能受设备/浏览器限制");
      }
    }
    bindLocalStream();
    syncButtons();
    return State.localStream;
  }

  function stopTracks(stream) {
    if (!stream || !stream.getTracks) return;
    stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
  }

  async function switchCamera() {
    if (State.mode !== "video" || !State.localStream || State.switchingCamera) return;
    if (!State.mediaCall || !State.mediaCall.peerConnection) { showToast("通话未就绪"); return; }
    State.switchingCamera = true;
    var newFacing = State.facingMode === "user" ? "environment" : "user";
    try {
      var ns = await getUserMediaWithVideoFallback(newFacing, false);
      var newTrack = ns.getVideoTracks()[0];
      if (!newTrack) throw new Error("no video track");
      try { newTrack.contentHint = String(CFG.videoContentHint || "detail"); } catch (e) {}

      var pc = State.mediaCall.peerConnection;
      var sender = pc.getSenders().filter(function (s) { return s.track && s.track.kind === "video"; })[0];
      if (sender) await sender.replaceTrack(newTrack);
      boostOutboundQuality(pc, "bind");

      var oldTrack = State.localStream.getVideoTracks()[0];
      if (oldTrack) {
        State.localStream.removeTrack(oldTrack);
        try { oldTrack.stop(); } catch (e) {}
      }
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

  function isShowingLocal(stream) {
    return !!(stream && State.localStream && stream === State.localStream);
  }

  function safePlayMedia(el, scope) {
    if (!el) return;
    function run() {
      if (!el || !el.srcObject) return;
      try {
        var p = el.play && el.play();
        if (p && typeof p.catch === "function") p.catch(function (err) { warn(scope || "media-play", err); });
      } catch (err) {
        warn(scope || "media-play", err);
      }
    }
    if (el.readyState >= 2) run();
    else {
      el.addEventListener("loadedmetadata", run, { once: true });
      el.addEventListener("canplay", run, { once: true });
      setTimeout(run, 120);
      setTimeout(run, 600);
    }
  }

  function hardRefreshVideoElement(el, stream, why) {
    if (!el || !stream || el._cpRefreshing) return;
    el._cpRefreshing = true;
    warn("video-refresh", why || "stuck");
    var transform = el.style.transform;
    try { el.pause(); } catch (e) {}
    try { el.srcObject = null; el.load(); } catch (e) { try { el.srcObject = null; } catch (_) {} }
    setTimeout(function () {
      try {
        el.autoplay = true;
        el.muted = true;
        el.playsInline = true;
        el.setAttribute("playsinline", "");
        el.setAttribute("webkit-playsinline", "");
        el.style.transform = transform;
        el.srcObject = stream;
        safePlayMedia(el, "video-refresh-play");
      } catch (e) { warn("video-refresh-set", e); }
      setTimeout(function () { el._cpRefreshing = false; }, 900);
    }, 80);
  }

  function videoFrameCount(el) {
    if (!el) return 0;
    try {
      if (el.getVideoPlaybackQuality) {
        var q = el.getVideoPlaybackQuality();
        if (q && typeof q.totalVideoFrames === "number") return q.totalVideoFrames;
      }
    } catch (e) {}
    try {
      if (typeof el.webkitDecodedFrameCount === "number") return el.webkitDecodedFrameCount;
    } catch (e) {}
    return Math.floor((Number(el.currentTime) || 0) * 10);
  }

  function checkRemoteVideoElement(el, key) {
    if (!el || el.srcObject !== State.remoteStream || !State.remoteStream) return;
    var track = State.remoteStream.getVideoTracks()[0];
    if (!track || track.readyState !== "live") return;
    safePlayMedia(el, "video-watch-play");

    var frame = videoFrameCount(el);
    var t = Number(el.currentTime) || 0;
    var st = State.videoWatchState[key] || { frame: -1, t: -1, sameSince: now(), lastRefresh: 0 };
    var moved = frame !== st.frame || Math.abs(t - st.t) > 0.05;
    if (moved) {
      st.frame = frame;
      st.t = t;
      st.sameSince = now();
    } else if (el.readyState >= 2 && !el.paused && now() - st.sameSince > Number(CFG.videoFreezeRecoverAfterMs || 4200)) {
      // 只针对“视频元素播放卡住”做重绑；真正网络没帧时只能等 WebRTC 自己恢复。
      if (!st.lastRefresh || now() - st.lastRefresh > 6000) {
        st.lastRefresh = now();
        st.sameSince = now();
        hardRefreshVideoElement(el, State.remoteStream, key + " frame-not-moving");
      }
    }
    State.videoWatchState[key] = st;
  }

  function startVideoWatchdog() {
    clearInterval(State.videoWatchTimer);
    State.videoWatchState = {};
    if (State.mode !== "video") return;
    State.videoWatchTimer = setInterval(function () {
      if (!State.callId || State.mode !== "video") { stopVideoWatchdog(); return; }
      checkRemoteVideoElement(byId("cp-call-remote-video"), "main");
      checkRemoteVideoElement(byId("cp-call-local-video"), "pip");
    }, Number(CFG.videoFreezeCheckMs || 1800));
  }

  function stopVideoWatchdog() {
    clearInterval(State.videoWatchTimer);
    State.videoWatchTimer = null;
    State.videoWatchState = {};
  }

  function setVideoElement(el, stream) {
    if (!el) return;
    var changed = el.srcObject !== stream;
    if (changed) el.srcObject = stream || null;
    // 远端声音走独立 audio，两个 video 始终静音，避免大小窗互换时产生回声。
    el.muted = true;
    el.autoplay = true;
    el.playsInline = true;
    el.disablePictureInPicture = true;
    el.setAttribute("playsinline", "");
    el.setAttribute("webkit-playsinline", "");
    el.style.transform = isShowingLocal(stream) && State.facingMode !== "environment" ? "scaleX(-1)" : "none";
    if (stream) safePlayMedia(el, "video-play");
  }

  function applyAudioOutputSink(el) {
    if (!el || !CFG.audioOutputDeviceId || typeof el.setSinkId !== "function") return;
    if (el._cpSinkId === CFG.audioOutputDeviceId) return;
    el.setSinkId(CFG.audioOutputDeviceId).then(function () {
      el._cpSinkId = CFG.audioOutputDeviceId;
      warn("audio-sink-ok", CFG.audioOutputDeviceId);
    }).catch(function (err) {
      warn("audio-sink", err);
      showToast("无法切换扬声器，将使用系统默认输出");
    });
  }

  function setRemoteAudioElement(el) {
    if (!el) return;
    if (el.srcObject !== State.remoteStream) el.srcObject = State.remoteStream || null;
    el.autoplay = true;
    el.muted = false;
    el.volume = 1;
    applyAudioOutputSink(el);
    if (State.remoteStream) safePlayMedia(el, "remote-audio-play");
  }

  function syncVideoSurfaces() {
    var mainVideo = byId("cp-call-remote-video");
    var pipVideo = byId("cp-call-local-video");
    var wrap = byId("cp-call-local-wrap");
    var main = byId("cp-call-main");
    var remoteAudio = byId("cp-call-remote-audio");

    setRemoteAudioElement(remoteAudio);

    if (State.mode !== "video") {
      if (mainVideo) { mainVideo.style.display = "none"; mainVideo.srcObject = null; }
      if (pipVideo) pipVideo.srcObject = null;
      if (wrap) wrap.style.display = "none";
      if (main) main.removeAttribute("data-main-source");
      return;
    }

    var mainStream = State.mainVideoSource === "local" ? State.localStream : State.remoteStream;
    var pipStream = State.mainVideoSource === "local" ? State.remoteStream : State.localStream;

    setVideoElement(mainVideo, mainStream);
    setVideoElement(pipVideo, pipStream);

    if (mainVideo) mainVideo.style.display = mainStream ? "block" : "none";
    if (main) main.setAttribute("data-main-source", State.mainVideoSource);
    if (wrap) {
      wrap.style.display = pipStream ? "block" : "none";
      wrap.setAttribute("data-showing", State.mainVideoSource === "local" ? "remote" : "local");
      wrap.setAttribute("title", State.mainVideoSource === "local" ? "点击放大对方画面" : "点击放大我的画面");
    }
  }

  function bindLocalStream() {
    syncVideoSurfaces();
  }

  function bindRemoteStream(stream) {
    State.remoteStream = stream || null;
    State.videoWatchState = {};
    if (State.remoteStream && State.remoteStream.getTracks) {
      State.remoteStream.getTracks().forEach(function (t) {
        try {
          t.onunmute = function () { syncVideoSurfaces(); startVideoWatchdog(); };
          t.onmute = function () { warn("remote-track-mute", t.kind); };
          t.onended = function () { warn("remote-track-ended", t.kind); };
        } catch (e) {}
      });
    }
    syncVideoSurfaces();
    startVideoWatchdog();
  }

  function tuneOutboundMedia(pc, reason) {
    if (!pc || !pc.getSenders) return;
    try {
      pc.getSenders().forEach(function (sender) {
        if (!sender || !sender.track || sender.track.kind !== "video" || !sender.getParameters || !sender.setParameters) return;
        try { sender.track.contentHint = String(CFG.videoContentHint || "detail"); } catch (e) {}
        var params = sender.getParameters() || {};
        if (!params.encodings || !params.encodings.length) params.encodings = [{}];
        params.encodings[0].active = true;
        params.encodings[0].maxBitrate = Number(CFG.videoMaxBitrate || 2600000);
        params.encodings[0].maxFramerate = Number(CFG.videoMaxFramerate || 30);
        try { params.encodings[0].scaleResolutionDownBy = 1; } catch (e) {}
        try { params.degradationPreference = String(CFG.videoDegradationPreference || "maintain-resolution"); } catch (e) {}
        sender.setParameters(params).then(function () {
          warn("set-video-params-ok", { reason: reason || "", bitrate: params.encodings[0].maxBitrate, framerate: params.encodings[0].maxFramerate });
        }).catch(function (err) { warn("set-video-params", err); });
      });
    } catch (e) { warn("tune-media", e); }
  }

  function boostOutboundQuality(pc, reason) {
    if (!pc) return;
    [0, 300, 900, 1800, 3200].forEach(function (delay) {
      setTimeout(function () { tuneOutboundMedia(pc, reason || "boost"); }, delay);
    });
  }

  function bindMediaCall(call) {
    State.mediaCall = call;
    call.on("stream", function (remoteStream) {
      bindRemoteStream(remoteStream);
      markConnected();
    });
    call.on("close", function () { if (State.callId) endCall(true); });
    call.on("error", function (err) { warn("media-call", err); if (State.callId) endCall(true); });

    try {
      var pc = call.peerConnection;
      if (pc) {
        boostOutboundQuality(pc, "bind");
        pc.addEventListener && pc.addEventListener("track", function (ev) {
          var s = ev && ev.streams && ev.streams[0];
          if (s && s !== State.remoteStream) {
            bindRemoteStream(s);
            markConnected();
          }
        });
        if (pc.addEventListener) {
          pc.addEventListener("connectionstatechange", function () {
            var st = pc.connectionState;
            warn("pc-connection-state", st);
            if (st === "connected") {
              markConnected();
              startQualityMonitor();
            } else if (st === "connecting") {
              setStatus(State.connected ? "网络恢复中…" : "连接中…");
            } else if (st === "disconnected") {
              setQualityBadge("网络不稳定", "warn");
            } else if (st === "failed") {
              setQualityBadge("连接失败", "bad");
              try { if (pc.restartIce) pc.restartIce(); } catch (e) {}
            } else if (st === "closed") {
              if (State.callId) endCall(true);
            }
          });
          pc.addEventListener("icegatheringstatechange", function () {
            warn("ice-gathering-state", pc.iceGatheringState);
          });
        }
        pc.oniceconnectionstatechange = function () {
          var st = pc.iceConnectionState;
          if (st === "connected" || st === "completed") {
            clearTimeout(State.iceGraceTimer);
            markConnected();
            startVideoWatchdog();
          } else if (st === "disconnected") {
            clearTimeout(State.iceGraceTimer);
            State.iceGraceTimer = setTimeout(function () {
              if (State.callId && pc.iceConnectionState === "disconnected") showToast("网络不稳定，正在重连…");
            }, 1500);
          } else if (st === "failed") {
            clearTimeout(State.iceGraceTimer);
            try { if (pc.restartIce) pc.restartIce(); } catch (e) {}
            State.iceGraceTimer = setTimeout(function () {
              if (State.callId && pc.iceConnectionState === "failed") {
                showToast("连接已断开");
                endCall(false);
              }
            }, CFG.iceReconnectGraceMs);
          }
        };
      }
    } catch (e) { warn("ice-monitor", e); }
  }

  // ----------------------------------------------------------------
  // 网络质量 / 屏幕常亮
  // ----------------------------------------------------------------
  function setQualityBadge(text, tone) {
    var el = byId("cp-call-quality");
    if (!el) return;
    if (!CFG.enableNetworkBadge || !State.connected) {
      el.style.display = "none";
      return;
    }
    el.textContent = text || "网络检测中";
    el.className = "cp-call-quality " + (tone || "ok");
    el.style.display = "inline-flex";
  }

  function bitrateFromStats(current, prev, bytesKey, tsKey) {
    if (!current || !prev) return 0;
    var bytes = Number(current[bytesKey] || 0) - Number(prev[bytesKey] || 0);
    var ms = Number(current[tsKey] || current.timestamp || 0) - Number(prev[tsKey] || prev.timestamp || 0);
    if (!bytes || !ms || ms <= 0) return 0;
    return Math.max(0, Math.round(bytes * 8 / ms)); // kbps
  }

  function compactKbps(v) {
    v = Number(v || 0);
    if (!v) return "";
    if (v >= 1000) return (v / 1000).toFixed(v >= 2000 ? 0 : 1) + "Mbps";
    return Math.round(v) + "kbps";
  }

  async function collectConnectionQuality(pc) {
    if (!pc || !pc.getStats) return null;
    var stats = await pc.getStats(null);
    var prev = State.statsState || {};
    var next = {};
    var out = {
      rttMs: 0,
      lossRatio: 0,
      audioKbps: 0,
      videoKbps: 0,
      packetsLost: 0,
      packetsReceived: 0
    };

    stats.forEach(function (s) {
      if (!s || !s.id) return;
      next[s.id] = s;
      if (s.type === "candidate-pair" && (s.selected || s.nominated || s.state === "succeeded")) {
        var rtt = Number(s.currentRoundTripTime || s.totalRoundTripTime || 0);
        if (rtt > 0) out.rttMs = Math.round(rtt * 1000);
      }
      if (s.type === "inbound-rtp" && !s.isRemote) {
        var ps = prev[s.id] || {};
        var lost = Math.max(0, Number(s.packetsLost || 0) - Number(ps.packetsLost || 0));
        var recv = Math.max(0, Number(s.packetsReceived || 0) - Number(ps.packetsReceived || 0));
        out.packetsLost += lost;
        out.packetsReceived += recv;
      }
      if (s.type === "outbound-rtp" && !s.isRemote) {
        var kbps = bitrateFromStats(s, prev[s.id], "bytesSent", "timestamp");
        if (s.kind === "audio" || s.mediaType === "audio") out.audioKbps += kbps;
        if (s.kind === "video" || s.mediaType === "video") out.videoKbps += kbps;
      }
    });

    var total = out.packetsLost + out.packetsReceived;
    out.lossRatio = total > 0 ? out.packetsLost / total : 0;
    State.statsState = next;
    return out;
  }

  function startQualityMonitor() {
    stopQualityMonitor();
    if (!CFG.enableNetworkBadge || !State.mediaCall || !State.mediaCall.peerConnection) return;
    setQualityBadge("网络检测中", "ok");
    var pc = State.mediaCall.peerConnection;
    var run = function () {
      if (!State.callId || !State.connected || !pc) return;
      collectConnectionQuality(pc).then(function (q) {
        if (!q || !State.connected) return;
        var tone = "ok";
        var text = "网络良好";
        if ((q.rttMs && q.rttMs >= Number(CFG.qualityPoorRttMs || 850)) || q.lossRatio >= Number(CFG.qualityPoorPacketLoss || 0.09)) {
          tone = "bad";
          text = "网络较差";
        } else if ((q.rttMs && q.rttMs >= Number(CFG.qualityOkRttMs || 360)) || q.lossRatio >= Number(CFG.qualityOkPacketLoss || 0.035)) {
          tone = "warn";
          text = "网络一般";
        }
        var detail = [];
        if (q.rttMs) detail.push(q.rttMs + "ms");
        if (State.mode === "video" && q.videoKbps) detail.push(compactKbps(q.videoKbps));
        else if (q.audioKbps) detail.push(compactKbps(q.audioKbps));
        setQualityBadge(detail.length ? text + " · " + detail.join(" · ") : text, tone);
      }).catch(function (err) { warn("quality-stats", err); });
    };
    run();
    State.statsTimer = setInterval(run, Number(CFG.statsIntervalMs || 2200));
  }

  function stopQualityMonitor() {
    clearInterval(State.statsTimer);
    State.statsTimer = null;
    State.statsState = null;
    var el = byId("cp-call-quality");
    if (el) {
      el.style.display = "none";
      el.textContent = "网络检测中";
      el.className = "cp-call-quality ok";
    }
  }

  function requestWakeLock() {
    if (CFG.keepScreenAwake === false || !navigator.wakeLock || State.wakeLock) return;
    navigator.wakeLock.request("screen").then(function (lock) {
      State.wakeLock = lock;
      lock.addEventListener && lock.addEventListener("release", function () { State.wakeLock = null; });
    }).catch(function (err) { warn("wake-lock", err); });
  }

  function releaseWakeLock() {
    var lock = State.wakeLock;
    State.wakeLock = null;
    if (lock && lock.release) lock.release().catch(noop);
  }

  function ensureWakeLockLifecycle() {
    if (State.visibilityHandler) return;
    State.visibilityHandler = function () {
      if (document.visibilityState === "visible" && State.callId) requestWakeLock();
    };
    document.addEventListener("visibilitychange", State.visibilityHandler);
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
    scheduleControlsHide();
    startQualityMonitor();
    requestWakeLock();
    playConnectedTone();
  }
  function setStatus(text) {
    var el = byId("cp-call-status");
    if (el) el.textContent = text || "";
  }

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
    if (native && String(native.getAttribute("data-uid") || "") !== me) {
      return String(native.getAttribute("data-uid") || "");
    }
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
    phone: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    hangup: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.99.99 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48a.989.989 0 0 1-.71.29c-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.66-1.85.998.998 0 0 1-.56-.9v-3.1A14.7 14.7 0 0 0 12 9z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    video: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
    videoOff: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
    flip: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><path d="M15 13a3 3 0 1 1-.9-2.15"/><polyline points="15.2 9.6 15 12 12.6 11.8"/></svg>'
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
      if (avatar) el.src = avatar;
      else el.removeAttribute("src");
      el.style.display = avatar ? "block" : "none";
    });
    if (bg) bg.style.backgroundImage = avatar ? 'url("' + escAttr(avatar) + '")' : "";
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
    syncVideoSurfaces();
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
    if (tip) tip.textContent = packet.mode === "video" ? "邀请你视频通话" : "邀请你语音通话";
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
    clearTimeout(State.iceGraceTimer);
    clearTimeout(State.controlsTimer);
    stopVideoWatchdog();
    stopQualityMonitor();
    releaseWakeLock();

    if (State.mediaCall) { try { State.mediaCall.close(); } catch (e) {} }
    stopTracks(State.localStream);
    stopTracks(State.remoteStream);

    var local = byId("cp-call-local-video");
    var remote = byId("cp-call-remote-video");
    var audio = byId("cp-call-remote-audio");
    var bg = byId("cp-call-bg");
    var wrap = byId("cp-call-local-wrap");
    var mainEl = byId("cp-call-main");
    if (mainEl) mainEl.classList.remove("controls-hidden");
    if (local) local.srcObject = null;
    if (remote) remote.srcObject = null;
    if (audio) audio.srcObject = null;
    if (bg) bg.style.backgroundImage = "";
    if (wrap) {
      wrap.style.left = "";
      wrap.style.top = "";
      wrap.style.right = "14px";
      wrap.removeAttribute("data-showing");
    }

    State.mediaCall = null;
    State.localStream = null;
    State.remoteStream = null;
    State.callId = "";
    State.direction = "";
    State.mode = "audio";
    State.connected = false;
    State.incomingInvite = null;
    State.remoteUser = { uid: "", name: "好友", avatar: "" };
    State.activeToken = "";
    State.facingMode = "user";
    State.switchingCamera = false;
    State.mainVideoSource = "remote";
    State.sec = 0;
    State.isMicOn = true;
    State.isCamOn = false;
    State.ending = false;
    syncButtons();
  }

  var recordedCalls = {};

  function computeCallRecord(hint) {
    var mine = State.direction === "outgoing";
    var connected = State.connected;
    var kind;
    if (connected) kind = "completed";
    else if (hint) kind = hint;
    else if (mine) kind = "canceled";
    else kind = "missed";
    return {
      callId: State.callId,
      peerUid: State.remoteUser.uid,
      mine: mine,
      mode: State.mode,
      kind: kind,
      durationSec: connected ? State.sec : 0
    };
  }

  function logCallRecord(rec) {
    try {
      if (!rec || !rec.callId || !rec.peerUid) return;
      if (recordedCalls[rec.callId]) return;
      recordedCalls[rec.callId] = 1;
      var api = window.CPChatHarmony;
      if (!api || typeof api.addCallRecord !== "function") return;
      api.addCallRecord(rec);
    } catch (e) {
      warn("log-call-record", e);
    }
  }

  function endCall(remoteEnded, hint) {
    if (State.ending) return;
    State.ending = true;
    var oldCallId = State.callId;
    var oldRemoteUid = State.remoteUser.uid;
    var type = State.direction === "outgoing" && !State.connected ? "cancel" : "end";
    var rec = computeCallRecord(hint);
    if (oldCallId) markClosedCall(oldCallId);
    if (!remoteEnded && oldCallId && oldRemoteUid) {
      sendSignal({ type: type, callId: oldCallId, to: oldRemoteUid }).catch(noop);
    }
    logCallRecord(rec);
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
    if (State.callId) { showToast("当前已有通话"); return; }
    var peerUid = getPeerUid();
    if (!peerUid) { showToast("请先进入私聊窗口"); return; }

    var peerId = await initPeer();
    if (State.callId) { showToast("当前已有通话"); return; }
    State.callId = createId();
    State.activeToken = State.callId;
    var token = State.activeToken;
    State.direction = "outgoing";
    State.mode = mode || "audio";
    State.connected = false;
    State.mainVideoSource = "remote";
    State.remoteUser.uid = String(peerUid);
    State.remoteUser.name = getPeerName();
    State.remoteUser.avatar = getPeerAvatar();

    showMainUI();
    setMainConnectedMode();
    setStatus(State.mode === "video" ? "准备视频通话…" : "准备语音通话…");

    try {
      await getMedia(State.mode);
      if (!isActiveCallToken(token)) return;
      await sendSignal({
        type: "invite",
        callId: State.callId,
        mode: State.mode,
        to: State.remoteUser.uid,
        fromName: myName(),
        fromAvatar: myAvatar(),
        peerId: peerId
      });
      if (!isActiveCallToken(token)) return;
      setStatus(State.mode === "video" ? "等待对方接听…" : "正在呼叫…");
      playOutgoingRing();
    } catch (err) {
      var msg = friendlyMediaError(err, State.mode === "video");
      if (State.callId) markClosedCall(State.callId);
      cleanupCall();
      hideUI();
      showToast(msg || "发起通话失败");
      throw err;
    }

    clearTimeout(State.timeoutTimer);
    State.timeoutTimer = setTimeout(function () {
      if (State.callId && !State.connected) { showToast("对方无应答"); endCall(false, "no_answer"); }
    }, CALL_TIMEOUT_MS);
  }

  async function acceptCall() {
    if (!State.incomingInvite) return;
    var invite = State.incomingInvite;
    var token = State.activeToken || State.callId;
    if (!invite.peerId) throw new Error("缺少对方 Peer ID");

    stopRing();
    unlockAudioNow();
    await ensureWukong();
    await initPeer();

    State.direction = "incoming";
    State.mode = invite.mode || "audio";
    State.mainVideoSource = "remote";
    showMainUI();
    setMainConnectedMode();
    setStatus("连接中…");

    var stream = await getMedia(State.mode);
    if (!isActiveCallToken(token)) return;
    await sendSignal({ type: "accept", callId: State.callId, to: State.remoteUser.uid });
    if (!isActiveCallToken(token)) return;

    var call = State.peer.call(invite.peerId, stream, {
      metadata: { callId: State.callId, from: uid(), mode: State.mode }
    });
    bindMediaCall(call);
    boostOutboundQuality(call.peerConnection, "after-call");
    startConnectGuard();

    clearTimeout(State.timeoutTimer);
    State.timeoutTimer = setTimeout(function () {
      if (State.callId && !State.connected) { showToast("连接超时"); endCall(false); }
    }, CONNECT_TIMEOUT_MS);
  }

  function rejectCall() {
    if (!State.incomingInvite) return;
    var rec = computeCallRecord("declined");
    if (State.callId) markClosedCall(State.callId);
    stopRing();
    sendSignal({ type: "reject", callId: State.callId, to: State.remoteUser.uid }).catch(noop);
    logCallRecord(rec);
    cleanupCall();
    hideUI();
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
      State.activeToken = packet.callId;
      State.direction = "incoming";
      State.mode = packet.mode || "audio";
      State.connected = false;
      State.incomingInvite = packet;
      State.mainVideoSource = "remote";
      State.remoteUser.uid = String(packet.from || "");
      State.remoteUser.name = packet.fromName || "好友";
      State.remoteUser.avatar = packet.fromAvatar || "";
      showIncomingUI(packet);
      clearTimeout(State.timeoutTimer);
      State.timeoutTimer = setTimeout(function () {
        if (State.callId && !State.connected) {
          var rec = computeCallRecord("missed");
          markClosedCall(State.callId);
          stopRing();
          logCallRecord(rec);
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
      setStatus("对方已接听，连接中…");
      startConnectGuard();
      return;
    }
    if (packet.type === "reject") { showToast("对方已拒绝"); endCall(true, "rejected"); return; }
    if (packet.type === "busy") { showToast("对方忙线中"); endCall(true, "busy"); return; }
    if (packet.type === "cancel" || packet.type === "end") { endCall(true); }
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
      var micIcon = mic.querySelector(".cp-call-ic");
      var micLabel = mic.querySelector(".cp-call-lbl");
      if (micIcon) micIcon.innerHTML = State.isMicOn ? ICON.mic : ICON.micOff;
      if (micLabel) micLabel.textContent = State.isMicOn ? "静音" : "已静音";
    }
    if (cam) {
      cam.style.display = State.mode === "video" ? "inline-flex" : "none";
      cam.classList.toggle("off", !State.isCamOn);
      var camIcon = cam.querySelector(".cp-call-ic");
      var camLabel = cam.querySelector(".cp-call-lbl");
      if (camIcon) camIcon.innerHTML = State.isCamOn ? ICON.video : ICON.videoOff;
      if (camLabel) camLabel.textContent = State.isCamOn ? "摄像头" : "已关闭";
    }
    if (flip) flip.style.display = State.mode === "video" ? "inline-flex" : "none";
  }

  // ----------------------------------------------------------------
  // 小窗拖动 + 点击切换主画面/小窗
  // ----------------------------------------------------------------
  function enablePipInteractions() {
    var wrap = byId("cp-call-local-wrap");
    if (!wrap || wrap._cpBound) return;
    wrap._cpBound = true;

    var dragging = false;
    var moved = false;
    var pointerId = null;
    var startX = 0;
    var startY = 0;
    var baseLeft = 0;
    var baseTop = 0;

    function startDrag(clientX, clientY, id) {
      dragging = true;
      moved = false;
      pointerId = id == null ? null : id;
      startX = clientX;
      startY = clientY;
      var rect = wrap.getBoundingClientRect();
      baseLeft = rect.left;
      baseTop = rect.top;
      wrap.style.right = "auto";
      wrap.style.left = baseLeft + "px";
      wrap.style.top = baseTop + "px";
      wrap.style.transition = "none";
      wrap.classList.add("dragging");
    }

    function moveDrag(clientX, clientY) {
      if (!dragging) return;
      var dx = clientX - startX;
      var dy = clientY - startY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
      var w = wrap.offsetWidth || 108;
      var h = wrap.offsetHeight || 152;
      var nl = Math.min(Math.max(6, baseLeft + dx), window.innerWidth - w - 6);
      var nt = Math.min(Math.max(60, baseTop + dy), window.innerHeight - h - 100);
      wrap.style.left = nl + "px";
      wrap.style.top = nt + "px";
    }

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      pointerId = null;
      wrap.style.transition = "";
      wrap.classList.remove("dragging");
      if (!moved) toggleMainVideoSource();
    }

    if (window.PointerEvent) {
      wrap.addEventListener("pointerdown", function (e) {
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
        startDrag(e.clientX, e.clientY, e.pointerId);
      });
      wrap.addEventListener("pointermove", function (e) {
        if (!dragging || (pointerId != null && e.pointerId !== pointerId)) return;
        e.preventDefault();
        e.stopPropagation();
        moveDrag(e.clientX, e.clientY);
      });
      wrap.addEventListener("pointerup", function (e) {
        if (pointerId != null && e.pointerId !== pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        try { wrap.releasePointerCapture(e.pointerId); } catch (_) {}
        endDrag();
      });
      wrap.addEventListener("pointercancel", function (e) {
        if (pointerId != null && e.pointerId !== pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        endDrag();
      });
    } else {
      function onDown(e) {
        var p = e.touches ? e.touches[0] : e;
        if (!p) return;
        e.stopPropagation();
        startDrag(p.clientX, p.clientY, null);
        document.addEventListener("mousemove", onMove, { passive: false });
        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("mouseup", onUp);
        document.addEventListener("touchend", onUp);
        document.addEventListener("touchcancel", onUp);
      }
      function onMove(e) {
        if (!dragging) return;
        var p = e.touches ? e.touches[0] : e;
        if (!p) return;
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        moveDrag(p.clientX, p.clientY);
      }
      function onUp(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("touchend", onUp);
        document.removeEventListener("touchcancel", onUp);
        endDrag();
      }
      wrap.addEventListener("mousedown", onDown);
      wrap.addEventListener("touchstart", onDown, { passive: true });
    }

    wrap.addEventListener("click", function (e) {
      // pointer/touch 已在 up 里处理点击；这里仅阻止冒泡到主画面，避免误隐藏控件。
      e.preventDefault();
      e.stopPropagation();
    });
  }

  function toggleMainVideoSource() {
    if (State.mode !== "video") return;
    if (!State.localStream || !State.remoteStream) {
      showToast("等待对方画面");
      return;
    }
    var next = State.mainVideoSource === "remote" ? "local" : "remote";
    var nextMain = next === "local" ? State.localStream : State.remoteStream;
    var nextPip = next === "local" ? State.remoteStream : State.localStream;
    if (!nextMain || !nextPip) {
      showToast("画面还没准备好");
      return;
    }
    State.mainVideoSource = next;
    syncVideoSurfaces();
    showCallControls();
  }

  // ----------------------------------------------------------------
  // 视频通话控件自动隐藏（点屏幕显示，3 秒后隐藏，类似微信）
  // ----------------------------------------------------------------
  function scheduleControlsHide() {
    clearTimeout(State.controlsTimer);
    if (State.mode !== "video" || !State.connected) return;
    State.controlsTimer = setTimeout(hideCallControls, Number(CFG.autoHideControlsMs || 3500));
  }
  function showCallControls() {
    var main = byId("cp-call-main");
    if (main) main.classList.remove("controls-hidden");
    scheduleControlsHide();
  }
  function hideCallControls() {
    clearTimeout(State.controlsTimer);
    if (State.mode !== "video" || !State.connected) return;
    var main = byId("cp-call-main");
    if (main) main.classList.add("controls-hidden");
  }
  function toggleCallControls() {
    var main = byId("cp-call-main");
    if (!main) return;
    if (main.classList.contains("controls-hidden")) showCallControls();
    else hideCallControls();
  }
  function onMainTap(e) {
    if (State.mode !== "video" || !State.connected) return;
    // Taps on the controls / PiP have their own handlers; just keep the bar
    // visible (and reset the auto-hide timer) instead of toggling.
    if (e.target && e.target.closest &&
        (e.target.closest("#cp-call-controls") || e.target.closest("#cp-call-local-wrap"))) {
      showCallControls();
      return;
    }
    toggleCallControls();
  }

  // ----------------------------------------------------------------
  // 样式
  // ----------------------------------------------------------------
  function injectStyle() {
    var css = `
      #cp-call-root *{box-sizing:border-box;}
      .cp-harmony-call-slot{position:relative;flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-left:auto;margin-right:2px;z-index:30;}
      #cp-chat-root .cp-harmony-call-entry,.cp-harmony-call-entry{width:34px!important;height:34px!important;min-width:34px!important;padding:0!important;border:0!important;border-radius:999px!important;background:transparent!important;color:#374151!important;display:grid!important;place-items:center!important;cursor:pointer!important;box-shadow:none!important;-webkit-tap-highlight-color:transparent;transition:transform .14s ease,color .14s ease;}
      #cp-chat-root .cp-harmony-call-entry:hover,.cp-harmony-call-entry:hover{background:transparent!important;color:#111827!important;}
      #cp-chat-root .cp-harmony-call-entry:active,.cp-harmony-call-entry:active{transform:scale(.9);background:transparent!important;}
      .cp-harmony-call-entry svg{width:20px;height:20px;display:block;}
      .cp-harmony-call-pop{position:absolute;right:0;top:44px;width:174px;padding:6px;border-radius:16px;background:rgba(255,255,255,.99);backdrop-filter:blur(20px) saturate(1.3);-webkit-backdrop-filter:blur(20px) saturate(1.3);border:1px solid rgba(0,0,0,.05);box-shadow:0 18px 44px rgba(15,23,42,.22);z-index:2147483450;animation:cp-pop-in .18s cubic-bezier(.2,.8,.2,1);}
      .cp-harmony-call-pop[hidden]{display:none!important;}
      @keyframes cp-pop-in{from{opacity:0;transform:translateY(-8px) scale(.95);}to{opacity:1;transform:translateY(0) scale(1);}}
      .cp-harmony-call-pop::before{content:"";position:absolute;right:18px;top:-6px;width:12px;height:12px;background:#fff;border-left:1px solid rgba(0,0,0,.05);border-top:1px solid rgba(0,0,0,.05);transform:rotate(45deg);}
      .cp-harmony-call-pop button{width:100%;height:48px;border:none;background:transparent;border-radius:12px;padding:8px 10px;display:flex;align-items:center;gap:10px;cursor:pointer;text-align:left;color:#0f172a;transition:background .12s ease;}
      .cp-harmony-call-pop button:hover{background:#f8fafc;}
      .cp-harmony-call-pop button:active{transform:scale(.98);}
      .cp-harmony-call-pop-icon{width:24px;height:24px;border-radius:0;display:grid;place-items:center;flex-shrink:0;background:transparent!important;box-shadow:none!important;}
      .cp-harmony-call-pop-icon svg{width:20px;height:20px;}
      .cp-harmony-call-pop-icon.audio{color:#334155;}
      .cp-harmony-call-pop-icon.video{color:#6d28d9;}
      .cp-harmony-call-pop-main b{display:block;font-size:14px;font-weight:700;color:#0f172a;}

      #cp-call-root{position:fixed;inset:0;z-index:2147483500;display:none;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Segoe UI",sans-serif;-webkit-tap-highlight-color:transparent;}
      #cp-call-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(40px) brightness(.42);transform:scale(1.12);background-color:#0f1620;}
      #cp-call-mask{position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,23,42,.15),rgba(8,12,20,.82));}
      #cp-call-main{position:absolute;inset:0;display:none;overflow:hidden;background:#070b11;touch-action:manipulation;}
      #cp-call-remote-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#070b11;display:none;}
      #cp-call-main.is-audio #cp-call-remote-video{display:none!important;}
      #cp-call-main.is-video::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(circle at 50% 40%,rgba(255,255,255,.04),rgba(0,0,0,0) 42%);}
      #cp-call-main.is-video #cp-call-remote-video{z-index:0;}

      #cp-call-top{position:absolute;top:0;left:0;right:0;z-index:3;padding:calc(54px + env(safe-area-inset-top)) 20px 0;display:flex;flex-direction:column;align-items:center;text-align:center;pointer-events:none;}
      #cp-call-avatar{width:108px;height:108px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.16);box-shadow:0 16px 40px rgba(0,0,0,.4);background:#334155;}
      #cp-call-name{margin-top:20px;font-size:27px;font-weight:800;letter-spacing:.5px;text-shadow:0 2px 8px rgba(0,0,0,.3);}
      #cp-call-status{margin-top:10px;font-size:15px;opacity:.78;font-variant-numeric:tabular-nums;}
      .cp-call-quality{margin-top:10px;display:none;align-items:center;justify-content:center;max-width:min(78vw,360px);padding:5px 10px;border-radius:999px;font-size:12px;font-weight:750;letter-spacing:.2px;background:rgba(34,197,94,.18);color:#dcfce7;border:1px solid rgba(187,247,208,.22);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}
      .cp-call-quality.warn{background:rgba(245,158,11,.20);color:#fef3c7;border-color:rgba(253,230,138,.25);}
      .cp-call-quality.bad{background:rgba(239,68,68,.22);color:#fee2e2;border-color:rgba(254,202,202,.25);}
      #cp-call-main.is-video #cp-call-top{padding-top:calc(30px + env(safe-area-inset-top));background:linear-gradient(180deg,rgba(0,0,0,.45),rgba(0,0,0,0));padding-bottom:20px;}
      #cp-call-main.is-video #cp-call-avatar{display:none!important;}
      #cp-call-main.is-video #cp-call-name{font-size:20px;}
      #cp-call-main.is-video #cp-call-top,#cp-call-main.is-video #cp-call-controls{transition:opacity .28s ease,transform .28s ease;}
      #cp-call-main.is-video.controls-hidden #cp-call-top{opacity:0;transform:translateY(-12px);pointer-events:none;}
      #cp-call-main.is-video.controls-hidden #cp-call-controls{opacity:0;transform:translateY(18px);pointer-events:none;}

      #cp-call-local-wrap{position:absolute;right:14px;top:calc(96px + env(safe-area-inset-top));width:112px;height:156px;border-radius:18px;overflow:hidden;background:#000;display:none;z-index:8;box-shadow:0 16px 36px rgba(0,0,0,.4);border:1.5px solid rgba(255,255,255,.18);cursor:pointer;transition:box-shadow .18s ease,transform .18s ease;touch-action:none;user-select:none;}
      #cp-call-local-wrap:active{transform:scale(.97);}
      #cp-call-local-wrap.dragging{transform:scale(1.02);box-shadow:0 20px 44px rgba(0,0,0,.5);}
      #cp-call-local-wrap::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);pointer-events:none;}
      #cp-call-local-video{width:100%;height:100%;object-fit:cover;display:block;background:#000;}

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
      #cp-call-in-actions{position:absolute;bottom:calc(56px + env(safe-area-inset-bottom));left:0;right:0;display:flex;gap:14px;align-items:center;justify-content:center;padding:0 18px;}
      .cp-call-in-action{min-width:122px;height:52px;border-radius:999px;padding:0 18px;display:inline-flex;flex-direction:row;align-items:center;justify-content:center;gap:9px;cursor:pointer;color:#fff;font-size:15px;font-weight:750;border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}
      .cp-call-in-action.reject{background:rgba(255,255,255,.12);}
      .cp-call-in-action.accept{background:linear-gradient(135deg,#3b82f6,#2563eb);box-shadow:0 12px 30px rgba(37,99,235,.34);}
      .cp-call-in-action:active{transform:scale(.96);}
      .cp-call-in-circle{width:24px;height:24px;border-radius:0;display:grid;place-items:center;color:currentColor;background:transparent!important;box-shadow:none!important;animation:none!important;}
      .cp-call-in-circle svg{width:21px;height:21px;}
      .cp-call-in-circle.red svg{transform:rotate(135deg);}
      .cp-call-hidden-signal{display:none!important;}
    `;
    var st = byId("cp-harmony-call-style");
    if (!st) {
      st = document.createElement("style");
      st.id = "cp-harmony-call-style";
      document.head.appendChild(st);
    }
    st.textContent = css;
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
        '<video id="cp-call-remote-video" autoplay muted playsinline webkit-playsinline></video>' +
        '<audio id="cp-call-remote-audio" autoplay playsinline></audio>' +
        '<div id="cp-call-top">' +
          '<img id="cp-call-avatar" src="" alt="">' +
          '<div id="cp-call-name">好友</div>' +
          '<div id="cp-call-status">连接中…</div>' +
          '<div id="cp-call-quality" class="cp-call-quality" style="display:none">网络检测中</div>' +
        '</div>' +
        '<div id="cp-call-local-wrap"><video id="cp-call-local-video" autoplay muted playsinline webkit-playsinline></video></div>' +
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
          '<button type="button" class="cp-call-in-action reject" id="cp-call-reject"><span class="cp-call-in-circle red">' + ICON.phone + '</span><span>拒绝</span></button>' +
          '<button type="button" class="cp-call-in-action accept" id="cp-call-accept"><span class="cp-call-in-circle green">' + ICON.phone + '</span><span>接听</span></button>' +
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

    var mainEl = byId("cp-call-main");
    if (mainEl) mainEl.addEventListener("click", onMainTap);

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

    if (!State.outsideClickHandler) {
      State.outsideClickHandler = function (e) {
        var p = byId("cp-harmony-call-pop");
        if (!p || p.hidden) return;
        if (!e.target.closest("#cp-harmony-call-pop") && !e.target.closest("#cp-harmony-call-entry")) p.hidden = true;
      };
      document.addEventListener("click", State.outsideClickHandler);
    }
  }

  function removeHeaderButton() {
    var slot = byId("cp-harmony-call-slot");
    if (slot && slot.parentNode) { try { slot.parentNode.removeChild(slot); } catch (_) {} }
  }

  function hideSignalMessagesInDom(scope) {
    if (!isChatContext()) return;
    var root = scope && scope.querySelectorAll ? scope : document;
    var rows = root.querySelectorAll(
      "#cp-msg-list .cp-row, " + '[component="chat/messages"] [component="chat/message"]'
    );
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if ((row.textContent || "").indexOf(SIGNAL_PREFIX) < 0) continue;
      row.classList.add("cp-call-hidden-signal");
    }
  }

  function refreshChatBindings() {
    if (isChatContext()) { injectHeaderButton(); hideSignalMessagesInDom(document); }
    else removeHeaderButton();
  }

  function shouldRefreshForMutation(mutations) {
    var needRefresh = false;
    var needHide = false;
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      for (var j = 0; j < m.addedNodes.length; j++) {
        var n = m.addedNodes[j];
        if (!n || n.nodeType !== 1) continue;
        if (
          n.id === "cp-chat-root" ||
          n.classList && (n.classList.contains("cp-header") || n.classList.contains("cp-header-actions")) ||
          n.querySelector && (n.querySelector(".cp-header") || n.querySelector(".cp-header-actions"))
        ) {
          needRefresh = true;
        }
        if ((n.textContent || "").indexOf(SIGNAL_PREFIX) >= 0) needHide = true;
      }
      if (m.removedNodes && m.removedNodes.length) {
        needRefresh = true;
      }
      if (needRefresh && needHide) break;
    }
    return needRefresh || needHide;
  }

  function destroy() {
    State.destroyed = true;
    if (State.domObserver) { try { State.domObserver.disconnect(); } catch (e) {} State.domObserver = null; }
    clearTimeout(State.injectTimer);
    cleanupCall();
    hideUI();
    removeHeaderButton();
    if (State.outsideClickHandler) {
      try { document.removeEventListener("click", State.outsideClickHandler); } catch (e) {}
      State.outsideClickHandler = null;
    }
    if (State.visibilityHandler) {
      try { document.removeEventListener("visibilitychange", State.visibilityHandler); } catch (e) {}
      State.visibilityHandler = null;
    }
    var root = byId("cp-call-root");
    if (root && root.parentNode) root.parentNode.removeChild(root);
    var style = byId("cp-harmony-call-style");
    if (style && style.parentNode) style.parentNode.removeChild(style);
    State.started = false;
    try { window.__cpHarmonyPeerCallInitedV7 = false; } catch (_) {}
    try { window.__cpHarmonyCallWkListenerBoundV7 = false; } catch (_) {}
  }

  // ----------------------------------------------------------------
  // 启动
  // ----------------------------------------------------------------
  function boot() {
    if (State.started) { refreshChatBindings(); return; }
    State.destroyed = false;
    State.started = true;

    mountUI();
    refreshChatBindings();
    unlockAudioOnGesture();
    ensureWakeLockLifecycle();

    if (CFG.globalListen !== false && CFG.autoConnectWukong !== false) {
      ensureWukong().catch(function (err) { warn("global-ensure-wukong", err); });
    }

    if (!State.domObserver) {
      State.domObserver = new MutationObserver(function (mutations) {
        if (!shouldRefreshForMutation(mutations)) return;
        clearTimeout(State.injectTimer);
        State.injectTimer = setTimeout(refreshChatBindings, 100);
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
            callId: State.callId,
            to: State.remoteUser.uid
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
    version: "v8.0-apprtc-ux-wukong-call",
    boot: boot,
    refresh: function () { injectHeaderButton(); hideSignalMessagesInDom(document); return !!byId("cp-harmony-call-entry"); },
    start: function (mode) { unlockAudioNow(); return startOutgoingCall(mode || "audio"); },
    end: function () { return endCall(false); },
    switchCamera: switchCamera,
    swapVideo: toggleMainVideoSource,
    getPeerId: function () { return State.peerId; },
    isActive: function () { return !!State.callId; },
    hideSignals: function () { hideSignalMessagesInDom(document); },
    audioUrls: function () { return { outgoing: mediaAssetUrls(CFG.outgoingRingUrl), incoming: mediaAssetUrls(CFG.incomingRingUrl) }; },
    videoQuality: function () {
      return { local: localVideoSettings(), bitrate: Number(CFG.videoMaxBitrate || 2600000), framerate: Number(CFG.videoMaxFramerate || 30), degradation: CFG.videoDegradationPreference || "maintain-resolution" };
    },
    boostQuality: function () { if (State.mediaCall) boostOutboundQuality(State.mediaCall.peerConnection, "manual"); return this.videoQuality(); },
    setAudioOutput: function (deviceId) { CFG.audioOutputDeviceId = String(deviceId || ""); applyAudioOutputSink(byId("cp-call-remote-audio")); return CFG.audioOutputDeviceId; },
    getStats: function () { return State.statsState || null; },
    testAudio: function (kind) { unlockAudioNow(); if (kind === "incoming") playIncomingRing(); else playOutgoingRing(); return mediaAssetUrls(kind === "incoming" ? CFG.incomingRingUrl : CFG.outgoingRingUrl); },
    stopAudio: stopRing,
    destroy: destroy,
    config: CFG
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
