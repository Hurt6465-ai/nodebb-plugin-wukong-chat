/* Generated from the uploaded chat window script and wrapped as a NodeBB plugin engine. */
(function () {
  "use strict";


  function ensureMobileViewport() {
    var content = "width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no";
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "viewport");
      document.head.appendChild(meta);
    }
    if (meta.getAttribute("content") !== content) {
      meta.setAttribute("content", content);
    }
  }
  ensureMobileViewport();


  var CP_PLUGIN = (window.CPChatHarmony = window.CPChatHarmony || {});
  function cpPluginConfig() {
    return (window.CPChatHarmony && window.CPChatHarmony.config) || {};
  }

  function getRuntimeState() {
    try {
      return typeof state === "undefined" ? null : state;
    } catch (_) {
      return null;
    }
  }

  function readSelfUidFromRuntime() {
    var s = getRuntimeState();
    var candidates = [
      s && s.myUid,
      window.app && window.app.user && window.app.user.uid,
      window.ajaxify && ajaxify.data && ajaxify.data.loggedInUser && ajaxify.data.loggedInUser.uid,
      window.ajaxify && ajaxify.data && ajaxify.data.uid,
      window.config && config.uid
    ];

    for (var i = 0; i < candidates.length; i++) {
      var uid = String(candidates[i] == null ? "" : candidates[i]).trim();
      if (/^\d+$/.test(uid)) return uid;
    }

    return "";
  }

  function ensureSelfUid() {
    var s = getRuntimeState();
    var uid = readSelfUidFromRuntime();
    if (uid && s && s.myUid !== uid) s.myUid = uid;
    return String((s && s.myUid) || uid || "").trim();
  }

  function getSelfUid() {
    return ensureSelfUid();
  }

  function cpSameUid(a, b) {
    a = String(a == null ? "" : a).trim();
    b = String(b == null ? "" : b).trim();

    if (!a || !b) return false;
    if (a === b) return true;

    if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
      return String(Number(a)) === String(Number(b));
    }

    return false;
  }

  function cpIsMineUid(uid) {
    return cpSameUid(uid, getSelfUid());
  }

  function normalizeMineFlag(m) {
    if (!m) return m;
    var uid = m.uid || m.from_uid || m.fromUid || m.fromUID || "";
    if (uid && cpIsMineUid(uid)) {
      m.mine = true;
      m.uid = getSelfUid();
    }
    return m;
  }

  function cpAutoPlayPreviewVideo(video, mask) {
    if (!video) return;

    video.controls = true;
    video.muted = false;
    video.playsInline = false;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");

    try { video.load(); } catch (_) {}

    var fullscreenTarget = video;
    try {
      if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      } else if (fullscreenTarget.requestFullscreen) {
        fullscreenTarget.requestFullscreen().catch(function () {});
      } else if (mask && mask.requestFullscreen) {
        mask.requestFullscreen().catch(function () {});
      }
    } catch (_) {}

    setTimeout(function () {
      try {
        var p = video.play();
        if (p && typeof p.catch === "function") {
          p.catch(function () {
            try {
              video.muted = true;
              video.play().catch(function () {});
            } catch (_) {}
          });
        }
      } catch (_) {}
    }, 30);
  }

  function cpKeyToSnake(key) {
    return String(key || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[\s\-]+/g, "_")
      .toLowerCase();
  }

  function cpT(key, fallback) {
    var lang = (window.CPChatHarmony && window.CPChatHarmony.i18n) || {};
    var snake = cpKeyToSnake(key);
    return lang[key] || lang[snake] || fallback || key;
  }

  function cpPickLocale() {
    var raw =
      (window.app && app.user && (app.user.language || app.user.locale)) ||
      (navigator.languages && navigator.languages[0]) ||
      navigator.language ||
      "zh-CN";
    raw = String(raw || "zh-CN");
    if (/^zh/i.test(raw)) return "zh-CN";
    if (/^(my|my-MM|burmese)/i.test(raw)) return "my";
    if (/^en/i.test(raw)) return "en-US";
    return "zh-CN";
  }

  async function cpLoadI18n() {
    var cfg = cpPluginConfig();
    var base = String(cfg.i18nBase || "").replace(/\/+$/, "");
    if (!base || (window.CPChatHarmony && window.CPChatHarmony.i18nLoaded)) return;

    var locale = cpPickLocale();
    var names = [locale];
    // Tolerate alternate locale file names (e.g. Burmese ships as my.json/my-MM.json)
    // so the chat UI localizes correctly instead of silently falling back to Chinese.
    if (locale === "my") names.push("my-MM");
    else if (locale === "en-US") names.push("en");
    if (names.indexOf("zh-CN") === -1) names.push("zh-CN");
    var urls = names.map(function (name) { return base + "/" + name + ".json"; });

    for (var i = 0; i < urls.length; i++) {
      try {
        var res = await fetch(urls[i] + "?v=42", {
          credentials: "same-origin",
          headers: { Accept: "application/json" }
        });
        if (!res.ok) continue;
        var json = await res.json();
        window.CPChatHarmony.i18n = Object.assign({}, window.CPChatHarmony.i18n || {}, json || {});
        window.CPChatHarmony.i18nLoaded = true;
        return;
      } catch (e) {
        warn("load-i18n", e);
      }
    }
  }
  function cpLog() {
    if (cpPluginConfig().debug && window.console && console.log) {
      console.log.apply(console, ['[cp-chat-harmony]'].concat(Array.prototype.slice.call(arguments)));
    }
  }
  if (cpPluginConfig().enabled === false) return;

  if (window.__cpNodebbHarmonyInited) return;
  window.__cpNodebbHarmonyVersion = "1.0.6-wukong-call-record-persist";
  window.__cpNodebbHarmonyInited = true;

  var LS_PREFIX = "cp_chat_harmony_" + location.pathname.replace(/[^\w]/g, "_");
  var KEY_CFG = LS_PREFIX + "_cfg";
  var KEY_BG = LS_PREFIX + "_bg";
  var DB_NAME = "CP_Wukong_Engine_V11";

  var MAX_WK_MESSAGES_IN_MEMORY = 600;
  var MAX_TOTAL_MESSAGES_IN_MEMORY = cpPluginConfig().maxTotalMessagesInMemory || 800;
  var MAX_PERSIST_MESSAGES = cpPluginConfig().maxPersistMessages || 220;

  var MEDIA_CACHE_MAX_BLOB_BYTES = 5 * 1024 * 1024;
  var MEDIA_CACHE_MAX_TOTAL_BYTES = 40 * 1024 * 1024;
  var MEDIA_CACHE_MAX_ITEMS = 240;
  var MEDIA_CACHE_EXPIRE_MS = 7 * 24 * 3600 * 1000;

  var PENDING_NATIVE_TTL = 18000;

  // 统一滚动判定阈值
  var BOTTOM_THRESHOLD = 120;


  var CALL_SIGNAL_PREFIX = "__cp_harmony_call__:";
  var CALL_RECORD_PREFIX = "__cp_harmony_call_record__:";

  function isCallRecordText(text) {
    var s = String(text == null ? "" : text).trim();
    return s.indexOf(CALL_RECORD_PREFIX) === 0;
  }

  function isCallControlSignalText(text) {
    var s = String(text == null ? "" : text).trim();
    return s.indexOf(CALL_SIGNAL_PREFIX) === 0 || s.indexOf("__wkcall__:") === 0 || s.indexOf("__wkcall__：") === 0;
  }

  function isCallSignalText(text) {
    return isCallControlSignalText(text) || isCallRecordText(text);
  }

  function isCallSignalMessage(m) {
    if (!m) return false;
    if (m.type === "call") return false;
    return isCallSignalText(m.serverText || m.text || m.html || "");
  }

  function safeParseJsonObject(raw) {
    try {
      var obj = JSON.parse(String(raw || ""));
      return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : null;
    } catch (_) {
      return null;
    }
  }

  function normalizeCallRecordKind(kind) {
    kind = String(kind || "").trim();
    var allowed = {
      completed: 1,
      canceled: 1,
      no_answer: 1,
      rejected: 1,
      busy: 1,
      missed: 1,
      declined: 1
    };
    return allowed[kind] ? kind : "completed";
  }

  function normalizeCallRecordMode(mode) {
    mode = String(mode || "audio").trim().toLowerCase();
    if (mode === "voice") mode = "audio";
    return mode === "video" ? "video" : "audio";
  }

  function normalizeCallRecordInfo(info) {
    info = info || {};
    var out = {
      type: "call_record",
      version: 1,
      callId: String(info.callId || info.call_id || "").trim(),
      kind: normalizeCallRecordKind(info.kind || info.callKind || info.status),
      mode: normalizeCallRecordMode(info.mode || info.callMode),
      durationSec: Math.max(0, Math.floor(Number(info.durationSec || info.duration || info.duration_seconds || 0) || 0)),
      mine: !!info.mine,
      ts: Number(info.ts || info.timestamp || Date.now()) || Date.now()
    };
    if (!out.callId) {
      out.callId = "call_" + shortHash([out.kind, out.mode, out.durationSec, out.ts].join("|"));
    }
    return out;
  }

  function buildCallRecordText(info) {
    var payload = normalizeCallRecordInfo(info);
    return CALL_RECORD_PREFIX + JSON.stringify(payload);
  }

  function parseCallRecordText(text) {
    var s = String(text == null ? "" : text).trim();
    if (s.indexOf(CALL_RECORD_PREFIX) !== 0) return null;
    var body = s.slice(CALL_RECORD_PREFIX.length).trim();
    var obj = safeParseJsonObject(body);
    if (!obj) {
      try { obj = safeParseJsonObject(decodeURIComponent(body)); } catch (_) { obj = null; }
    }
    if (!obj) return null;
    return normalizeCallRecordInfo(obj);
  }

  var LANG_LIST = [
    { n: "中文", f: "🇨🇳" },
    { n: "English", f: "🇺🇸" },
    { n: "မြန်မာစာ", f: "🇲🇲" },
    { n: "日本語", f: "🇯🇵" },
    { n: "한국어", f: "🇰🇷" },
    { n: "ภาษาไทย", f: "🇹🇭" },
    { n: "Tiếng Việt", f: "🇻🇳" },
    { n: "Русский", f: "🇷🇺" }
  ];

  var LANG_CODE_MAP = {
    "自动检测": "auto",
    auto: "auto",
    "中文": "zh-CN",
    "English": "en",
    "မြန်မာစာ": "my",
    "缅甸语": "my",
    "日本語": "ja",
    "한국어": "ko",
    "ภาษาไทย": "th",
    "Tiếng Việt": "vi",
    "Русский": "ru"
  };

  var IMAGE_CONFIG = {
    maxSide: 1440,
    maxSizeMB: 0.45,
    quality: 0.6,
    minCompressBytes: 120 * 1024,
    useWebp: true,
    qualities: [0.60, 0.55, 0.50, 0.45]
  };

  var VIDEO_CONFIG = {
    maxSizeThreshold: 30 * 1024 * 1024,
    maxDuration: 180,
    maxWidth: 720,
    fps: 24,
    videoBitsPerSecond: 900000,
    audioBitsPerSecond: 64000
  };

  var VOICE_CONFIG = {
    fallbackMimeTypes: ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"],
    audioBitsPerSecond: 16000
  };

  var DEFAULT_TRANSLATE_PROMPT =
   '将以下消息翻译成 {{myLang}}。\n\n' +
   '核心目标：准确率最高，最接近原文意思。\n\n' +
   '要求：\n' +
   '- 采用高保真自然直译：优先保留原文意思、结构、语气、情绪、称呼、轻重程度、表达顺序、表情符号和换行。\n' +
   '- 译文要符合 {{myLang}} 的日常表达习惯，但不得为了自然、好听或顺口而改变原文意思。\n' +
   '- 不要新增、删减、总结、解释、改写或美化原文。\n' +
   '- 原文简单就简单翻，原文随意就随意翻，原文含糊就尽量保留含糊感。\n' +
   '- 若原文带有暧昧、调侃、冷淡、敷衍、撒娇、抱怨、反问、讽刺、怀疑、不满或委屈等语气，译文必须保留对应聊天感觉，不要加重或减轻。\n' +
   '- 不要添加原文没有的称呼、敬语、亲昵称呼、暧昧语气或情绪。\n' +
   '- 保留链接、用户名、代码块、Markdown、列表、数字、英文、专有名词和表情。\n' +
   '- 如果原文有多条消息或多行内容，按原结构逐条对应翻译，不要合并。\n' +
   '- 只输出严格 JSON：{"translation":"译文"}\n' +
   '- 不要添加任何解释、备注、原文或额外文字。\n\n' +
   '待翻译消息：\n' +
   '"{{peerMessage}}"';
  var DEFAULT_WINGMAN_PROMPT =
    '你是我的情感顾问和聊天僚机。根据历史聊天上下文，以及以下信息，帮我分析对方消息并生成短回复建议。\n\n' +
    '【我的信息】\n' +
    '- 我的语言：{{myLang}}\n' +
    '- 对方性别：{{targetGender}}（女生/男生/不指定）\n' +
    '- 当前关系阶段：{{relationshipStage}}（刚认识/聊过几次/有点暧昧/已约过会）\n' +
    '- 我的聊天风格：{{communicationStyle}}（默认：自然直接，偶尔幽默）\n\n' +
    '【性别差异提醒】\n' +
    '- 若对方是女生：多关注情绪，少给直接建议；幽默要轻松不冒犯；推进要稳，先共情再引导。\n' +
    '- 若对方是男生：可稍直接，但别过度主动；调侃有度，别贬低。\n' +
    '- 若未指定：按自然社交常识处理。\n\n' +
    '【最近对话历史】\n' +
    '{{history}}\n\n' +
    '【对方刚发的消息】\n' +
    '"{{peerMessage}}"\n\n' +
    '【你需要完成的任务】\n' +
    '1. 根据聊天上下文信息，分析对方的意图和情绪。50字以内，格式严格写为："[情绪状态]，[表面意思]，[可能潜台词]。" 若消息太短无法判断，写"消息很短，正常接即可。"\n' +
    '2. 根据情感分析结果为用户生成3-5条短回复。每条必须能直接发送，20字以内，口语化，有接话钩子。\n\n' +
    '【回复生成规则】\n' +
    '- 每条 text 必须 ≤20 个字符，越短越好。\n' +
    '- 可以用"哈哈哈、真的、笑死、好家伙、绝了、天呐"等自然聊天词。\n' +
    '- 风格多样，至少覆盖轻松幽默/温暖关心/真诚走心/推进关系/化解尴尬中的不同方向。\n' +
    '- 每条附带口语化风险说明，例如"很安全，她会回"或"有点冒险"。\n' +
    '- 刚认识不暧昧，暧昧期不客套。\n' +
    '- 绝对禁止：自我贬低、质问对方、情感绑架、大段表白、纯"哈哈"。\n\n' +
    '【输出格式】\n' +
    '只输出一个 JSON，不要任何 Markdown 标记，格式如下：\n' +
    '{\n' +
    '  "emotion_analysis": "这里填情感分析",\n' +
    '  "quick_replies": [\n' +
    '    {\n' +
    '      "label": "6字内标签",\n' +
    '      "text": "20字内短回复",\n' +
    '      "style": "轻松幽默/温暖关心/真诚走心/推进关系/化解尴尬",\n' +
    '      "affinity_risk": "风险说明"\n' +
    '    }\n' +
    '  ]\n' +
    '}';

  function cpSvgIcon(name, extraClass) {
    var paths = {
      plus: '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
      play: '<path d="M8 5v14l11-7z"></path>',
      pause: '<path d="M9 5v14"></path><path d="M15 5v14"></path>',
      mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"></path><path d="M5 11a7 7 0 0 0 14 0"></path><path d="M12 18v3"></path><path d="M8 21h8"></path>',
      send: '<path d="M12 19V5"></path><path d="M5 12l7-7 7 7"></path>',
      image: '<rect x="3" y="5" width="18" height="14" rx="3"></rect><circle cx="8.5" cy="10" r="1.5"></circle><path d="M21 15l-5-5L5 19"></path>',
      camera: '<path d="M7 7l1.5-2h7L17 7h2a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3h2z"></path><circle cx="12" cy="13" r="4"></circle>',
      quote: '<path d="M10 11H6a4 4 0 0 1 4-4v2a2 2 0 0 0-2 2h2v5H5v-5a7 7 0 0 1 7-7"></path><path d="M19 11h-4a4 4 0 0 1 4-4v2a2 2 0 0 0-2 2h2v5h-5v-5a7 7 0 0 1 7-7"></path>',
      recall: '<path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-15-6.7L3 13"></path>',
      trash: '<path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M6 7l1 14h10l1-14"></path><path d="M9 7V4h6v3"></path>',
      close: '<path d="M6 6l12 12"></path><path d="M18 6L6 18"></path>'
    };
    var cls = "cp-icon" + (extraClass ? " " + extraClass : "");
    return '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true">' + (paths[name] || paths.plus) + "</svg>";
  }

  var ICON = {
    play: cpSvgIcon("play"),
    pause: cpSvgIcon("pause"),
    mic: cpSvgIcon("mic"),
    send: cpSvgIcon("send"),
    photo: cpSvgIcon("plus"),
    quote: cpSvgIcon("quote"),
    recall: cpSvgIcon("recall"),
    trans: '<span class="cp-lang-icon"><i class="fa-solid fa-language fa fa-language"></i><span class="cp-lang-fallback">译</span></span>',
    camera: cpSvgIcon("camera"),
    album: cpSvgIcon("image"),
    trash: cpSvgIcon("trash"),
    close: cpSvgIcon("close"),
    ai: '<span class="cp-trans-wa" aria-hidden="true"><b>文</b><b>A</b></span>'
  };


  var waveHeights = [5, 8, 12, 16, 10, 7, 14, 9, 13, 6, 11, 15];
  var persistTimer = null;
  var footerHeightTimer = null;

  var state = {
    mounted: false,
    observer: null,
    lazyObserver: null,
    lazyObserved: typeof WeakSet !== "undefined" ? new WeakSet() : null,
    vvHandler: null,
    popHandler: null,
    docClickHandler: null,
    selectBlockersBound: false,

    cfg: null,
    bg: null,

    messages: [],
    wkMessages: [],

    renderLimit: 240,
    lastRenderHash: "",
    renderVersion: 0,
    renderPending: false,
    syncScheduled: false,

    pickingLangFor: null,
    contextMsg: null,
    quoteTarget: null,

    audio: new Audio(),
    audioEndedHandler: null,
    audioEndedBound: false,
    currentAudioEl: null,

    previewOpen: false,
    settingsOpen: false,

    rec: {
      mediaRecorder: null,
      stream: null,
      mimeType: "",
      chunks: [],
      timer: null,
      sec: 0,
      paused: false,
      shouldSend: false
    },

    wkReady: false,
    myUid: "",
    peerUidCache: "",
    peerUsernameCache: "",
    peerUserslugCache: "",
    peerPictureCache: "",
    peerIconTextCache: "",
    peerIconBgCache: "",
    peerRouteSlug: "",
    suppressNativeIds: {},
    pendingSentTexts: {},
    loadedPeerUid: "",
    peerLoadPromise: null,
    mountGeneration: 0,
    clearedPeerKeys: {},

    isPreloading: false,
    loadingOldHistory: false,
    offlineSyncRunning: false,
    noMoreOldHistory: false,
    hasNoMoreHistory: false, // legacy alias for old-history UI checks
    initialLoadDone: false,

    scrollCache: {},
    unreadCount: 0,
    readTimer: null,

    blobUrlCache: {},
    blobKeys: [],
    blobLastUsed: {},
    videoPosterCache: {},
    heightMap: {},
    heightObserved: {},
    virtualRenderPending: false,

    mergedCache: null,
    mergedDirty: true,

    msgIndex: null,
    msgIndexDirty: true,

    aiCache: {},
    aiCacheKeys: [],
    encodeSupport: {},

    localMaxSeq: 0,
    wingmanRequestId: 0,
    translateInflight: {},

    // 修复：跟踪用户是否在底部（用于自动滚动决策）
    stickToBottom: true,
    bootRetryTimer: null,
    nativeObserverRetryTimer: null
  };

  function cpFlushPersistOnExit() {
    try {
      if (!state || !state.mounted) return;
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      var pUid = getPeerUid();
      if (pUid) persistChatToDB(pUid);
    } catch (e) {
      warn("flush-persist-exit", e);
    }
  }

  try {
    window.addEventListener("pagehide", cpFlushPersistOnExit);
    window.addEventListener("beforeunload", cpFlushPersistOnExit);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") cpFlushPersistOnExit();
    });
  } catch (_) {}

  function bindAudioEndedHandler() {
    if (!state || !state.audio || !state.audioEndedHandler || state.audioEndedBound) return;

    try {
      state.audio.addEventListener("ended", state.audioEndedHandler);
      state.audioEndedBound = true;
    } catch (e) {
      warn("bind-audio-ended", e);
    }
  }

  function releaseSharedAudio() {
    if (!state || !state.audio) return;

    try {
      if (state.audioEndedHandler && state.audioEndedBound) {
        state.audio.removeEventListener("ended", state.audioEndedHandler);
      }
      state.audioEndedBound = false;
      state.audio.pause();
      state.audio.removeAttribute("src");
      state.audio.load();
    } catch (e) {
      warn("release-audio", e);
    }
  }

  function releaseMountedMediaElements() {
    try {
      Array.prototype.forEach.call(document.querySelectorAll("#cp-msg-list video, #cp-msg-list audio, #cp-preview-body video, #cp-preview-body audio"), function (el) {
        try {
          el.pause();
          el.removeAttribute("src");
          el.load();
        } catch (_) {}
      });
    } catch (e) {
      warn("release-media-elements", e);
    }
  }

  function getWkStableMessageId(m) {
    if (!m) return "";
    return String(
      m.message_id ||
      m.messageID ||
      m.messageId ||
      m.client_msg_no ||
      m.clientMsgNo ||
      m.client_msg_no_str ||
      ""
    );
  }

  function getWkClientMsgNo(m) {
    if (!m) return "";
    return String(m.client_msg_no || m.clientMsgNo || m.clientMsgNO || "");
  }

  function getWkSeq(m) {
    if (!m) return 0;
    return Number(m.message_seq || m.messageSeq || m.seq || 0) || 0;
  }

  function getWkTimestampMs(m) {
    if (!m) return Date.now();
    var raw = m.timestamp_ms || m.timestamp || m.time || m.ts || 0;
    var n = Number(raw) || 0;
    if (!n) return Date.now();

    // 秒 / 毫秒 / 微秒 / 纳秒都做兼容，避免异常时间把消息排到未来。
    if (n > 1000000000000000) return Math.floor(n / 1000000);
    if (n > 10000000000000) return Math.floor(n / 1000);
    if (n > 100000000000) return Math.floor(n);
    return Math.floor(n * 1000);
  }

  function getWkMessageIdentity(raw, fallbackText, fromUid) {
    raw = raw || {};
    var seq = getWkSeq(raw);
    var clientNo = getWkClientMsgNo(raw);
    var stableId = getWkStableMessageId(raw);
    var ts = getWkTimestampMs(raw);
    var id = stableId || clientNo || (seq ? ("wk_seq_" + seq) : ("wk_fallback_" + String(fromUid || "") + "_" + shortHash(String(fallbackText || "")) + "_" + ts));
    return {
      id: String(id),
      seq: seq,
      clientNo: clientNo,
      stableId: stableId,
      ts: ts
    };
  }

  function findExistingWkMessage(msgId, clientNo, seq) {
    for (var i = 0; i < state.wkMessages.length; i++) {
      var m = state.wkMessages[i];
      if (msgIdentityMatches(m, msgId, clientNo, seq)) return m;
    }
    return null;
  }

  function serializeWkMeta(wkMsg) {
    if (!wkMsg) return null;
    return {
      message_id: wkMsg.message_id || wkMsg.messageID || wkMsg.messageId || "",
      client_msg_no: wkMsg.client_msg_no || wkMsg.clientMsgNo || wkMsg.clientMsgNO || "",
      message_seq: Number(wkMsg.message_seq || wkMsg.messageSeq || wkMsg.seq || 0) || 0,
      from_uid: String(wkMsg.from_uid || wkMsg.fromUID || wkMsg.fromUid || ""),
      timestamp: Number(wkMsg.timestamp || wkMsg.timestamp_ms || wkMsg.time || wkMsg.ts || 0) || 0,
      contentType: wkMsg.contentType || wkMsg.content_type || 0
    };
  }

  function serializeMessageForDB(m) {
    if (!m) return null;
    var copy = {
      id: String(m.id || ""),
      seq: Number(m.seq || 0) || 0,
      clientMsgNo: String(m.clientMsgNo || ""),
      mine: !!m.mine,
      ts: Number(m.ts || Date.now()) || Date.now(),
      username: String(m.username || ""),
      userslug: String(m.userslug || ""),
      uid: String(m.uid || ""),
      avatarHtml: String(m.avatarHtml || ""),
      type: String(m.type || "text"),
      text: String(m.text || ""),
      html: String(m.html || ""),
      quote: String(m.quote || ""),
      quoteUser: String(m.quoteUser || ""),
      recalled: !!m.recalled,
      mediaUrl: String(m.mediaUrl || ""),
      audioUrl: String(m.audioUrl || ""),
      translation: String(m.translation || ""),
      translationOpen: !!m.translationOpen,
      durationStr: String(m.durationStr || ""),
      read: !!m.read,
      serverText: String(m.serverText || ""),
      pendingLocal: !!m.pendingLocal,
      failedLocal: !!m.failedLocal,
      callId: String(m.callId || ""),
      callKind: String(m.callKind || ""),
      callMode: String(m.callMode || ""),
      wkMeta: serializeWkMeta(m.wkMsg) || m.wkMeta || null,
      _ver: Number(m._ver || 1) || 1
    };
    if (Array.isArray(m.items)) {
      copy.items = m.items.slice(0, 9).map(function (it) { return { url: String((it && it.url) || "") }; });
    }
    return copy;
  }

  function hydrateMessageFromDB(m) {
    if (!m) return null;
    m.wkMsg = null;
    if (m.wkMeta) {
      m.message_id = m.wkMeta.message_id || "";
      m.client_msg_no = m.wkMeta.client_msg_no || "";
      m.message_seq = m.wkMeta.message_seq || 0;
    }

    // 本地 IndexedDB 不是可信输入，恢复时重新收紧 HTML 和媒体 URL。
    if (m.html) m.html = sanitizeHtmlString(m.html);
    if (m.avatarHtml) m.avatarHtml = sanitizeAvatarHtml(m.avatarHtml);
    if (m.mediaUrl) m.mediaUrl = cpSafeUrl(m.mediaUrl, { allowDataImage: false });
    if (m.audioUrl) m.audioUrl = cpSafeUrl(m.audioUrl, { allowDataImage: false });
    if (Array.isArray(m.items)) {
      m.items = m.items.map(function (it) { return { url: cpSafeUrl(it && it.url, { allowDataImage: false }) }; }).filter(function (it) { return !!it.url; });
    }

    m.pendingLocal = false;
    m.failedLocal = false;
    if (!m._ver) m._ver = 1;
    return normalizeMineFlag(m);
  }

  function getPeerPersistKey(peerUid) {
    var uid = String(peerUid || getPeerUid() || "").trim();
    if (!/^\d+$/.test(uid)) return "";
    var channelType = Number((window.__NBB_WUKONG_PAGE__ && window.__NBB_WUKONG_PAGE__.channelType) || cpPluginConfig().channelType || 1) || 1;
    return "uid:" + uid + ":ct:" + channelType;
  }

  function msgIdentityMatches(msg, msgId, clientNo, seq) {
    if (!msg) return false;

    var ids = [
      msg.id,
      msg.clientMsgNo,
      msg.client_msg_no,
      msg.messageID,
      msg.message_id,
      msg.wkMeta && msg.wkMeta.message_id,
      msg.wkMeta && msg.wkMeta.client_msg_no,
      msg.wkMsg && msg.wkMsg.messageID,
      msg.wkMsg && msg.wkMsg.message_id,
      msg.wkMsg && msg.wkMsg.clientMsgNo,
      msg.wkMsg && msg.wkMsg.client_msg_no
    ].map(function (x) {
      return String(x || "");
    });

    if (msgId && ids.indexOf(String(msgId)) > -1) return true;
    if (clientNo && ids.indexOf(String(clientNo)) > -1) return true;

    if (seq && msg.seq && Number(msg.seq) === Number(seq)) return true;

    return false;
  }

  function findPendingOutgoingMessage(serverText, msgId, clientNo, seq, ts, type) {
    var key = normalizeTextKey(serverText);
    var nowTs = Number(ts || Date.now());

    for (var i = state.wkMessages.length - 1; i >= 0; i--) {
      var m = state.wkMessages[i];
      if (!m || !m.mine) continue;

      if (msgIdentityMatches(m, msgId, clientNo, seq)) return m;

      var maybeLocal =
        !m.seq ||
        m.seq === Number.MAX_SAFE_INTEGER ||
        /^wk_\d+_\d+/.test(String(m.id || "")) ||
        m.pendingLocal;

      if (!maybeLocal) continue;
      if (type && m.type && m.type !== type) continue;

      var localPayload = m.type === "text" ? (m.serverText || m.text || "") : (m.mediaUrl || m.audioUrl || "");
      if (!localPayload || normalizeTextKey(localPayload) !== key) continue;

      var diff = Math.abs(Number(m.ts || 0) - nowTs);
      if (!m.ts || !nowTs || diff <= 30000) return m;
    }

    return null;
  }

  function adoptServerIdentity(localMsg, serverMsg, msgId, seq, clientNo, serverText, displayText) {
    if (!localMsg) return false;

    var changed = false;
    var stableId = String(msgId || clientNo || "");

    if (stableId && String(localMsg.id || "") !== stableId) {
      localMsg.id = stableId;
      changed = true;
    }

    if (seq && Number(seq) !== Number(localMsg.seq || 0)) {
      localMsg.seq = Number(seq);
      changed = true;
    }

    if (serverMsg && localMsg.wkMsg !== serverMsg) {
      localMsg.wkMsg = serverMsg;
      localMsg.wkMeta = serializeWkMeta(serverMsg);
      changed = true;
    }

    if (clientNo && localMsg.clientMsgNo !== String(clientNo)) {
      localMsg.clientMsgNo = String(clientNo);
      changed = true;
    }

    if (serverText && localMsg.serverText !== serverText) {
      localMsg.serverText = serverText;
      changed = true;
    }

    if (displayText && localMsg.text && localMsg.text !== displayText && /^wk_\d+_\d+/.test(String(localMsg.id || ""))) {
      localMsg.text = displayText;
      changed = true;
    }

    localMsg.pendingLocal = false;

    if (changed) msgTouch(localMsg);
    return changed;
  }

  function bindOutgoingAck(wkMsgObj, localMsg) {
    if (!localMsg) return;

    if (wkMsgObj && typeof wkMsgObj.then === "function") {
      localMsg.pendingLocal = true;
      localMsg.failedLocal = false;
      wkMsgObj.then(function (realMsg) {
        bindOutgoingAck(realMsg, localMsg);
      }).catch(function (err) {
        warn("send-promise-ack", err);
        localMsg.pendingLocal = false;
        localMsg.failedLocal = true;
        msgTouch(localMsg);
        incrementalRender("keep");
      });
      return;
    }

    if (!wkMsgObj) {
      localMsg.pendingLocal = false;
      localMsg.failedLocal = true;
      msgTouch(localMsg);
      incrementalRender("keep");
      return;
    }

    localMsg.pendingLocal = true;
    localMsg.failedLocal = false;

    var sync = function (ack) {
      var source = ack || wkMsgObj;
      var msgId = getWkStableMessageId(source) || getWkStableMessageId(wkMsgObj);
      var clientNo = getWkClientMsgNo(source) || getWkClientMsgNo(wkMsgObj);
      var seq = getWkSeq(source) || getWkSeq(wkMsgObj);

      if (adoptServerIdentity(localMsg, source, msgId, seq, clientNo, localMsg.serverText || localMsg.text || "", localMsg.text || "")) {
        localMsg.failedLocal = false;
        schedulePersistChat(getPeerUid());
        incrementalRender("keep");
      }
    };

    sync(wkMsgObj);

    try {
      if (typeof wkMsgObj.once === "function") {
        wkMsgObj.once("sendack", sync);
        wkMsgObj.once("ack", sync);
      } else if (typeof wkMsgObj.on === "function") {
        wkMsgObj.on("sendack", sync);
        wkMsgObj.on("ack", sync);
      } else if (typeof wkMsgObj.addEventListener === "function") {
        wkMsgObj.addEventListener("sendack", function (ev) { sync(ev && (ev.detail || ev)); }, { once: true });
        wkMsgObj.addEventListener("ack", function (ev) { sync(ev && (ev.detail || ev)); }, { once: true });
      }
    } catch (e) {
      warn("bind-sendack", e);
    }

    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      sync(wkMsgObj);
      if (tries >= 12 || (!localMsg.pendingLocal && localMsg.seq && localMsg.seq !== Number.MAX_SAFE_INTEGER)) {
        clearInterval(timer);
        if (tries >= 12 && localMsg.pendingLocal && (!localMsg.seq || localMsg.seq === Number.MAX_SAFE_INTEGER)) {
          localMsg.pendingLocal = false;
          localMsg.failedLocal = true;
          msgTouch(localMsg);
          incrementalRender("keep");
        }
      }
    }, 250);
  }

  function warn(scope, err) {
    try {
      console.warn("[cp-chat][" + scope + "]", err);
    } catch (_) {}
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function cpSetModalVisible(mask, visible) {
    if (!mask) return;
    if (visible) {
      mask.hidden = false;
      mask.removeAttribute("hidden");
      mask.classList.add("is-open");
      document.body.classList.add("cp-modal-open");
      var root = byId("cp-chat-root");
      if (root) root.classList.add("cp-modal-open");
    } else {
      mask.classList.remove("is-open");
      mask.hidden = true;
      mask.setAttribute("hidden", "");
      var anyOpen = document.querySelector("#cp-chat-root .cp-modal-mask.is-open,#cp-chat-root .cp-context-overlay.is-open,#cp-chat-root .cp-preview-mask.is-open");
      if (!anyOpen) {
        document.body.classList.remove("cp-modal-open");
        var root2 = byId("cp-chat-root");
        if (root2) root2.classList.remove("cp-modal-open");
      }
    }
  }

  function cpNormalizeActionIcons() {
    var mediaBtn = byId("cp-media-btn");
    var primaryIcon = byId("cp-primary-icon");
    var cameraIcon = document.querySelector("#cp-pick-camera .cp-menu-ico");
    var cameraLabel = document.querySelector("#cp-pick-camera .cp-menu-label");
    var albumIcon = document.querySelector("#cp-pick-album .cp-menu-ico");
    var albumLabel = document.querySelector("#cp-pick-album .cp-menu-label");

    if (mediaBtn) mediaBtn.innerHTML = ICON.photo;
    var transBtn = byId("cp-send-translate-toggle");
    if (transBtn) transBtn.innerHTML = '<span class="cp-trans-wa" aria-hidden="true"><b>文</b><b>A</b></span>';
    if (primaryIcon && !String(byId("cp-input") && byId("cp-input").value || "").trim()) primaryIcon.innerHTML = ICON.mic;
    if (cameraIcon) cameraIcon.innerHTML = ICON.camera;
    if (cameraLabel) cameraLabel.textContent = cpT("shoot", "拍摄");
    if (albumIcon) albumIcon.innerHTML = ICON.album;
    if (albumLabel) albumLabel.textContent = cpT("album", "相册图片/视频");
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escAttr(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function cpIsSafeUrl(url, opts) {
    opts = opts || {};
    var s = String(url || "").trim().replace(/[\u0000-\u001f\u007f\s]+/g, "");
    var decoded = "";
    try { decoded = decodeURIComponent(s); } catch (_) { decoded = s; }
    if (!s) return false;
    if (/^(javascript|vbscript|file):/i.test(s) || /^(javascript|vbscript|file):/i.test(decoded)) return false;
    if (/^data:/i.test(s)) return !!opts.allowDataImage && /^data:image\/(png|jpe?g|gif|webp);/i.test(s);
    if (s.charAt(0) === "/" || s.charAt(0) === "#") return true;
    return /^(https?:|mailto:|tel:|blob:)/i.test(s);
  }

  function cpSafeUrl(url, opts) {
    var s = String(url || "").trim().replace(/[\u0000-\u001f\u007f]/g, "");
    if (!cpIsSafeUrl(s, opts)) return "";
    if (/^\/\//.test(s)) return location.protocol + s;
    return s;
  }

  function cpSafeColor(value, fallback) {
    var s = String(value || "").trim();
    if (/^#[0-9a-f]{3,8}$/i.test(s)) return s;
    if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(s)) return s;
    if (/^[a-z]{3,20}$/i.test(s)) return s;
    return fallback || "#72a5f2";
  }

  function sanitizeHtmlString(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = String(html || "");
    return getRenderableHtml(tmp);
  }

  function normalizeTextKey(text) {
    return String(text == null ? "" : text)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 800);
  }

  function shortHash(input) {
    var s = String(input == null ? "" : input);
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(36);
  }

  // 修复：检查滚动容器是否在底部
  function isMainAtBottom() {
    var main = byId("cp-main");
    if (!main) return true;
    return main.scrollHeight - main.scrollTop - main.clientHeight < BOTTOM_THRESHOLD;
  }

  function markPendingNativeText(serverText, localMsgId) {
    var key = normalizeTextKey(serverText);
    if (!key) return;

    cleanupPendingNativeTexts();

    state.pendingSentTexts[key] = {
      localMsgId: localMsgId || "",
      ts: Date.now()
    };
  }

  function cleanupPendingNativeTexts() {
    var now = Date.now();
    var keys = Object.keys(state.pendingSentTexts || {});

    for (var i = 0; i < keys.length; i++) {
      if (!state.pendingSentTexts[keys[i]] || now - state.pendingSentTexts[keys[i]].ts > PENDING_NATIVE_TTL) {
        delete state.pendingSentTexts[keys[i]];
      }
    }

    var suppressKeys = Object.keys(state.suppressNativeIds || {});
    if (suppressKeys.length > 300) {
      state.suppressNativeIds = {};
    }
  }

  function shouldSuppressNativeText(text, nativeId) {
    cleanupPendingNativeTexts();

    var key = normalizeTextKey(text);
    if (!key) return false;

    var pending = state.pendingSentTexts[key];
    if (!pending) return false;

    if (Date.now() - pending.ts > PENDING_NATIVE_TTL) {
      delete state.pendingSentTexts[key];
      return false;
    }

    if (nativeId) state.suppressNativeIds[String(nativeId)] = true;
    delete state.pendingSentTexts[key];

    return true;
  }

  function msgTouch(m) {
    if (!m) return;
    m._ver = (Number(m._ver) || 0) + 1;
    state.renderVersion++;
    state.mergedDirty = true;
    state.msgIndexDirty = true;
  }

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
      return Object.assign(fallback, parsed);
    } catch (e) {
      warn("load-json", e);
      return fallback;
    }
  }

  function saveJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      warn("save-json", e);
    }
  }

  function normalizeConfig(cfg) {
    var defaults = {
      autoTranslateLastMsg: false,
      sourceLang: cpPluginConfig().defaultSourceLang || "中文",
      targetLang: cpPluginConfig().defaultTargetLang || "မြန်မာစာ",
      sendTranslateEnabled: false,
      smartReplyEnabled: false,
      contextMemoryEnabled: true,
      contextRounds: 30,
      targetGender: "女生",
      relationshipStage: "刚认识",
      communicationStyle: "自然直接，偶尔幽默",
      voiceMaxDuration: 60,
      translateProvider: "ai",
      ai: {
        endpoint: "https://api.deepseek.com/v1/chat/completions",
        apiKey: "",
        model: "deepseek4flash",
        temperature: 0.3,
        translatePrompt: DEFAULT_TRANSLATE_PROMPT,
        wingmanPrompt: DEFAULT_WINGMAN_PROMPT
      }
    };

    cfg = Object.assign({}, defaults, cfg || {});
    cfg.ai = Object.assign({}, defaults.ai, cfg.ai || {});

    cfg.translateProvider = "ai";
    if (!cfg.sourceLang) cfg.sourceLang = defaults.sourceLang;
    if (!cfg.targetLang) cfg.targetLang = defaults.targetLang;

    if (!cfg.ai.translatePrompt) cfg.ai.translatePrompt = DEFAULT_TRANSLATE_PROMPT;
    if (!cfg.ai.wingmanPrompt) cfg.ai.wingmanPrompt = DEFAULT_WINGMAN_PROMPT;
    cfg.ai.temperature = 0.3;

    cfg.contextRounds = Number(cfg.contextRounds) || 30;
    if ([10, 30, 50, 100].indexOf(cfg.contextRounds) === -1) cfg.contextRounds = 30;

    if (["女生", "男生", "不指定"].indexOf(cfg.targetGender) === -1) cfg.targetGender = "女生";
    if (!cfg.relationshipStage) cfg.relationshipStage = "刚认识";
    if (!cfg.communicationStyle) cfg.communicationStyle = "自然直接，偶尔幽默";

    return cfg;
  }

  var dbPromise = new Promise(function (resolve) {
    if (!window.indexedDB) return resolve(null);

    var req = indexedDB.open(DB_NAME, 1);

    req.onupgradeneeded = function (e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains("chats")) db.createObjectStore("chats", { keyPath: "peerUid" });
      if (!db.objectStoreNames.contains("media")) db.createObjectStore("media", { keyPath: "url" });
    };

    req.onsuccess = function (e) {
      resolve(e.target.result);
    };

    req.onerror = function (e) {
      warn("idb-open", e);
      resolve(null);
    };
  });

  async function idbGet(storeName, key) {
    var db = await dbPromise;
    if (!db) return null;

    return new Promise(function (resolve) {
      try {
        var req = db.transaction(storeName, "readonly").objectStore(storeName).get(key);

        req.onsuccess = function (e) {
          resolve(e.target.result);
        };

        req.onerror = function (e) {
          warn("idb-get", e);
          resolve(null);
        };
      } catch (e) {
        warn("idb-get-wrap", e);
        resolve(null);
      }
    });
  }

  async function idbDelete(storeName, key) {
    var db = await dbPromise;
    if (!db || !key) return false;

    return new Promise(function (resolve) {
      try {
        var req = db.transaction(storeName, "readwrite").objectStore(storeName).delete(key);
        req.onsuccess = function () { resolve(true); };
        req.onerror = function (e) { warn("idb-delete", e); resolve(false); };
      } catch (e) {
        warn("idb-delete-wrap", e);
        resolve(false);
      }
    });
  }

  async function idbPutMedia(url, blob) {
    var db = await dbPromise;
    if (!db || !url || !blob) return;
    if (blob.size > MEDIA_CACHE_MAX_BLOB_BYTES) return;

    try {
      db.transaction("media", "readwrite").objectStore("media").put({
        url: url,
        blob: blob,
        size: blob.size || 0,
        ts: Date.now()
      });
    } catch (e) {
      warn("idb-put-media", e);
    }
  }

  async function cleanUpOldMedia() {
    var db = await dbPromise;
    if (!db) return;

    try {
      var items = [];

      await new Promise(function (resolve) {
        var tx = db.transaction("media", "readonly");
        var store = tx.objectStore("media");
        var req = store.openCursor();

        req.onsuccess = function (e) {
          var cursor = e.target.result;
          if (!cursor) return resolve();

          var val = cursor.value || {};
          items.push({
            key: cursor.key,
            ts: Number(val.ts || 0),
            size: Number(val.size || (val.blob && val.blob.size) || 0)
          });

          cursor.continue();
        };

        req.onerror = function () {
          resolve();
        };
      });

      if (!items.length) return;

      var now = Date.now();
      items.sort(function (a, b) {
        return (a.ts || 0) - (b.ts || 0);
      });

      var total = 0;
      var keep = [];
      var del = [];

      for (var i = 0; i < items.length; i++) {
        if (!items[i].ts || now - items[i].ts > MEDIA_CACHE_EXPIRE_MS) {
          del.push(items[i].key);
        } else {
          keep.push(items[i]);
          total += items[i].size || 0;
        }
      }

      while (keep.length > MEDIA_CACHE_MAX_ITEMS || total > MEDIA_CACHE_MAX_TOTAL_BYTES) {
        var old = keep.shift();
        if (!old) break;
        del.push(old.key);
        total -= old.size || 0;
      }

      if (!del.length) return;

      var tx2 = db.transaction("media", "readwrite");
      var store2 = tx2.objectStore("media");

      for (var d = 0; d < del.length; d++) {
        store2.delete(del[d]);
      }
    } catch (e) {
      warn("cleanup-media", e);
    }
  }

  function cpBlobUrlInUse(blobUrl) {
    if (!blobUrl || !/^blob:/i.test(blobUrl)) return false;
    try {
      var nodes = document.querySelectorAll('#cp-chat-root img,#cp-chat-root video,#cp-chat-root audio,#cp-preview-body img,#cp-preview-body video,#cp-preview-body audio');
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].src === blobUrl || nodes[i].currentSrc === blobUrl) return true;
      }
    } catch (_) {}
    return false;
  }

  function cpRevokeBlobUrl(originalUrl, force) {
    var blobUrl = state.blobUrlCache && state.blobUrlCache[originalUrl];
    if (!blobUrl) return true;
    if (!force && cpBlobUrlInUse(blobUrl)) return false;
    try { URL.revokeObjectURL(blobUrl); } catch (_) {}
    delete state.blobUrlCache[originalUrl];
    if (state.blobLastUsed) delete state.blobLastUsed[originalUrl];
    return true;
  }

  function cpTrimBlobUrlCache(force) {
    if (!state.blobKeys) state.blobKeys = [];
    var seen = {};
    state.blobKeys = state.blobKeys.filter(function (k) {
      if (!k || seen[k] || !state.blobUrlCache[k]) return false;
      seen[k] = true;
      return true;
    });

    while (state.blobKeys.length > 60) {
      var oldUrl = state.blobKeys.shift();
      if (!cpRevokeBlobUrl(oldUrl, !!force)) {
        state.blobKeys.push(oldUrl);
        break;
      }
    }
  }

  async function getOrFetchMediaBlob(url, type) {
    url = cpSafeUrl(url, { allowDataImage: type === "image" });
    if (!url || url.indexOf("blob:") === 0 || url.indexOf("data:") === 0) return url;
    if (type === "video" || /\.(mp4|mov|webm|m4v)(?:\?|#|$)/i.test(url)) return url;

    if (state.blobUrlCache[url]) {
      state.blobLastUsed[url] = Date.now();
      return state.blobUrlCache[url];
    }

    var blobUrl = null;
    var cached = await idbGet("media", url);

    if (cached && cached.blob) {
      blobUrl = URL.createObjectURL(cached.blob);
    } else {
      try {
        var res = await fetch(url);
        if (!res.ok) throw new Error("fetch media failed");
        var blob = await res.blob();

        if (blob.size <= MEDIA_CACHE_MAX_BLOB_BYTES) {
          idbPutMedia(url, blob);
        }

        blobUrl = URL.createObjectURL(blob);
      } catch (e) {
        warn("fetch-media", e);
        return url;
      }
    }

    state.blobUrlCache[url] = blobUrl;
    state.blobLastUsed[url] = Date.now();
    state.blobKeys.push(url);
    cpTrimBlobUrlCache(false);

    return blobUrl;
  }

  function schedulePersistChat(peerUid) {
    var key = getPeerPersistKey(peerUid);
    if (!key) return;
    if (persistTimer) clearTimeout(persistTimer);

    persistTimer = setTimeout(function () {
      persistTimer = null;
      persistChatToDB(peerUid);
    }, 900);
  }

  async function persistChatToDB(peerUid) {
    var db = await dbPromise;
    var persistKey = getPeerPersistKey(peerUid);
    if (!db || !persistKey) return;

    var maxSeq = 0;

    for (var i = 0; i < state.wkMessages.length; i++) {
      var s = state.wkMessages[i].seq;
      if (s && s < Number.MAX_SAFE_INTEGER && s > maxSeq) maxSeq = s;
    }

    var safeMessages = state.wkMessages.filter(function (m) {
      return !isCallSignalMessage(m);
    }).slice(-MAX_PERSIST_MESSAGES).map(serializeMessageForDB).filter(Boolean);

    try {
      var tx = db.transaction("chats", "readwrite");
      tx.objectStore("chats").put({
        peerUid: persistKey,
        canonicalPeerUid: String(peerUid || getPeerUid() || ""),
        messages: safeMessages,
        maxSeq: maxSeq,
        ts: Date.now()
      });
      tx.onerror = function (e) { warn("persist-chat-tx", e); };
    } catch (e) {
      warn("persist-chat", e);
    }
  }

  async function loadChatFromDB(peerUid) {
    ensureSelfUid();
    var persistKey = getPeerPersistKey(peerUid);
    if (!persistKey) return;
    var data = await idbGet("chats", persistKey);
    if ((!data || !data.messages) && peerUid) {
      // v1.0.5 migration: older builds used raw peerUid as the IndexedDB key.
      data = await idbGet("chats", String(peerUid));
      if (data && data.messages) {
        setTimeout(function () { persistChatToDB(peerUid); }, 0);
      }
    }
    if (!data || !data.messages) return;

    var restored = data.messages
      .map(hydrateMessageFromDB)
      .filter(function (m) {
        return m && !isCallSignalMessage(m);
      })
      .slice(-MAX_PERSIST_MESSAGES);

    for (var ri = 0; ri < restored.length; ri++) {
      var rm = restored[ri];
      var ident = {
        id: rm.id || "",
        clientNo: rm.clientMsgNo || (rm.wkMeta && rm.wkMeta.client_msg_no) || "",
        seq: rm.seq || (rm.wkMeta && rm.wkMeta.message_seq) || 0
      };
      if (findExistingWkMessage(ident.id, ident.clientNo, ident.seq)) continue;
      state.wkMessages.push(rm);
    }

    state.wkMessages.sort(function (a, b) {
      var as = Number(a.seq || 0);
      var bs = Number(b.seq || 0);
      if (as && bs && as !== Number.MAX_SAFE_INTEGER && bs !== Number.MAX_SAFE_INTEGER && as !== bs) return as - bs;
      return (a.ts || 0) - (b.ts || 0);
    });

    if (data.maxSeq) state.localMaxSeq = Math.max(Number(state.localMaxSeq || 0), Number(data.maxSeq || 0));

    state.renderVersion++;
    state.mergedDirty = true;
    state.msgIndexDirty = true;

    incrementalRender("restore");
  }

  function pruneWkMessages() {
    if (state.wkMessages.length <= MAX_WK_MESSAGES_IN_MEMORY) return;

    state.wkMessages = state.wkMessages.slice(-MAX_WK_MESSAGES_IN_MEMORY);
    state.renderVersion++;
    state.mergedDirty = true;
    state.msgIndexDirty = true;
  }

  // 修复：内存裁剪逻辑。NodeBB 原生消息不再作为可信消息源，悟空消息只按较高上限裁剪。
  function pruneAllMessagesInMemory() {
    if (state.messages.length) state.messages = [];
    var max = Math.max(MAX_WK_MESSAGES_IN_MEMORY, MAX_TOTAL_MESSAGES_IN_MEMORY || 800);
    if (state.wkMessages.length <= max) return;
    state.wkMessages = state.wkMessages.slice(-max);
    state.renderVersion++;
    state.mergedDirty = true;
    state.msgIndexDirty = true;
  }

  function rebuildMsgIndex() {
    var map = new Map();
    for (var j = 0; j < state.wkMessages.length; j++) map.set(String(state.wkMessages[j].id), state.wkMessages[j]);
    state.msgIndex = map;
    state.msgIndexDirty = false;
  }

  function getMsgById(id) {
    if (state.msgIndexDirty || !state.msgIndex) rebuildMsgIndex();
    return state.msgIndex.get(String(id)) || null;
  }

  function getMergedMessages() {
    ensureSelfUid();
    if (!state.mergedDirty && state.mergedCache) return state.mergedCache;

    var allRawMsgs = (state.wkMessages || []).filter(function (m) {
      normalizeMineFlag(m);
      return !isCallSignalMessage(m);
    });

    allRawMsgs.sort(function (a, b) {
      var as = Number(a.seq || 0);
      var bs = Number(b.seq || 0);
      if (as && bs && as !== Number.MAX_SAFE_INTEGER && bs !== Number.MAX_SAFE_INTEGER && as !== bs) return as - bs;
      return (a.ts || 0) - (b.ts || 0);
    });

    var seenStable = new Set();
    var allMsgs = [];

    for (var k = 0; k < allRawMsgs.length; k++) {
      var ms = allRawMsgs[k];
      var seq = Number(ms.seq || 0);
      var clientNo = String(ms.clientMsgNo || ms.client_msg_no || (ms.wkMeta && ms.wkMeta.client_msg_no) || "");
      var stableId = String(ms.message_id || (ms.wkMeta && ms.wkMeta.message_id) || "");
      var id = String(ms.id || "");
      var key = "";

      if (ms.type === "call" && ms.callId) key = "call:" + String(ms.callId);
      else if (seq && seq !== Number.MAX_SAFE_INTEGER) key = "seq:" + seq;
      else if (clientNo) key = "client:" + clientNo;
      else if (stableId) key = "stable:" + stableId;
      else if (id && !/^wk_\d+_\d+/.test(id)) key = "id:" + id;

      if (key) {
        if (seenStable.has(key)) continue;
        seenStable.add(key);
      }

      // 不再按“文本内容 + 时间窗口”去重，避免用户连续发送相同文本被误删。
      allMsgs.push(ms);
    }

    state.mergedCache = allMsgs;
    state.mergedDirty = false;

    return allMsgs;
  }

  function getRelativePath() {
    return (window.config && window.config.relative_path) || "";
  }

  function getRoutePeerSlug() {
    var page = window.__NBB_WUKONG_PAGE__ || {};
    var cfg = cpPluginConfig() || {};

    var direct = page.targetUid || cfg.targetUid || cfg.uid || "";
    if (direct) return String(direct);

    var q = new URLSearchParams(location.search || "");
    direct = q.get("uid") || q.get("to_uid") || q.get("targetUid") || "";
    if (direct) return String(direct);

    var path = String(location.pathname || "");
    var rel = getRelativePath();

    if (rel && path.indexOf(rel) === 0) {
      path = path.slice(rel.length) || "/";
    }

    var wk = path.match(/\/wukong\/([^\/?#]+)/i);
    if (wk && wk[1]) {
      try { return decodeURIComponent(wk[1]); } catch (_) { return wk[1] || ""; }
    }

    var match = path.match(/\/user\/([^\/?#]+)(?:\/chats(?:\/|$)|$)/i);
    if (!match) return "";

    try {
      return decodeURIComponent(match[1]);
    } catch (_) {
      return match[1] || "";
    }
  }

  function pickUserRecord(obj) {
    if (!obj || typeof obj !== "object") return null;

    if (obj.data && typeof obj.data === "object") {
      var fromData = pickUserRecord(obj.data);
      if (fromData) return fromData;
    }

    if (obj.userData && typeof obj.userData === "object") return obj.userData;
    if (obj.user && typeof obj.user === "object") return obj.user;
    if (obj.targetUser && typeof obj.targetUser === "object") return obj.targetUser;
    if (obj.recipient && typeof obj.recipient === "object") return obj.recipient;
    if (obj.toUser && typeof obj.toUser === "object") return obj.toUser;
    if (obj.profile && typeof obj.profile === "object") return obj.profile;
    if (Array.isArray(obj.users) && obj.users[0]) return obj.users[0];
    if (obj.uid || obj.userId || obj.id || obj.username || obj.userslug || obj.slug || obj.title || obj.displayname || obj.name) return obj;

    return null;
  }


  function cpHydratePeerMessagesFromCache() {
    var peerUid = String(state.peerUidCache || "");
    var name = String(state.peerUsernameCache || "");
    var slug = String(state.peerUserslugCache || "");

    if (!peerUid || !name || /^\d+$/.test(name)) return;

    var changed = false;
    var lists = [state.messages || [], state.wkMessages || []];

    for (var li = 0; li < lists.length; li++) {
      var list = lists[li];

      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (!m || m.mine) continue;

        var oldName = String(m.username || "");
        var samePeer =
          (m.uid && String(m.uid) === peerUid) ||
          (/^\d+$/.test(oldName) && !m.mine) ||
          (!oldName && !m.mine);

        if (!samePeer) continue;

        m.uid = peerUid;
        m.username = name;
        m.userslug = slug || m.userslug || encodeURIComponent(name.toLowerCase().replace(/ /g, "-"));
        m.avatarHtml = getAvatarHtml(peerUid, name, null);
        m._ver = (m._ver || 1) + 1;

        if (oldName !== name) changed = true;
      }
    }

    if (changed) {
      state.renderVersion++;
      state.mergedDirty = true;
      state.msgIndexDirty = true;
    }
  }

  function cpNormalizeSlug(str) {
    str = String(str || "").trim();
    if (!str) return "";
    try { str = decodeURIComponent(str); } catch (_) {}
    return String(str).toLowerCase();
  }

  function getPeerDisplayNameFallback(slug) {
    slug = String(slug || "").trim();
    if (!slug || /^\d+$/.test(slug)) return "";
    try { slug = decodeURIComponent(slug); } catch (_) {}
    return slug;
  }

  function setPeerFromUser(u) {
    if (!u || typeof u !== "object") return false;

    var myUidStr = getSelfUid();
    var rawUid = u.uid || u.userId || u.id;
    var uid = /^\d+$/.test(String(rawUid || "")) ? String(rawUid) : "";
    var username = u.username || u.displayname || u.name || u.title || u.fullname || "";
    if (/^\d+$/.test(String(username || ""))) username = "";
    var userslug = u.userslug || u.slug || (username ? encodeURIComponent(String(username).toLowerCase().replace(/ /g, "-")) : "");
    var picture = u.picture || u.uploadedpicture || u.uploadedPicture || u.pictureUrl || u.avatarUrl || u.avatar || "";

    if (uid && uid !== myUidStr && uid !== "0") state.peerUidCache = uid;
    if (username) state.peerUsernameCache = String(username);
    if (userslug) {
      state.peerUserslugCache = String(userslug);
      state.peerRouteSlug = state.peerRouteSlug || String(userslug);
    }
    if (picture) state.peerPictureCache = picture;
    if (u.icontext || u["icon:text"]) state.peerIconTextCache = u.icontext || u["icon:text"];
    if (u.iconbgColor || u["icon:bgColor"]) state.peerIconBgCache = u.iconbgColor || u["icon:bgColor"];

    return !!(state.peerUidCache || state.peerUsernameCache || state.peerUserslugCache);
  }

  function getPeerFromAjaxify() {
    var data = window.ajaxify && ajaxify.data ? ajaxify.data : null;
    if (!data) return null;

    var myUidStr = getSelfUid();
    var routeSlug = getRoutePeerSlug();
    var candidates = [];

    var directRecord = pickUserRecord(data);
    if (directRecord) candidates.push(directRecord);

    if (Array.isArray(data.users)) candidates = candidates.concat(data.users);
    if (Array.isArray(data.members)) candidates = candidates.concat(data.members);
    if (Array.isArray(data.recipients)) candidates = candidates.concat(data.recipients);

    [data.user, data.targetUser, data.recipient, data.toUser, data.profile].forEach(function (x) {
      var picked = pickUserRecord(x);
      if (picked) candidates.push(picked);
    });

    for (var i = 0; i < candidates.length; i++) {
      var u = candidates[i];
      if (!u || typeof u !== "object") continue;
      var uid = u.uid || u.userId || u.id;
      var slug = u.userslug || u.slug || u.username || "";
      if (uid && String(uid) === myUidStr) continue;
      if (routeSlug && slug && cpNormalizeSlug(slug) !== cpNormalizeSlug(routeSlug) && cpNormalizeSlug(u.username || "") !== cpNormalizeSlug(routeSlug)) {
        continue;
      }
      return u;
    }

    for (var j = 0; j < candidates.length; j++) {
      var cu = candidates[j];
      if (!cu || typeof cu !== "object") continue;
      var cuid = cu.uid || cu.userId || cu.id;
      if (cuid && String(cuid) !== myUidStr && String(cuid) !== "0") return cu;
    }

    return null;
  }


  async function hydratePeerFromWukongApi() {
    var cfg = cpPluginConfig();
    var uid = String((cfg && cfg.targetUid) || (window.__NBB_WUKONG_PAGE__ && window.__NBB_WUKONG_PAGE__.targetUid) || "").trim();
    if (!/^\d+$/.test(uid)) return false;
    try {
      var res = await fetch((cfg.apiBase || "/api/wukong") + "/user/" + encodeURIComponent(uid), {
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      if (!res.ok) return false;
      var json = await res.json();
      var record = pickUserRecord(json) || json;
      if (setPeerFromUser(record)) {
        updateHeaderPeerInfo(null);
        return true;
      }
    } catch (e) {
      warn("hydrate-peer-wukong-api", e);
    }
    return false;
  }

  async function hydratePeerFromRoute() {
    if (await hydratePeerFromWukongApi()) return true;
    if (state.peerHydrating) return false;
    if (state.peerUidCache && state.peerUsernameCache) return true;

    var u = getPeerFromAjaxify();
    if (setPeerFromUser(u)) return true;

    var slug = getRoutePeerSlug();
    if (!slug) return false;

    state.peerRouteSlug = String(slug);
    if (!/^\d+$/.test(String(slug))) {
      state.peerUsernameCache = state.peerUsernameCache || getPeerDisplayNameFallback(slug);
      state.peerUserslugCache = state.peerUserslugCache || String(slug);
    } else {
      state.peerUidCache = state.peerUidCache || String(slug);
    }
    updateHeaderPeerInfo(null);

    state.peerHydrating = true;
    try {
      var endpoints = [
        (cpPluginConfig().apiBase || "/api/wukong") + "/user/" + encodeURIComponent(slug),
        getRelativePath() + "/api/user/" + encodeURIComponent(slug)
      ];

      for (var i = 0; i < endpoints.length; i++) {
        try {
          var res = await fetch(endpoints[i], { credentials: "same-origin", headers: { accept: "application/json" } });
          if (!res.ok) continue;

          var json = await res.json();
          var record = pickUserRecord(json) || json;

          if (setPeerFromUser(record)) {
            updateHeaderPeerInfo(null);
            return true;
          }
        } catch (inner) {
          warn("hydrate-peer-endpoint", inner);
        }
      }
    } catch (e) {
      warn("hydrate-peer", e);
    } finally {
      state.peerHydrating = false;
    }

    return false;
  }

  function getPeerUid() {
    if (/^\d+$/.test(String(state.peerUidCache || ""))) return String(state.peerUidCache);

    var page = window.__NBB_WUKONG_PAGE__ || {};
    var cfg = cpPluginConfig() || {};
    var direct = page.targetUid || cfg.targetUid || cfg.uid || "";

    if (/^\d+$/.test(String(direct || ""))) {
      state.peerUidCache = String(direct);
      return state.peerUidCache;
    }

    if (direct) {
      state.peerRouteSlug = state.peerRouteSlug || String(direct);
      if (!state.peerUsernameCache) state.peerUsernameCache = getPeerDisplayNameFallback(direct);
      if (!state.peerUserslugCache) state.peerUserslugCache = String(direct);
    }

    setPeerFromUser(getPeerFromAjaxify());
    if (/^\d+$/.test(String(state.peerUidCache || ""))) return String(state.peerUidCache);

    var slug = getRoutePeerSlug();
    if (slug) {
      state.peerRouteSlug = state.peerRouteSlug || String(slug);
      if (/^\d+$/.test(String(slug))) {
        state.peerUidCache = String(slug);
        return state.peerUidCache;
      }
      state.peerUsernameCache = state.peerUsernameCache || getPeerDisplayNameFallback(slug);
      state.peerUserslugCache = state.peerUserslugCache || String(slug);
    }

    return "";
  }

  function getAvatarInitial(username, uid) {
    var name = String(username || "").trim();
    if (!name || /^\d+$/.test(name) || name === cpT("unknown_user", "用户")) {
      if (uid && String(uid) === String(state.peerUidCache || "") && state.peerIconTextCache) return String(state.peerIconTextCache).charAt(0).toUpperCase();
      return "?";
    }
    return name.charAt(0).toUpperCase();
  }

  function sanitizeAvatarHtml(html) {
    if (!html) return "";
    var tmp = document.createElement("div");
    tmp.innerHTML = String(html || "");
    var img = tmp.querySelector("img");
    if (!img) return "";
    var src = cpSafeUrl(img.getAttribute("src") || "", { allowDataImage: true });
    if (!src) return "";
    return '<img class="avatar" src="' + escAttr(src) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />';
  }

  function getAvatarHtml(uid, username, fallbackHtml) {
    var pic = "";
    var text = getAvatarInitial(username, uid);
    var bg = "#72a5f2";

    if (cpIsMineUid(uid) && window.app && window.app.user) {
      pic = app.user.picture || "";
      if (app.user.icontext) text = app.user.icontext;
      if (app.user.iconbgColor) bg = app.user.iconbgColor;
      if (!pic && fallbackHtml && fallbackHtml.indexOf("<img") > -1) return fallbackHtml;
    } else {
      var u = null;

      if (uid && window.ajaxify && ajaxify.data && ajaxify.data.users) {
        u = ajaxify.data.users.find(function (x) {
          return String(x.uid) === String(uid);
        });
      }

      if (!u && uid && String(uid) === String(state.peerUidCache || "")) {
        u = {
          picture: state.peerPictureCache,
          icontext: state.peerIconTextCache,
          iconbgColor: state.peerIconBgCache
        };
      }

      if (!u && state.peerUsernameCache && String(username || "") === String(state.peerUsernameCache)) {
        u = {
          picture: state.peerPictureCache,
          icontext: state.peerIconTextCache,
          iconbgColor: state.peerIconBgCache
        };
      }

      if (u) {
        pic = cpSafeUrl(u.picture || "", { allowDataImage: true });
        if (u.icontext) text = String(u.icontext).charAt(0).toUpperCase();
        if (u.iconbgColor) bg = cpSafeColor(u.iconbgColor, bg);
      }
    }

    pic = cpSafeUrl(pic, { allowDataImage: true });
    if (pic) {
      return '<img class="avatar" src="' + escAttr(pic) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />';
    }

    var safeFallback = sanitizeAvatarHtml(fallbackHtml);
    if (safeFallback) return safeFallback;

    return (
      '<div class="avatar" style="background:' +
      escAttr(cpSafeColor(bg, "#72a5f2")) +
      ';color:#fff;display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:50%;font-size:16px;">' +
      esc(text) +
      "</div>"
    );
  }

  function updateHeaderPeerInfo(peerMsg) {
    var pInfo = byId("cp-peer-info");
    if (!pInfo) return;

    var avatar = byId("cp-peer-avatar");
    var ajaxUser = getPeerFromAjaxify();
    var name = state.peerUsernameCache || "";
    var userslug = state.peerUserslugCache || "";
    var uid = state.peerUidCache || "";
    var avatarHtml = "";

    if (peerMsg) {
      name = peerMsg.username || name;
      userslug = peerMsg.userslug || userslug;
      uid = peerMsg.uid || uid;
      avatarHtml = peerMsg.avatarHtml || "";
      setPeerFromUser({ uid: uid, username: name, userslug: userslug });
    }

    if (ajaxUser) {
      setPeerFromUser(ajaxUser);
      name = name || ajaxUser.username || ajaxUser.displayname || ajaxUser.name || ajaxUser.title || ajaxUser.fullname || ajaxUser.userslug || ajaxUser.slug || "";
      userslug = userslug || ajaxUser.userslug || ajaxUser.slug || "";
      uid = uid || ajaxUser.uid || ajaxUser.userId || ajaxUser.id || "";
      avatarHtml = avatarHtml || getAvatarHtml(String(uid || ""), name, null);
    }

    if (!name) {
      var routeSlug = getRoutePeerSlug();
      if (routeSlug && !/^\d+$/.test(String(routeSlug))) {
        name = routeSlug;
        userslug = userslug || routeSlug;
      } else if (routeSlug) {
        name = state.peerUsernameCache || cpT("unknown_user", "用户");
      }
    }

    if (name) {
      state.peerUsernameCache = name;
      userslug = userslug || encodeURIComponent(String(name).toLowerCase().replace(/ /g, "-"));
      state.peerUserslugCache = userslug;
      var profileHref = getRelativePath() + '/user/' + escAttr(userslug || encodeURIComponent(String(name).toLowerCase().replace(/ /g, "-")));
      pInfo.innerHTML = '<a href="' + profileHref + '" title="访问主页">' + esc(name) + "</a>";
      if (avatar) {
        avatar.innerHTML = '<a class="cp-peer-avatar-link" href="' + profileHref + '" title="访问主页">' +
          (sanitizeAvatarHtml(avatarHtml) || getAvatarHtml(String(uid || ""), name, null)) +
          "</a>";
      }
    } else {
      pInfo.textContent = cpT("chatRoom", "聊天室");
      if (avatar) avatar.innerHTML = getAvatarHtml("", "?", null);
    }
  }

  function extractWkPayload(m) {
    try {
      if (m.payload) {
        if (typeof m.payload === "string") {
          if (m.payload.charAt(0) === "{") return JSON.parse(m.payload);

          return JSON.parse(
            decodeURIComponent(
              atob(m.payload)
                .split("")
                .map(function (c) {
                  return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
                })
                .join("")
            )
          );
        }

        if (m.payload instanceof Uint8Array) {
          if (window.TextDecoder) return JSON.parse(new TextDecoder("utf-8").decode(m.payload));

          var arr = [];
          for (var i = 0; i < m.payload.length; i++) arr.push(String.fromCharCode(m.payload[i]));
          return JSON.parse(decodeURIComponent(escape(arr.join(""))));
        }
      }

      if (m.content && typeof m.content === "object") return m.content;
      if (m.content) return JSON.parse(m.content);
    } catch (e) {
      warn("extract-wk-payload", e);
    }

    return {};
  }

  var audioDurCache = {};

  function getAudioDuration(url, cb) {
    if (audioDurCache[url]) return cb(audioDurCache[url]);

    var temp = new Audio();
    temp.preload = "metadata";
    temp.src = url;

    var fallback = setTimeout(function () {
      temp.onerror = null;
      temp.onloadedmetadata = null;
      cb(0);
    }, 5000);

    temp.onloadedmetadata = function () {
      if (temp.duration === Infinity) {
        temp.currentTime = 1e101;

        temp.ontimeupdate = function () {
          temp.ontimeupdate = null;
          temp.currentTime = 0;
          clearTimeout(fallback);
          audioDurCache[url] = temp.duration || 0;
          cb(temp.duration || 0);
        };
      } else {
        clearTimeout(fallback);
        audioDurCache[url] = temp.duration || 0;
        cb(temp.duration || 0);
      }
    };

    temp.onerror = function () {
      clearTimeout(fallback);
      cb(0);
    };
  }

  function createMessageObj(text, isMine, uid, wkMsg, payloadObj) {
    var username = isMine ? (window.app && app.user ? app.user.username : "我") : state.peerUsernameCache || cpT("unknown_user", "用户");
    if (!isMine && /^\d+$/.test(String(username || ""))) username = cpT("unknown_user", "用户");
    var userslug = isMine ? (window.app && app.user ? app.user.userslug || "" : "") : (state.peerUserslugCache || "");
    var avatarHtml = getAvatarHtml(String(uid), username, null);

    var type = "text";
    var mediaUrl = "";
    var audioUrl = "";
    var displayHtml = esc(text);
    var match;

    if ((match = text.match(/^!\[\]\((.+?)\)$/)) || (match = text.match(/^\[图片\]\((.+?)\)$/))) {
      mediaUrl = cpSafeUrl(match[1], { allowDataImage: false });
      if (mediaUrl) {
        type = "image";
        text = "[图片]";
        displayHtml = "";
      }
    } else if ((match = text.match(/^\[视频\]\((.+?)\)$/))) {
      mediaUrl = cpSafeUrl(match[1], { allowDataImage: false });
      if (mediaUrl) {
        type = "video";
        text = "[视频]";
        displayHtml = "";
      }
    } else if ((match = text.match(/^\[语音消息\]\((.+?)\)$/))) {
      audioUrl = cpSafeUrl(match[1], { allowDataImage: false });
      if (audioUrl) {
        type = "voice";
        text = "[语音]";
        displayHtml = "";
      }
    }

    var obj = {
      id: "wk_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
      seq: Number.MAX_SAFE_INTEGER,
      mine: !!isMine,
      ts: Date.now(),
      username: username,
      userslug: userslug,
      uid: String(uid),
      avatarHtml: avatarHtml,
      type: type,
      text: text,
      html: displayHtml,
      quote: "",
      quoteUser: "",
      recalled: false,
      mediaUrl: mediaUrl,
      audioUrl: audioUrl,
      translation: "",
      translationOpen: false,
      durationStr: "",
      wkMsg: wkMsg || null,
      wkMeta: serializeWkMeta(wkMsg),
      read: false,
      serverText: "",
      _ver: 1
    };

    if (type === "voice") {
      if (payloadObj && payloadObj.duration) {
        obj.durationStr = formatDuration(payloadObj.duration);
      } else if (payloadObj && payloadObj.time) {
        obj.durationStr = formatDuration(payloadObj.time);
      } else if (obj.audioUrl) {
        getAudioDuration(obj.audioUrl, function (sec) {
          obj.durationStr = formatDuration(sec);
          msgTouch(obj);

          var durEl = byId("dur_" + obj.id);
          if (durEl) durEl.innerText = obj.durationStr;

          incrementalRender("keep");
        });
      }
    }

    return obj;
  }

  var CALL_ICON = {
    voice:
      '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
        '<path fill="currentColor" d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1l-2.1 2.2z"/>' +
      "</svg>",
    video:
      '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
        '<path fill="currentColor" d="M17 10.5V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.5l4 4v-11l-4 4z"/>' +
      "</svg>"
  };

  function callRecordIconHtml(m) {
    return String(m.callMode || "") === "video" ? CALL_ICON.video : CALL_ICON.voice;
  }

  function callRecordLabel(m) {
    var kind = String(m.callKind || "");
    var isVideo = String(m.callMode || "") === "video";
    var base = isVideo ? cpT("call_video", "视频通话") : cpT("call_voice", "语音通话");
    var dur = m.durationStr || "";
    switch (kind) {
      case "completed": return base + (dur ? " " + dur : "");
      case "canceled": return cpT("call_canceled", "已取消");
      case "no_answer": return cpT("call_no_answer", "对方无应答");
      case "rejected": return cpT("call_peer_rejected", "对方已拒绝");
      case "busy": return cpT("call_peer_busy", "对方忙线中");
      case "missed": return cpT("call_missed", "未接听");
      case "declined": return cpT("call_declined", "已拒绝");
      default: return base;
    }
  }

  function findExistingCallRecordMessage(callId, msgId, clientNo, seq) {
    callId = String(callId || "");
    for (var i = state.wkMessages.length - 1; i >= 0; i--) {
      var m = state.wkMessages[i];
      if (!m) continue;
      if (callId && m.callId && String(m.callId) === callId) return m;
      if (msgIdentityMatches(m, msgId, clientNo, seq)) return m;
    }
    return null;
  }

  function upsertCallRecordMessage(info, mine, uidForMsg, wkMsg, serverText) {
    info = normalizeCallRecordInfo(info);
    var ident = getWkMessageIdentity(wkMsg || {}, serverText || info.callId, uidForMsg);
    var msgId = ident.id || ("call_" + shortHash(info.callId));
    var existing = findExistingCallRecordMessage(info.callId, msgId, ident.clientNo, ident.seq);
    var target = existing || createMessageObj("", !!mine, uidForMsg, wkMsg || null, null);
    var changed = !existing;

    if (target.id !== msgId) { target.id = msgId; changed = true; }
    if (ident.seq && Number(target.seq || 0) !== Number(ident.seq)) { target.seq = ident.seq; changed = true; }
    if (ident.clientNo && target.clientMsgNo !== ident.clientNo) { target.clientMsgNo = ident.clientNo; changed = true; }
    if (ident.ts && Math.abs(Number(target.ts || 0) - Number(ident.ts)) > 1000) { target.ts = ident.ts; changed = true; }
    else if (!ident.ts && info.ts && Math.abs(Number(target.ts || 0) - Number(info.ts)) > 1000) { target.ts = info.ts; changed = true; }
    if (wkMsg && target.wkMsg !== wkMsg) { target.wkMsg = wkMsg; target.wkMeta = serializeWkMeta(wkMsg); changed = true; }

    var nextDurationStr = info.durationSec > 0 ? formatDuration(info.durationSec) : "";
    var nextServerText = serverText || buildCallRecordText(info);

    if (target.type !== "call") changed = true;
    if (target.mine !== !!mine) changed = true;
    if (target.uid !== String(uidForMsg || "")) changed = true;
    if (target.callId !== info.callId) changed = true;
    if (target.callKind !== info.kind) changed = true;
    if (target.callMode !== info.mode) changed = true;
    if (target.durationStr !== nextDurationStr) changed = true;
    if (target.serverText !== nextServerText) changed = true;

    target.type = "call";
    target.mine = !!mine;
    target.uid = String(uidForMsg || "");
    target.callId = info.callId;
    target.callKind = info.kind;
    target.callMode = info.mode;
    target.durationStr = nextDurationStr;
    target.html = "";
    target.serverText = nextServerText;
    var nextText = callRecordLabel(target);
    if (target.text !== nextText) changed = true;
    target.text = nextText;
    target.pendingLocal = false;
    target.failedLocal = false;

    if (!existing) {
      state.wkMessages.push(target);
    } else if (changed) {
      msgTouch(target);
    }

    return { msg: target, added: !existing, touched: changed };
  }

  function sendCallRecordSignal(info) {
    return sendCallSignalText(buildCallRecordText(info));
  }

  // Called by cp-harmony-call.js when a call ends, to leave a chat-history
  // record bubble (voice/video, cancelled, missed, rejected, duration...).
  function addCallRecord(info) {
    try {
      info = normalizeCallRecordInfo(info || {});
      var peerUid = String((arguments[0] && arguments[0].peerUid) || "").replace(/[^\d]/g, "");
      if (!peerUid) return;
      var current = String(getPeerUid() || "").replace(/[^\d]/g, "");
      if (!current || current !== peerUid) return; // only log into the open chat

      var mine = !!info.mine;
      var uidForMsg = mine
        ? String(state.myUid || (window.app && app.user && app.user.uid) || "")
        : peerUid;

      var signalText = buildCallRecordText(info);
      var result = upsertCallRecordMessage(info, mine, uidForMsg, null, signalText);

      if (result.added || result.touched) {
        state.mergedDirty = true;
        state.msgIndexDirty = true;
        state.renderVersion++;
        incrementalRender("bottom");
      }

      // 本地立即落库，避免刷新太快时 900ms 延迟定时器来不及执行。
      persistChatToDB(peerUid);

      // 同步一条隐藏的通话记录信令到悟空 IM，刷新、换设备、重新拉历史时都能恢复。
      if (!(arguments[0] && arguments[0].persistToServer === false)) {
        sendCallRecordSignal(info);
      }
    } catch (e) {
      warn("add-call-record", e);
    }
  }
  CP_PLUGIN.addCallRecord = addCallRecord;
  CP_PLUGIN.buildCallRecordText = buildCallRecordText;
  CP_PLUGIN.parseCallRecordText = parseCallRecordText;

  function onAudioEnded() {
    if (state.currentAudioEl) {
      state.currentAudioEl.classList.remove("playing");
      var icon = state.currentAudioEl.querySelector(".cp-play-circle");
      if (icon) icon.innerHTML = ICON.play;
    }

    state.currentAudioEl = null;
  }

  // 修复：保存引用并通过幂等绑定，避免重复挂载时累积 ended 监听器
  state.audioEndedHandler = onAudioEnded;
  bindAudioEndedHandler();

  function isWkConnectedStatus(status) {
    return status === 1 || status === "connected" || status === "CONNECTED" || status === "connect" || status === "CONNECT";
  }

  function initWukong() {
    if (window.__wkEngineBooted) return;
    window.__wkEngineBooted = true;

    var apiBase = cpPluginConfig().apiBase || "/api/wukong";

    function loadToken() {
      return fetch(apiBase + "/token", {
        credentials: "same-origin",
        headers: { accept: "application/json" }
      }).then(function (res) {
        if (!res.ok) throw new Error("token http " + res.status);
        return res.json();
      }).catch(function () {
        return fetch("/bridge/token", {
          credentials: "same-origin",
          headers: { accept: "application/json" }
        }).then(function (res) {
          if (!res.ok) throw new Error("bridge token http " + res.status);
          return res.json();
        });
      });
    }

    loadToken().then(function (res) {
      if (!res) return;

      var token = res.token || (res.data && res.data.token) || "";
      var uid = res.uid || res.userId || (res.user && res.user.uid) || (res.data && (res.data.uid || res.data.userId)) || "";
      var addr = res.addr || res.wsAddr || res.wkws || (res.data && (res.data.addr || res.data.wsAddr || res.data.wkws)) || "";

      if (!token) {
        warn("wk-token-empty", res);
        return;
      }

      state.myUid = String(uid || state.myUid || (window.app && app.user ? app.user.uid : ""));
      if (res.user || res.userData || (res.data && (res.data.user || res.data.userData))) {
        var me = pickUserRecord(res.user || res.userData || res.data);
        if (me && window.app && app.user) {
          app.user.picture = app.user.picture || me.picture || me.uploadedpicture || me.avatarUrl || "";
          app.user.username = app.user.username || me.username || me.displayname || "";
          app.user.userslug = app.user.userslug || me.userslug || me.slug || "";
        }
      }

      var s = document.createElement("script");
      s.src = cpPluginConfig().wkSdkUrl || "https://cdn.jsdelivr.net/npm/wukongimjssdk@latest/lib/wukongimjssdk.umd.js";
      document.head.appendChild(s);

      s.onload = function () {
        var wk = window.wk;
        if (!wk || !wk.WKSDK) return;

        wk.WKSDK.shared().config.uid = state.myUid;
        wk.WKSDK.shared().config.token = String(token);
        wk.WKSDK.shared().config.addr = addr || cpPluginConfig().wkWsUrl || ((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/wkws/");

        wk.WKSDK.shared().chatManager.addMessageListener(function (m) {
          if (!state.mounted) return;

          var payloadObj = extractWkPayload(m) || {};

          if (m.contentType === 1006 || payloadObj.type === 1006) {
            var targetId = payloadObj.client_msg_no || payloadObj.message_id || payloadObj.clientMsgNo;

            var targetMsg = state.wkMessages.find(function (x) {
              return x.id === targetId || (x.wkMsg && (x.wkMsg.clientMsgNo === targetId || x.wkMsg.messageID === targetId));
            });

            if (targetMsg) {
              targetMsg.recalled = true;
              targetMsg.text = "此消息已被撤回";
              msgTouch(targetMsg);
              incrementalRender("keep");
            }

            return;
          }

          var fromUid = String(m.fromUID || m.from_uid || "");
          if (cpIsMineUid(fromUid)) return;

          var currentPeerUid = getPeerUid();
          if (!currentPeerUid || !messageBelongsToCurrentPeer(m, fromUid, currentPeerUid)) return;

          var t = payloadObj.text || payloadObj.content || "";
          if (!t) return;

          if (isCallRecordText(t)) {
            var liveCallInfo = parseCallRecordText(t);
            if (!liveCallInfo) return;
            var liveCallResult = upsertCallRecordMessage(liveCallInfo, false, fromUid, m, t);
            if (liveCallResult.msg && liveCallResult.msg.seq && liveCallResult.msg.seq > state.localMaxSeq) state.localMaxSeq = liveCallResult.msg.seq;
            if (liveCallResult.added || liveCallResult.touched) {
              pruneWkMessages();
              pruneAllMessagesInMemory();
              state.renderVersion++;
              state.mergedDirty = true;
              state.msgIndexDirty = true;
              schedulePersistChat(currentPeerUid);
              var callWasAtBottom = isMainAtBottom();
              if (callWasAtBottom) {
                state.unreadCount = 0;
                updateUnreadBadge();
                incrementalRender("bottom");
                requestAnimationFrame(forceScrollToBottom);
              } else {
                state.unreadCount++;
                updateUnreadBadge();
                incrementalRender("keep");
                if (navigator.vibrate) navigator.vibrate([50, 100, 50]);
              }
            }
            return;
          }

          if (isCallSignalText(t)) return;

          var ident = getWkMessageIdentity(m, t, fromUid);
          if (findExistingWkMessage(ident.id, ident.clientNo, ident.seq)) return;

          var newMsg = createMessageObj(t, false, fromUid, m, payloadObj);
          newMsg.id = ident.id;
          newMsg.seq = ident.seq || 0;
          newMsg.clientMsgNo = ident.clientNo || "";
          newMsg.ts = ident.ts || Date.now();
          newMsg.serverText = t;
          newMsg.wkMeta = serializeWkMeta(m);

          if (newMsg.seq && newMsg.seq > state.localMaxSeq) state.localMaxSeq = newMsg.seq;

          state.wkMessages.push(newMsg);
          pruneWkMessages();
          pruneAllMessagesInMemory();

          state.renderVersion++;
          state.mergedDirty = true;
          state.msgIndexDirty = true;

          schedulePersistChat(currentPeerUid);

          var wasAtBottom = isMainAtBottom();

          if (state.cfg.autoTranslateLastMsg) {
            setTimeout(function () {
              executePeerTranslateOnly(newMsg);
            }, 0);
          }

          if (wasAtBottom) {
            state.unreadCount = 0;
            updateUnreadBadge();
            incrementalRender("bottom");
            requestAnimationFrame(function () {
              forceScrollToBottom();
              setTimeout(markVisibleAsRead, 60);
            });
          } else {
            state.unreadCount++;
            updateUnreadBadge();
            incrementalRender("keep");
            if (navigator.vibrate) navigator.vibrate([50, 100, 50]);
          }
        });

        wk.WKSDK.shared().connectManager.addConnectStatusListener(function (status) {
          var connected = isWkConnectedStatus(status);
          state.wkReady = connected;
          if (connected && state.mounted && state.initialLoadDone) {
            var pUid = getPeerUid();
            if (pUid && state.localMaxSeq > 0) fetchOfflineMessages(pUid);
          }
        });

        wk.WKSDK.shared().connectManager.connect();
        setTimeout(function () {
          try {
            var cm = window.wk && window.wk.WKSDK && window.wk.WKSDK.shared().connectManager;
            var status = cm && (cm.status || cm.connectStatus || cm.state);
            if (isWkConnectedStatus(status)) state.wkReady = true;
          } catch (_) {}
        }, 1500);
      };

      s.onerror = function (e) {
        warn("wk-sdk-load", e);
      };
    }).catch(function (e) {
      warn("wk-token", e);
    });
  }

  async function fetchWukongHistory(peerUid, startSeq, opts) {
    opts = opts || {};
    var isOfflineSync = !!opts.isOfflineSync;
    if (!peerUid) return 0;
    if (!isOfflineSync && (state.loadingOldHistory || state.noMoreOldHistory)) return 0;
    if (isOfflineSync && state.offlineSyncRunning && !opts._insideOfflineLoop) return 0;

    var limit = opts.limit || 20;
    var apiBase = cpPluginConfig().apiBase || "/api/wukong";
    var channelId = (window.__NBB_WUKONG_PAGE__ && window.__NBB_WUKONG_PAGE__.channelId) || cpPluginConfig().channelId || peerUid;
    var channelType = Number((window.__NBB_WUKONG_PAGE__ && window.__NBB_WUKONG_PAGE__.channelType) || cpPluginConfig().channelType || 1);

    if (!isOfflineSync) {
      state.loadingOldHistory = true;
      state.isPreloading = true;
      if (byId("cp-top-spinner")) byId("cp-top-spinner").hidden = false;
    }

    try {
      var urls = [];

      var u1 = apiBase + "/history?channel_id=" + encodeURIComponent(channelId) + "&channel_type=" + encodeURIComponent(channelType) + "&limit=" + encodeURIComponent(limit);
      if (startSeq && startSeq > 0) u1 += "&start_message_seq=" + encodeURIComponent(startSeq);
      urls.push(u1);

      // 兼容独立 bridge 后端：topic/group 会话必须传真实 channelId/channelType，不能退回 peerUid。
      var u2 = "/bridge/get-history?login_uid=" + encodeURIComponent(state.myUid) +
        "&channel_id=" + encodeURIComponent(channelId) +
        "&channel_type=" + encodeURIComponent(channelType) +
        "&limit=" + encodeURIComponent(limit);
      if (startSeq && startSeq > 0) u2 += "&start_message_seq=" + encodeURIComponent(startSeq);
      urls.push(u2);

      var json = null;
      var ok = false;

      for (var ui = 0; ui < urls.length; ui++) {
        try {
          var res = await fetch(urls[ui], { credentials: "same-origin", headers: { accept: "application/json" } });
          if (!res.ok) continue;
          json = await res.json();
          ok = true;
          break;
        } catch (inner) {
          warn("wk-history-endpoint", inner);
        }
      }

      if (!ok) throw new Error("history api failed");

      var msgs = [];

      if (Array.isArray(json)) msgs = json;
      else if (json.data && Array.isArray(json.data)) msgs = json.data;
      else if (json.data && Array.isArray(json.data.messages)) msgs = json.data.messages;
      else if (Array.isArray(json.messages)) msgs = json.messages;
      else if (json.response && Array.isArray(json.response.messages)) msgs = json.response.messages;

      if (msgs.length) {
        var before = state.wkMessages.length;
        var loadingOlder = !!startSeq && !isOfflineSync;
        processWukongMessages(msgs, loadingOlder);
        var addedCount = Math.max(0, state.wkMessages.length - before);
        if (!isOfflineSync && (msgs.length < limit || (loadingOlder && addedCount === 0))) {
          state.noMoreOldHistory = true;
          state.hasNoMoreHistory = true;
        }
        return addedCount;
      }

      if (!isOfflineSync) {
        state.noMoreOldHistory = true;
        state.hasNoMoreHistory = true;
      }
      return 0;
    } catch (e) {
      warn("wk-history", e);
      return 0;
    } finally {
      if (!isOfflineSync) {
        state.loadingOldHistory = false;
        state.isPreloading = false;
        if (byId("cp-top-spinner")) byId("cp-top-spinner").hidden = true;
      }
    }
  }

  async function fetchOfflineMessages(peerUid) {
    if (!peerUid || !state.localMaxSeq || state.offlineSyncRunning) return;

    state.offlineSyncRunning = true;
    try {
      var startSeq = state.localMaxSeq + 1;
      var hasMore = true;
      var guard = 0;

      while (hasMore && guard < 20) {
        guard += 1;
        var beforeMax = state.localMaxSeq || 0;
        var added = await fetchWukongHistory(peerUid, startSeq, { limit: 50, isOfflineSync: true, _insideOfflineLoop: true });
        var batchMaxSeq = state.localMaxSeq || 0;

        if (!added || batchMaxSeq <= beforeMax) {
          hasMore = false;
        } else {
          startSeq = batchMaxSeq + 1;
          if (added < 50) hasMore = false;
        }
      }
    } finally {
      state.offlineSyncRunning = false;
    }
  }

  function messageBelongsToCurrentPeer(rawMsg, fromUid, peerUid) {
    peerUid = String(peerUid || getPeerUid() || "");
    if (!peerUid) return false;
    fromUid = String(fromUid || "");
    if (fromUid && !cpIsMineUid(fromUid) && fromUid !== peerUid) return false;

    var rawChannel = rawMsg && (rawMsg.channel_id || rawMsg.channelID || rawMsg.channelId);
    if (!rawChannel && rawMsg && rawMsg.channel) rawChannel = rawMsg.channel.channelID || rawMsg.channel.channel_id || rawMsg.channel.id;
    var to = rawMsg && (rawMsg.to_uid || rawMsg.toUID || rawMsg.toUid || rawMsg.receiver_uid || rawMsg.receiverUID);

    if (cpIsMineUid(fromUid) && to && String(to) !== peerUid) return false;

    var expectedChannel = String((window.__NBB_WUKONG_PAGE__ && window.__NBB_WUKONG_PAGE__.channelId) || cpPluginConfig().channelId || peerUid);
    if (rawChannel && String(rawChannel) !== peerUid && String(rawChannel) !== expectedChannel) return false;

    return true;
  }

  function processWukongMessages(msgs, isLoadMore) {
    var added = false;
    var touchedExisting = false;
    var wasAtBottom = isMainAtBottom();

    var existingIds = new Set();
    var existingSeqs = new Set();

    for (var ei = 0; ei < state.wkMessages.length; ei++) {
      var ex = state.wkMessages[ei];
      if (!ex) continue;
      if (ex.id) existingIds.add(String(ex.id));
      if (ex.clientMsgNo) existingIds.add(String(ex.clientMsgNo));
      if (ex.wkMsg) {
        var exStable = getWkStableMessageId(ex.wkMsg);
        var exClient = getWkClientMsgNo(ex.wkMsg);
        if (exStable) existingIds.add(String(exStable));
        if (exClient) existingIds.add(String(exClient));
      }
      if (ex.seq && ex.seq !== Number.MAX_SAFE_INTEGER) existingSeqs.add(String(ex.seq));
    }

    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      var payloadObj = extractWkPayload(m) || {};
      var fromUid = String(m.from_uid || m.fromUID || m.fromUid || "");
      if (!messageBelongsToCurrentPeer(m, fromUid, getPeerUid())) continue;
      var isMine = cpIsMineUid(fromUid);
      var serverT = payloadObj.text || payloadObj.content || "";

      // 历史/离线消息里的通话记录信令要还原成通话气泡；普通通话控制信令仍隐藏。
      if (isCallRecordText(serverT)) {
        var histCallInfo = parseCallRecordText(serverT);
        if (!histCallInfo) continue;
        var histCallResult = upsertCallRecordMessage(histCallInfo, isMine, fromUid, m, serverT);
        var histCallMsg = histCallResult.msg;
        if (histCallMsg && histCallMsg.seq && histCallMsg.seq < Number.MAX_SAFE_INTEGER && histCallMsg.seq > state.localMaxSeq) {
          state.localMaxSeq = histCallMsg.seq;
        }
        if (histCallResult.added) added = true;
        if (histCallResult.touched) touchedExisting = true;
        continue;
      }

      // 历史/离线消息里的通话控制信令不显示
      if (isCallSignalText(serverT)) continue;

      var t = serverT;

      if (isMine && payloadObj.originalText) t = payloadObj.originalText;
      if (!t) continue;

      // 双保险：originalText 如果也是通话信令，也跳过
      if (isCallSignalText(t)) continue;

      var ident = getWkMessageIdentity(m, serverT || t, fromUid);
      var seq = ident.seq;
      var clientNo = ident.clientNo;
      var msgId = ident.id;
      var ts = ident.ts;

      var existing = findExistingWkMessage(msgId, clientNo, seq);
      if (existing) {
        var touched = adoptServerIdentity(existing, m, msgId, seq, clientNo, serverT || t, t);
        if (ts && (!existing.ts || Math.abs(existing.ts - ts) > 1000)) {
          existing.ts = ts;
          touched = true;
        }
        if (touched) touchedExisting = true;
        if (seq && seq > state.localMaxSeq) state.localMaxSeq = seq;
        existingIds.add(String(existing.id || msgId));
        if (clientNo) existingIds.add(String(clientNo));
        if (seq) existingSeqs.add(String(seq));
        continue;
      }

      if (isMine) {
        var pending = findPendingOutgoingMessage(serverT || t, msgId, clientNo, seq, ts, "");
        if (pending) {
          adoptServerIdentity(pending, m, msgId, seq, clientNo, serverT || t, t);
          pending.ts = ts || pending.ts;
          existingIds.add(String(pending.id || msgId));
          if (clientNo) existingIds.add(String(clientNo));
          if (seq) existingSeqs.add(String(seq));
          touchedExisting = true;
          continue;
        }
      }

      var newMsg = createMessageObj(t, isMine, fromUid, m, payloadObj);
      newMsg.id = msgId;
      newMsg.seq = seq || 0;
      newMsg.clientMsgNo = clientNo || "";
      newMsg.wkMeta = serializeWkMeta(m);
      // 修复：始终设置 serverText（实际发送/接收的服务器文本）
      newMsg.serverText = serverT || t;

      if (ts) newMsg.ts = ts;

      if (newMsg.seq && newMsg.seq < Number.MAX_SAFE_INTEGER && newMsg.seq > state.localMaxSeq) {
        state.localMaxSeq = newMsg.seq;
      }

      state.wkMessages.push(newMsg);
      existingIds.add(String(newMsg.id));
      if (clientNo) existingIds.add(String(clientNo));
      if (newMsg.seq) existingSeqs.add(String(newMsg.seq));
      added = true;
    }

    if (!added && !touchedExisting) return;

    state.wkMessages.sort(function (a, b) {
      var as = Number(a.seq || 0);
      var bs = Number(b.seq || 0);
      if (as && bs && as !== Number.MAX_SAFE_INTEGER && bs !== Number.MAX_SAFE_INTEGER && as !== bs) return as - bs;
      return (a.ts || 0) - (b.ts || 0);
    });

    pruneWkMessages();
    pruneAllMessagesInMemory();

    state.renderVersion++;
    state.mergedDirty = true;
    state.msgIndexDirty = true;

    schedulePersistChat(getPeerUid());

    if (isLoadMore) {
      incrementalRender("prepend");
    } else if (wasAtBottom) {
      incrementalRender("bottom");
      requestAnimationFrame(forceScrollToBottom);
    } else {
      incrementalRender("keep");
    }

    if (state.cfg.autoTranslateLastMsg && !isLoadMore) {
      var lastPeerMsg = null;

      for (var k = state.wkMessages.length - 1; k >= 0; k--) {
        if (!state.wkMessages[k].mine && state.wkMessages[k].type === "text" && !state.wkMessages[k].recalled) {
          lastPeerMsg = state.wkMessages[k];
          break;
        }
      }

      if (lastPeerMsg && !lastPeerMsg.translationOpen) {
        setTimeout(function () {
          executePeerTranslateOnly(lastPeerMsg);
        }, 0);
      }
    }
  }

  function sendText(text, originalText) {
    // 防止误把通话信令当普通消息发送并插入本地气泡
    if (isCallSignalText(text) || isCallSignalText(originalText)) {
      sendCallSignalText(text || originalText);
      return;
    }

    var peerUid = getPeerUid();
    var displayText = originalText || text;

    if (!peerUid || !state.wkReady || !window.wk || !window.wk.WKSDK) {
      toast("悟空连接中，暂时无法发送");
      warn("wk-send-not-ready", { peerUid: peerUid, wkReady: state.wkReady, hasWk: !!window.wk });
      return;
    }

    var wkMsgObj = null;

    try {
      var channel = new window.wk.Channel(peerUid, 1);
      var msgContent = new window.wk.MessageText(text);

      var quotePayload = null;
      if (state.quoteTarget) {
        quotePayload = {
          text: state.quoteTarget.text || "",
          username: state.quoteTarget.username || "",
          id: state.quoteTarget.id || ""
        };
      }

      if (originalText || quotePayload) {
        var origEncode = msgContent.encode.bind(msgContent);

        msgContent.encode = function () {
          var p = origEncode();
          var pObj = null;

          if (typeof p === "string") {
            try { pObj = JSON.parse(p); } catch (_) { pObj = { text: text, content: text }; }
          } else if (p && typeof p === "object") {
            pObj = p;
          } else {
            pObj = { text: text, content: text };
          }

          if (originalText) pObj.originalText = originalText;
          if (quotePayload) pObj.quote = quotePayload;
          return typeof p === "string" ? JSON.stringify(pObj) : pObj;
        };
      }

      wkMsgObj = window.wk.WKSDK.shared().chatManager.send(msgContent, channel);
    } catch (e) {
      warn("wk-send", e);
      toast("发送失败，请检查连接");
      return;
    }

    var newMsg = createMessageObj(displayText, true, state.myUid, wkMsgObj, {
      text: displayText,
      originalText: originalText
    });

    newMsg.serverText = text;
    newMsg.pendingLocal = true;
    newMsg.failedLocal = false;
    newMsg.wkMeta = serializeWkMeta(wkMsgObj);

    if (state.quoteTarget) {
      newMsg.quote = state.quoteTarget.text || "";
      newMsg.quoteUser = state.quoteTarget.username || "";
      state.quoteTarget = null;
      hideQuoteBar();
    }

    state.wkMessages.push(newMsg);
    bindOutgoingAck(wkMsgObj, newMsg);
    pruneWkMessages();
    pruneAllMessagesInMemory();

    state.renderVersion++;
    state.mergedDirty = true;
    state.msgIndexDirty = true;

    schedulePersistChat(peerUid);

    state.unreadCount = 0;
    updateUnreadBadge();

    incrementalRender("bottom");
    requestAnimationFrame(forceScrollToBottom);

    var input = byId("cp-input");

    if (input) {
      input.value = "";
      input.style.height = "42px";
    }

    updatePrimaryButton();
    updateFooterHeight();
  }

  function smoothScrollToBottom() {
    var mainEl = byId("cp-main");
    if (!mainEl) return;

    var gap = mainEl.scrollHeight - mainEl.scrollTop - mainEl.clientHeight;

    if (gap < 800) mainEl.scrollTo({ top: mainEl.scrollHeight, behavior: "smooth" });
    else mainEl.scrollTop = mainEl.scrollHeight;
  }

  // 修复：强制立即滚到底（不动画）
  function forceScrollToBottom() {
    var mainEl = byId("cp-main");
    if (!mainEl) return;
    mainEl.scrollTop = mainEl.scrollHeight;
  }

  function boot() {
    var cfg = cpPluginConfig() || {};
    var isIndependent = !!(cfg.independent || document.getElementById("nodebb-wukong-root") || (window.__NBB_WUKONG_PAGE__ && (window.__NBB_WUKONG_PAGE__.targetUid || window.__NBB_WUKONG_PAGE__.tid)) || /\/wukong(?:\/|$)/i.test(location.pathname));

    if (isIndependent) {
      if (!state.mounted) mount();
      else scheduleSync();
      return;
    }

    var chatContainer = document.querySelector('[component="chat/messages"]');

    if (chatContainer) {
      if (!state.mounted) mount();
      else scheduleSync();
    } else {
      if (state.mounted) unmount();
      if (state.bootRetryTimer) clearTimeout(state.bootRetryTimer);
      state.bootRetryTimer = setTimeout(boot, 500);
    }
  }

  async function ensurePeerLoaded(loadGeneration) {
    loadGeneration = loadGeneration || state.mountGeneration;
    ensureSelfUid();
    var pUid = getPeerUid();

    if (!pUid) {
      await hydratePeerFromRoute();
      if (!state.mounted || loadGeneration !== state.mountGeneration) return;
      pUid = getPeerUid();
      updateHeaderPeerInfo(null);
    }

    if (!pUid) return;

    if (state.loadedPeerUid === pUid && state.peerLoadPromise) return state.peerLoadPromise;

    state.loadedPeerUid = pUid;
    state.noMoreOldHistory = false;
    state.hasNoMoreHistory = false;

    state.peerLoadPromise = (async function () {
      await loadChatFromDB(pUid);
      if (!state.mounted || loadGeneration !== state.mountGeneration || String(getPeerUid()) !== String(pUid)) return;

      await fetchWukongHistory(pUid, 0, { limit: 20 });
      if (!state.mounted || loadGeneration !== state.mountGeneration || String(getPeerUid()) !== String(pUid)) return;

      if (state.localMaxSeq > 0) await fetchOfflineMessages(pUid);
      if (!state.mounted || loadGeneration !== state.mountGeneration || String(getPeerUid()) !== String(pUid)) return;

      cpHydratePeerMessagesFromCache();
      state.initialLoadDone = true;

      // 初始加载完成后滚到底。
      requestAnimationFrame(forceScrollToBottom);
    })().finally(function () {
      if (state.loadedPeerUid === pUid) state.peerLoadPromise = null;
    });

    return state.peerLoadPromise;
  }

  async function mount() {
    var mountGeneration = ++state.mountGeneration;
    state.mounted = true;
    await cpLoadI18n();
    if (mountGeneration !== state.mountGeneration) return;
    state.cfg = normalizeConfig(
      loadJSON(KEY_CFG, {
        autoTranslateLastMsg: false,
        sourceLang: "中文",
        targetLang: "မြန်မာစာ",
        sendTranslateEnabled: false,
        smartReplyEnabled: false,
        contextMemoryEnabled: true,
        contextRounds: 30,
        targetGender: "女生",
        relationshipStage: "刚认识",
        communicationStyle: "自然直接，偶尔幽默",
        voiceMaxDuration: 60,
        translateProvider: "ai",
        ai: {
          endpoint: "",
          apiKey: "",
          model: "deepseek4flash",
          temperature: 0.3,
          translatePrompt: DEFAULT_TRANSLATE_PROMPT,
          wingmanPrompt: DEFAULT_WINGMAN_PROMPT
        }
      })
    );

    state.bg = loadJSON(KEY_BG, { dataUrl: null, opacity: 0.85 });

    state.peerUidCache = "";
    state.peerUsernameCache = "";
    state.peerUserslugCache = "";
    state.peerPictureCache = "";
    state.peerIconTextCache = "";
    state.peerIconBgCache = "";
    state.peerHydrating = false;
    state.peerRouteSlug = "";
    state.suppressNativeIds = {};
    state.pendingSentTexts = {};
    state.loadedPeerUid = "";
    state.wkMessages = [];
    state.messages = [];
    state.myUid = ensureSelfUid();
    state.unreadCount = 0;
    state.renderLimit = 240;
    state.lastRenderHash = "";
    state.renderVersion = 0;
    state.isPreloading = false;
    state.loadingOldHistory = false;
    state.offlineSyncRunning = false;
    state.noMoreOldHistory = false;
    state.hasNoMoreHistory = false;
    state.mergedCache = null;
    state.mergedDirty = true;
    state.msgIndexDirty = true;
    state.msgIndex = null;
    state.quoteTarget = null;
    state.localMaxSeq = 0;
    state.initialLoadDone = false;
    state.wingmanRequestId = 0;
    state.translateInflight = {};
    state.stickToBottom = true;
    state.lazyObserved = typeof WeakSet !== "undefined" ? new WeakSet() : null;
    state.heightMap = {};
    state.heightObserved = {};
    state.virtualRenderPending = false;
    state.peerLoadPromise = null;
    bindAudioEndedHandler();

    cleanUpOldMedia();

    injectStyle();
    injectRoot();
    cpNormalizeActionIcons();
    // 先用路由用户名占位，避免标题长时间停留在“加载中...”
    updateHeaderPeerInfo(null);
    hydratePeerFromRoute().then(function () {
      if (!state.mounted || mountGeneration !== state.mountGeneration) return;
      updateHeaderPeerInfo(null);
      ensurePeerLoaded(mountGeneration);
    });
    bindUI();
    bindSelectBlockers();
    applyBackground();
    renderRecBars();
    syncSettingsUI();
    updateHeaderPeerInfo(null);
    initLazyObserver();

    setTimeout(mountNativeObserver, 300);

    scheduleSync();
    initWukong();

    document.body.classList.add("cp-shell-on");

    await ensurePeerLoaded(mountGeneration);

    updateFooterHeight();
  }

  function unmount() {
    if (!state.mounted) return;
    state.mountGeneration++;

    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;

      var pUid = getPeerUid();
      if (pUid) persistChatToDB(pUid);
    }

    if (state.bootRetryTimer) {
      clearTimeout(state.bootRetryTimer);
      state.bootRetryTimer = null;
    }

    if (state.nativeObserverRetryTimer) {
      clearTimeout(state.nativeObserverRetryTimer);
      state.nativeObserverRetryTimer = null;
    }

    clearTimeout(state.readTimer);
    state.readTimer = null;

    var mainEl = byId("cp-main");

    if (mainEl && getPeerUid()) {
      state.scrollCache[getPeerUid()] = mainEl.scrollTop;

      var cacheKeys = Object.keys(state.scrollCache);
      if (cacheKeys.length > 20) delete state.scrollCache[cacheKeys[0]];
    }

    if (state.observer) state.observer.disconnect();
    state.observer = null;

    if (state.heightObserver) {
      state.heightObserver.disconnect();
      state.heightObserver = null;
      state.heightObserved = {};
    }

    if (state.lazyObserver) state.lazyObserver.disconnect();
    state.lazyObserver = null;
    state.lazyObserved = typeof WeakSet !== "undefined" ? new WeakSet() : null;

    releaseMountedMediaElements();

    if (window.visualViewport && state.vvHandler) {
      window.visualViewport.removeEventListener("resize", state.vvHandler);
      window.visualViewport.removeEventListener("scroll", state.vvHandler);
    }

    if (state.popHandler) window.removeEventListener("popstate", state.popHandler);

    if (state.docClickHandler) {
      document.removeEventListener("click", state.docClickHandler);
      state.docClickHandler = null;
    }

    releaseSharedAudio();

    var root = byId("cp-chat-root");
    if (root) root.remove();

    document.body.classList.remove("cp-shell-on");

    state.blobKeys.forEach(function (k) {
      try { cpRevokeBlobUrl(k, true); } catch (e) { warn("revoke-blob-on-unmount", e); }
    });

    state.blobUrlCache = {};
    state.blobKeys = [];
    state.blobLastUsed = {};
    state.wkMessages = [];
    state.messages = [];
    state.peerUidCache = "";
    state.peerUsernameCache = "";
    state.peerUserslugCache = "";
    state.peerPictureCache = "";
    state.peerIconTextCache = "";
    state.peerIconBgCache = "";
    state.peerHydrating = false;
    state.peerRouteSlug = "";
    state.suppressNativeIds = {};
    state.pendingSentTexts = {};
    state.loadedPeerUid = "";
    state.peerLoadPromise = null;
    state.mounted = false;
    state.previewOpen = false;
    state.settingsOpen = false;
    state.mergedCache = null;
    state.mergedDirty = true;
    state.msgIndex = null;
    state.msgIndexDirty = true;
    state.initialLoadDone = false;
  }

  function injectStyle() {
    if (byId("cp-chat-style")) return;

    var css = `
      #cp-chat-root [hidden],
      #cp-chat-root .cp-modal-mask[hidden],
      #cp-chat-root .cp-context-overlay[hidden],
      #cp-chat-root .cp-preview-mask[hidden],
      #cp-chat-root .cp-media-pop[hidden],
      #cp-chat-root #cp-settings-mask[hidden],
      #cp-chat-root #cp-lang-mask[hidden],
      #cp-chat-root #cp-wingman-panel[hidden],
      #cp-chat-root #cp-quote-preview[hidden],
      #cp-chat-root #cp-upload-progress-wrap[hidden],
      #cp-chat-root #cp-rec-inline[hidden],
      #cp-chat-root #cp-fab-badge[hidden],
      #cp-chat-root #cp-top-spinner[hidden] {
        display:none!important;
        visibility:hidden!important;
        opacity:0!important;
        pointer-events:none!important;
      }
      #cp-chat-root .cp-row.is-pending .cp-bubble-wrap::after {
        content:"发送中";
        display:block;
        font-size:10px;
        color:#94a3b8;
        margin-top:3px;
        text-align:right;
      }
      #cp-chat-root .cp-row.is-failed .cp-bubble-wrap::after {
        content:"发送失败";
        display:block;
        font-size:10px;
        color:#ef4444;
        margin-top:3px;
        text-align:right;
      }
    `;

    var st = document.createElement("style");
    st.id = "cp-chat-style";
    st.textContent = css;
    document.head.appendChild(st);
  }




  function applyStaticTranslations() {
    function setText(id, key, fallback) {
      var el = byId(id);
      if (el) el.textContent = cpT(key, fallback);
    }
    function setHtml(id, key, fallback) {
      var el = byId(id);
      if (el) el.innerHTML = cpT(key, fallback);
    }
    function setLabel(inputId, key, fallback) {
      var input = byId(inputId);
      var label = input && input.closest ? input.closest('label') : null;
      var span = label && label.querySelector('span');
      if (span) span.textContent = cpT(key, fallback);
    }

    if (byId('cp-header-back')) byId('cp-header-back').setAttribute('aria-label', cpT('back', '返回'));
    if (byId('cp-header-more')) byId('cp-header-more').setAttribute('aria-label', cpT('settings', '设置'));
    if (byId('cp-input')) byId('cp-input').setAttribute('placeholder', cpT('sendMessage', '发送消息...'));
    setText('cp-peer-info', 'loading', '加载中...');
    var spinner = byId('cp-top-spinner');
    if (spinner) spinner.innerHTML = '<i class="fa fa-circle-o-notch"></i> ' + esc(cpT('loading', '加载中...'));

    var cameraSpan = byId('cp-pick-camera') && byId('cp-pick-camera').querySelector('span:last-child');
    if (cameraSpan) cameraSpan.textContent = cpT('shoot', '拍摄');
    var albumSpan = byId('cp-pick-album') && byId('cp-pick-album').querySelector('span:last-child');
    if (albumSpan) albumSpan.textContent = cpT('album', '相册图片/视频');

    var langTitle = byId('cp-lang-mask') && byId('cp-lang-mask').querySelector('h3');
    if (langTitle) langTitle.textContent = cpT('chooseLanguage', '选择语言');
    var settingsTitle = byId('cp-settings-mask') && byId('cp-settings-mask').querySelector('.cp-settings-head h3');
    if (settingsTitle) settingsTitle.textContent = cpT('chatSettings', '聊天设置');

    var sectionTitles = document.querySelectorAll('#cp-settings-mask .cp-settings-section-title');
    if (sectionTitles[0]) sectionTitles[0].textContent = cpT('translateProvider', '🌐 翻译方式');
    if (sectionTitles[1]) sectionTitles[1].textContent = cpT('wingmanSettings', '🧠 僚机设置');
    if (sectionTitles[2]) sectionTitles[2].textContent = cpT('chatFeatures', '✨ 聊天功能');
    if (sectionTitles[3]) sectionTitles[3].textContent = cpT('background', '🖼️ 背景');

    setText('cp-provider-google', 'googleTranslate', '谷歌翻译');
    setText('cp-provider-ai', 'aiTranslate', 'AI 翻译');
    setLabel('cp-ai-endpoint', 'aiEndpoint', 'AI 接口 URL');
    setLabel('cp-ai-key', 'apiKey', 'API Key');
    setLabel('cp-ai-model', 'model', '模型');
    setLabel('cp-target-gender', 'targetGender', '对方性别');
    setLabel('cp-relationship-stage', 'relationshipStage', '关系阶段');
    setLabel('cp-communication-style', 'chatStyle', '聊天风格');
    setLabel('cp-context-rounds-setting', 'contextRounds', '历史轮数');
    setLabel('cp-bg-opacity', 'bgOpacity', '白雾遮罩');

    var sr = byId('cp-sr-setting') && byId('cp-sr-setting').closest('label').querySelector('span');
    if (sr) sr.textContent = cpT('smartReply', '追问气囊');
    var ctx = byId('cp-context-memory-setting') && byId('cp-context-memory-setting').closest('label').querySelector('span');
    if (ctx) ctx.textContent = cpT('context', '上下文');
    var auto = byId('cp-auto-trans-setting') && byId('cp-auto-trans-setting').closest('label').querySelector('span');
    if (auto) auto.textContent = cpT('autoTranslateLast', '自动翻译最新对方消息');

    setText('cp-bg-upload-btn', 'backgroundUpload', '设置自定义背景图片');
    setText('cp-clear-history', 'clearHistory', '清空本地聊天记录');
    setText('cp-settings-close-btn', 'close', '关闭');
    setText('cp-settings-save', 'save', '保存配置');
    if (byId('cp-send-translate-toggle')) byId('cp-send-translate-toggle').setAttribute('title', cpT('translateSendTitle', '开启后：输入框内容会翻译成对方语言再发送'));
  }

  function injectRoot() {
    var existingRoot = byId("cp-chat-root");
    if (existingRoot) {
      if (byId("cp-peer-info") && byId("cp-bg-op-val") && byId("cp-settings-mask") && byId("cp-msg-list")) return;
      try {
        existingRoot.remove();
      } catch (_) {
        if (existingRoot.parentNode) existingRoot.parentNode.removeChild(existingRoot);
      }
    }

    var html = `
      <div id="cp-chat-root">
        <div class="cp-bg" id="cp-bg"></div>
        <div class="cp-bg-mask" id="cp-bg-mask"></div>

        <header class="cp-header">
          <button type="button" class="cp-header-back" id="cp-header-back" aria-label="返回">‹</button>
          <div class="cp-header-peer">
            <div class="cp-peer-avatar" id="cp-peer-avatar"></div>
            <div class="cp-header-center" id="cp-peer-info">加载中...</div>
          </div>
          <div class="cp-header-actions">
            <button id="cp-header-more" aria-label="设置"><span class="cp-more-dots">⋮</span></button>
          </div>
        </header>

        <main class="cp-main" id="cp-main">
          <div id="cp-top-spinner" class="cp-skeleton-spinner" hidden>
            <i class="fa fa-circle-o-notch"></i> 加载中...
          </div>
          <div id="cp-msg-list"></div>
          <div id="cp-bottom-anchor"></div>
        </main>

        <button id="cp-fab-bottom" class="cp-fab-bottom" title="回到底部">
          <svg class="cp-icon cp-fab-down-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12l7 7 7-7"></path></svg>
          <span id="cp-fab-badge" class="cp-fab-badge" hidden>0</span>
        </button>

        <div id="cp-context-overlay" class="cp-context-overlay" hidden>
          <div id="cp-context-menu" class="cp-context-menu"></div>
        </div>

        <footer class="cp-footer" id="cp-footer">
          <div style="text-align:center;">
            <div class="cp-translate-bar" id="cp-translate-bar">
              <button class="cp-lang-btn" id="cp-src-lang-btn">🇨🇳 中文</button>
              <button class="cp-swap-btn" id="cp-lang-swap">⇄</button>
              <button class="cp-lang-btn" id="cp-tgt-lang-btn">🇲🇲 မြန်မာစာ</button>
              <button class="cp-toggle-ai-send" id="cp-send-translate-toggle" title="开启后：输入框内容会翻译成对方语言再发送"><span class="cp-trans-wa" aria-hidden="true"><b>文</b><b>A</b></span></button>
            </div>
          </div>

          <div id="cp-wingman-panel" class="cp-wingman-panel" hidden>
            <div id="cp-wingman-analysis" class="cp-wingman-analysis"></div>
            <div id="cp-smart-replies-bar" class="cp-smart-replies-bar"></div>
          </div>

          <div id="cp-quote-preview" class="cp-quote-preview" hidden>
            <div class="cp-quote-preview-bar"></div>
            <div class="cp-quote-preview-body">
              <div class="cp-quote-preview-name" id="cp-quote-preview-name"></div>
              <div class="cp-quote-preview-text" id="cp-quote-preview-text"></div>
            </div>
            <button class="cp-quote-preview-close" id="cp-quote-close">✕</button>
          </div>

          <div class="cp-toolbar" id="cp-toolbar">
            <div id="cp-upload-progress-wrap" class="cp-progress-wrap" hidden>
              <div id="cp-upload-progress-bar" class="cp-progress-bar"></div>
            </div>

            <div id="cp-toolbar-inputs" style="display:flex;width:100%;align-items:flex-end;">
              <button id="cp-media-btn" class="cp-tool-btn"></button>
              <div class="cp-input-box" id="cp-input-box-wrap">
                <textarea id="cp-input" rows="1" placeholder="发送消息..." autocomplete="off"></textarea>
              </div>
              <button id="cp-primary-btn" class="cp-primary-btn">
                <span id="cp-primary-icon"></span>
              </button>
            </div>

            <div id="cp-rec-inline" class="cp-rec-inline" hidden>
              <button id="cp-rec-cancel" class="cp-rec-btn-icon cp-rec-cancel" aria-label="取消录音">
                ${ICON.close}
              </button>
              <div class="cp-rec-panel">
                <div class="cp-rec-topline">
                  <span class="cp-rec-dot"></span>
                  <span class="cp-rec-title">正在录音</span>
                  <span id="cp-rec-time" class="cp-rec-time">0:00</span>
                </div>
                <div class="cp-rec-bars" id="cp-rec-bars"></div>
              </div>
              <button id="cp-rec-pause" class="cp-rec-btn-icon cp-rec-pause" aria-label="暂停录音">
                ${ICON.pause}
              </button>
              <button id="cp-rec-send" class="cp-rec-btn-icon cp-rec-send" aria-label="发送语音">
                ${ICON.send}
              </button>
            </div>
          </div>

          <div class="cp-media-pop" id="cp-media-pop" hidden>
            <button id="cp-pick-camera" class="cp-media-pop-btn" type="button">
              <span class="cp-menu-ico">${ICON.camera}</span><span class="cp-menu-label">拍摄</span>
            </button>
            <button id="cp-pick-album" class="cp-media-pop-btn" type="button">
              <span class="cp-menu-ico">${ICON.album}</span><span class="cp-menu-label">相册图片/视频</span>
            </button>
          </div>
        </footer>

        <input id="cp-media-file" type="file" accept="image/*,video/*" multiple hidden />
        <input id="cp-camera-file" type="file" accept="image/*" capture="environment" hidden />
        <input id="cp-bg-file" type="file" accept="image/*" hidden />

        <div class="cp-modal-mask" id="cp-lang-mask" hidden>
          <div class="cp-modal" style="padding:20px 15px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;font-size:18px;">选择语言</h3>
              <button id="cp-lang-close" style="border:none;background:none;font-size:20px;color:#666;cursor:pointer;">✕</button>
            </div>
            <div class="cp-lang-grid" id="cp-lang-grid"></div>
          </div>
        </div>

        <div class="cp-modal-mask" id="cp-settings-mask" hidden>
          <div class="cp-modal cp-settings-v13" id="cp-settings-modal">
            <div class="cp-settings-head">
              <h3>聊天设置</h3>
              <button type="button" class="cp-settings-x" id="cp-settings-close-x" aria-label="关闭">
                ×
              </button>
            </div>

            <div class="cp-settings-body">
              <div class="cp-settings-section">
                <div class="cp-settings-section-title">🌐 翻译方式</div>
                <div class="cp-provider-tabs">
                  <button type="button" class="cp-provider-tab" id="cp-provider-google" data-provider="google">谷歌翻译</button>
                  <button type="button" class="cp-provider-tab" id="cp-provider-ai" data-provider="ai">AI 翻译</button>
                </div>

                <div id="cp-ai-pane" class="cp-ai-pane">
                  <label class="cp-setting-field">
                    <span>AI 接口 URL</span>
                    <input id="cp-ai-endpoint" type="text" placeholder="https://api.openai.com/v1" />
                  </label>
                  <label class="cp-setting-field">
                    <span>API Key</span>
                    <input id="cp-ai-key" type="password" placeholder="AI 翻译 / 僚机需要" />
                  </label>
                  <label class="cp-setting-field">
                    <span>模型</span>
                    <input id="cp-ai-model" type="text" placeholder="deepseek4flash" />
                  </label>
                </div>
              </div>

              <div class="cp-settings-section">
                <div class="cp-settings-section-title">🧠 僚机设置</div>

                <div class="cp-setting-row">
                  <label class="cp-setting-field">
                    <span>对方性别</span>
                    <select id="cp-target-gender">
                      <option>女生</option>
                      <option>男生</option>
                      <option>不指定</option>
                    </select>
                  </label>

                  <label class="cp-setting-field">
                    <span>关系阶段</span>
                    <select id="cp-relationship-stage">
                      <option>刚认识</option>
                      <option>聊过几次</option>
                      <option>有点暧昧</option>
                      <option>已约过会</option>
                    </select>
                  </label>
                </div>

                <label class="cp-setting-field">
                  <span>聊天风格</span>
                  <input id="cp-communication-style" type="text" placeholder="自然直接，偶尔幽默" />
                </label>

                <div class="cp-setting-row" style="margin-top:9px;">
                  <label class="cp-setting-toggle">
                    <span>追问气囊</span>
                    <input id="cp-sr-setting" type="checkbox" />
                  </label>
                  <label class="cp-setting-toggle">
                    <span>上下文</span>
                    <input id="cp-context-memory-setting" type="checkbox" />
                  </label>
                </div>

                <label class="cp-setting-field">
                  <span>历史轮数</span>
                  <select id="cp-context-rounds-setting">
                    <option value="10">10轮</option>
                    <option value="30">30轮</option>
                    <option value="50">50轮</option>
                    <option value="100">100轮</option>
                  </select>
                </label>
              </div>

              <div class="cp-settings-section">
                <div class="cp-settings-section-title">✨ 聊天功能</div>
                <label class="cp-setting-toggle">
                  <span>自动翻译最新对方消息</span>
                  <input id="cp-auto-trans-setting" type="checkbox" />
                </label>
              </div>

              <div class="cp-settings-section">
                <div class="cp-settings-section-title">🖼️ 背景</div>
                <button id="cp-bg-upload-btn" style="width:100%;padding:10px;background:#fff;border:1px dashed #cbd5e1;border-radius:12px;cursor:pointer;font-size:14px;">
                  设置自定义背景图片
                </button>
                <label class="cp-setting-field">
                  <span>白雾遮罩 <em id="cp-bg-op-val">85%</em></span>
                  <input id="cp-bg-opacity" type="range" min="0" max="1" step="0.05" style="accent-color:#3b82f6;" />
                </label>
              </div>

              <button id="cp-clear-history" style="width:100%;padding:10px;background:transparent;color:#ef4444;border:1px solid #ef4444;border-radius:12px;font-size:13px;cursor:pointer;margin-bottom:12px;">
                清空本地聊天记录
              </button>

              <div class="cp-settings-actions">
                <button type="button" class="cp-settings-secondary" id="cp-settings-close-btn">关闭</button>
                <button type="button" class="cp-settings-primary" id="cp-settings-save">保存配置</button>
              </div>
            </div>
          </div>
        </div>

        <div class="cp-preview-mask" id="cp-preview-mask" style="position:absolute;inset:0;z-index:2147483010;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;transition:background-color .25s ease;" hidden>
          <div id="cp-preview-body" style="transition:transform .25s;display:flex;align-items:center;justify-content:center;"></div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", html);
    try { document.body.classList.remove("cp-chat-harmony-booting"); } catch (_) {}
    applyStaticTranslations();
    cpNormalizeActionIcons();

    byId("cp-media-btn").innerHTML = ICON.photo;
    byId("cp-primary-icon").innerHTML = ICON.mic;

    var langHtml = "";

    for (var i = 0; i < LANG_LIST.length; i++) {
      langHtml +=
        '<div class="cp-lang-item" data-lang="' +
        escAttr(LANG_LIST[i].n) +
        '"><span class="cp-lang-flag">' +
        LANG_LIST[i].f +
        "</span><span>" +
        esc(LANG_LIST[i].n) +
        "</span></div>";
    }

    byId("cp-lang-grid").innerHTML = langHtml;
  }

  function clearAllMessageTranslations() {
    var lists = [state.messages || [], state.wkMessages || []];
    var changed = false;

    for (var li = 0; li < lists.length; li++) {
      var list = lists[li];

      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (!m) continue;
        if (m.translation || m.translationOpen) {
          m.translation = "";
          m.translationOpen = false;
          msgTouch(m);
          changed = true;
        }
      }
    }

    state.aiCache = {};
    state.aiCacheKeys = [];

    if (changed) incrementalRender("keep");
  }

  function bindUI() {
    var input = byId("cp-input");
    var btnPrimary = byId("cp-primary-btn");
    var mainEl = byId("cp-main");
    var fabBtn = byId("cp-fab-bottom");

    var scrollRAF = null;

    mainEl.addEventListener(
      "scroll",
      function () {
        if (scrollRAF) return;

        scrollRAF = requestAnimationFrame(function () {
          scrollRAF = null;
          handleScrollLogic(mainEl, fabBtn);
        });
      },
      { passive: true }
    );

    fabBtn.addEventListener("click", function () {
      state.unreadCount = 0;
      state.stickToBottom = true;
      updateUnreadBadge();
      mainEl.scrollTo({ top: mainEl.scrollHeight, behavior: "smooth" });
    });

    input.addEventListener("focus", function () {
      clearWingmanPanel();
    });

    input.addEventListener("click", function () {
      clearWingmanPanel();
    });

    input.addEventListener("input", function () {
      clearWingmanPanel();
      this.style.height = "42px";
      this.style.height = Math.min(this.scrollHeight, 118) + "px";
      updatePrimaryButton();
      updateFooterHeight();
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handlePrimaryAction();
        this.style.height = "42px";
        updateFooterHeight();
      }
    });

    btnPrimary.addEventListener("click", function () {
      handlePrimaryAction();
      input.style.height = "42px";
      updateFooterHeight();
    });

    byId("cp-media-btn").addEventListener("click", function () {
      var pop = byId("cp-media-pop");
      pop.hidden = !pop.hidden;
    });

    byId("cp-pick-camera").addEventListener("click", function (ev) {
      ev.preventDefault();
      byId("cp-media-pop").hidden = true;
      var input = byId("cp-camera-file");
      if (input) {
        input.value = "";
        input.click();
      }
    });

    byId("cp-pick-album").addEventListener("click", function (ev) {
      ev.preventDefault();
      byId("cp-media-pop").hidden = true;
      var input = byId("cp-media-file");
      if (input) {
        input.value = "";
        input.click();
      }
    });

    byId("cp-camera-file").addEventListener("change", onPickMedia);
    byId("cp-media-file").addEventListener("change", onPickMedia);
    byId("cp-quote-close").addEventListener("click", hideQuoteBar);

    byId("cp-send-translate-toggle").addEventListener("click", function () {
      state.cfg.sendTranslateEnabled = !state.cfg.sendTranslateEnabled;
      saveJSON(KEY_CFG, state.cfg);
      syncTranslateBar();
      toast(state.cfg.sendTranslateEnabled ? cpT("enabledTranslateSend", "译发已开启") : cpT("disabledTranslateSend", "译发已关闭"));
    });

    byId("cp-lang-swap").addEventListener("click", function () {
      var a = state.cfg.sourceLang;
      state.cfg.sourceLang = state.cfg.targetLang;
      state.cfg.targetLang = a;
      syncTranslateBar();
      saveJSON(KEY_CFG, state.cfg);
      clearWingmanPanel();
    });

    byId("cp-src-lang-btn").addEventListener("click", function () {
      state.pickingLangFor = "source";
      cpSetModalVisible(byId("cp-lang-mask"), true);
    });

    byId("cp-tgt-lang-btn").addEventListener("click", function () {
      state.pickingLangFor = "target";
      cpSetModalVisible(byId("cp-lang-mask"), true);
    });

    byId("cp-lang-close").addEventListener("click", function () {
      cpSetModalVisible(byId("cp-lang-mask"), false);
    });

    byId("cp-lang-grid").addEventListener("click", function (e) {
      var item = e.target.closest(".cp-lang-item");
      if (!item) return;

      var lang = item.getAttribute("data-lang");

      if (state.pickingLangFor === "source") state.cfg.sourceLang = lang;
      else state.cfg.targetLang = lang;

      syncTranslateBar();
      clearAllMessageTranslations();
      saveJSON(KEY_CFG, state.cfg);
      cpSetModalVisible(byId("cp-lang-mask"), false);
      clearWingmanPanel();
    });

    byId("cp-bg-upload-btn").addEventListener("click", function () {
      byId("cp-bg-file").click();
    });

    byId("cp-bg-file").addEventListener("change", handleBackgroundUpload);

    byId("cp-bg-opacity").addEventListener("input", function (e) {
      var bgOpVal = byId("cp-bg-op-val");
      if (bgOpVal) bgOpVal.innerText = Math.round(e.target.value * 100) + "%";
      state.bg.opacity = parseFloat(e.target.value);
      applyBackground();
    });

    byId("cp-provider-google").addEventListener("click", function () {
      setTranslateProvider("google");
    });

    byId("cp-provider-ai").addEventListener("click", function () {
      setTranslateProvider("ai");
    });

    byId("cp-settings-close-btn").addEventListener("click", function () {
      closeSettings(false);
    });

    byId("cp-settings-close-x").addEventListener("click", function () {
      closeSettings(false);
    });

    byId("cp-settings-save").addEventListener("click", saveSettings);

    byId("cp-header-more").addEventListener("click", function (e) {
      e.stopPropagation();
      openSettings();
    });

    byId("cp-header-back").addEventListener("click", function () {
      if (history.length > 1) history.back();
      else location.href = (window.config && config.relative_path ? config.relative_path : "") + "/chats";
    });

    byId("cp-clear-history").addEventListener("click", clearChatHistory);

    function closeOnMaskClick(e) {
      if (e.target === this) {
        if (this.id === "cp-settings-mask") closeSettings(false);
        else cpSetModalVisible(this, false);
      }
    }

    byId("cp-lang-mask").addEventListener("click", closeOnMaskClick);
    byId("cp-settings-mask").addEventListener("click", closeOnMaskClick);

    var list = byId("cp-msg-list");
    list.addEventListener("click", onListClick);

    var longPressTimer = null;
    var longPressStart = null;

    list.addEventListener(
      "touchstart",
      function (e) {
        var bubble = e.target.closest(".cp-bubble");
        if (!bubble || bubble.classList.contains("media-shell")) return;

        var row = bubble.closest(".cp-row");
        if (!row) return;

        longPressStart = e.touches && e.touches[0] ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;

        longPressTimer = setTimeout(function () {
          showContextMenu(row.getAttribute("data-id"));
          longPressTimer = null;
        }, 430);
      },
      { passive: true }
    );

    list.addEventListener(
      "touchmove",
      function (e) {
        if (!longPressTimer || !longPressStart || !e.touches || !e.touches[0]) return;

        var dx = Math.abs(e.touches[0].clientX - longPressStart.x);
        var dy = Math.abs(e.touches[0].clientY - longPressStart.y);

        if (dx > 10 || dy > 10) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      },
      { passive: true }
    );

    ["touchend", "touchcancel"].forEach(function (name) {
      list.addEventListener(
        name,
        function () {
          if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        },
        { passive: true }
      );
    });

    list.addEventListener("contextmenu", function (e) {
      var bubble = e.target.closest(".cp-bubble");
      if (!bubble || bubble.classList.contains("media-shell")) return;

      var row = bubble.closest(".cp-row");
      if (!row) return;

      e.preventDefault();
      showContextMenu(row.getAttribute("data-id"));
    });

    byId("cp-context-overlay").addEventListener("click", function (e) {
      if (e.target === this) hideContextMenu();
    });

    state.docClickHandler = function (e) {
      var pop = byId("cp-media-pop");

      if (pop && !pop.hidden && !e.target.closest("#cp-media-pop") && !e.target.closest("#cp-media-btn")) {
        pop.hidden = true;
      }
    };

    document.addEventListener("click", state.docClickHandler);

    var pMask = byId("cp-preview-mask");
    var pBody = byId("cp-preview-body");
    var touchStartY = 0;
    var touchCurrentY = 0;

    pMask.addEventListener("click", function (e) {
      if (e.target === this) closePreview();
    });

    pMask.addEventListener(
      "touchstart",
      function (e) {
        if (e.touches.length === 1) {
          touchStartY = e.touches[0].clientY;
          touchCurrentY = touchStartY;
          pBody.style.transition = "none";
        }
      },
      { passive: true }
    );

    pMask.addEventListener(
      "touchmove",
      function (e) {
        if (e.touches.length === 1 && touchStartY > 0) {
          touchCurrentY = e.touches[0].clientY;
          var diff = touchCurrentY - touchStartY;

          if (diff > 0) {
            pBody.style.transform = "translateY(" + diff + "px) scale(" + (1 - diff / 2000) + ")";
            pMask.style.backgroundColor = "rgba(0,0,0," + Math.max(0, 0.9 - diff / 500) + ")";
          }
        }
      },
      { passive: true }
    );

    pMask.addEventListener(
      "touchend",
      function () {
        if (touchStartY > 0) {
          var diff = touchCurrentY - touchStartY;
          pBody.style.transition = "all .25s";

          if (diff > 100) closePreview();
          else {
            pBody.style.transform = "";
            pMask.style.backgroundColor = "rgba(0,0,0,.9)";
          }
        }

        touchStartY = 0;
        touchCurrentY = 0;
      },
      { passive: true }
    );

    // 修复：popstate 处理时 hidden 状态先变更，避免 history.back 死循环
    state.popHandler = function () {
      if (state.previewOpen) {
        closePreview(true);
        return;
      }
      if (state.settingsOpen) {
        closeSettings(true);
        return;
      }
    };

    window.addEventListener("popstate", state.popHandler);

    byId("cp-context-menu").addEventListener("click", onContextMenuClick);
    byId("cp-smart-replies-bar").addEventListener("click", onSmartReplyClick);

    byId("cp-rec-cancel").addEventListener("click", function () {
      stopRecording(false);
    });

    byId("cp-rec-send").addEventListener("click", function () {
      stopRecording(true);
    });

    byId("cp-rec-pause").addEventListener("click", togglePauseRecording);

    state.vvHandler = handleViewport;

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", state.vvHandler, { passive: true });
      window.visualViewport.addEventListener("scroll", state.vvHandler, { passive: true });
    }

    handleViewport();
    updateFooterHeight();
  }

  function bindSelectBlockers() {
    if (state.selectBlockersBound) return;
    state.selectBlockersBound = true;

    var block = function (e) {
      var root = byId("cp-chat-root");
      if (!root || !root.contains(e.target)) return;
      if (e.target.closest("textarea,input,select")) return;
      if (e.target.closest(".cp-text,.cp-translation-text,.cp-rendered-text,.cp-bubble a")) return;
      if (e.target.closest("a,button,video,audio")) return;
      e.preventDefault();
      return false;
    };

    // 不再拦截 copy，允许用户复制聊天文本、链接、电话。
    document.addEventListener("selectstart", block, true);
    document.addEventListener("dragstart", block, true);
  }

  function openSettings() {
    var mask = byId("cp-settings-mask");
    cpSetModalVisible(mask, true);
    state.settingsOpen = true;
    try {
      history.pushState({ cpSettings: true }, "", location.href);
    } catch (_) {}
  }

  function closeSettings(fromPopState) {
    if (!state.settingsOpen && !(byId("cp-settings-mask") && byId("cp-settings-mask").classList.contains("is-open"))) return;

    state.settingsOpen = false;
    cpSetModalVisible(byId("cp-settings-mask"), false);

    if (!fromPopState) {
      try {
        history.back();
      } catch (_) {}
    }
  }

  function showQuoteBar(msg) {
    state.quoteTarget = msg;

    byId("cp-quote-preview-name").textContent = msg.username || "未知";
    byId("cp-quote-preview-text").textContent = msg.text || msg.html || "";
    byId("cp-quote-preview").hidden = false;
    byId("cp-input").focus();

    updateFooterHeight();
  }

  function hideQuoteBar() {
    state.quoteTarget = null;
    byId("cp-quote-preview").hidden = true;
    updateFooterHeight();
  }

  function updateFooterHeight() {
    if (footerHeightTimer) clearTimeout(footerHeightTimer);

    footerHeightTimer = setTimeout(function () {
      var footer = byId("cp-footer");
      var root = byId("cp-chat-root");

      if (!footer || !root) return;

      var wasAtBottom = state.stickToBottom;
      var h = Math.max(110, Math.ceil(footer.offsetHeight || 110));
      root.style.setProperty("--cp-footer-h", h + "px");

      // 修复：footer 高度变化（如僚机面板展开）后，若用户原本在底部，保持在底部
      if (wasAtBottom) {
        requestAnimationFrame(forceScrollToBottom);
      }
    }, 0);
  }

  function handleViewport() {
    var vv = window.visualViewport;
    var offset = 0;

    if (vv) offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);

    var footer = byId("cp-footer");
    if (footer) footer.style.bottom = offset + "px";

    updateFooterHeight();
  }

  function setTranslateProvider(provider) {
    state.cfg.translateProvider = "ai";
    syncProviderUI();
    syncTranslateBar();
    saveJSON(KEY_CFG, state.cfg);
  }

  function getProvider() {
    return "ai";
  }

  function syncProviderUI() {
    var provider = getProvider();
    var google = byId("cp-provider-google");
    var ai = byId("cp-provider-ai");
    var pane = byId("cp-ai-pane");

    if (google) { google.classList.remove("active"); google.hidden = true; google.style.display = "none"; }
    if (ai) ai.classList.add("active");
    if (pane) pane.classList.add("show");
  }

  function syncSettingsUI() {
    state.cfg = normalizeConfig(state.cfg);

    function setValue(id, value) {
      var el = byId(id);
      if (el) el.value = value;
    }

    function setChecked(id, value) {
      var el = byId(id);
      if (el) el.checked = !!value;
    }

    var endpoint = byId("cp-ai-endpoint");
    var key = byId("cp-ai-key");
    var model = byId("cp-ai-model");

    if (endpoint) endpoint.value = state.cfg.ai.endpoint || "";
    if (key) key.value = state.cfg.ai.apiKey || "";
    if (model) model.value = state.cfg.ai.model || "deepseek4flash";

    setChecked("cp-sr-setting", state.cfg.smartReplyEnabled);
    setChecked("cp-auto-trans-setting", state.cfg.autoTranslateLastMsg);
    setChecked("cp-context-memory-setting", state.cfg.contextMemoryEnabled);
    setValue("cp-context-rounds-setting", String(state.cfg.contextRounds || 30));
    setValue("cp-target-gender", state.cfg.targetGender || "女生");
    setValue("cp-relationship-stage", state.cfg.relationshipStage || "刚认识");
    setValue("cp-communication-style", state.cfg.communicationStyle || "自然直接，偶尔幽默");

    var op = state.bg.opacity !== undefined ? state.bg.opacity : 0.85;
    setValue("cp-bg-opacity", op);

    var bgOpVal = byId("cp-bg-op-val");
    if (bgOpVal) bgOpVal.innerText = Math.round(op * 100) + "%";

    syncProviderUI();
    syncTranslateBar();
  }

  function syncTranslateBar() {
    var src = byId("cp-src-lang-btn");
    var tgt = byId("cp-tgt-lang-btn");

    if (src) src.innerHTML = getFlag(state.cfg.sourceLang) + " " + esc(state.cfg.sourceLang);
    if (tgt) tgt.innerHTML = getFlag(state.cfg.targetLang) + " " + esc(state.cfg.targetLang);

    var toggleBtn = byId("cp-send-translate-toggle");

    if (toggleBtn) {
      if (state.cfg.sendTranslateEnabled) toggleBtn.classList.add("active");
      else toggleBtn.classList.remove("active");
    }

    syncProviderUI();
  }

  function saveSettings() {
    function checked(id, fallback) {
      var el = byId(id);
      return el ? !!el.checked : !!fallback;
    }
    function value(id, fallback) {
      var el = byId(id);
      return el && el.value != null ? String(el.value) : String(fallback || "");
    }

    state.cfg.smartReplyEnabled = checked("cp-sr-setting", state.cfg.smartReplyEnabled);
    state.cfg.autoTranslateLastMsg = checked("cp-auto-trans-setting", state.cfg.autoTranslateLastMsg);
    state.cfg.contextMemoryEnabled = checked("cp-context-memory-setting", state.cfg.contextMemoryEnabled);
    state.cfg.contextRounds = Number(value("cp-context-rounds-setting", state.cfg.contextRounds || 30)) || 30;
    state.cfg.targetGender = value("cp-target-gender", state.cfg.targetGender || "女生") || "女生";
    state.cfg.relationshipStage = value("cp-relationship-stage", state.cfg.relationshipStage || "刚认识") || "刚认识";
    state.cfg.communicationStyle = value("cp-communication-style", state.cfg.communicationStyle || "自然直接，偶尔幽默").trim() || "自然直接，偶尔幽默";

    state.cfg.translateProvider = "ai";
    state.cfg.ai.endpoint = value("cp-ai-endpoint", state.cfg.ai.endpoint || "").trim();
    state.cfg.ai.apiKey = value("cp-ai-key", state.cfg.ai.apiKey || "").trim();
    state.cfg.ai.model = value("cp-ai-model", state.cfg.ai.model || "deepseek4flash").trim() || "deepseek4flash";
    state.cfg.ai.temperature = 0.3;

    state.bg.opacity = Math.max(0, Math.min(1, parseFloat(value("cp-bg-opacity", state.bg.opacity !== undefined ? state.bg.opacity : 0.85)) || 0.85));
    state.cfg.voiceMaxDuration = Math.max(5, Math.min(180, Number(state.cfg.voiceMaxDuration || 60) || 60));

    saveJSON(KEY_CFG, state.cfg);
    saveJSON(KEY_BG, state.bg);

    applyBackground();
    syncTranslateBar();
    clearWingmanPanel();
    closeSettings(false);
    toast(cpT("saved", "配置已保存"));
  }

  function getFlag(langName) {
    for (var i = 0; i < LANG_LIST.length; i++) {
      if (LANG_LIST[i].n === langName) return LANG_LIST[i].f;
    }

    return "🌐";
  }

  function updateUnreadBadge() {
    var badge = byId("cp-fab-badge");
    var fabBtn = byId("cp-fab-bottom");

    if (!badge || !fabBtn) return;

    if (state.unreadCount > 0) {
      badge.textContent = state.unreadCount > 99 ? "99+" : state.unreadCount;
      badge.hidden = false;
      fabBtn.classList.add("show");
    } else {
      badge.hidden = true;
    }
  }

  function markVisibleAsRead() {
    if (!state.wkReady || !window.wk) return;

    var main = byId("cp-main");
    if (!main) return;

    var unreadList = [];
    var viewTop = main.scrollTop;
    var viewBottom = viewTop + main.clientHeight;
    var nodes = document.querySelectorAll(".cp-row.other");

    nodes.forEach(function (n) {
      var top = n.offsetTop;
      var bottom = top + n.offsetHeight;

      if (bottom > viewTop && top < viewBottom) {
        var msg = getMsgById(n.getAttribute("data-id"));

        if (msg && msg.wkMsg && !msg.read) {
          msg.read = true;
          unreadList.push(msg.wkMsg);
        }
      }
    });

    if (!unreadList.length) return;

    try {
      var ch = new window.wk.Channel(getPeerUid(), 1);
      window.wk.WKSDK.shared().receiptManager.addReceiptMessages(ch, unreadList);
    } catch (e) {
      warn("mark-read", e);
    }
  }

  function handleScrollLogic(mainEl, fabBtn) {
    var atBottom = mainEl.scrollHeight - mainEl.scrollTop - mainEl.clientHeight < BOTTOM_THRESHOLD;

    // 修复：跟踪 stickToBottom 状态
    state.stickToBottom = atBottom;

    var isScrolledUp = !atBottom;

    if (isScrolledUp || state.unreadCount > 0) fabBtn.classList.add("show");
    else fabBtn.classList.remove("show");

    if (atBottom && state.unreadCount > 0) {
      state.unreadCount = 0;
      updateUnreadBadge();
    }

    clearTimeout(state.readTimer);
    state.readTimer = setTimeout(markVisibleAsRead, 300);

    if (mainEl.scrollTop < 300 && !state.loadingOldHistory && !state.noMoreOldHistory) {
      var allLen = state.messages.length + state.wkMessages.length;

      if (state.renderLimit < allLen) {
        state.loadingOldHistory = true;
        state.isPreloading = true;
        byId("cp-top-spinner").hidden = false;

        setTimeout(function () {
          state.renderLimit += 80;
          state.loadingOldHistory = false;
          state.isPreloading = false;
          byId("cp-top-spinner").hidden = true;
          incrementalRender("prepend");
        }, 80);
      } else {
        var peerUid = getPeerUid();
        if (!peerUid) return;

        var oldestSeq = Number.MAX_SAFE_INTEGER;

        for (var i = 0; i < state.wkMessages.length; i++) {
          if (state.wkMessages[i].seq && state.wkMessages[i].seq < oldestSeq && state.wkMessages[i].seq > 0) {
            oldestSeq = state.wkMessages[i].seq;
          }
        }

        if (oldestSeq !== Number.MAX_SAFE_INTEGER && oldestSeq > 1) fetchWukongHistory(peerUid, oldestSeq - 1);
        else {
          state.noMoreOldHistory = true;
          state.hasNoMoreHistory = true;
        }
      }
    }

    if (state.mounted && getPeerUid()) state.scrollCache[getPeerUid()] = mainEl.scrollTop;
    cpScheduleVirtualRender();
  }

  function showContextMenu(msgId) {
    var msg = getMsgById(msgId);
    if (!msg) return;

    state.contextMsg = msg;

    var menu = byId("cp-context-menu");
    var html =
      '<div class="cp-menu-item" data-action="quote">' + esc(cpT("quote", "引用")) + '</div>' +
      '<div class="cp-menu-item" data-action="translate">' + esc(cpT("translate", "翻译")) + '</div>';

    if (msg.mine) html += '<div class="cp-menu-item danger" data-action="recall">' + esc(cpT("recall", "撤回")) + '</div>';

    html += '<div class="cp-menu-item danger" data-action="delete">' + esc(cpT("delete", "删除")) + '</div>';

    menu.innerHTML = html;
    byId("cp-context-overlay").hidden = false;
  }

  function hideContextMenu() {
    byId("cp-context-overlay").hidden = true;
    state.contextMsg = null;
  }

  function onContextMenuClick(e) {
    var item = e.target.closest(".cp-menu-item");
    if (!item || !state.contextMsg) return;

    var action = item.getAttribute("data-action");

    if (action === "quote") {
      showQuoteBar(state.contextMsg);
      updatePrimaryButton();
    } else if (action === "translate") {
      executePeerTranslateAndWingman(state.contextMsg, { forceOpen: true });
    } else if (action === "recall") {
      recallMessage(state.contextMsg.id);
    } else if (action === "delete") {
      deleteMessage(state.contextMsg.id);
    }

    hideContextMenu();
  }

  async function recallMessage(id) {
    var msg = getMsgById(id);
    if (!msg) return;

    var seq = msg.wkMsg ? msg.wkMsg.messageSeq || msg.wkMsg.message_seq : 0;
    var clientMsgNo = msg.wkMsg ? msg.wkMsg.clientMsgNo || msg.wkMsg.client_msg_no : "";
    var msgId = msg.wkMsg ? msg.wkMsg.messageID || msg.wkMsg.message_id : "";

    if (msg.wkMsg) {
      try {
        var apiBase = cpPluginConfig().apiBase || "/api/wukong";
        var revokeBody = JSON.stringify({
          channel_id: getPeerUid(),
          message_seq: seq,
          client_msg_no: clientMsgNo,
          message_id: msgId
        });
        var revokeUrls = [apiBase + "/revoke", "/bridge/revoke"];
        var revoked = false;
        for (var ri = 0; ri < revokeUrls.length; ri++) {
          var res = await fetch(revokeUrls[ri], {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: revokeBody
          });
          if (res.ok) { revoked = true; break; }
        }

        if (!revoked) throw new Error("revoke route failed");
      } catch (e) {
        warn("revoke-bridge", e);

        if (window.wk && window.wk.WKSDK.shared().chatManager.send) {
          try {
            var channel = new window.wk.Channel(getPeerUid(), 1);
            var revokeContent = new window.wk.MessageText("撤回消息请求");

            revokeContent.encode = function () {
              return JSON.stringify({
                type: 1006,
                message_id: msgId,
                client_msg_no: clientMsgNo,
                content: "此消息已被撤回"
              });
            };

            window.wk.WKSDK.shared().chatManager.send(revokeContent, channel);
          } catch (ex) {
            warn("revoke-fallback", ex);
          }
        }
      }
    }

    msg.recalled = true;
    msg.text = "此消息已被撤回";
    msgTouch(msg);

    incrementalRender("keep");
    toast("撤回成功");
  }

  async function deleteMessage(id) {
    var msg = getMsgById(id);
    if (!msg) return;

    if (msg.wkMsg && window.wk && window.wk.WKSDK.shared().chatManager.deleteMessage) {
      try {
        await window.wk.WKSDK.shared().chatManager.deleteMessage(msg.wkMsg);
      } catch (e) {
        warn("wk-delete", e);
      }
    }

    state.wkMessages = state.wkMessages.filter(function (m) {
      return String(m.id) !== String(id);
    });

    state.renderVersion++;
    state.mergedDirty = true;
    state.msgIndexDirty = true;

    incrementalRender("keep");
    toast("删除成功");
  }

  async function clearChatHistory() {
    var peerUid = getPeerUid();
    if (!peerUid) return;

    if (!confirm("确定要清空与该用户的所有本地记录吗？")) return;

    state.wkMessages = [];
    state.messages = [];
    state.renderVersion++;
    state.mergedDirty = true;
    state.msgIndexDirty = true;
    state.localMaxSeq = 0;
    state.noMoreOldHistory = true;
    state.hasNoMoreHistory = true;

    await idbDelete("chats", getPeerPersistKey(peerUid));
    await persistChatToDB(peerUid);

    if (window.wk && window.wk.WKSDK.shared().conversationManager && window.wk.WKSDK.shared().conversationManager.clearConversationMessages) {
      try {
        var ch = new window.wk.Channel(peerUid, 1);
        window.wk.WKSDK.shared().conversationManager.clearConversationMessages(ch);
      } catch (e) {
        warn("clear-history-wk", e);
      }
    }

    closeSettings(false);
    clearWingmanPanel();
    incrementalRender("bottom");
    toast("已清空记录");
  }

  function mountNativeObserver() {
    if (!state.mounted) return;

    var root = document.querySelector('[component="chat/messages"]');

    if (!root) {
      if (state.nativeObserverRetryTimer) clearTimeout(state.nativeObserverRetryTimer);
      state.nativeObserverRetryTimer = setTimeout(mountNativeObserver, 500);
      return;
    }

    if (state.observer) state.observer.disconnect();

    state.observer = new MutationObserver(function () {
      scheduleSync();
    });

    state.observer.observe(root, { childList: true, subtree: true });
  }

  function scheduleSync() {
    if (state.syncScheduled) return;

    state.syncScheduled = true;

    setTimeout(function () {
      state.syncScheduled = false;
      syncFromNative();
    }, 80);
  }

  function syncFromNative() {
    // Wukong is the only trusted message channel. NodeBB DOM is used only to hydrate
    // route/user/avatar information so refreshes do not show a numeric or fallback avatar.
    var rootRows = Array.prototype.slice.call(document.querySelectorAll('[component="chat/messages"] [component="chat/message"]'));
    var peerMsg = null;

    for (var idx = 0; idx < rootRows.length; idx++) {
      var row = rootRows[idx];
      if (row.getAttribute("data-self") === "1") continue;
      var uid = row.getAttribute("data-uid") || "";
      var userLink = row.querySelector(".message-header a[href*='/user/']");
      var username = row.querySelector(".chat-user-name") ? row.querySelector(".chat-user-name").textContent.trim() : "";
      var userslug = "";
      var avatarWrap = row.querySelector(".message-header img.chat-user-avatar, .message-header .avatar, .message-header .user-icon");
      var picture = avatarWrap && avatarWrap.tagName === "IMG" ? avatarWrap.getAttribute("src") : "";

      if (userLink && userLink.getAttribute("href")) {
        var sm = userLink.getAttribute("href").match(/\/user\/([^/?#]+)/);
        if (sm) userslug = sm[1];
      }

      if (uid || username || userslug || picture) {
        setPeerFromUser({ uid: uid, username: username, userslug: userslug, picture: picture });
        peerMsg = { uid: uid, username: username, userslug: userslug, avatarHtml: getAvatarHtml(uid, username, picture ? '<img class="avatar" src="' + escAttr(picture) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />' : null) };
        break;
      }
    }

    if (peerMsg) {
      updateHeaderPeerInfo(peerMsg);
      cpHydratePeerMessagesFromCache();
      state.renderVersion++;
      state.mergedDirty = true;
      state.msgIndexDirty = true;
      incrementalRender("keep");
    } else {
      updateHeaderPeerInfo(null);
    }

    ensurePeerLoaded(state.mountGeneration);
  }

  function parseNativeMessage(row) {
    var id = row.getAttribute("data-mid") || row.getAttribute("data-id") || "m_" + Math.random().toString(36).slice(2, 8);
    var mine = row.getAttribute("data-self") === "1";
    var ts = Number(row.getAttribute("data-timestamp")) || Date.now();
    var msgUid = mine ? state.myUid : row.getAttribute("data-uid") || "";

    var avatarWrap = row.querySelector(".message-header .avatar, .message-header img.chat-user-avatar, .message-header .user-icon");
    var parsedAvatarHtml = avatarWrap ? avatarWrap.cloneNode(true).outerHTML : null;

    var userLink = row.querySelector(".message-header a[href*='/user/']");
    var username = row.querySelector(".chat-user-name") ? row.querySelector(".chat-user-name").textContent.trim() : "";
    var userslug = "";

    if (userLink && userLink.getAttribute("href")) {
      var sm = userLink.getAttribute("href").match(/\/user\/([^/?#]+)/);
      if (sm) userslug = sm[1];
    }

    if (!userslug && username) userslug = encodeURIComponent(String(username).toLowerCase().replace(/ /g, "-"));

    var finalAvatarHtml = getAvatarHtml(msgUid, username, parsedAvatarHtml);
    var body = row.querySelector(".message-body");
    if (!body) return null;

    var quoteNode = row.querySelector('[component="chat/message/parent"]');
    var quoteText = "";
    var quoteUser = "";

    if (quoteNode) {
      var quoteContentNode = quoteNode.querySelector('[component="chat/message/parent/content"]');
      quoteText = quoteContentNode ? quoteContentNode.textContent.trim() : quoteNode.textContent.trim();

      var quoteUserNode = quoteNode.querySelector(".chat-user-name, .username, a[href*='/user/']");
      if (quoteUserNode) quoteUser = quoteUserNode.textContent.trim();
    }

    var clone = body.cloneNode(true);

    clone.querySelectorAll('[component="chat/message/parent"]').forEach(function (n) {
      n.remove();
    });

    var mediaImages = [];

    clone.querySelectorAll("img").forEach(function (img) {
      if (isEmojiImg(img)) return;
      var src = img.getAttribute("src");
      if (src) mediaImages.push(src);
    });

    var plainText = getMessagePlainText(clone).trim();

    // NodeBB 原生消息里如果出现通话信令，也不要同步进自定义聊天窗口
    if (isCallSignalText(plainText)) {
      if (id) state.suppressNativeIds[String(id)] = true;
      return null;
    }

    var htmlText = getRenderableHtml(clone);

    if (mine && shouldSuppressNativeText(plainText, id)) {
      return null;
    }

    var msg = {
      id: String(id),
      mine: mine,
      ts: ts,
      avatarHtml: finalAvatarHtml,
      username: username,
      userslug: userslug,
      uid: msgUid,
      type: "text",
      text: plainText,
      html: htmlText,
      quote: quoteText,
      quoteUser: quoteUser,
      recalled: /已被撤回|此消息已被撤回/.test(plainText),
      durationStr: "",
      serverText: plainText,
      _ver: 1
    };

    if (msg.recalled) {
      msg.text = "此消息已被撤回";
      msg.html = "";
      return msg;
    }

    if (mediaImages.length > 1) {
      msg.type = "gallery";
      msg.items = mediaImages.slice(0, 9).map(function (u) {
        return { url: u };
      });
      msg.text = "[图片集]";
      msg.html = "";
      return msg;
    }

    if (mediaImages.length === 1) {
      msg.type = "image";
      msg.mediaUrl = mediaImages[0];
      msg.text = "[图片]";
      msg.html = "";
      return msg;
    }

    var a = clone.querySelector("a[href]");

    if (a) {
      var href = a.getAttribute("href") || "";

      if (/\.(webm|m4a|mp3|ogg)(?:\?|#|$)/i.test(href)) {
        msg.type = "voice";
        msg.audioUrl = href;
        msg.text = "[语音]";
        msg.html = "";
        return msg;
      }

      if (/\.(mp4|mov|m4v|webm)(?:\?|#|$)/i.test(href)) {
        msg.type = "video";
        msg.mediaUrl = href;
        msg.text = "[视频]";
        msg.html = "";
        return msg;
      }

      if (/\.(png|jpe?g|gif|webp|bmp)(?:\?|#|$)/i.test(href)) {
        msg.type = "image";
        msg.mediaUrl = href;
        msg.text = "[图片]";
        msg.html = "";
        return msg;
      }
    }

    return msg;
  }

  function incrementalRender(mode) {
    if (state.renderPending) return;

    state.renderPending = true;

    requestAnimationFrame(function () {
      state.renderPending = false;
      doIncrementalRender(mode);
    });
  }

  function formatDateDivider(ts) {
    var d = new Date(ts);
    var now = new Date();

    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var diff = Math.floor((today - msgDay) / (1000 * 60 * 60 * 24));

    if (diff === 0) return "今天";
    if (diff === 1) return "昨天";
    if (diff === 2) return "前天";

    if (d.getFullYear() === now.getFullYear()) {
      return d.getMonth() + 1 + "月" + d.getDate() + "日";
    }

    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  function buildNodeHash(m, isLastInGroup) {
    return [
      m.id || "",
      m._ver || 0,
      m.recalled ? "R" : "",
      m.translationOpen ? "T" : "",
      isLastInGroup ? "L" : "",
      m.durationStr || "",
      m.pendingLocal ? "P" : "",
      m.failedLocal ? "F" : "",
      m.text || "",
      m.mediaUrl || "",
      m.audioUrl || "",
      m.translation || "",
      m.serverText || ""
    ].join("|");
  }

  function buildTranslationAreaHtml(m) {
    if (!m.translation || !m.translationOpen) return "";

    var isLoading = m.translation === "翻译中...";
    var isError = /^翻译失败/.test(m.translation || "");

    return (
      '<div class="cp-translation-wrap">' +
        '<div class="cp-translation-text' +
          (isError ? " is-error" : "") +
          '"' +
          (isError ? ' data-act="retry-translate"' : ' data-act="collapse-translation"') +
        ">" +
          (isLoading ? "⏳ " : "✨ ") +
          esc(m.translation) +
          (isError ? "（点此重试）" : "") +
        "</div>" +
      "</div>"
    );
  }


  function cpMsgEstimatedHeight(m) {
    if (!m) return 56;
    var id = String(m.id || "");
    if (state.heightMap && state.heightMap[id]) return state.heightMap[id];

    if (m.type === "image") return 260;
    if (m.type === "video") return 280;
    if (m.type === "gallery") return 320;
    if (m.type === "voice") return 76;
    if (m.type === "call") return 52;
    if (m.recalled) return 44;

    var text = String(m.text || m.serverText || "");
    var lines = Math.max(1, Math.ceil(text.length / 18));
    return Math.min(240, 48 + lines * 22 + (m.quote ? 56 : 0) + (m.translationOpen ? 44 : 0));
  }

  function cpRangeHeight(arr, start, end) {
    var total = 0;
    for (var i = start; i < end; i++) total += cpMsgEstimatedHeight(arr[i]);
    return total;
  }

  function cpComputeVirtualWindow(arr, main, mode) {
    var len = arr ? arr.length : 0;
    var buffer = 10;
    var minVirtual = 180;

    if (!len || len <= minVirtual || !main || !main.clientHeight) {
      return { enabled: false, start: 0, end: len, topHeight: 0, bottomHeight: 0, messages: arr || [] };
    }

    // Do not disable virtualization just because media exists. Media heights are
    // estimated conservatively and corrected by ResizeObserver, otherwise long
    // chats with many videos/images can render thousands of DOM nodes.

    var viewportTop = Math.max(0, main.scrollTop || 0);
    var viewportBottom = viewportTop + Math.max(main.clientHeight || 0, 500);

    if (mode === "bottom" || mode === "restore") {
      var lastStart = Math.max(0, len - 110);
      return {
        enabled: true,
        start: lastStart,
        end: len,
        topHeight: cpRangeHeight(arr, 0, lastStart),
        bottomHeight: 0,
        messages: arr.slice(lastStart)
      };
    }

    var y = 0;
    var start = 0;
    var end = len;

    for (var i = 0; i < len; i++) {
      var h = cpMsgEstimatedHeight(arr[i]);
      if (y + h >= viewportTop) {
        start = Math.max(0, i - buffer);
        break;
      }
      y += h;
    }

    y = 0;
    for (var j = 0; j < len; j++) {
      y += cpMsgEstimatedHeight(arr[j]);
      if (y >= viewportBottom) {
        end = Math.min(len, j + 1 + buffer);
        break;
      }
    }

    if (end <= start) end = Math.min(len, start + 50);
    if (end - start > 140) end = Math.min(len, start + 140);

    return {
      enabled: true,
      start: start,
      end: end,
      topHeight: cpRangeHeight(arr, 0, start),
      bottomHeight: cpRangeHeight(arr, end, len),
      messages: arr.slice(start, end)
    };
  }

  function cpObserveMessageHeight(node, id) {
    if (!node || !id || typeof ResizeObserver === "undefined") return;

    state.heightMap = state.heightMap || {};
    state.heightObserved = state.heightObserved || {};
    if (state.heightObserved[id] === node) return;

    if (!state.heightObserver) {
      state.heightObserver = new ResizeObserver(function (entries) {
        var changed = false;

        entries.forEach(function (entry) {
          var el = entry.target;
          var mid = el && el.getAttribute && el.getAttribute("data-id");
          if (!mid || mid.indexOf("__v") === 0 || mid.indexOf("sep_") === 0) return;

          var height = Math.ceil((entry.contentRect && entry.contentRect.height) || el.offsetHeight || 0);
          if (height > 0 && Math.abs((state.heightMap[mid] || 0) - height) > 2) {
            state.heightMap[mid] = height;
            changed = true;
          }
        });

        if (changed && state.mounted) cpScheduleVirtualRender();
      });
    }

    state.heightObserved[id] = node;
    try { state.heightObserver.observe(node); } catch (_) {}
  }

  function cpScheduleVirtualRender() {
    if (state.virtualRenderPending || state.renderPending) return;
    state.virtualRenderPending = true;
    requestAnimationFrame(function () {
      state.virtualRenderPending = false;
      if (state.mounted) doIncrementalRender("keep");
    });
  }

  function doIncrementalRender(mode) {
    var list = byId("cp-msg-list");
    var main = byId("cp-main");

    if (!list || !main) return;

    var oldScrollTop = main.scrollTop;
    var oldScrollHeight = main.scrollHeight;
    // 修复：使用统一阈值
    var wasAtBottom = oldScrollHeight - oldScrollTop - main.clientHeight < BOTTOM_THRESHOLD;

    var allMsgs = getMergedMessages();
    var baseRenderArr = allMsgs.slice(-state.renderLimit);
    var virtualMeta = cpComputeVirtualWindow(baseRenderArr, main, mode);
    var renderArr = virtualMeta.messages;

    var newHash = state.renderVersion + "|" + baseRenderArr.length + "|" + virtualMeta.start + "|" + virtualMeta.end + "|";
    var h;

    for (h = 0; h < renderArr.length; h++) {
      newHash += [
        renderArr[h].id,
        renderArr[h]._ver || 0,
        renderArr[h].recalled ? "R" : "",
        renderArr[h].translationOpen ? "T" : "",
        renderArr[h].translation || "",
        renderArr[h].type || "",
        renderArr[h].text || "",
        renderArr[h].serverText || "",
        renderArr[h].mediaUrl || "",
        renderArr[h].audioUrl || ""
      ].join("|");
    }

    if (state.lastRenderHash === newHash && mode === "keep") return;
    state.lastRenderHash = newHash;

    var lastPeerTextMsgId = null;

    for (var j = renderArr.length - 1; j >= 0; j--) {
      if (!renderArr[j].mine && !renderArr[j].recalled && renderArr[j].type === "text") {
        lastPeerTextMsgId = renderArr[j].id;
        break;
      }
    }

    var existingMap = {};
    var child = list.firstElementChild;

    while (child) {
      var did = child.getAttribute("data-id");
      if (did) existingMap[did] = child;
      child = child.nextElementSibling;
    }

    var targetIds = [];
    var targetNodes = {};
    var prevDayStr = "";

    if (virtualMeta.enabled) {
      var topSpacerId = "__vtop";
      var topSpacer = existingMap[topSpacerId] || document.createElement("div");
      topSpacer.className = "cp-virtual-spacer cp-virtual-top";
      topSpacer.setAttribute("data-id", topSpacerId);
      topSpacer.style.height = Math.max(0, virtualMeta.topHeight || 0) + "px";
      targetIds.push(topSpacerId);
      targetNodes[topSpacerId] = topSpacer;
    }

    for (var i = 0; i < renderArr.length; i++) {
      var m = renderArr[i];
      var ts = Number(m.ts || Date.now());
      var dayStr = formatDateDivider(ts);

      if (dayStr !== prevDayStr) {
        var sepHash = "sep_" + dayStr;
        targetIds.push(sepHash);

        var sepNode = existingMap[sepHash];

        if (!sepNode) {
          sepNode = document.createElement("div");
          sepNode.className = "cp-time-sep";
          sepNode.setAttribute("data-id", sepHash);
          sepNode.innerHTML = "<span>" + esc(dayStr) + "</span>";
        }

        targetNodes[sepHash] = sepNode;
        prevDayStr = dayStr;
      }

      var isLastInGroup = true;

      if (i < renderArr.length - 1) {
        var nextM = renderArr[i + 1];
        var mUid = m.mine ? state.myUid : m.uid;
        var nextUid = nextM.mine ? state.myUid : nextM.uid;

        if (mUid === nextUid && nextM.ts - m.ts < 180000) {
          isLastInGroup = false;
        }
      }

      var isMediaType = m.type === "image" || m.type === "video" || m.type === "gallery";
      var showTail = isLastInGroup && !m.recalled && !isMediaType;

      var bubbleClass =
        "cp-bubble" +
        (m.recalled ? " recalled" : "") +
        (m.type === "voice" ? " voice-shell" : "") +
        (isMediaType ? " media-shell" : "");

      var rowClass = "cp-row " + (m.mine ? "mine" : "other");
      if (m.pendingLocal) rowClass += " is-pending";
      if (m.failedLocal) rowClass += " is-failed";

      if (showTail) rowClass += " has-tail";
      if (isLastInGroup) rowClass += " is-last";

      var nodeHash = buildNodeHash(m, isLastInGroup);
      var node = existingMap[m.id];

      if (node && node.getAttribute("data-hash") === nodeHash) {
        if (node.className !== rowClass) node.className = rowClass;
      } else {
        var body = "";
        var timeStr = formatTime(ts);
        var inlineTimeHtml = '<span class="cp-inline-time">' + esc(timeStr) + "</span>";

        if (m.recalled) {
          body = '<div class="cp-text">此消息已被撤回</div>';
        } else if (m.type === "call") {
          body =
            '<div class="cp-call-record cp-call-' + escAttr(m.callKind || "") + '">' +
              '<span class="cp-call-ico">' + callRecordIconHtml(m) + "</span>" +
              '<span class="cp-call-label">' + esc(callRecordLabel(m)) + "</span>" +
              inlineTimeHtml +
            "</div>";
        } else if (m.type === "voice") {
          body =
            '<button class="cp-voice cp-lazy-audio" data-act="play-voice" data-audio-src="' +
              escAttr(m.audioUrl || m.mediaUrl || "") +
            '">' +
              '<span class="cp-play-circle">' +
                ICON.play +
              "</span>" +
              '<span class="cp-wave">' +
                waveHeights.map(function (height) {
                  return '<i style="height:' + height + 'px"></i>';
                }).join("") +
              "</span>" +
              '<div class="cp-voice-info-col">' +
                '<span class="cp-voice-dur" id="dur_' + escAttr(m.id) + '">' +
                  esc(m.durationStr || "--:--") +
                "</span>" +
                '<span class="cp-voice-time">' + esc(timeStr) + "</span>" +
              "</div>" +
            "</button>";
        } else if (m.type === "image") {
          body =
            '<button class="cp-media-thumb" data-act="preview-media" style="position:relative;">' +
              '<div class="cp-lazy-media cp-lazy-loading" data-type="img" data-src="' +
                escAttr(m.mediaUrl || "") +
              '">' +
                '<i class="fa fa-image fa-2x" style="color:#cbd5e1"></i>' +
              "</div>" +
            "</button>" +
            '<span class="cp-media-time">' + esc(timeStr) + "</span>";
        } else if (m.type === "video") {
          body =
            '<button class="cp-media-thumb cp-video-wrap" data-act="preview-media" data-src="' + escAttr(m.mediaUrl || "") + '">' +
              '<div class="cp-lazy-media cp-lazy-loading" data-type="video" data-src="' +
                escAttr(m.mediaUrl || "") +
              '">' +
                '<i class="fa fa-video-camera fa-2x" style="color:#cbd5e1"></i>' +
              "</div>" +
              '<span class="cp-video-mark">视频</span>' +
            "</button>" +
            '<span class="cp-media-time">' + esc(timeStr) + "</span>";
        } else if (m.type === "gallery") {
          var items = Array.isArray(m.items) ? m.items : [];

          var galleryHtml = items.slice(0, 9).map(function (it) {
            return (
              '<button class="cp-media-thumb" data-act="preview-gallery-item" data-src="' +
                escAttr(it.url || "") +
                '" style="display:inline-block;margin:2px;position:relative;">' +
                '<div class="cp-lazy-media cp-lazy-loading" data-type="img" data-src="' +
                  escAttr(it.url || "") +
                  '" style="width:92px;height:92px;">' +
                  '<i class="fa fa-image" style="color:#cbd5e1"></i>' +
                "</div>" +
              "</button>"
            );
          }).join("");

          body =
            '<div style="max-width:300px;">' +
              galleryHtml +
            "</div>" +
            '<span class="cp-media-time">' + esc(timeStr) + "</span>";
        } else {
          var q = "";

          if (m.quote) {
            q =
              '<div class="cp-quote-card">' +
                '<div class="cp-quote-bar"></div>' +
                '<div class="cp-quote-body">' +
                  '<div class="cp-quote-name">' + esc(m.quoteUser || "消息") + "</div>" +
                  '<div class="cp-quote-text">' + esc(m.quote) + "</div>" +
                "</div>" +
              "</div>";
          }

          body =
            q +
            '<div class="cp-text">' +
              (m.html || esc(m.text || "")) +
              inlineTimeHtml +
            "</div>" +
            buildTranslationAreaHtml(m);
        }

        var quick =
          m.id === lastPeerTextMsgId
            ? '<button class="cp-quick-trans" data-act="quick-translate" data-id="' +
              escAttr(m.id) +
              '" title="翻译 / 僚机分析" aria-label="翻译 / 僚机分析">' +
              ICON.ai +
              "</button>"
            : "";

        var safeUserSlug = m.userslug || state.peerUserslugCache || encodeURIComponent(String(m.username || "guest").toLowerCase().replace(/ /g, "-"));
        var avatarHtml = sanitizeAvatarHtml(m.avatarHtml) || getAvatarHtml(m.uid || state.peerUidCache || "", m.username || state.peerUsernameCache || "", null);

        var avatarWrapHtml = m.mine
          ? ""
          : '<a href="' + getRelativePath() + '/user/' +
            escAttr(safeUserSlug) +
            '" class="cp-avatar-wrap" title="访问主页">' +
            avatarHtml +
            "</a>";

        var innerContent =
          avatarWrapHtml +
          '<div class="cp-bubble-wrap">' +
            '<div class="' + bubbleClass + '">' +
              body +
            "</div>" +
            quick +
          "</div>";

        if (!node) {
          node = document.createElement("div");
          node.setAttribute("data-id", m.id);
        }

        node.className = rowClass;
        node.innerHTML = innerContent;
        node.setAttribute("data-hash", nodeHash);
      }

      cpObserveMessageHeight(node, m.id);
      targetIds.push(m.id);
      targetNodes[m.id] = node;
    }

    if (virtualMeta.enabled) {
      var bottomSpacerId = "__vbottom";
      var bottomSpacer = existingMap[bottomSpacerId] || document.createElement("div");
      bottomSpacer.className = "cp-virtual-spacer cp-virtual-bottom";
      bottomSpacer.setAttribute("data-id", bottomSpacerId);
      bottomSpacer.style.height = Math.max(0, virtualMeta.bottomHeight || 0) + "px";
      targetIds.push(bottomSpacerId);
      targetNodes[bottomSpacerId] = bottomSpacer;
    }

    var targetSet = new Set(targetIds);
    var toRemove = [];
    var c = list.firstElementChild;

    while (c) {
      var cid = c.getAttribute("data-id");
      if (!targetSet.has(cid)) toRemove.push(c);
      c = c.nextElementSibling;
    }

    for (var r = 0; r < toRemove.length; r++) {
      list.removeChild(toRemove[r]);
    }

    var refChild = list.firstElementChild;

    for (var t = 0; t < targetIds.length; t++) {
      var targetNode = targetNodes[targetIds[t]];

      if (refChild === targetNode) {
        refChild = refChild.nextElementSibling;
      } else {
        list.insertBefore(targetNode, refChild);
      }
    }

    // 修复：滚动逻辑统一
    if (mode === "bottom") {
      // 强制滚到底
      main.scrollTop = main.scrollHeight;
      state.stickToBottom = true;
    } else if (mode === "prepend") {
      var newScrollHeight = main.scrollHeight;
      main.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
    } else if (mode === "restore") {
      var pUid = getPeerUid();

      if (pUid && state.scrollCache[pUid] !== undefined) {
        main.scrollTop = state.scrollCache[pUid];
      } else {
        main.scrollTop = main.scrollHeight;
        state.stickToBottom = true;
      }
    } else if (mode === "keep") {
      // 修复：keep 模式下，如果原本在底部就保持在底部（关键修复！）
      if (wasAtBottom) {
        main.scrollTop = main.scrollHeight;
        state.stickToBottom = true;
      } else {
        main.scrollTop = oldScrollTop;
      }
    }

    observeLazyElements();
    cpTrimBlobUrlCache(false);
    if (typeof cpHydrateVideoPosters === "function") cpHydrateVideoPosters(list);
    updateFooterHeight();
  }

  function initLazyObserver() {
    if (state.lazyObserver) state.lazyObserver.disconnect();
    state.lazyObserved = typeof WeakSet !== "undefined" ? new WeakSet() : null;

    if (!("IntersectionObserver" in window)) return;

    state.lazyObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;

          var el = entry.target;
          state.lazyObserver.unobserve(el);

          if (el.classList.contains("cp-lazy-media")) loadLazyMedia(el);
          else if (el.classList.contains("cp-lazy-audio")) loadLazyAudio(el);
        });
      },
      {
        root: byId("cp-main"),
        rootMargin: "300px 0px"
      }
    );
  }

  function observeLazyElements() {
    if (state.lazyObserver) {
      document.querySelectorAll(".cp-lazy-media,.cp-lazy-audio").forEach(function (el) {
        if (state.lazyObserved && state.lazyObserved.has(el)) return;
        if (!state.lazyObserved && el.dataset.observed === "1") return;

        if (state.lazyObserved) state.lazyObserved.add(el);
        else el.dataset.observed = "1";

        state.lazyObserver.observe(el);
      });
    } else {
      processLazyMediaFallback();
    }
  }

  function processLazyMediaFallback() {
    document.querySelectorAll(".cp-lazy-media").forEach(loadLazyMedia);
    document.querySelectorAll(".cp-lazy-audio").forEach(loadLazyAudio);
  }

  function loadLazyMedia(el) {
    var src = el.getAttribute("data-src");
    var type = el.getAttribute("data-type");

    if (!src) return;

    getOrFetchMediaBlob(src, type).then(function (localUrl) {
      if (!el.parentNode) return;

      // 修复：媒体加载完成后若用户在底部就保持在底部
      var wasAtBottom = isMainAtBottom();

      if (type === "img") {
        var img = document.createElement("img");
        img.src = localUrl;
        img.setAttribute("data-original", src);

        img.onload = function () {
          if (el.parentNode) {
            el.replaceWith(img);
            if (wasAtBottom) requestAnimationFrame(forceScrollToBottom);
          }
        };

        img.onerror = function () {
          if (el.parentNode) el.replaceWith(img);
        };
      } else if (type === "video") {
        var video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.controls = false;
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.setAttribute("data-original", src);

        var videoUrl = localUrl;

        if (videoUrl.indexOf("#") === -1 && videoUrl.indexOf("blob:") !== 0) {
          videoUrl += "#t=0.001";
        }

        video.src = videoUrl;

        video.addEventListener("loadeddata", function () {
          if (el.parentNode) {
            el.replaceWith(video);
            if (wasAtBottom) requestAnimationFrame(forceScrollToBottom);
          }
        });

        video.addEventListener("error", function () {
          video.src = localUrl;
          if (el.parentNode) el.replaceWith(video);
        });

        setTimeout(function () {
          if (el.parentNode) el.replaceWith(video);
        }, 2000);
      }
    });
  }

  function loadLazyAudio(el) {
    var src = el.getAttribute("data-audio-src");
    if (!src) return;

    getOrFetchMediaBlob(src, "voice").then(function (localUrl) {
      el.setAttribute("data-url", localUrl);
      el.classList.remove("cp-lazy-audio");
    });
  }

  function onListClick(e) {
    var collapseEl = e.target.closest('[data-act="collapse-translation"]');

    if (collapseEl) {
      var collapseRow = collapseEl.closest(".cp-row");
      var collapseMsg = collapseRow && getMsgById(collapseRow.getAttribute("data-id"));
      if (collapseMsg) {
        collapseMsg.translationOpen = false;
        collapseMsg._ver = (collapseMsg._ver || 1) + 1;
        state.renderVersion++;
        state.mergedDirty = true;
        incrementalRender("keep");
      }
      return;
    }

    var retryEl = e.target.closest('[data-act="retry-translate"]');

    if (retryEl) {
      var retryRow = retryEl.closest(".cp-row");

      if (retryRow) {
        executePeerTranslateAndWingman(getMsgById(retryRow.getAttribute("data-id")), {
          forceRetry: true,
          forceOpen: true
        });
      }

      return;
    }

    var quickBtn = e.target.closest(".cp-quick-trans");

    if (quickBtn) {
      e.preventDefault();
      e.stopPropagation();

      executePeerTranslateAndWingman(getMsgById(quickBtn.getAttribute("data-id")), {
        forceOpen: true
      });

      return;
    }

    var actEl = e.target.closest("[data-act]");
    if (!actEl) return;

    var act = actEl.getAttribute("data-act");

    if (act === "play-voice") {
      e.stopPropagation();

      var url = actEl.getAttribute("data-url");
      var iconEl = actEl.querySelector(".cp-play-circle");

      if (!url) {
        loadLazyAudio(actEl);

        setTimeout(function () {
          var lazyUrl = actEl.getAttribute("data-url");
          if (lazyUrl) actEl.click();
        }, 60);

        return;
      }

      if (state.audio.src.indexOf(url) > -1 && !state.audio.paused) {
        state.audio.pause();
        actEl.classList.remove("playing");
        if (iconEl) iconEl.innerHTML = ICON.play;
      } else {
        if (state.currentAudioEl) {
          state.currentAudioEl.classList.remove("playing");

          var oldIcon = state.currentAudioEl.querySelector(".cp-play-circle");
          if (oldIcon) oldIcon.innerHTML = ICON.play;
        }

        state.audio.src = url;

        state.audio.play().catch(function (err) {
          warn("audio-play", err);
          toast("播放失败");
        });

        actEl.classList.add("playing");
        if (iconEl) iconEl.innerHTML = ICON.pause;
        state.currentAudioEl = actEl;
      }

      return;
    }

    if (act === "preview-media") {
      e.stopPropagation();

      var img = actEl.querySelector("img");
      var vid = actEl.querySelector("video");
      var lazy = actEl.querySelector(".cp-lazy-media");
      var lazyType = lazy && lazy.getAttribute("data-type");

      var mediaUrl =
        (img && (img.getAttribute("data-original") || img.getAttribute("src"))) ||
        (vid && (vid.getAttribute("data-original") || vid.getAttribute("src"))) ||
        (lazy && lazy.getAttribute("data-src"));

      if (img || lazyType === "img") openPreview({ type: "image", mediaUrl: mediaUrl });
      else if (vid || lazyType === "video") openPreview({ type: "video", mediaUrl: mediaUrl });

      return;
    }

    if (act === "preview-gallery-item") {
      e.stopPropagation();

      openPreview({
        type: "image",
        mediaUrl: actEl.getAttribute("data-src") || ""
      });
    }
  }

  function getLangCode(langName, fallback) {
    var raw = String(langName || "").trim();
    return LANG_CODE_MAP[raw] || LANG_CODE_MAP[raw.toLowerCase()] || fallback || raw || "auto";
  }

  function fillTemplate(tpl, data) {
    return String(tpl || "").replace(/{{\s*(\w+)\s*}}/g, function (_, key) {
      return data[key] !== undefined ? String(data[key]) : "";
    });
  }

  function normalizeAiEndpoint(url) {
    var clean = String(url || "").trim();

    if (!clean) return "";
    if (!cpIsSafeUrl(clean, { allowDataImage: false })) return "";
    if (/^(mailto:|tel:|blob:|#)/i.test(clean)) return "";
    if (/\/(chat\/completions|responses)$/i.test(clean)) return clean;

    return clean.replace(/\/+$/, "") + "/chat/completions";
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    options = options || {};
    timeoutMs = timeoutMs || 12000;

    if (window.AbortController) {
      var controller = new AbortController();
      var timer = setTimeout(function () {
        controller.abort();
      }, timeoutMs);

      options.signal = controller.signal;

      return fetch(url, options).finally(function () {
        clearTimeout(timer);
      });
    }

    return Promise.race([
      fetch(url, options),
      new Promise(function (_, reject) {
        setTimeout(function () {
          reject(new Error("请求超时"));
        }, timeoutMs);
      })
    ]);
  }

  function extractAIText(data) {
    if (data && Array.isArray(data.choices) && data.choices[0] && data.choices[0].message) {
      var content = data.choices[0].message.content;

      if (typeof content === "string") return content.trim();

      if (Array.isArray(content)) {
        return content.map(function (p) {
          return (p && (p.text || p.output_text || "")) || "";
        }).join("").trim();
      }
    }

    if (data && typeof data.output_text === "string") return data.output_text.trim();

    if (data && Array.isArray(data.output)) {
      return data.output.map(function (item) {
        if (item && Array.isArray(item.content)) {
          return item.content.map(function (part) {
            return (part && (part.text || part.output_text || "")) || "";
          }).join("");
        }

        return "";
      }).join("").trim();
    }

    return "";
  }

  function parseJsonLoose(raw) {
    var text = String(raw || "")
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    try {
      return JSON.parse(text);
    } catch (_) {}

    var match = text.match(/\{[\s\S]*\}/);

    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {}
    }

    return null;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function withRetry(fn, times, scope) {
    var lastErr = null;

    for (var i = 0; i < times; i++) {
      try {
        return await fn(i);
      } catch (err) {
        lastErr = err;
        warn(scope || "retry", err);

        if (i < times - 1) {
          await sleep(260 + i * 420);
        }
      }
    }

    throw lastErr;
  }

  async function rawAIRequest(messages, ai, timeoutMs) {
    ai = ai || {};

    var endpoint = normalizeAiEndpoint(ai.endpoint);

    if (!endpoint || !ai.apiKey || !ai.model) {
      throw new Error("AI 未配置");
    }

    return await withRetry(
      async function () {
        var res = await fetchWithTimeout(
          endpoint,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + ai.apiKey
            },
            body: JSON.stringify({
              model: ai.model || "deepseek4flash",
              temperature: 0.3,
              thinking: { type: "disabled" },
              bodyConfigs: { thinking: { type: "disabled" } },
              messages: messages
            })
          },
          timeoutMs || 12000
        );

        if (!res.ok) {
          var detail = await res.text().catch(function () {
            return "";
          });

          throw new Error(detail || "AI接口错误: " + res.status);
        }

        var data = await res.json();
        var out = extractAIText(data);

        if (!out) throw new Error("AI返回为空");

        return out;
      },
      2,
      "ai-request"
    );
  }

  async function translateViaGoogle(text, to, from) {
    var sl = getLangCode(from, "auto");
    var tl = getLangCode(to, "en");

    if (sl !== "auto" && sl.indexOf("-") > -1) sl = sl.split("-")[0];
    if (tl.indexOf("-") > -1) tl = tl.split("-")[0];

    return await withRetry(
      async function () {
        var apiBase = cpPluginConfig().apiBase || "/api/wukong";
        var proxyUrls = [
          apiBase + "/translate/google?sl=" + encodeURIComponent(sl || "auto") + "&tl=" + encodeURIComponent(tl || "en") + "&q=" + encodeURIComponent(text),
          "/bridge/translate/google?sl=" + encodeURIComponent(sl || "auto") + "&tl=" + encodeURIComponent(tl || "en") + "&q=" + encodeURIComponent(text)
        ];

        // 优先走同源后端代理，避免浏览器 CORS 或地区网络导致 Google 翻译失败。
        for (var pi = 0; pi < proxyUrls.length; pi++) {
          try {
            var pres = await fetchWithTimeout(proxyUrls[pi], { credentials: "same-origin", cache: "force-cache" }, 4500);
            if (!pres.ok) continue;
            var pjson = await pres.json();
            if (pjson && pjson.translation) return String(pjson.translation).trim();
          } catch (proxyErr) {
            warn("google-translate-proxy", proxyErr);
          }
        }

        var url =
          "https://translate.googleapis.com/translate_a/single?client=gtx&sl=" +
          encodeURIComponent(sl || "auto") +
          "&tl=" +
          encodeURIComponent(tl || "en") +
          "&dt=t&q=" +
          encodeURIComponent(text);

        var res = await fetchWithTimeout(url, { cache: "force-cache" }, 4500);

        if (!res.ok) throw new Error("Google translate failed: " + res.status);

        var data = await res.json();
        var parts = Array.isArray(data && data[0]) ? data[0] : [];

        return parts.map(function (item) {
          return item && item[0] ? item[0] : "";
        }).join("").trim();
      },
      1,
      "google-translate"
    );
  }

  async function translateViaAI(text, from, to, ai) {
    ai = ai || state.cfg.ai || {};

    var prompt = fillTemplate(ai.translatePrompt || DEFAULT_TRANSLATE_PROMPT, {
      myLang: to || state.cfg.sourceLang || "中文",
      peerMessage: text,
      sourceLang: from || "auto",
      targetLang: to || state.cfg.sourceLang || "中文"
    });

    var raw = await rawAIRequest(
      [
        {
          role: "system",
          content: "你是极速聊天翻译器。必须只输出可解析 JSON。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      ai,
      9000
    );

    var json = parseJsonLoose(raw);

    return (json && typeof json.translation === "string" ? json.translation : raw).trim();
  }

  async function translateByProvider(text, from, to, forceProvider) {
    return await translateViaAI(text, from, to, state.cfg.ai || {});
  }

  function addToAiCache(key, val, ttlMs) {
    state.aiCache[key] = {
      value: val,
      expiresAt: Date.now() + (ttlMs || 3600000)
    };

    state.aiCacheKeys.push(key);

    if (state.aiCacheKeys.length > 180) {
      var old = state.aiCacheKeys.shift();
      delete state.aiCache[old];
    }
  }

  function getAiCache(key) {
    var cached = state.aiCache[key];

    if (cached && cached.expiresAt > Date.now()) return cached.value;

    return null;
  }

  function executePeerTranslateOnly(msg, opts) {
    opts = opts || {};

    if (!msg || msg.recalled || msg.type !== "text" || msg.mine) return Promise.resolve("");

    var isRetry = !!opts.forceRetry || /^翻译失败/.test(msg.translation || "");

    if (state.translateInflight[msg.id] && !isRetry) {
      if (opts.forceOpen) {
        msg.translationOpen = true;
        msgTouch(msg);
        incrementalRender("keep");
      }

      return state.translateInflight[msg.id];
    }

    if (msg.translation && msg.translation !== "翻译中..." && !isRetry) {
      if (opts.forceOpen) {
        msg.translationOpen = true;
        msgTouch(msg);
        incrementalRender("keep");
      }

      return Promise.resolve(msg.translation);
    }

    msg.translation = "翻译中...";
    msg.translationOpen = true;
    msgTouch(msg);
    incrementalRender("keep");

    var provider = getProvider();

    var cacheKey =
      "translate|" +
      provider +
      "|" +
      state.cfg.targetLang +
      ">" +
      state.cfg.sourceLang +
      "|" +
      String(msg.text || "").slice(0, 800);

    var cached = getAiCache(cacheKey);

    if (cached && !isRetry) {
      msg.translation = cached;
      msg.translationOpen = true;
      msgTouch(msg);
      incrementalRender("keep");
      return Promise.resolve(cached);
    }

    var p = translateByProvider(msg.text, state.cfg.targetLang, state.cfg.sourceLang, provider)
      .then(function (out) {
        msg.translation = out || "翻译为空";
        msg.translationOpen = true;
        addToAiCache(cacheKey, msg.translation, 3 * 24 * 3600000);
        msgTouch(msg);
        incrementalRender("keep");
        schedulePersistChat(getPeerUid());
        return msg.translation;
      })
      .catch(function (err) {
        warn("peer-translate", err);
        msg.translation = "翻译失败";
        msg.translationOpen = true;
        msgTouch(msg);
        incrementalRender("keep");
        throw err;
      })
      .finally(function () {
        delete state.translateInflight[msg.id];
      });

    state.translateInflight[msg.id] = p;

    return p;
  }

  function executePeerTranslateAndWingman(msg, opts) {
    opts = opts || {};

    if (!msg || msg.recalled || msg.type !== "text" || msg.mine) return;

    var isRetry = !!opts.forceRetry || /^翻译失败/.test(msg.translation || "");

    if (msg.translation && msg.translation !== "翻译中..." && !isRetry) {
      msg.translationOpen = opts.forceOpen ? true : !msg.translationOpen;
      msgTouch(msg);
      incrementalRender("keep");

      if (msg.translationOpen && state.cfg.smartReplyEnabled) {
        setTimeout(function () {
          startWingmanForMessage(msg);
        }, 180);
      }

      return;
    }

    executePeerTranslateOnly(msg, {
      forceRetry: isRetry,
      forceOpen: true
    }).catch(function () {});

    if (state.cfg.smartReplyEnabled) {
      setTimeout(function () {
        startWingmanForMessage(msg);
      }, 180);
    } else {
      clearWingmanPanel();
    }
  }

  function buildHistoryForPrompt(currentMsg) {
    if (!state.cfg.contextMemoryEnabled) return "（未启用上下文记忆）";

    var all = getMergedMessages().filter(function (m) {
      return m && m.type === "text" && !m.recalled && m.text && String(m.id) !== String(currentMsg.id);
    });

    var maxMsgs = Math.max(1, Number(state.cfg.contextRounds || 30)) * 2;
    var slice = all.slice(-maxMsgs);

    if (!slice.length) return "（暂无历史）";

    return slice.map(function (m) {
      return (m.mine ? "我" : "对方") + "：" + String(m.text || "").replace(/\s+/g, " ").slice(0, 220);
    }).join("\n");
  }

  function startWingmanForMessage(msg) {
    if (!msg || msg.mine || msg.type !== "text") return;

    if (!state.cfg.smartReplyEnabled) {
      clearWingmanPanel();
      return;
    }

    if (!state.cfg.ai || !state.cfg.ai.endpoint || !state.cfg.ai.apiKey || !state.cfg.ai.model) {
      renderWingmanInfo("僚机需要先在设置里填写 AI 接口、Key 和模型。", []);
      return;
    }

    var requestId = ++state.wingmanRequestId;
    renderWingmanLoading();

    var cacheKey =
      "wingman|" +
      String(msg.text || "").slice(0, 700) +
      "|" +
      state.cfg.sourceLang +
      "|" +
      state.cfg.targetGender +
      "|" +
      state.cfg.relationshipStage +
      "|" +
      state.cfg.contextRounds +
      "|" +
      (state.cfg.contextMemoryEnabled ? "1" : "0") +
      "|" +
      (state.cfg.ai.model || "");

    var cached = getAiCache(cacheKey);

    if (cached) {
      renderSmartReplies(cached.emotion_analysis || cached.analysis || "", cached.quick_replies || []);
      return;
    }

    fetchAIWingman(msg)
      .then(function (json) {
        if (requestId !== state.wingmanRequestId) return;

        addToAiCache(cacheKey, json, 45 * 60 * 1000);
        renderSmartReplies(json.emotion_analysis || "", json.quick_replies || []);
      })
      .catch(function (err) {
        if (requestId !== state.wingmanRequestId) return;

        warn("wingman", err);
        renderWingmanInfo("僚机分析失败，稍后再试。", []);
      });
  }

  async function fetchAIWingman(msg) {
    var ai = state.cfg.ai || {};

    var prompt = fillTemplate(ai.wingmanPrompt || DEFAULT_WINGMAN_PROMPT, {
      myLang: state.cfg.sourceLang,
      targetGender: state.cfg.targetGender,
      relationshipStage: state.cfg.relationshipStage,
      relationship_stage: state.cfg.relationshipStage,
      communicationStyle: state.cfg.communicationStyle,
      communication_style: state.cfg.communicationStyle,
      history: buildHistoryForPrompt(msg),
      peerMessage: msg.text
    });

    var raw = await rawAIRequest(
      [
        {
          role: "system",
          content: "只输出可解析的 JSON，不要使用 Markdown，不要解释。所有 quick_replies.text 必须 20 字以内。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      ai,
      18000
    );

    var json = parseJsonLoose(raw);

    if (!json) {
      return {
        emotion_analysis: raw.slice(0, 80),
        quick_replies: []
      };
    }

    if (!Array.isArray(json.quick_replies)) json.quick_replies = [];

    json.quick_replies = json.quick_replies.slice(0, 5).map(function (r) {
      if (typeof r === "string") {
        return {
          label: "回复",
          text: String(r).trim().slice(0, 40),
          style: "自然",
          affinity_risk: "安全"
        };
      }

      return {
        label: String(r.label || r.style || "回复").slice(0, 6),
        text: String(r.text || r.reply || "").trim().slice(0, 40),
        style: String(r.style || "自然"),
        affinity_risk: String(r.affinity_risk || r.risk || "安全")
      };
    }).filter(function (r) {
      return !!r.text;
    });

    return json;
  }


  function cpMakeVideoPoster(url) {
    return new Promise(function (resolve) {
      var done = false;
      var video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.src = url;

      function finish(value) {
        if (done) return;
        done = true;
        try { video.removeAttribute("src"); video.load(); } catch (_) {}
        resolve(value || "");
      }

      video.addEventListener("loadeddata", function () {
        try {
          var canvas = document.createElement("canvas");
          var w = video.videoWidth || 640;
          var h = video.videoHeight || 360;
          var max = 640;
          var scale = Math.min(1, max / Math.max(w, h));
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
          finish(canvas.toDataURL("image/jpeg", 0.78));
        } catch (e) {
          finish("");
        }
      }, { once: true });

      video.addEventListener("loadedmetadata", function () {
        try {
          if (Number.isFinite(video.duration) && video.duration > 0) {
            video.currentTime = Math.min(0.18, video.duration / 3);
          }
        } catch (_) {}
      }, { once: true });

      video.addEventListener("error", function () { finish(""); }, { once: true });
      setTimeout(function () { finish(""); }, 4200);
    });
  }


  function cpMakeVideoPosterFromFile(file) {
    if (!file || !/^video\//i.test(file.type || "")) return Promise.resolve("");
    var url = URL.createObjectURL(file);
    return cpMakeVideoPoster(url).then(function (poster) {
      try { URL.revokeObjectURL(url); } catch (_) {}
      return poster || "";
    }, function () {
      try { URL.revokeObjectURL(url); } catch (_) {}
      return "";
    });
  }

  async function cpHydrateVideoPosters(root) {
    root = root || document;
    var nodes = Array.prototype.slice.call(root.querySelectorAll(".cp-video-wrap[data-src]:not([data-poster-ready])"));
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      node.setAttribute("data-poster-ready", "1");
      var url = node.getAttribute("data-src");
      if (!url) continue;
      try {
        var poster = state.videoPosterCache && state.videoPosterCache[url];
        if (!poster) poster = await cpMakeVideoPoster(url);
        if (poster) {
          node.style.backgroundImage = "url(" + poster + ")";
          node.classList.add("has-poster");
        } else {
          node.classList.add("no-poster");
        }
      } catch (e) {
        node.classList.add("no-poster");
        warn("video-poster", e);
      }
    }
  }

  function renderWingmanLoading() {
    var panel = byId("cp-wingman-panel");
    var analysis = byId("cp-wingman-analysis");
    var bar = byId("cp-smart-replies-bar");

    if (!panel || !analysis || !bar) return;

    panel.hidden = false;
    analysis.innerHTML = '<span class="cp-thinking-dot"></span><span>思考中…</span>';
    bar.innerHTML = "";

    updateFooterHeight();
  }

  function renderWingmanInfo(text, replies) {
    var panel = byId("cp-wingman-panel");
    var analysis = byId("cp-wingman-analysis");
    var bar = byId("cp-smart-replies-bar");

    if (!panel || !analysis || !bar) return;

    panel.hidden = false;
    analysis.textContent = text;
    bar.innerHTML = "";

    if (replies && replies.length) {
      renderSmartReplies(text, replies);
    }

    updateFooterHeight();
  }

  function renderSmartReplies(analysisText, repliesList) {
    var panel = byId("cp-wingman-panel");
    var analysis = byId("cp-wingman-analysis");
    var bar = byId("cp-smart-replies-bar");

    if (!panel || !analysis || !bar) return;

    panel.hidden = false;

    analysis.innerHTML =
      '<i class="fa fa-heart-o" style="color:#6366f1"></i><span>' +
      esc(analysisText || "可以正常接话。") +
      "</span>";

    var html = "";

    for (var i = 0; i < Math.min(5, repliesList.length); i++) {
      var item = repliesList[i];
      var text = String(item.text || "").trim().slice(0, 40);

      if (!text) continue;

      html +=
        '<button class="cp-sr-pill" data-text="' +
        escAttr(text) +
        '" title="' +
        escAttr((item.style || "") + " · " + (item.affinity_risk || "")) +
        '">' +
        esc(text) +
        "<em>" +
        esc(item.label || item.style || "") +
        "</em></button>";
    }

    bar.innerHTML = html;

    updateFooterHeight();
  }

  function clearWingmanPanel() {
    var p = byId("cp-wingman-panel");
    if (p) p.hidden = true;

    updateFooterHeight();
  }

  function onSmartReplyClick(e) {
    var item = e.target.closest(".cp-sr-pill");
    if (!item) return;

    var text = item.getAttribute("data-text");
    if (!text) return;

    var input = byId("cp-input");

    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();

    clearWingmanPanel();
    updatePrimaryButton();
    updateFooterHeight();
  }

  function handlePrimaryAction() {
    var text = String(byId("cp-input").value || "").trim();

    if (text) {
      return sendByPolicy(text);
    }

    if (!state.rec.mediaRecorder || state.rec.mediaRecorder.state === "inactive") startRecording();
    else stopRecording(true);
  }

  async function sendByPolicy(text) {
    if (!state.cfg.sendTranslateEnabled) {
      sendText(text, null);
      return;
    }

    var btn = byId("cp-primary-btn");
    var icon = byId("cp-primary-icon");

    btn.disabled = true;
    icon.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';

    try {
      var translated = await translateByProvider(text, state.cfg.sourceLang, state.cfg.targetLang, getProvider());

      sendText(translated || text, translated ? text : null);
    } catch (err) {
      warn("send-translate", err);
      toast("译发失败，已直接发送原文");
      sendText(text, null);
    } finally {
      btn.disabled = false;
      updatePrimaryButton();
    }
  }



  function sendCallSignalText(signalText) {
    var peerUid = getPeerUid();

    if (!signalText) return false;

    if (!peerUid || !state.wkReady || !window.wk) {
      warn("wk-call-signal-not-ready", {
        peerUid: peerUid,
        wkReady: state.wkReady,
        hasWk: !!window.wk
      });
      return false;
    }

    try {
      var channel = new window.wk.Channel(peerUid, 1);
      var msgContent = new window.wk.MessageText(signalText);
      window.wk.WKSDK.shared().chatManager.send(msgContent, channel);
      return true;
    } catch (e) {
      warn("wk-call-signal-send", e);
      return false;
    }
  }

  function extractUploadUrl(json) {
    if (!json) return "";

    function pick(v) {
      if (!v) return "";
      if (typeof v === "string") return v;
      if (typeof v !== "object") return "";
      return v.url || v.path || v.src || v.location || v.file || v.filename || "";
    }

    var candidates = [
      pick(json),
      pick(json.data),
      pick(json.response),
      pick(json.file),
      pick(json.upload),
      json.url,
      json.path,
      json.src
    ];

    var arrays = [
      json.files,
      json.images,
      json.uploads,
      json.data && json.data.files,
      json.data && json.data.images,
      json.data && json.data.uploads,
      json.response && json.response.files,
      json.response && json.response.images,
      json.response && json.response.uploads
    ];

    for (var ai = 0; ai < arrays.length; ai++) {
      var arr = arrays[ai];
      if (Array.isArray(arr) && arr.length) {
        candidates.push(pick(arr[0]));
      }
    }

    var url = "";

    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i]) {
        url = String(candidates[i]);
        break;
      }
    }

    if (!url) return "";

    url = String(url).trim().replace(/[\u0000-\u001f\u007f]/g, "");
    if (/^(javascript|data|vbscript):/i.test(url)) return "";
    if (/^\/\//.test(url)) url = location.protocol + url;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.charAt(0) === "/") return url;

    return "/" + url.replace(/^\/+/, "");
  }

  function uploadToNodeBB(file, onProgress) {
    function sendOnce(endpoint, fieldName) {
      return new Promise(function (resolve, reject) {
        var fd = new FormData();
        fd.append(fieldName, file, file.name || "cp_" + Date.now());

        var xhr = new XMLHttpRequest();
        xhr.open("POST", endpoint);
        xhr.withCredentials = true;

        if (window.config) xhr.setRequestHeader("x-csrf-token", config.csrf_token || config.csrfToken || "");

        xhr.upload.onprogress = function (e) {
          if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
        };

        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              var json = JSON.parse(xhr.responseText || "{}");
              var url = extractUploadUrl(json);
              if (!url) throw new Error("upload url empty: " + xhr.responseText.slice(0, 200));
              resolve(url);
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error("upload failed: " + xhr.status + " " + xhr.responseText.slice(0, 200)));
          }
        };

        xhr.onerror = function () {
          reject(new Error("network error"));
        };

        xhr.send(fd);
      });
    }

    var rel = window.config && config.relative_path ? config.relative_path : "";
    var apiBase = cpPluginConfig().apiBase || "/api/wukong";
    var endpoints = [
      { url: apiBase + "/upload", field: "files[]" },
      { url: apiBase + "/upload", field: "file" },
      // 兼容独立 index.js bridge 后端；如果站点没有 NodeBB plugin route，上传仍可用。
      { url: "/bridge/upload", field: "files[]" },
      { url: "/bridge/upload", field: "file" }
    ];

    return endpoints.reduce(function (promise, ep) {
      return promise.catch(function () {
        return sendOnce(ep.url, ep.field).catch(function (err) { warn("upload-endpoint " + ep.url + " " + ep.field, err); throw err; });
      });
    }, Promise.reject(new Error("start upload"))).then(function (url) {
      if (!url) throw new Error("upload url empty");
      return url;
    });
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();

      reader.onload = function (e) {
        resolve(e.target.result);
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();

      img.onload = function () {
        resolve(img);
      };

      img.onerror = reject;
      img.src = src;
    });
  }

  async function canEncode(type) {
    if (!state.encodeSupport) state.encodeSupport = {};
    if (state.encodeSupport[type] !== undefined) return state.encodeSupport[type];

    var canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;

    if (!canvas.toBlob) {
      state.encodeSupport[type] = false;
      return false;
    }

    var ok = await new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        resolve(!!blob && blob.type === type);
      }, type, 0.8);
    });

    state.encodeSupport[type] = ok;

    return ok;
  }

  function extForMime(type) {
    if (type === "image/webp") return ".webp";
    if (type === "image/png") return ".png";
    return ".jpg";
  }

  async function compressWithLibrary(file, targetType) {
    if (typeof window.imageCompression !== "function") return null;

    return window.imageCompression(file, {
      maxSizeMB: IMAGE_CONFIG.maxSizeMB,
      maxWidthOrHeight: IMAGE_CONFIG.maxSide,
      useWebWorker: true,
      fileType: targetType,
      initialQuality: IMAGE_CONFIG.quality,
      alwaysKeepResolution: false,
      preserveExif: false
    });
  }


  function cpLoadImageFromFileForCompress(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try { URL.revokeObjectURL(url); } catch (_) {}
        resolve(img);
      };
      img.onerror = function (e) {
        try { URL.revokeObjectURL(url); } catch (_) {}
        reject(e);
      };
      img.src = url;
    });
  }

  function cpCanvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, type, quality);
    });
  }

  async function compressWithCanvas(file, targetType) {
    // v42: ObjectURL avoids base64/DataURL memory bloat on mobile.
    var img = await cpLoadImageFromFileForCompress(file);

    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var scale = Math.min(1, IMAGE_CONFIG.maxSide / Math.max(w, h));

    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));

    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    var ctx = canvas.getContext("2d", { alpha: targetType === "image/webp" });
    if (!ctx || !canvas.toBlob) return null;

    ctx.drawImage(img, 0, 0, w, h);

    var targetBytes = IMAGE_CONFIG.maxSizeMB * 1024 * 1024;
    var qualities = IMAGE_CONFIG.qualities || [IMAGE_CONFIG.quality || 0.6, 0.52, 0.45, 0.38];
    var best = null;

    for (var i = 0; i < qualities.length; i++) {
      var blob = await cpCanvasToBlob(canvas, targetType, Number(qualities[i]));
      if (!blob) continue;

      best = blob;
      if (blob.size <= targetBytes) break;
    }

    return best;
  }

  async function compressImage(file) {
    if (!file || !/^image\//i.test(file.type)) return file;
    if (/image\/(gif|svg\+xml)/i.test(file.type)) return file;
    if (file.size < IMAGE_CONFIG.minCompressBytes) return file;

    var targetType = IMAGE_CONFIG.useWebp && (await canEncode("image/webp")) ? "image/webp" : "image/jpeg";

    try {
      var blob = await compressWithLibrary(file, targetType);

      if (!blob) blob = await compressWithCanvas(file, targetType);
      if (!blob || blob.size >= file.size * 0.95) return file;

      var baseName = String(file.name || "image-" + Date.now()).replace(/\.[^.]+$/, "");

      return new File([blob], baseName + extForMime(targetType), {
        type: targetType,
        lastModified: Date.now()
      });
    } catch (err) {
      warn("compress-image", err);
      return file;
    }
  }

  async function compressVideo(file, maxSizeThreshold, maxDuration) {
    // v33: Do not transcode mobile videos in the browser.
    // The old canvas/MediaRecorder conversion often produced WebM files that
    // displayed a black preview or could not play in some mobile browsers.
    // We only validate duration, then upload the original file.
    maxDuration = maxDuration || VIDEO_CONFIG.maxDuration;
    maxSizeThreshold = maxSizeThreshold || VIDEO_CONFIG.maxSizeThreshold;

    if (!file || !/^video\//i.test(file.type)) return file;
    if (file.size > maxSizeThreshold) {
      var tooLarge = new Error("视频超过 " + Math.round(maxSizeThreshold / 1024 / 1024) + "MB，不能上传");
      tooLarge.code = "VIDEO_TOO_LARGE";
      throw tooLarge;
    }

    var inputUrl = URL.createObjectURL(file);
    try {
      var video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.src = inputUrl;

      await new Promise(function (resolve, reject) {
        video.onloadedmetadata = resolve;
        video.onerror = reject;
        setTimeout(resolve, 3500);
      });

      if (Number.isFinite(video.duration) && video.duration > maxDuration) {
        var tooLong = new Error("视频过长，最多 " + maxDuration + " 秒");
        tooLong.code = "VIDEO_TOO_LONG";
        throw tooLong;
      }

      return file;
    } catch (err) {
      warn("check-video", err);
      if (err && (err.code === "VIDEO_TOO_LONG" || err.code === "VIDEO_TOO_LARGE")) throw err;
      return file;
    } finally {
      try { URL.revokeObjectURL(inputUrl); } catch (_) {}
    }
  }

  async function onPickMedia(e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    if (!files.length) return;

    var pWrap = byId("cp-upload-progress-wrap");
    var pBar = byId("cp-upload-progress-bar");

    try {
      for (var i = 0; i < files.length; i++) {
        if (pWrap) {
          pWrap.hidden = false;
          pWrap.removeAttribute("hidden");
        }
        if (pBar) pBar.style.width = "0%";

        var rawFile = files[i];
        var uploadFile = rawFile;

        try {
          if ((rawFile.type || "").indexOf("image/") === 0) {
            toast("正在压缩图片...");
            uploadFile = await compressImage(rawFile);
          } else if ((rawFile.type || "").indexOf("video/") === 0) {
            toast("正在检查视频...");
            uploadFile = await compressVideo(rawFile);
          }
        } catch (mediaErr) {
          warn("media-prepare", mediaErr);
          toast(mediaErr && mediaErr.message ? mediaErr.message : "文件不可用");
          continue;
        }

        var url = await uploadToNodeBB(uploadFile, function (pct) {
          if (pBar) pBar.style.width = Math.max(1, Math.min(100, pct * 100)) + "%";
        });
        if (pBar) pBar.style.width = "100%";

        if (!url) { toast("上传失败：没有返回文件地址"); continue; }

        if ((uploadFile.type || rawFile.type || "").indexOf("image/") === 0) {
          sendText("![](" + url + ")");
        } else if ((uploadFile.type || rawFile.type || "").indexOf("video/") === 0) {
          state.videoPosterCache = state.videoPosterCache || {};
          try {
            var poster = await cpMakeVideoPosterFromFile(rawFile);
            if (poster) state.videoPosterCache[url] = poster;
          } catch (posterErr) {
            warn("local-video-poster", posterErr);
          }
          sendText("[视频](" + url + ")");
        } else {
          sendText("[文件](" + url + ")");
        }
      }
    } catch (err) {
      warn("pick-media", err);
      toast(cpT("uploadFailed", "上传失败"));
    } finally {
      if (pWrap) pWrap.hidden = true;
      if (pBar) pBar.style.width = "0%";
    }

    e.target.value = "";
  }

  function handleBackgroundUpload(e) {
    var file = e.target.files[0];
    if (!file) return;
    if (!/^image\//i.test(file.type || "") || /svg/i.test(file.type || "") || file.size > 8 * 1024 * 1024) {
      toast("背景图格式或大小不支持");
      e.target.value = "";
      return;
    }

    var reader = new FileReader();

    reader.onload = function (ev) {
      var img = new Image();

      img.onload = function () {
        var canvas = document.createElement("canvas");
        var ctx = canvas.getContext("2d");

        var max = 1080;
        var w = img.width;
        var h = img.height;

        if (w > max || h > max) {
          if (w > h) {
            h = Math.round((h * max) / w);
            w = max;
          } else {
            w = Math.round((w * max) / h);
            h = max;
          }
        }

        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);

        state.bg.dataUrl = canvas.toDataURL("image/jpeg", 0.6);

        saveJSON(KEY_BG, state.bg);
        applyBackground();
        toast(cpT("bgUpdated", "背景图已更新"));
      };

      img.src = ev.target.result;
    };

    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function applyBackground() {
    var bgEl = byId("cp-bg");
    var bgMask = byId("cp-bg-mask");

    if (!bgEl) return;

    if (state.bg && state.bg.dataUrl) {
      bgEl.style.backgroundImage = "url('" + state.bg.dataUrl + "')";
      document.body.classList.add("cp-has-bg");
    } else {
      bgEl.style.backgroundImage = "none";
      document.body.classList.remove("cp-has-bg");
    }

    if (bgMask) {
      bgMask.style.setProperty("--bg-op", state.bg && state.bg.opacity !== undefined ? state.bg.opacity : 0.85);
    }
  }

  function toggleUIForRecording(isRec) {
    var inputs = byId("cp-toolbar-inputs");
    var rec = byId("cp-rec-inline");
    var toolbar = byId("cp-toolbar");

    if (inputs) inputs.hidden = isRec;
    if (rec) rec.hidden = !isRec;
    if (toolbar) toolbar.classList.toggle("is-recording", !!isRec);

    updateFooterHeight();
  }

  function getSupportedMimeType() {
    if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== "function") return "";

    for (var i = 0; i < VOICE_CONFIG.fallbackMimeTypes.length; i++) {
      if (MediaRecorder.isTypeSupported(VOICE_CONFIG.fallbackMimeTypes[i])) return VOICE_CONFIG.fallbackMimeTypes[i];
    }

    return "";
  }

  function createAudioRecorder(stream) {
    var mimeType = getSupportedMimeType();
    var options = {
      audioBitsPerSecond: VOICE_CONFIG.audioBitsPerSecond
    };

    if (mimeType) options.mimeType = mimeType;

    try {
      return new MediaRecorder(stream, options);
    } catch (err) {
      warn("audio-recorder-bitrate", err);
      return mimeType ? new MediaRecorder(stream, { mimeType: mimeType }) : new MediaRecorder(stream);
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      toast(cpT("recordingUnsupported", "当前浏览器不支持录音"));
      return;
    }

    var stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      state.rec.stream = stream;
      state.rec.chunks = [];
      state.rec.sec = 0;
      state.rec.paused = false;
      state.rec.shouldSend = false;
      state.rec.mimeType = getSupportedMimeType();
      state.rec.mediaRecorder = createAudioRecorder(stream);
      state.rec.mimeType = state.rec.mediaRecorder.mimeType || state.rec.mimeType || "audio/webm";

      var timeEl = byId("cp-rec-time");
      if (timeEl) timeEl.textContent = "0:00";

      state.rec.mediaRecorder.ondataavailable = function (ev) {
        if (ev.data && ev.data.size > 0) state.rec.chunks.push(ev.data);
      };

      state.rec.mediaRecorder.onstop = async function () {
        stream.getTracks().forEach(function (t) {
          t.stop();
        });

        clearInterval(state.rec.timer);
        state.rec.timer = null;

        toggleUIForRecording(false);
        updatePrimaryButton();

        if (state.rec.shouldSend && state.rec.chunks.length) {
          var pWrap = byId("cp-upload-progress-wrap");
          var pBar = byId("cp-upload-progress-bar");

          try {
            var actualMime = state.rec.mediaRecorder.mimeType || state.rec.mimeType || "audio/webm";
            var ext = actualMime.indexOf("ogg") > -1 ? "ogg" : actualMime.indexOf("mp4") > -1 ? "m4a" : "webm";
            var blob = new Blob(state.rec.chunks, { type: actualMime });
            var file = new File([blob], "voice_" + Date.now() + "." + ext, { type: actualMime });

            if (pWrap) pWrap.hidden = false;
            if (pBar) pBar.style.width = "0%";

            var url = await uploadToNodeBB(file, function (pct) {
              if (pBar) pBar.style.width = Math.max(1, Math.min(100, pct * 100)) + "%";
            });

            if (!url) throw new Error("voice upload url empty");
            sendText("[语音消息](" + url + ")");
          } catch (e) {
            warn("record-upload", e);
            toast("语音发送失败");
          } finally {
            if (pWrap) pWrap.hidden = true;
            if (pBar) pBar.style.width = "0%";
          }
        }

        state.rec.chunks = [];
        state.rec.stream = null;
        state.rec.mediaRecorder = null;
        state.rec.shouldSend = false;
      };

      toggleUIForRecording(true);

      byId("cp-rec-pause").innerHTML = ICON.pause;

      state.rec.mediaRecorder.start(250);

      state.rec.timer = setInterval(function () {
        if (state.rec.paused) return;

        state.rec.sec += 1;
        byId("cp-rec-time").textContent = formatDuration(state.rec.sec);

        if (state.rec.sec >= (state.cfg.voiceMaxDuration || 60)) stopRecording(true);
      }, 1000);
    } catch (e) {
      if (stream) {
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {}
      }
      toggleUIForRecording(false);
      warn("start-recording", e);
      toast("录音不可用或被拒绝");
    }
  }

  function stopRecording(shouldSend) {
    if (!state.rec.mediaRecorder || state.rec.mediaRecorder.state === "inactive") return;

    state.rec.shouldSend = !!shouldSend;
    state.rec.mediaRecorder.stop();
  }

  function togglePauseRecording() {
    var mr = state.rec.mediaRecorder;
    if (!mr) return;

    if (typeof mr.pause !== "function" || typeof mr.resume !== "function") {
      toast("当前浏览器不支持暂停录音");
      return;
    }

    var pauseBtn = byId("cp-rec-pause");

    if (mr.state === "recording") {
      mr.pause();
      state.rec.paused = true;
      if (pauseBtn) pauseBtn.innerHTML = ICON.play;
      var title = document.querySelector(".cp-rec-title");
      if (title) title.textContent = "已暂停";
    } else if (mr.state === "paused") {
      mr.resume();
      state.rec.paused = false;
      if (pauseBtn) pauseBtn.innerHTML = ICON.pause;
      var title2 = document.querySelector(".cp-rec-title");
      if (title2) title2.textContent = "正在录音";
    }
  }

  async function openPreview(msg) {
    var body = byId("cp-preview-body");

    if (msg.type === "image") {
      var localUrl = await getOrFetchMediaBlob(msg.mediaUrl, msg.type);
      body.innerHTML =
        '<img class="cp-preview-image" src="' +
        escAttr(localUrl) +
        '" />';
    } else if (msg.type === "video") {
      // Use the original URL instead of a fetched blob so the browser can use
      // normal video streaming/range behavior. This fixes many mobile playbacks.
      var videoUrl = msg.mediaUrl || "";
      body.innerHTML =
        '<video class="cp-preview-video" src="' +
        escAttr(videoUrl) +
        '" controls preload="auto" playsinline webkit-playsinline></video>';
    }

    var mask = byId("cp-preview-mask");
    mask.hidden = false;
    mask.classList.add("is-open");
    mask.style.backgroundColor = "rgba(0,0,0,.82)";
    body.style.transform = "";

    var pv = body.querySelector("video");
    if (pv) {
      cpAutoPlayPreviewVideo(pv, mask);
    }

    state.previewOpen = true;

    history.pushState({ cpPreview: true }, "", location.href);
  }

  function closePreview(fromPopState) {
    if (!state.previewOpen) return;

    state.previewOpen = false;

    var mask = byId("cp-preview-mask");
    var body = byId("cp-preview-body");
    var v = body && body.querySelector("video");
    if (v) {
      try { v.pause(); } catch (_) {}
      try { v.removeAttribute("src"); v.load(); } catch (_) {}
    }

    body.style.transform = "translateY(100vh) scale(.8)";
    mask.style.backgroundColor = "transparent";

    setTimeout(function () {
      mask.classList.remove("is-open");
      mask.hidden = true;
      body.innerHTML = "";
    }, 250);

    if (!fromPopState) {
      try {
        history.back();
      } catch (_) {}
    }
  }

  function isSafeHref(url) {
    return cpIsSafeUrl(url, { allowDataImage: false }) && !/^data:/i.test(String(url || ""));
  }

  function isSafeImgSrc(url) {
    return cpIsSafeUrl(url, { allowDataImage: true });
  }

  function sanitizeNodeInto(node, parent) {
    if (!node) return;

    if (node.nodeType === 3) {
      parent.appendChild(document.createTextNode(node.nodeValue || ""));
      return;
    }

    if (node.nodeType !== 1) return;

    var tag = (node.tagName || "").toLowerCase();

    if (tag === "br") {
      parent.appendChild(document.createElement("br"));
      return;
    }

    if (tag === "img") {
      if (isEmojiImg(node)) {
        var emojiImg = document.createElement("img");
        var src = node.getAttribute("src") || "";

        if (isSafeImgSrc(src)) emojiImg.setAttribute("src", src);

        emojiImg.setAttribute("alt", node.getAttribute("alt") || "");
        emojiImg.setAttribute("title", node.getAttribute("title") || "");
        emojiImg.className = "emoji";

        parent.appendChild(emojiImg);
      } else {
        parent.appendChild(document.createTextNode(node.getAttribute("alt") || ""));
      }

      return;
    }

    var allowed = {
      a: 1,
      b: 1,
      strong: 1,
      i: 1,
      em: 1,
      u: 1,
      s: 1,
      code: 1,
      pre: 1,
      blockquote: 1,
      p: 1,
      div: 1,
      span: 1,
      ul: 1,
      ol: 1,
      li: 1
    };

    if (!allowed[tag]) {
      var children = node.childNodes || [];

      for (var i = 0; i < children.length; i++) sanitizeNodeInto(children[i], parent);

      return;
    }

    var el = document.createElement(tag);

    if (tag === "a") {
      var href = node.getAttribute("href") || "";

      if (isSafeHref(href)) {
        el.setAttribute("href", href);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer nofollow");
      }
    }

    var childNodes = node.childNodes || [];

    for (var j = 0; j < childNodes.length; j++) sanitizeNodeInto(childNodes[j], el);

    parent.appendChild(el);
  }

  function getRenderableHtml(root) {
    var container = document.createElement("div");
    var children = root.childNodes || [];

    for (var i = 0; i < children.length; i++) sanitizeNodeInto(children[i], container);

    return (container.innerHTML || "").trim();
  }

  function updatePrimaryButton() {
    var hasText = String(byId("cp-input").value || "").trim().length > 0;
    var btn = byId("cp-primary-btn");
    var icon = byId("cp-primary-icon");

    if (hasText) {
      btn.classList.add("send");
      icon.innerHTML = ICON.send;
    } else {
      btn.classList.remove("send");
      icon.innerHTML = ICON.mic;
    }
  }

  function renderRecBars() {
    var bars = byId("cp-rec-bars");

    if (!bars) return;

    bars.innerHTML = waveHeights.slice(0, 10).map(function (h, i) {
      return '<i style="height:' + h + "px;animation-delay:" + i * 0.05 + 's"></i>';
    }).join("");
  }

  function formatTime(ts) {
    var d = new Date(ts);
    var h = d.getHours();
    var suffix = h >= 12 ? "PM" : "AM";
    var hour12 = h % 12 || 12;

    return String(hour12) + ":" + String(d.getMinutes()).padStart(2, "0") + " " + suffix;
  }

  function formatDuration(sec) {
    if (!sec || isNaN(sec)) return "0:00";

    sec = Math.floor(sec);

    return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  }

  function isEmojiImg(img) {
    if (!img) return false;

    return img.classList.contains("emoji") || img.hasAttribute("data-emoji");
  }

  function getMessagePlainText(root) {
    var out = [];

    (function walk(node) {
      if (!node) return;

      if (node.nodeType === 3) {
        out.push(node.nodeValue || "");
        return;
      }

      if (node.nodeType !== 1) return;

      var tag = (node.tagName || "").toLowerCase();

      if (tag === "br") {
        out.push("\n");
        return;
      }

      if (tag === "img" && isEmojiImg(node)) {
        out.push(node.getAttribute("alt") || node.getAttribute("title") || "🙂");
        return;
      }

      if (tag === "a") {
        var beforeLen = out.length;
        var href = node.getAttribute("href") || "";
        var aChildren = node.childNodes || [];

        for (var ai = 0; ai < aChildren.length; ai++) walk(aChildren[ai]);

        var linkText = out.slice(beforeLen).join("");

        if (href && linkText.indexOf(href) === -1) {
          out.push(" " + href);
        }

        return;
      }

      var children = node.childNodes || [];

      for (var i = 0; i < children.length; i++) walk(children[i]);

      if (tag === "p" || tag === "div" || tag === "li") out.push("\n");
    })(root);

    return out.join("").replace(/\n{3,}/g, "\n\n");
  }

  function toast(text) {
    var n = document.createElement("div");

    n.style.cssText =
      "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.72);color:#fff;padding:10px 20px;border-radius:20px;z-index:2147483640;font-size:14px;pointer-events:none;";

    n.textContent = text;
    document.body.appendChild(n);

    setTimeout(function () {
      if (n.parentNode) n.remove();
    }, 2000);
  }

  if (window.jQuery) {
    $(boot);

    $(window).on("action:ajaxify.end action:chat.loaded action:chat.switched", function () {
      setTimeout(boot, 80);
      setTimeout(boot, 260);
    });
  } else {
    document.addEventListener("DOMContentLoaded", boot);
    window.addEventListener("load", boot);
  }
})();
