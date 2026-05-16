/* Generated from the uploaded chat window script and wrapped as a NodeBB plugin engine. */
(function () {
  "use strict";


  var CP_PLUGIN = (window.CPChatHarmony = window.CPChatHarmony || {});
  function cpPluginConfig() {
    return (window.CPChatHarmony && window.CPChatHarmony.config) || {};
  }
  function cpT(key, fallback) {
    var lang = (window.CPChatHarmony && window.CPChatHarmony.i18n) || {};
    return lang[key] || fallback || key;
  }
  function cpLog() {
    if (cpPluginConfig().debug && window.console && console.log) {
      console.log.apply(console, ['[cp-chat-harmony]'].concat(Array.prototype.slice.call(arguments)));
    }
  }


  function cpIndependentMode() {
    return true;
  }

  function cpRaw(v) {
    if (v === undefined || v === null) return "";
    var s = String(v).trim();
    if (!s || s === "undefined" || s === "null") return "";
    if (/^\{[^}]+\}$/.test(s)) return "";
    return s;
  }

  function cpDigits(v) {
    return cpRaw(v).replace(/[^0-9]/g, "");
  }

  function cpPageConfig() {
    var root = document.getElementById("nodebb-wukong-root");
    var cfg = window.__NBB_WUKONG_PAGE__ || {};
    var q = new URLSearchParams(location.search || "");
    var mUser = String(location.pathname || "").match(/\/wukong\/(\d+)/i);
    var targetUid = cpDigits(root && root.getAttribute("data-target-uid")) || cpDigits(cfg.targetUid) || cpDigits(mUser && mUser[1]) || cpDigits(q.get("uid"));
    var tid = cpDigits(root && root.getAttribute("data-tid")) || cpDigits(cfg.tid) || cpDigits(q.get("tid"));
    var channelId = cpRaw(root && root.getAttribute("data-channel-id")) || cpRaw(cfg.channelId) || cpRaw(q.get("channel_id"));
    var channelType = Number(cpRaw(root && root.getAttribute("data-channel-type")) || cpRaw(cfg.channelType) || cpRaw(q.get("channel_type")) || 0);
    if (tid && !channelId) channelId = "nbb_topic_" + tid;
    if (!channelId && targetUid) channelId = targetUid;
    if (![1, 2].includes(channelType)) channelType = tid || String(channelId).indexOf("nbb_topic_") === 0 ? 2 : 1;
    return { targetUid: targetUid, tid: tid, channelId: channelId, channelType: channelType };
  }

  function cpApiBase() {
    return cpRaw(cpPluginConfig().apiBase) || "/api/wukong";
  }

  function cpGetTargetUid() {
    var c = cpPageConfig();
    return c.channelType === 1 ? cpDigits(c.targetUid || c.channelId) : "";
  }

  function cpGetChannelId() {
    var c = cpPageConfig();
    return c.channelId || c.targetUid || "";
  }

  function cpGetChannelType() {
    return Number(cpPageConfig().channelType || 1) || 1;
  }

  function cpLoadScriptSequential(urls, onload, onerror) {
    urls = (urls || []).filter(Boolean);
    if (window.wk && window.wk.WKSDK) return onload();
    var idx = 0;
    var tryNext = function () {
      if (idx >= urls.length) {
        if (onerror) onerror(new Error("all_wukong_sdk_urls_failed"));
        return;
      }
      var url = urls[idx++];
      var s = document.createElement("script");
      s.src = url;
      s.async = true;
      s.onload = function () {
        if (window.wk && window.wk.WKSDK) onload();
        else tryNext();
      };
      s.onerror = tryNext;
      document.head.appendChild(s);
    };
    tryNext();
  }

  async function cpFetchJSON(url, opts) {
    var res = await fetch(url, Object.assign({ credentials: "include", headers: { accept: "application/json" } }, opts || {}));
    if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
    return await res.json();
  }

  if (cpPluginConfig().enabled === false) return;

  if (window.__cpNodebbHarmonyInited) return;
  window.__cpNodebbHarmonyVersion = "1.0.3-cache-peer-fastboot";
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

  function isCallSignalText(text) {
    return String(text == null ? "" : text).indexOf(CALL_SIGNAL_PREFIX) === 0;
  }

  function isCallSignalMessage(m) {
    if (!m) return false;
    return isCallSignalText(m.serverText || m.text || m.html || "");
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
    useWebp: true
  };

  var VIDEO_CONFIG = {
    maxSizeThreshold: 40 * 1024 * 1024,
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
    '要求：\n' +
    '- 采用自然直译风格：保留原文结构、语气、表情符号和换行，译文读起来像 {{myLang}} 原生消息，不生硬。\n' +
    '- 若原文带有暧昧、调侃、冷淡、敷衍、撒娇、抱怨等语气，译文必须保留这种聊天感觉。\n' +
    '- 保留链接、用户名、代码块、Markdown、列表和表情。\n' +
    '- 只输出 JSON：{"translation":"译文"}\n' +
    '- 不要添加任何解释或额外文字。\n\n' +
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

  var ICON = {
    play: '<i class="fa fa-play"></i>',
    pause: '<i class="fa fa-pause"></i>',
    mic: '<i class="fa fa-microphone"></i>',
    send: '<i class="fa fa-arrow-up"></i>',
    photo: '<i class="fa fa-image"></i>',
    quote: '<i class="fa fa-reply"></i>',
    recall: '<i class="fa fa-undo"></i>',
    trans: '<i class="fa fa-language"></i>',
    camera: '<i class="fa fa-camera"></i>',
    album: '<i class="fa fa-picture-o"></i>',
    ai: '<span style="font-weight:900;font-size:13px;background:linear-gradient(45deg,#3b82f6,#8b5cf6);-webkit-background-clip:text;color:transparent;">译</span>'
  };

  var waveHeights = [5, 8, 12, 16, 10, 7, 14, 9, 13, 6, 11, 15];
  var persistTimer = null;
  var footerHeightTimer = null;

  var state = {
    mounted: false,
    observer: null,
    lazyObserver: null,
    vvHandler: null,
    popHandler: null,
    docClickHandler: null,
    selectBlockersBound: false,

    cfg: null,
    bg: null,

    messages: [],
    wkMessages: [],

    renderLimit: 50,
    lastRenderHash: "",
    renderVersion: 0,
    renderPending: false,
    syncScheduled: false,

    pickingLangFor: null,
    contextMsg: null,
    quoteTarget: null,

    audio: new Audio(),
    audioEndedHandler: null,
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
    suppressNativeIds: {},
    pendingSentTexts: {},
    loadedPeerUid: "",

    isPreloading: false,
    hasNoMoreHistory: false,
    initialLoadDone: false,

    scrollCache: {},
    unreadCount: 0,
    readTimer: null,

    blobUrlCache: {},
    blobKeys: [],

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

  function warn(scope, err) {
    try {
      console.warn("[cp-chat][" + scope + "]", err);
    } catch (_) {}
  }

  function byId(id) {
    return document.getElementById(id);
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

  function normalizeTextKey(text) {
    return String(text == null ? "" : text)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 800);
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
      return Object.assign(fallback, JSON.parse(raw));
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
        endpoint: "",
        apiKey: "",
        model: "gpt-4o-mini",
        temperature: 0.2,
        translatePrompt: DEFAULT_TRANSLATE_PROMPT,
        wingmanPrompt: DEFAULT_WINGMAN_PROMPT
      }
    };

    cfg = Object.assign({}, defaults, cfg || {});
    cfg.ai = Object.assign({}, defaults.ai, cfg.ai || {});

    if (cfg.translateProvider !== "ai" && cfg.translateProvider !== "google") cfg.translateProvider = "ai";
    if (!cfg.sourceLang) cfg.sourceLang = defaults.sourceLang;
    if (!cfg.targetLang) cfg.targetLang = defaults.targetLang;

    if (!cfg.ai.translatePrompt) cfg.ai.translatePrompt = DEFAULT_TRANSLATE_PROMPT;
    if (!cfg.ai.wingmanPrompt) cfg.ai.wingmanPrompt = DEFAULT_WINGMAN_PROMPT;
    if (!Number.isFinite(Number(cfg.ai.temperature))) cfg.ai.temperature = 0.2;

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

  async function getOrFetchMediaBlob(url, type) {
    if (!url || url.indexOf("blob:") === 0 || url.indexOf("data:") === 0) return url;
    if (type === "video" || /\.(mp4|mov|webm|m4v)(?:\?|#|$)/i.test(url)) return url;

    if (state.blobUrlCache[url]) return state.blobUrlCache[url];

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
    state.blobKeys.push(url);

    if (state.blobKeys.length > 60) {
      var oldUrl = state.blobKeys.shift();

      try {
        URL.revokeObjectURL(state.blobUrlCache[oldUrl]);
      } catch (e) {
        warn("revoke-url", e);
      }

      delete state.blobUrlCache[oldUrl];
    }

    return blobUrl;
  }

  function schedulePersistChat(peerUid) {
    if (!peerUid) return;
    if (persistTimer) clearTimeout(persistTimer);

    persistTimer = setTimeout(function () {
      persistTimer = null;
      persistChatToDB(peerUid);
    }, 1600);
  }

  async function persistChatToDB(peerUid) {
    var db = await dbPromise;
    if (!db || !peerUid) return;

    var maxSeq = 0;

    for (var i = 0; i < state.wkMessages.length; i++) {
      var s = state.wkMessages[i].seq;
      if (s && s < Number.MAX_SAFE_INTEGER && s > maxSeq) maxSeq = s;
    }

    try {
      db.transaction("chats", "readwrite").objectStore("chats").put({
        peerUid: peerUid,
        messages: state.wkMessages.filter(function (m) {
          return !isCallSignalMessage(m);
        }).slice(-MAX_PERSIST_MESSAGES),
        maxSeq: maxSeq,
        ts: Date.now()
      });
    } catch (e) {
      warn("persist-chat", e);
    }
  }

  async function loadChatFromDB(peerUid) {
    var data = await idbGet("chats", peerUid);
    if (!data || !data.messages) return;

    state.wkMessages = data.messages
      .filter(function (m) {
        return !isCallSignalMessage(m);
      })
      .slice(-MAX_PERSIST_MESSAGES);

    for (var i = 0; i < state.wkMessages.length; i++) {
      if (!state.wkMessages[i]._ver) state.wkMessages[i]._ver = 1;
    }

    if (data.maxSeq) state.localMaxSeq = data.maxSeq;

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

  // 修复：内存裁剪逻辑修正
  function pruneAllMessagesInMemory() {
    var total = state.messages.length + state.wkMessages.length;
    if (total <= MAX_TOTAL_MESSAGES_IN_MEMORY) return;

    var extra = total - MAX_TOTAL_MESSAGES_IN_MEMORY;

    // 优先裁 native messages（保留至少 200 条）
    if (state.messages.length > 200) {
      var canRemove = state.messages.length - 200;
      var removeNative = Math.min(extra, canRemove);

      if (removeNative > 0) {
        state.messages = state.messages.slice(removeNative);
        extra -= removeNative;
      }
    }

    if (extra > 0 && state.wkMessages.length > 0) {
      state.wkMessages = state.wkMessages.slice(extra);
    }

    state.renderVersion++;
    state.mergedDirty = true;
    state.msgIndexDirty = true;
  }

  function rebuildMsgIndex() {
    var map = new Map();

    for (var i = 0; i < state.messages.length; i++) map.set(String(state.messages[i].id), state.messages[i]);
    for (var j = 0; j < state.wkMessages.length; j++) map.set(String(state.wkMessages[j].id), state.wkMessages[j]);

    state.msgIndex = map;
    state.msgIndexDirty = false;
  }

  function getMsgById(id) {
    if (state.msgIndexDirty || !state.msgIndex) rebuildMsgIndex();
    return state.msgIndex.get(String(id)) || null;
  }

  function getMergedMessages() {
    if (!state.mergedDirty && state.mergedCache) return state.mergedCache;

    var allRawMsgs = state.messages.concat(state.wkMessages || []).filter(function (m) {
      return !isCallSignalMessage(m);
    });

    allRawMsgs.sort(function (a, b) {
      return (a.ts || 0) - (b.ts || 0);
    });

    var seenIds = new Set();
    var seenFallback = new Map();
    var allMsgs = [];

    for (var k = 0; k < allRawMsgs.length; k++) {
      var ms = allRawMsgs[k];
      var idKey = String(ms.id || "");

      if (idKey && !/^wk_/.test(idKey) && !/^m_/.test(idKey)) {
        if (seenIds.has(idKey)) continue;
        seenIds.add(idKey);
      }

      // 修复：dedup key 优先使用 serverText（这是发送/接收的实际服务器文本）
      var payloadKey =
        ms.type === "text"
          ? (ms.serverText || ms.text || "")
          : (ms.mediaUrl || ms.audioUrl || "");

      var dedupKey =
        (ms.mine ? state.myUid : ms.uid) +
        "|" +
        (ms.type || "text") +
        "|" +
        normalizeTextKey(payloadKey) +
        "|" +
        Math.floor((ms.ts || 0) / 5000);

      if (payloadKey && seenFallback.has(dedupKey)) continue;

      seenFallback.set(dedupKey, ms);
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
    var pageUid = cpGetTargetUid();
    if (pageUid) return pageUid;

    var path = String(location.pathname || "");
    var rel = getRelativePath();

    if (rel && path.indexOf(rel) === 0) {
      path = path.slice(rel.length) || "/";
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

    if (obj.user && typeof obj.user === "object") return obj.user;
    if (obj.targetUser && typeof obj.targetUser === "object") return obj.targetUser;
    if (obj.recipient && typeof obj.recipient === "object") return obj.recipient;
    if (obj.toUser && typeof obj.toUser === "object") return obj.toUser;
    if (obj.profile && typeof obj.profile === "object") return obj.profile;
    if (obj.uid || obj.username || obj.userslug || obj.slug || obj.title || obj.displayname || obj.name) return obj;

    return null;
  }

  function setPeerFromUser(u) {
    if (!u || typeof u !== "object") return false;

    var myUidStr = String(window.app && app.user ? app.user.uid : state.myUid);
    var uid = u.uid || u.userId || u.id;
    var username = u.username || u.displayname || u.name || u.title || u.fullname || u.userslug || u.slug || "";
    var userslug = u.userslug || u.slug || (username ? encodeURIComponent(String(username).toLowerCase().replace(/ /g, "-")) : "");

    if (uid && String(uid) !== myUidStr && String(uid) !== "0") state.peerUidCache = String(uid);
    if (username) state.peerUsernameCache = String(username);
    if (userslug) state.peerUserslugCache = String(userslug);
    if (u.picture) state.peerPictureCache = u.picture;
    if (u.icontext) state.peerIconTextCache = u.icontext;
    if (u.iconbgColor) state.peerIconBgCache = u.iconbgColor;

    return !!(state.peerUidCache || state.peerUsernameCache || state.peerUserslugCache);
  }

  function getPeerFromAjaxify() {
    var data = window.ajaxify && ajaxify.data ? ajaxify.data : null;
    if (!data) return null;

    var myUidStr = String(window.app && app.user ? app.user.uid : state.myUid);
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
      if (routeSlug && slug && String(slug).toLowerCase() !== String(routeSlug).toLowerCase() && String(u.username || "").toLowerCase() !== String(routeSlug).toLowerCase()) {
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

  async function hydratePeerFromRoute() {
    if (state.peerHydrating) return false;
    if (state.peerUidCache && state.peerUsernameCache) return true;

    var targetUid = cpGetTargetUid();
    if (targetUid) {
      state.peerUidCache = String(targetUid);
      state.peerUsernameCache = state.peerUsernameCache || ("用户" + targetUid);
      state.peerHydrating = true;
      try {
        var u = await cpFetchJSON(cpApiBase() + "/user/" + encodeURIComponent(targetUid));
        if (setPeerFromUser(u)) {
          updateHeaderPeerInfo(null);
          return true;
        }
      } catch (e) {
        warn("hydrate-peer-api", e);
      } finally {
        state.peerHydrating = false;
      }
      updateHeaderPeerInfo(null);
      return true;
    }

    var u2 = getPeerFromAjaxify();
    if (setPeerFromUser(u2)) return true;

    var slug = getRoutePeerSlug();
    if (!slug) return false;

    state.peerUserslugCache = state.peerUserslugCache || slug;
    state.peerUsernameCache = state.peerUsernameCache || slug;
    updateHeaderPeerInfo(null);

    state.peerHydrating = true;
    try {
      var url = getRelativePath() + "/api/user/" + encodeURIComponent(slug);
      var res = await fetch(url, { credentials: "same-origin", headers: { accept: "application/json" } });
      if (!res.ok) return false;

      var json = await res.json();
      var record = pickUserRecord(json) || json;
      if (json && json.userData) record = json.userData;
      if (json && json.users && json.users[0]) record = json.users[0];

      if (setPeerFromUser(record)) {
        updateHeaderPeerInfo(null);
        return true;
      }
    } catch (e) {
      warn("hydrate-peer", e);
    } finally {
      state.peerHydrating = false;
    }

    return false;
  }


  function getPeerUid() {
    if (state.peerUidCache) return state.peerUidCache;

    var pageUid = cpGetTargetUid();
    if (pageUid) {
      state.peerUidCache = String(pageUid);
      return state.peerUidCache;
    }

    setPeerFromUser(getPeerFromAjaxify());
    if (state.peerUidCache) return state.peerUidCache;

    var peerMsg = state.messages.find(function (m) {
      return !m.mine && m.uid;
    });

    if (peerMsg && peerMsg.uid) {
      state.peerUidCache = String(peerMsg.uid);
      state.peerUsernameCache = state.peerUsernameCache || peerMsg.username || "";
      state.peerUserslugCache = state.peerUserslugCache || peerMsg.userslug || "";
      return state.peerUidCache;
    }

    if (!state.peerUsernameCache) {
      var slug = getRoutePeerSlug();
      if (slug) {
        state.peerUsernameCache = slug;
        state.peerUserslugCache = slug;
      }
    }

    return "";
  }


  function getAvatarHtml(uid, username, fallbackHtml) {
    var pic = "";
    var text = String(username || "?").charAt(0).toUpperCase();
    var bg = "#72a5f2";

    if (uid === state.myUid && window.app && window.app.user) {
      pic = app.user.picture;
      if (app.user.icontext) text = app.user.icontext;
      if (app.user.iconbgColor) bg = app.user.iconbgColor;
    } else {
      var u = null;

      if (uid && window.ajaxify && ajaxify.data && ajaxify.data.users) {
        u = ajaxify.data.users.find(function (x) {
          return String(x.uid) === String(uid);
        });
      }

      if (!u && state.peerUsernameCache && String(username || "") === String(state.peerUsernameCache)) {
        u = {
          picture: state.peerPictureCache,
          icontext: state.peerIconTextCache,
          iconbgColor: state.peerIconBgCache
        };
      }

      if (u) {
        pic = u.picture;
        if (u.icontext) text = u.icontext;
        if (u.iconbgColor) bg = u.iconbgColor;
      }
    }

    if (pic) {
      return '<img class="avatar" src="' + escAttr(pic) + '" style="width:100%;height:100%;border-radius:40%;object-fit:cover;" />';
    }

    if (fallbackHtml && fallbackHtml.indexOf("<img") > -1) return fallbackHtml;

    return (
      '<div class="avatar" style="background:' +
      escAttr(bg) +
      ';color:#fff;display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:40%;font-size:16px;">' +
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
      if (routeSlug) {
        name = routeSlug;
        userslug = userslug || routeSlug;
      }
    }

    if (name) {
      state.peerUsernameCache = name;
      userslug = userslug || encodeURIComponent(String(name).toLowerCase().replace(/ /g, "-"));
      state.peerUserslugCache = userslug;
      pInfo.innerHTML = '<a href="' + getRelativePath() + '/user/' + escAttr(userslug) + '/topics" title="访问主页">' + esc(name) + "</a>";
      if (avatar) avatar.innerHTML = avatarHtml || getAvatarHtml(String(uid || getPeerUid() || ""), name, null);
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
    var peerMsg = state.messages.find(function (m) {
      return !m.mine && m.username;
    });

    var username = isMine ? (window.app && app.user ? app.user.username : "我") : peerMsg ? peerMsg.username : state.peerUsernameCache || "用户" + uid;
    var userslug = isMine ? (window.app && app.user ? app.user.userslug || "" : "") : peerMsg ? peerMsg.userslug : "";
    var avatarHtml = getAvatarHtml(String(uid), username, peerMsg ? peerMsg.avatarHtml : null);

    var type = "text";
    var mediaUrl = "";
    var audioUrl = "";
    var displayHtml = esc(text);
    var match;

    if ((match = text.match(/^!\[\]\((.+?)\)$/)) || (match = text.match(/^\[图片\]\((.+?)\)$/))) {
      type = "image";
      mediaUrl = match[1];
      text = "[图片]";
      displayHtml = "";
    } else if ((match = text.match(/^\[视频\]\((.+?)\)$/))) {
      type = "video";
      mediaUrl = match[1];
      text = "[视频]";
      displayHtml = "";
    } else if ((match = text.match(/^\[语音消息\]\((.+?)\)$/))) {
      type = "voice";
      audioUrl = match[1];
      text = "[语音]";
      displayHtml = "";
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

  function onAudioEnded() {
    if (state.currentAudioEl) {
      state.currentAudioEl.classList.remove("playing");
      var icon = state.currentAudioEl.querySelector(".cp-play-circle");
      if (icon) icon.innerHTML = ICON.play;
    }

    state.currentAudioEl = null;
  }

  // 修复：保存引用以便清理
  state.audioEndedHandler = onAudioEnded;
  state.audio.addEventListener("ended", state.audioEndedHandler);

  function initWukong() {
    if (window.__wkEngineBooted) return;
    window.__wkEngineBooted = true;

    cpFetchJSON(cpApiBase() + "/token")
      .catch(function () {
        return cpFetchJSON("/bridge/token");
      })
      .then(function (res) {
        if (!res || !res.token) return;

        state.myUid = String(res.wkUid || res.uid || "");

        var urls = [];
        var cfgUrl = cpRaw(cpPluginConfig().wkSdkUrl);
        if (cfgUrl) urls.push(cfgUrl);
        urls.push("/plugins/nodebb-plugin-wukong-chat/static/vendor/wukongimjssdk.umd.js?v=1");
        urls.push("/plugins/nodebb-plugin-cp-wukong-inject/static/vendor/wukongimjssdk.umd.js?v=1");
        urls.push("https://cdn.jsdelivr.net/npm/wukongimjssdk@latest/lib/wukongimjssdk.umd.js");

        cpLoadScriptSequential(urls, function () {
          var wk = window.wk;
          if (!wk || !wk.WKSDK) return;

          wk.WKSDK.shared().config.uid = state.myUid;
          wk.WKSDK.shared().config.token = String(res.token);
          wk.WKSDK.shared().config.addr = cpRaw(res.wkws || res.wsAddr || res.addr || cpPluginConfig().wkWsUrl) || ((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/wkws/");

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
            if (fromUid === state.myUid) return;

            var currentPeerUid = getPeerUid();
            if (cpGetChannelType() === 1 && (!currentPeerUid || fromUid !== currentPeerUid)) return;

            var t = payloadObj.text || payloadObj.content || "";
            if (!t) return;
            if (isCallSignalText(t)) return;

            var newMsg = createMessageObj(t, false, fromUid, m, payloadObj);
            newMsg.serverText = t;

            var incomingSeq = m.messageSeq || m.message_seq || 0;
            if (incomingSeq > state.localMaxSeq) state.localMaxSeq = incomingSeq;

            state.wkMessages.push(newMsg);
            pruneWkMessages();
            pruneAllMessagesInMemory();

            state.renderVersion++;
            state.mergedDirty = true;
            state.msgIndexDirty = true;

            schedulePersistChat(currentPeerUid || cpGetChannelId());

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
            if (status === 1 && state.mounted && state.initialLoadDone) {
              var pUid = getPeerUid();
              if (pUid && state.localMaxSeq > 0) fetchOfflineMessages(pUid);
            }
          });

          wk.WKSDK.shared().connectManager.connect();
          state.wkReady = true;
        }, function (e) {
          warn("wk-sdk-load", e);
          toast("悟空 SDK 加载失败");
        });
      })
      .catch(function (e) {
        warn("wk-token", e);
        toast("悟空登录失败");
      });
  }


  async function fetchWukongHistory(peerUid, startSeq, opts) {
    peerUid = peerUid || cpGetChannelId();
    if (!peerUid || state.isPreloading || state.hasNoMoreHistory) return;

    opts = opts || {};
    var limit = opts.limit || 20;

    state.isPreloading = true;
    if (byId("cp-top-spinner")) byId("cp-top-spinner").hidden = false;

    try {
      var url = cpApiBase() + "/history?channel_id=" + encodeURIComponent(cpGetChannelId() || peerUid) + "&channel_type=" + encodeURIComponent(cpGetChannelType()) + "&limit=" + encodeURIComponent(limit);
      if (startSeq && startSeq > 0) url += "&start_message_seq=" + encodeURIComponent(startSeq);

      var res = await fetch(url, { credentials: "include", headers: { accept: "application/json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);

      var json = await res.json();
      var msgs = [];

      if (Array.isArray(json)) msgs = json;
      else if (json.data && Array.isArray(json.data)) msgs = json.data;
      else if (json.data && Array.isArray(json.data.messages)) msgs = json.data.messages;
      else if (Array.isArray(json.messages)) msgs = json.messages;

      if (msgs.length) {
        processWukongMessages(msgs, !!startSeq && !opts.isOfflineSync);
        if (msgs.length < limit) state.hasNoMoreHistory = true;
      } else {
        state.hasNoMoreHistory = true;
      }
    } catch (e) {
      warn("wk-history", e);
    } finally {
      state.isPreloading = false;
      if (byId("cp-top-spinner")) byId("cp-top-spinner").hidden = true;
    }
  }


  async function fetchOfflineMessages(peerUid) {
    peerUid = peerUid || cpGetChannelId();
    if (!peerUid || !state.localMaxSeq) return;

    var startSeq = state.localMaxSeq + 1;
    var hasMore = true;

    while (hasMore) {
      try {
        var url = cpApiBase() + "/history?channel_id=" + encodeURIComponent(cpGetChannelId() || peerUid) + "&channel_type=" + encodeURIComponent(cpGetChannelType()) + "&limit=50&start_message_seq=" + encodeURIComponent(startSeq);

        var res = await fetch(url, { credentials: "include", headers: { accept: "application/json" } });
        if (!res.ok) break;

        var json = await res.json();
        var msgs = [];

        if (Array.isArray(json)) msgs = json;
        else if (json.data && Array.isArray(json.data)) msgs = json.data;
        else if (json.data && Array.isArray(json.data.messages)) msgs = json.data.messages;
        else if (Array.isArray(json.messages)) msgs = json.messages;

        if (msgs.length) {
          processWukongMessages(msgs, false);

          var batchMaxSeq = 0;

          for (var i = 0; i < msgs.length; i++) {
            var s = msgs[i].message_seq || msgs[i].messageSeq || 0;
            if (s > batchMaxSeq) batchMaxSeq = s;
          }

          startSeq = batchMaxSeq + 1;
          if (msgs.length < 50) hasMore = false;
        } else {
          hasMore = false;
        }
      } catch (e) {
        warn("offline-sync", e);
        hasMore = false;
      }
    }
  }


  function processWukongMessages(msgs, isLoadMore) {
    var added = false;
    var wasAtBottom = isMainAtBottom();

    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      var payloadObj = extractWkPayload(m) || {};
      var fromUid = String(m.from_uid || m.fromUID);
      var isMine = fromUid === state.myUid;
      var serverT = payloadObj.text || payloadObj.content || "";

      // 历史/离线消息里的通话信令不显示
      if (isCallSignalText(serverT)) continue;

      var t = serverT;

      if (isMine && payloadObj.originalText) t = payloadObj.originalText;
      if (!t) continue;

      // 双保险：originalText 如果也是通话信令，也跳过
      if (isCallSignalText(t)) continue;

      var msgId = String(m.message_id || m.messageID || m.client_msg_no || m.clientMsgNo || "wk_hist_" + Math.random());

      var exists = state.wkMessages.some(function (x) {
        return x.id === msgId;
      });

      if (exists) continue;

      var newMsg = createMessageObj(t, isMine, fromUid, m, payloadObj);
      newMsg.id = msgId;
      newMsg.seq = m.message_seq || m.messageSeq || 0;
      // 修复：始终设置 serverText（实际发送/接收的服务器文本）
      newMsg.serverText = serverT || t;

      if (m.timestamp) newMsg.ts = m.timestamp * 1000;

      if (newMsg.seq && newMsg.seq < Number.MAX_SAFE_INTEGER && newMsg.seq > state.localMaxSeq) {
        state.localMaxSeq = newMsg.seq;
      }

      state.wkMessages.push(newMsg);
      added = true;
    }

    if (!added) return;

    state.wkMessages.sort(function (a, b) {
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

    if (!cpIndependentMode()) try {
      var nativeInput = document.querySelector('[component="chat/input"]');
      var nativeBtn = document.querySelector('[component="chat/send"]');

      if (nativeInput && nativeBtn) {
        var setter =
          Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set ||
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

        if (setter) setter.call(nativeInput, text);
        else nativeInput.value = text;

        nativeInput.dispatchEvent(new Event("input", { bubbles: true }));
        nativeInput.dispatchEvent(new Event("change", { bubbles: true }));

        setTimeout(function () {
          nativeBtn.click();
        }, 30);
      }
    } catch (e) {
      warn("native-send", e);
    }

    var wkMsgObj = null;
    var displayText = originalText || text;

    if (peerUid && state.wkReady && window.wk) {
      try {
        var channel = new window.wk.Channel(peerUid, 1);
        var msgContent = new window.wk.MessageText(text);

        if (originalText) {
          var origEncode = msgContent.encode.bind(msgContent);

          msgContent.encode = function () {
            var p = origEncode();

            if (typeof p === "string") {
              try {
                var pObj = JSON.parse(p);
                pObj.originalText = originalText;
                return JSON.stringify(pObj);
              } catch (e) {
                warn("wk-encode-original", e);
              }
            } else if (p && typeof p === "object") {
              p.originalText = originalText;
            }

            return p;
          };
        }

        wkMsgObj = window.wk.WKSDK.shared().chatManager.send(msgContent, channel);
      } catch (e) {
        warn("wk-send", e);
      }
    }

    var newMsg = createMessageObj(displayText, true, state.myUid, wkMsgObj, {
      text: displayText,
      originalText: originalText
    });

    newMsg.serverText = text;

    markPendingNativeText(text, newMsg.id);

    if (state.quoteTarget) {
      newMsg.quote = state.quoteTarget.text || "";
      newMsg.quoteUser = state.quoteTarget.username || "";
      state.quoteTarget = null;
      hideQuoteBar();
    }

    state.wkMessages.push(newMsg);
    pruneWkMessages();
    pruneAllMessagesInMemory();

    state.renderVersion++;
    state.mergedDirty = true;
    state.msgIndexDirty = true;

    schedulePersistChat(peerUid);

    state.unreadCount = 0;
    updateUnreadBadge();

    // 修复：自己发的消息一定滚到底部
    incrementalRender("bottom");
    requestAnimationFrame(forceScrollToBottom);

    var input = byId("cp-input");

    if (input) {
      input.value = "";
      input.style.height = "36px";
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
    if (cpIndependentMode()) {
      if (!state.mounted) mount();
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


  async function ensurePeerLoaded() {
    var pUid = getPeerUid();

    if (!pUid) {
      await hydratePeerFromRoute();
      pUid = getPeerUid();
      updateHeaderPeerInfo(null);
    }

    if (!pUid || state.loadedPeerUid === pUid) return;

    state.loadedPeerUid = pUid;

    await loadChatFromDB(pUid);
    await fetchWukongHistory(pUid, 0, { limit: 20 });

    if (state.localMaxSeq > 0) await fetchOfflineMessages(pUid);

    state.initialLoadDone = true;

    // 修复：初始加载完成后滚到底
    requestAnimationFrame(forceScrollToBottom);
  }

  async function mount() {
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
          model: "gpt-4o-mini",
          temperature: 0.2,
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
    state.suppressNativeIds = {};
    state.pendingSentTexts = {};
    state.loadedPeerUid = "";
    state.wkMessages = [];
    state.messages = [];
    state.myUid = String(window.app && window.app.user ? window.app.user.uid : "");
    state.unreadCount = 0;
    state.renderLimit = 50;
    state.lastRenderHash = "";
    state.renderVersion = 0;
    state.isPreloading = false;
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

    cleanUpOldMedia();

    injectStyle();
    injectRoot();
    // 先用路由用户名占位，避免标题长时间停留在“加载中...”
    updateHeaderPeerInfo(null);
    hydratePeerFromRoute().then(function () {
      updateHeaderPeerInfo(null);
      ensurePeerLoaded();
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

    state.mounted = true;
    document.body.classList.add("cp-shell-on");

    await ensurePeerLoaded();

    updateFooterHeight();
  }

  function unmount() {
    if (!state.mounted) return;

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

    if (state.lazyObserver) state.lazyObserver.disconnect();
    state.lazyObserver = null;

    if (window.visualViewport && state.vvHandler) {
      window.visualViewport.removeEventListener("resize", state.vvHandler);
      window.visualViewport.removeEventListener("scroll", state.vvHandler);
    }

    if (state.popHandler) window.removeEventListener("popstate", state.popHandler);

    if (state.docClickHandler) {
      document.removeEventListener("click", state.docClickHandler);
      state.docClickHandler = null;
    }

    state.audio.pause();

    var root = byId("cp-chat-root");
    if (root) root.remove();

    document.body.classList.remove("cp-shell-on");

    state.blobKeys.forEach(function (k) {
      try {
        URL.revokeObjectURL(state.blobUrlCache[k]);
      } catch (e) {
        warn("revoke-blob-on-unmount", e);
      }
    });

    state.blobUrlCache = {};
    state.blobKeys = [];
    state.wkMessages = [];
    state.messages = [];
    state.peerUidCache = "";
    state.peerUsernameCache = "";
    state.peerUserslugCache = "";
    state.peerPictureCache = "";
    state.peerIconTextCache = "";
    state.peerIconBgCache = "";
    state.peerHydrating = false;
    state.suppressNativeIds = {};
    state.pendingSentTexts = {};
    state.loadedPeerUid = "";
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
      body.cp-shell-on[component="chat/main-wrapper"],
      body.cp-shell-on .chats-full,
      body.cp-shell-on .chat-modal,
      body.cp-shell-on[component="chat/nav-wrapper"] {
        position:absolute!important;
        top:-9999px!important;
        left:-9999px!important;
        opacity:0!important;
        pointer-events:none!important;
        z-index:-1!important;
      }

      #cp-chat-root {
        position:fixed;
        inset:0;
        z-index:2147483000;
        --cp-other:#fff;
        --cp-mine:#e0c3fc;
        --cp-bg:#f1f5f9;
        --cp-text:#1f2937;
        --cp-primary:#3b82f6;
        --cp-danger:#ef4444;
        --cp-footer-h:118px;
        font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;
        color:var(--cp-text);
        overflow:hidden;
        background:var(--cp-bg);
        -webkit-user-select:none!important;
        user-select:none!important;
        -webkit-touch-callout:none!important;
        touch-action:manipulation;
      }

      #cp-chat-root *,
      #cp-chat-root *::before,
      #cp-chat-root *::after {
        box-sizing:border-box;
        -webkit-user-select:none!important;
        user-select:none!important;
        -webkit-touch-callout:none!important;
      }

      #cp-chat-root textarea,
      #cp-chat-root input,
      #cp-chat-root select {
        -webkit-user-select:text!important;
        user-select:text!important;
        -webkit-touch-callout:default!important;
      }

      #cp-chat-root *::-webkit-scrollbar { display:none!important; }

      .cp-bg {
        position:absolute;
        inset:0;
        background-size:cover;
        background-position:center;
        z-index:0;
        pointer-events:none;
      }

      .cp-bg-mask {
        position:absolute;
        inset:0;
        background:rgba(241,245,249,var(--bg-op,.85));
        z-index:1;
        pointer-events:none;
      }

      .cp-header {
        position:absolute;
        left:0;
        right:0;
        top:0;
        z-index:20;
        height:calc(52px + env(safe-area-inset-top));
        padding:env(safe-area-inset-top) 12px 7px 10px;
        display:flex;
        align-items:flex-end;
        justify-content:flex-start;
        gap:8px;
        border-bottom:1px solid rgba(255,255,255,.35);
        background:rgba(255,255,255,.72);
        backdrop-filter:blur(10px);
        box-shadow:0 1px 3px rgba(0,0,0,.02);
      }

      .cp-header-back {
        width:32px;
        height:36px;
        border:none;
        background:transparent;
        color:#111827;
        font-size:30px;
        line-height:1;
        display:grid;
        place-items:center;
        cursor:pointer;
        flex-shrink:0;
      }

      .cp-header-peer {
        min-width:0;
        flex:1;
        display:flex;
        align-items:center;
        gap:9px;
        padding-bottom:2px;
      }

      .cp-peer-avatar {
        width:36px;
        height:36px;
        border-radius:40%;
        overflow:hidden;
        flex-shrink:0;
        box-shadow:0 1px 4px rgba(0,0,0,.10);
        background:#cbd5e1;
      }

      .cp-peer-avatar .avatar,
      .cp-peer-avatar img {
        width:100%!important;
        height:100%!important;
        border-radius:40%!important;
        object-fit:cover;
      }

      .cp-header-center {
        flex:1;
        min-width:0;
        font-size:18px;
        text-align:left;
        font-weight:800;
        color:#111827;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .cp-header-center a {
        color:inherit;
        text-decoration:none;
      }

      .cp-header-actions {
        width:42px;
        flex-shrink:0;
        display:flex;
        justify-content:center;
        align-items:center;
        padding-right:6px;
        padding-bottom:3px;
      }

      .cp-header-actions button {
        width:34px;
        height:34px;
        border:none;
        border-radius:50%;
        background:transparent!important;
        box-shadow:none!important;
        display:grid;
        place-items:center;
        font-size:18px;
        color:#4b5563;
        cursor:pointer;
        padding:0;
      }

      .cp-main {
        position:absolute;
        left:0;
        right:0;
        top:calc(52px + env(safe-area-inset-top));
        bottom:calc(var(--cp-footer-h) + env(safe-area-inset-bottom));
        z-index:10;
        overflow-y:auto;
        overflow-x:hidden;
        padding:10px 8px 20px;
        scroll-behavior:auto;
        -webkit-overflow-scrolling:touch;
        overscroll-behavior:contain;
      }

      .cp-skeleton-spinner {
        text-align:center;
        font-size:13px;
        color:#9ca3af;
        padding:12px 0;
        height:40px;
        display:flex;
        align-items:center;
        justify-content:center;
        gap:8px;
      }

      .cp-skeleton-spinner i { animation:fa-spin 1s infinite linear; }

      .cp-fab-bottom {
        position:absolute;
        right:16px;
        bottom:calc(var(--cp-footer-h) + 20px);
        width:38px;
        height:38px;
        border-radius:50%;
        border:1px solid rgba(0,0,0,.05);
        background:rgba(255,255,255,.9);
        backdrop-filter:blur(5px);
        box-shadow:0 4px 12px rgba(0,0,0,.15);
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:20px;
        color:var(--cp-primary);
        cursor:pointer;
        opacity:0;
        pointer-events:none;
        transform:translateY(20px);
        transition:all .25s cubic-bezier(.2,.8,.2,1);
        z-index:35;
      }

      .cp-fab-bottom.show {
        opacity:1;
        pointer-events:auto;
        transform:translateY(0);
      }

      .cp-fab-badge {
        position:absolute;
        top:-4px;
        right:-4px;
        background:#ef4444;
        color:#fff;
        font-size:10px;
        font-family:sans-serif;
        font-weight:bold;
        padding:2px 5px;
        border-radius:10px;
        box-shadow:0 1px 2px rgba(0,0,0,.2);
      }

      .cp-time-sep {
        display:flex;
        justify-content:center;
        margin:16px 0 10px;
        pointer-events:none;
      }

      .cp-time-sep span {
        background:transparent!important;
        color:#94a3b8;
        font-size:11px;
        font-weight:600;
        padding:2px 4px;
        border-radius:0;
        backdrop-filter:none!important;
        box-shadow:none!important;
      }

      .cp-row {
        display:flex;
        align-items:flex-end;
        gap:8px;
        padding:2px 0;
        position:relative;
      }

      .cp-row.mine { justify-content:flex-end; }
      .cp-row.mine .cp-avatar-wrap { display:none; }

      .cp-avatar-wrap {
        display:block;
        flex-shrink:0;
        width:40px;
        height:40px;
        cursor:pointer;
        border-radius:40%;
        overflow:hidden;
        visibility:hidden;
        z-index:8;
        position:relative!important;
        transform:translateZ(0);
      }

      .cp-row.is-last .cp-avatar-wrap { visibility:visible; }

      .cp-bubble-wrap {
        max-width:78%;
        min-width:40px;
        position:relative!important;
        z-index:1!important;
        overflow:visible;
      }

      .cp-bubble {
        position:relative!important;
        padding:6px 10px 8px;
        font-size:15.5px;
        line-height:1.45;
        word-break:break-word;
        cursor:default;
        border-radius:15px 15px 13px 15px;
        z-index:1!important;
      }

      .cp-row.other .cp-bubble {
        background:var(--cp-other);
        color:#000;
      }

      .cp-row.mine .cp-bubble {
        background:var(--cp-mine);
        color:#111;
      }

      .cp-row.other.has-tail .cp-bubble { border-bottom-left-radius:0; }
      .cp-row.mine.has-tail .cp-bubble { border-bottom-right-radius:4px; }

      .cp-row.other.has-tail .cp-bubble::before {
        content:"";
        position:absolute;
        bottom:2px;
        left:-8px;
        width:20px;
        height:10px;
        background:var(--cp-other);
        border-bottom-right-radius:16px 14px;
        z-index:0!important;
        pointer-events:none!important;
      }

      .cp-row.other.has-tail .cp-bubble::after {
        content:"";
        position:absolute;
        bottom:2px;
        left:-12px;
        width:12px;
        height:20px;
        background:var(--cp-bg);
        border-bottom-right-radius:10px;
        z-index:0!important;
        pointer-events:none!important;
      }

      .cp-row.mine.has-tail .cp-bubble::before {
        content:"";
        position:absolute;
        bottom:2px;
        right:-12px;
        width:28px;
        height:19px;
        background:var(--cp-mine);
        border-bottom-left-radius:18px 18px;
        z-index:0!important;
        pointer-events:none!important;
      }

      .cp-row.mine.has-tail .cp-bubble::after {
        content:"";
        position:absolute;
        bottom:2px;
        right:-12px;
        width:12px;
        height:20px;
        background:var(--cp-bg);
        border-bottom-left-radius:10px;
        z-index:0!important;
        pointer-events:none!important;
      }

      body.cp-has-bg .cp-row.has-tail .cp-bubble::before,
      body.cp-has-bg .cp-row.has-tail .cp-bubble::after { display:none!important; }

      body.cp-has-bg .cp-row.other.has-tail .cp-bubble {
        border-bottom-left-radius:18px!important;
      }

      body.cp-has-bg .cp-row.mine.has-tail .cp-bubble {
        border-bottom-right-radius:18px!important;
      }

      .cp-bubble.recalled {
        opacity:.72;
        background:#e5e7eb!important;
        border-radius:8px!important;
      }

      .cp-bubble.recalled::before,
      .cp-bubble.recalled::after { display:none!important; }

      .cp-bubble.media-shell {
        padding:0;
        background:transparent!important;
        box-shadow:none;
        border-radius:8px!important;
        overflow:hidden;
      }

      .cp-bubble.media-shell::before,
      .cp-bubble.media-shell::after { display:none!important; }

      .cp-quote-card {
        display:flex;
        background:rgba(59,130,246,.08);
        border-radius:8px;
        margin-bottom:6px;
        overflow:hidden;
        pointer-events:none;
      }

      .cp-row.mine .cp-quote-card { background:rgba(0,0,0,.06); }

      .cp-quote-bar {
        width:3px;
        min-width:3px;
        background:var(--cp-primary);
        border-radius:3px 0 0 3px;
        flex-shrink:0;
      }

      .cp-row.mine .cp-quote-bar { background:rgba(0,0,0,.35); }

      .cp-quote-body {
        padding:5px 10px;
        min-width:0;
        overflow:hidden;
      }

      .cp-quote-name {
        font-size:12px;
        font-weight:600;
        color:var(--cp-primary);
        line-height:1.3;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .cp-row.mine .cp-quote-name { color:rgba(0,0,0,.55); }

      .cp-quote-text {
        font-size:13px;
        color:rgba(0,0,0,.55);
        line-height:1.35;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        max-width:220px;
      }

      .cp-inline-time {
        float:right;
        margin:12px 0 0 8px;
        font-size:10px;
        opacity:.45;
        font-variant-numeric:tabular-nums;
        line-height:1.45;
        pointer-events:none;
      }

      .cp-text {
        white-space:pre-wrap;
        pointer-events:none;
      }

      .cp-text a { pointer-events:auto; }

      .cp-text img.emoji {
        width:1.25em;
        height:1.25em;
        vertical-align:-.2em;
        display:inline-block;
      }

      .cp-translation-wrap {
        clear:both;
        margin-top:6px;
        padding-top:6px;
        border-top:1px dashed rgba(0,0,0,.1);
      }

      .cp-translation-text {
        font-size:13.5px;
        white-space:pre-wrap;
        opacity:.95;
        color:#374151;
      }

      .cp-translation-text.is-error {
        color:#ef4444;
        cursor:pointer;
        pointer-events:auto;
      }

      .cp-quick-trans {
        position:absolute;
        right:-34px;
        top:50%;
        transform:translateY(-50%);
        width:28px;
        height:28px;
        background:rgba(255,255,255,.98);
        border-radius:999px;
        box-shadow:0 2px 8px rgba(0,0,0,.12);
        display:grid;
        place-items:center;
        cursor:pointer;
        border:1px solid rgba(0,0,0,.04);
        z-index:14;
        transition:transform .18s,box-shadow .18s;
        pointer-events:auto;
        touch-action:manipulation;
        -webkit-tap-highlight-color:transparent;
      }

      .cp-quick-trans:active { transform:translateY(-50%) scale(.92); }

      .cp-media-time {
        position:absolute;
        right:6px;
        bottom:6px;
        font-size:10px;
        color:#fff;
        background:rgba(0,0,0,.5);
        border-radius:8px;
        padding:2px 6px;
        z-index:2;
        font-variant-numeric:tabular-nums;
      }

      .cp-media-thumb {
        display:block;
        border:0;
        padding:0;
        margin:0;
        background:transparent;
        cursor:pointer;
        pointer-events:auto;
      }

      .cp-media-thumb img {
        display:block;
        width:200px;
        max-height:280px;
        border-radius:8px;
        object-fit:cover;
        object-position:top;
      }

      .cp-video-wrap {
        width:200px;
        max-height:280px;
        border-radius:8px;
        overflow:hidden;
        position:relative;
        background:#e2e8f0;
      }

      .cp-video-wrap video {
        width:100%;
        height:100%;
        object-fit:cover;
        object-position:top;
        display:block;
      }

      .cp-video-wrap::after {
        content:"\\f01d";
        font-family:FontAwesome;
        position:absolute;
        left:50%;
        top:50%;
        transform:translate(-50%,-50%);
        font-size:32px;
        color:rgba(255,255,255,.8);
        pointer-events:none;
        text-shadow:0 2px 4px rgba(0,0,0,.3);
      }

      .cp-video-mark {
        position:absolute;
        right:6px;
        bottom:6px;
        font-size:10px;
        color:#fff;
        background:rgba(0,0,0,.6);
        border-radius:8px;
        padding:2px 6px;
        z-index:2;
      }

      .cp-voice {
        display:flex;
        align-items:center;
        gap:6px;
        min-width:100px;
        border:0;
        background:transparent;
        cursor:pointer;
        pointer-events:auto;
        padding:0;
        color:inherit;
      }

      .cp-play-circle {
        width:28px;
        height:28px;
        border-radius:50%;
        display:grid;
        place-items:center;
        box-shadow:0 1px 3px rgba(0,0,0,.1);
        flex-shrink:0;
        font-size:12px;
        background:#f1f5f9;
        color:var(--cp-primary);
      }

      .cp-wave {
        display:flex;
        align-items:center;
        gap:2px;
        height:14px;
        flex:1;
        opacity:.6;
      }

      .cp-wave i {
        width:2px;
        border-radius:2px;
        background:currentColor;
      }

      .cp-voice.playing .cp-wave i {
        animation:cp-wave-pulse .6s ease-in-out infinite alternate;
        opacity:1;
      }

      .cp-voice-info-col {
        display:flex;
        flex-direction:column;
        align-items:flex-end;
        line-height:1;
        margin-left:2px;
      }

      .cp-voice-dur {
        font-size:13px;
        font-weight:bold;
      }

      .cp-voice-time {
        font-size:9px;
        opacity:.45;
        margin-top:3px;
        font-variant-numeric:tabular-nums;
      }

      @keyframes cp-wave-pulse {
        from { transform:scaleY(.4); }
        to { transform:scaleY(1.5); }
      }

      @keyframes cp-rec-bar-pulse {
        from { transform:scaleY(.5); }
        to { transform:scaleY(1.6); }
      }

      .cp-lazy-loading {
        animation:cp-pulse 1.5s infinite;
        background:rgba(0,0,0,.05);
        width:180px;
        height:180px;
        border-radius:8px;
        display:flex;
        align-items:center;
        justify-content:center;
        flex-shrink:0;
      }

      @keyframes cp-pulse {
        0% { opacity:.6; }
        50% { opacity:1; }
        100% { opacity:.6; }
      }

      .cp-context-overlay {
        position:fixed;
        inset:0;
        z-index:2147483004;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:20px;
        background:rgba(15,23,42,.32);
        backdrop-filter:blur(1px);
      }

      .cp-context-menu {
        z-index:2147483005;
        background:#fff;
        border-radius:18px;
        box-shadow:0 8px 30px rgba(0,0,0,.18);
        padding:6px;
        width:auto;
        min-width:166px;
        max-width:210px;
        animation:cp-menu-pop-center .16s cubic-bezier(.2,.8,.2,1);
      }

      @keyframes cp-menu-pop-center {
        from { transform:scale(.92); opacity:0; }
        to { transform:scale(1); opacity:1; }
      }

      .cp-menu-item {
        padding:12px 14px;
        font-size:15px;
        color:#374151;
        cursor:pointer;
        border-radius:10px;
        display:flex;
        align-items:center;
        gap:10px;
        white-space:nowrap;
      }

      .cp-menu-item:active { background:#e5e7eb; }
      .cp-menu-item.danger { color:#ef4444; }

      .cp-footer {
        position:absolute;
        left:0;
        right:0;
        bottom:0;
        z-index:30;
        padding:0 12px max(12px,env(safe-area-inset-bottom));
        background:linear-gradient(to top,rgba(255,255,255,.96),rgba(255,255,255,.80),transparent);
        display:flex;
        flex-direction:column;
        gap:6px;
      }

      .cp-translate-bar {
        max-width:100%;
        margin:2px 4px 0;
        display:inline-flex;
        align-items:center;
        gap:4px;
        padding:2px 8px;
        border:1px solid rgba(255,255,255,.6);
        border-radius:20px;
        background:rgba(255,255,255,.88);
        backdrop-filter:blur(8px);
        box-shadow:0 1px 6px rgba(0,0,0,.04);
      }

      .cp-lang-btn {
        background:transparent;
        border:none;
        font-size:12px;
        font-weight:700;
        color:#374151;
        cursor:pointer;
        padding:2px 6px;
        border-radius:12px;
        white-space:nowrap;
      }

      .cp-swap-btn {
        border:none;
        background:transparent;
        color:#9ca3af;
        font-size:13px;
        cursor:pointer;
        padding:0 4px;
      }

      .cp-toggle-ai-send {
        position:relative;
        border:none;
        background:transparent;
        color:#9ca3af;
        font-size:14px;
        cursor:pointer;
        padding:4px 4px 4px 14px;
        border-radius:50%;
        display:flex;
        align-items:center;
        margin-left:4px;
        border-left:1px solid #e5e7eb;
      }

      .cp-toggle-ai-send::before {
        content:"";
        position:absolute;
        left:4px;
        top:50%;
        transform:translateY(-50%);
        width:5px;
        height:5px;
        border-radius:50%;
        background:#9ca3af;
      }

      .cp-toggle-ai-send.active { color:var(--cp-primary); }

      .cp-toggle-ai-send.active::before {
        background:#22c55e;
        box-shadow:0 0 4px #22c55e;
      }

      .cp-wingman-panel {
        margin:0 4px;
        padding:7px 9px;
        border:1px solid rgba(99,102,241,.16);
        border-radius:16px;
        background:rgba(255,255,255,.92);
        backdrop-filter:blur(6px);
        box-shadow:0 3px 12px rgba(0,0,0,.05);
      }

      .cp-wingman-analysis {
        font-size:12.5px;
        color:#475569;
        margin-bottom:7px;
        line-height:1.4;
        display:flex;
        align-items:center;
        gap:6px;
      }

      .cp-thinking-dot {
        width:6px;
        height:6px;
        border-radius:50%;
        background:#6366f1;
        animation:cp-thinking 1s infinite alternate;
        display:inline-block;
        flex-shrink:0;
      }

      @keyframes cp-thinking {
        from { opacity:.25; transform:scale(.8); }
        to { opacity:1; transform:scale(1.25); }
      }

      .cp-smart-replies-bar {
        display:flex;
        gap:8px;
        overflow-x:auto;
        padding:1px 0;
        scroll-behavior:smooth;
        -webkit-overflow-scrolling:touch;
        scrollbar-width:none;
        background:transparent;
        max-width:100%;
      }

      .cp-smart-replies-bar::-webkit-scrollbar { display:none; }

      .cp-sr-pill {
        flex-shrink:0;
        background:#e0e7ff;
        color:#4338ca;
        padding:7px 12px;
        border-radius:16px;
        font-size:13px;
        font-weight:600;
        cursor:pointer;
        border:1px solid rgba(0,0,0,.05);
        white-space:normal;
        line-height:1.35;
        box-shadow:0 2px 4px rgba(0,0,0,.05);
        max-width:min(72vw,260px);
        overflow:visible;
        text-overflow:clip;
      }

      .cp-sr-pill {
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
        overflow:hidden;
      }

      .cp-sr-pill:active { background:#c7d2fe; }

      .cp-sr-pill em {
        font-style:normal;
        opacity:.72;
        font-weight:500;
        margin-left:4px;
        font-size:11px;
      }

      .cp-quote-preview {
        display:flex;
        align-items:center;
        gap:8px;
        background:rgba(255,255,255,.92);
        backdrop-filter:blur(6px);
        border-radius:12px;
        padding:6px 10px;
        margin:0 4px 4px;
        border:1px solid rgba(0,0,0,.06);
        font-size:13px;
        color:#4b5563;
      }

      .cp-quote-preview-bar {
        width:3px;
        min-height:28px;
        background:var(--cp-primary);
        border-radius:3px;
        flex-shrink:0;
      }

      .cp-quote-preview-body {
        flex:1;
        min-width:0;
        overflow:hidden;
      }

      .cp-quote-preview-name {
        font-size:11px;
        font-weight:700;
        color:var(--cp-primary);
      }

      .cp-quote-preview-text {
        font-size:12px;
        color:#6b7280;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .cp-quote-preview-close {
        border:none;
        background:none;
        font-size:16px;
        color:#9ca3af;
        cursor:pointer;
        padding:0 4px;
        flex-shrink:0;
      }

      .cp-toolbar {
        position:relative;
        max-width:100%;
        margin:0;
        display:flex;
        align-items:flex-end;
        padding:6px;
        border:1px solid rgba(0,0,0,.08);
        border-radius:28px;
        background:rgba(255,255,255,.95);
        box-shadow:0 4px 15px rgba(0,0,0,.06);
        min-height:50px;
      }

      .cp-progress-wrap {
        position:absolute;
        left:16px;
        right:16px;
        top:-5px;
        height:4px;
        background:rgba(0,0,0,.06);
        border-radius:4px;
        overflow:hidden;
        pointer-events:none;
      }

      .cp-progress-bar {
        height:100%;
        width:0%;
        background:var(--cp-primary);
        transition:width .1s linear;
      }

      .cp-tool-btn {
        width:36px;
        height:36px;
        border:none;
        background:transparent;
        color:#6b7280;
        cursor:pointer;
        display:grid;
        place-items:center;
        flex-shrink:0;
        border-radius:50%;
        margin-bottom:2px;
      }

      .cp-input-box {
        flex:1;
        min-width:0;
        display:flex;
        align-items:center;
      }

      .cp-input-box textarea {
        width:100%;
        min-height:36px;
        max-height:120px;
        border:none;
        padding:8px 4px;
        margin:2px 0;
        font-size:15px;
        outline:none;
        background:transparent;
        color:#1f2937;
        resize:none;
        overflow-y:auto;
        font-family:inherit;
        line-height:20px;
      }

      .cp-primary-btn {
        width:38px;
        height:38px;
        border:none;
        border-radius:50%;
        color:#6b7280;
        cursor:pointer;
        display:grid;
        place-items:center;
        background:transparent;
        flex-shrink:0;
        margin-bottom:1px;
      }

      .cp-primary-btn.send {
        background:var(--cp-primary);
        color:#fff;
        box-shadow:0 2px 8px rgba(37,99,235,.3);
      }

      .cp-modal-mask {
        position:absolute;
        inset:0;
        z-index:50;
        background:rgba(0,0,0,.4);
        display:flex;
        align-items:center;
        justify-content:center;
        backdrop-filter:blur(2px);
        padding:20px;
      }

      .cp-modal {
        width:100%;
        max-width:420px;
        max-height:86vh;
        overflow-y:auto;
        border-radius:22px;
        background:#fff;
        box-shadow:0 10px 40px rgba(0,0,0,.2);
      }

      .cp-lang-grid {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:10px;
        margin-top:14px;
      }

      .cp-lang-item {
        display:flex;
        align-items:center;
        gap:10px;
        padding:11px 14px;
        border-radius:14px;
        background:#f8fafc;
        border:1px solid #e2e8f0;
        cursor:pointer;
        font-size:15px;
        color:#334155;
      }

      .cp-settings-head {
        position:sticky;
        top:0;
        z-index:2;
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding:13px 14px;
        background:rgba(255,255,255,.98);
        border-bottom:1px solid #eef2f7;
      }

      .cp-settings-head h3 {
        margin:0;
        font-size:17px;
        font-weight:800;
      }

      .cp-settings-x {
        width:32px;
        height:32px;
        border:none;
        border-radius:50%;
        background:#f1f5f9;
        color:#64748b;
        cursor:pointer;
      }

      .cp-settings-body {
        padding:12px 14px 16px;
        max-height:calc(86vh - 60px);
        overflow-y:auto;
      }

      .cp-settings-section {
        margin-bottom:12px;
        padding:11px;
        border:1px solid #e2e8f0;
        border-radius:16px;
        background:#f8fafc;
      }

      .cp-settings-section-title {
        font-size:13px;
        font-weight:800;
        color:#334155;
        margin-bottom:9px;
      }

      .cp-provider-tabs {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:8px;
      }

      .cp-provider-tab {
        border:1px solid #dbe4ef;
        border-radius:14px;
        padding:10px 8px;
        background:#fff;
        color:#475569;
        font-size:14px;
        font-weight:800;
        cursor:pointer;
      }

      .cp-provider-tab.active {
        color:#fff;
        border-color:var(--cp-primary);
        background:linear-gradient(135deg,#3b82f6,#6366f1);
        box-shadow:0 6px 16px rgba(59,130,246,.22);
      }

      .cp-ai-pane {
        display:none;
        margin-top:8px;
      }

      .cp-ai-pane.show { display:block; }

      .cp-setting-row {
        display:flex;
        gap:9px;
        align-items:center;
      }

      .cp-setting-row > * { flex:1; }

      .cp-setting-field {
        display:block;
        margin-top:8px;
      }

      .cp-setting-field span {
        display:block;
        font-size:12px;
        color:#64748b;
        margin-bottom:5px;
      }

      .cp-setting-field input,
      .cp-setting-field select {
        width:100%;
        box-sizing:border-box;
        padding:9px 10px;
        border:1px solid #dbe4ef;
        border-radius:12px;
        background:#fff;
        color:#111827;
        outline:none;
        font-family:inherit;
      }

      .cp-setting-toggle {
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
        background:#fff;
        border:1px solid #e2e8f0;
        padding:10px;
        border-radius:14px;
        font-size:13px;
        cursor:pointer;
      }

      .cp-setting-toggle input {
        width:18px;
        height:18px;
        accent-color:var(--cp-primary);
      }

      .cp-settings-actions {
        display:flex;
        gap:10px;
        position:sticky;
        bottom:0;
        padding-top:8px;
        background:linear-gradient(to top,#fff 70%,rgba(255,255,255,0));
      }

      .cp-settings-actions button {
        flex:1;
        padding:11px;
        border-radius:14px;
        font-weight:800;
        font-size:15px;
        cursor:pointer;
      }

      .cp-settings-secondary {
        background:#f1f5f9;
        color:#475569;
        border:1px solid #cbd5e1;
      }

      .cp-settings-primary {
        background:var(--cp-primary);
        color:#fff;
        border:none;
      }

      .cp-rec-inline {
        display:flex;
        align-items:center;
        gap:6px;
        flex:1;
        padding:2px 4px;
        background:transparent;
        width:100%;
      }

      .cp-rec-btn-icon {
        background:none;
        border:none;
        padding:4px 8px;
        cursor:pointer;
        display:flex;
        align-items:center;
        justify-content:center;
      }

      .cp-rec-vis {
        flex:1;
        display:flex;
        align-items:center;
        gap:4px;
        min-width:0;
      }

      .cp-rec-dot {
        width:8px;
        height:8px;
        background:#ef4444;
        border-radius:50%;
        flex-shrink:0;
        animation:cp-rec-blink 1.5s infinite;
      }

      .cp-rec-dash {
        flex:1;
        height:2px;
        border-bottom:3px dotted #9ca3af;
        margin:0 4px;
        opacity:.8;
      }

      .cp-rec-bars {
        display:flex;
        align-items:center;
        justify-content:center;
        gap:3px;
        height:20px;
        width:28px;
        margin-right:4px;
      }

      .cp-rec-bars i {
        width:3px;
        border-radius:2px;
        background:#9ca3af;
        animation:cp-rec-bar-pulse .7s ease-in-out infinite alternate;
      }

      @keyframes cp-rec-blink {
        0%,100% { opacity:1; }
        50% { opacity:.3; }
      }


      #cp-chat-root [hidden],
      #cp-chat-root .cp-context-overlay[hidden],
      #cp-chat-root .cp-modal-mask[hidden],
      #cp-chat-root .cp-preview-mask[hidden] {
        display:none!important;
        visibility:hidden!important;
        pointer-events:none!important;
      }

      body.cp-shell-on {
        overflow:hidden!important;
        background:#f1f5f9!important;
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
            <button id="cp-header-more" aria-label="设置"><i class="fa fa-ellipsis-v"></i></button>
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
          <i class="fa fa-angle-down"></i>
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
              <button class="cp-toggle-ai-send" id="cp-send-translate-toggle" title="开启后：输入框内容会翻译成对方语言再发送">译</button>
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
              <button id="cp-rec-cancel" class="cp-rec-btn-icon">
                <i class="fa fa-trash-o" style="font-size:20px;color:#6b7280;"></i>
              </button>
              <div class="cp-rec-vis">
                <span class="cp-rec-dot"></span>
                <div class="cp-rec-dash"></div>
                <div class="cp-rec-bars" id="cp-rec-bars"></div>
              </div>
              <button id="cp-rec-pause" class="cp-rec-btn-icon">
                <i class="fa fa-pause-circle" style="font-size:22px;color:#0ea5e9;"></i>
              </button>
              <span id="cp-rec-time" style="font-size:16px;color:#4b5563;font-family:sans-serif;font-weight:500;width:38px;text-align:center;">0:00</span>
              <button id="cp-rec-send" class="cp-rec-btn-icon">
                <i class="fa fa-paper-plane" style="font-size:20px;color:#0ea5e9;"></i>
              </button>
            </div>
          </div>

          <div class="cp-media-pop" id="cp-media-pop" hidden style="position:absolute;bottom:70px;left:20px;background:#fff;border-radius:16px;padding:8px;box-shadow:0 5px 20px rgba(0,0,0,.15);z-index:40">
            <button id="cp-pick-camera" style="width:100%;background:none;border:none;padding:12px;text-align:left;display:flex;gap:12px;font-size:15px">
              <span class="mi">${ICON.camera}</span><span>拍摄</span>
            </button>
            <button id="cp-pick-album" style="width:100%;background:none;border:none;padding:12px;text-align:left;display:flex;gap:12px;font-size:15px">
              <span class="mi">${ICON.album}</span><span>相册图片/视频</span>
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
                <i class="fa fa-times"></i>
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
                    <input id="cp-ai-model" type="text" placeholder="gpt-4o-mini / qwen / deepseek" />
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
      this.style.height = "36px";
      this.style.height = Math.min(this.scrollHeight, 120) + "px";
      updatePrimaryButton();
      updateFooterHeight();
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handlePrimaryAction();
        this.style.height = "36px";
        updateFooterHeight();
      }
    });

    btnPrimary.addEventListener("click", function () {
      handlePrimaryAction();
      input.style.height = "36px";
      updateFooterHeight();
    });

    byId("cp-media-btn").addEventListener("click", function () {
      var pop = byId("cp-media-pop");
      pop.hidden = !pop.hidden;
    });

    byId("cp-pick-camera").addEventListener("click", function () {
      byId("cp-media-pop").hidden = true;
      byId("cp-camera-file").click();
    });

    byId("cp-pick-album").addEventListener("click", function () {
      byId("cp-media-pop").hidden = true;
      byId("cp-media-file").click();
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
      byId("cp-lang-mask").hidden = false;
    });

    byId("cp-tgt-lang-btn").addEventListener("click", function () {
      state.pickingLangFor = "target";
      byId("cp-lang-mask").hidden = false;
    });

    byId("cp-lang-close").addEventListener("click", function () {
      byId("cp-lang-mask").hidden = true;
    });

    byId("cp-lang-grid").addEventListener("click", function (e) {
      var item = e.target.closest(".cp-lang-item");
      if (!item) return;

      var lang = item.getAttribute("data-lang");

      if (state.pickingLangFor === "source") state.cfg.sourceLang = lang;
      else state.cfg.targetLang = lang;

      syncTranslateBar();
      saveJSON(KEY_CFG, state.cfg);
      byId("cp-lang-mask").hidden = true;
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
        else this.hidden = true;
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
      if (state.previewOpen) closePreview(true);
      if (state.settingsOpen) closeSettings(true);
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
      if (e.target.closest("a,button,video")) return;
      e.preventDefault();
      return false;
    };

    document.addEventListener("selectstart", block, true);
    document.addEventListener("dragstart", block, true);
    document.addEventListener("copy", block, true);
  }

  function openSettings() {
    byId("cp-settings-mask").hidden = false;
    state.settingsOpen = true;
    history.pushState({ cpSettings: true }, "", location.href);
  }

  function closeSettings(fromPopState) {
    if (!state.settingsOpen) return;

    state.settingsOpen = false;
    byId("cp-settings-mask").hidden = true;

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
    state.cfg.translateProvider = provider === "google" ? "google" : "ai";
    syncProviderUI();
    syncTranslateBar();
    saveJSON(KEY_CFG, state.cfg);
  }

  function getProvider() {
    return state.cfg && state.cfg.translateProvider === "google" ? "google" : "ai";
  }

  function syncProviderUI() {
    var provider = getProvider();
    var google = byId("cp-provider-google");
    var ai = byId("cp-provider-ai");
    var pane = byId("cp-ai-pane");

    if (google) google.classList.toggle("active", provider === "google");
    if (ai) ai.classList.toggle("active", provider === "ai");
    if (pane) pane.classList.toggle("show", provider === "ai");
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
    if (model) model.value = state.cfg.ai.model || "gpt-4o-mini";

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

    state.cfg.translateProvider = getProvider();
    state.cfg.ai.endpoint = value("cp-ai-endpoint", state.cfg.ai.endpoint || "").trim();
    state.cfg.ai.apiKey = value("cp-ai-key", state.cfg.ai.apiKey || "").trim();
    state.cfg.ai.model = value("cp-ai-model", state.cfg.ai.model || "gpt-4o-mini").trim() || "gpt-4o-mini";
    state.cfg.ai.temperature = 0.2;

    state.bg.opacity = parseFloat(value("cp-bg-opacity", state.bg.opacity !== undefined ? state.bg.opacity : 0.85));

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

    if (mainEl.scrollTop < 300 && !state.isPreloading && !state.hasNoMoreHistory) {
      var allLen = state.messages.length + state.wkMessages.length;

      if (state.renderLimit < allLen) {
        state.isPreloading = true;
        byId("cp-top-spinner").hidden = false;

        setTimeout(function () {
          state.renderLimit += 50;
          state.isPreloading = false;
          byId("cp-top-spinner").hidden = true;
          incrementalRender("prepend");
        }, 120);
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
        else state.hasNoMoreHistory = true;
      }
    }

    if (state.mounted && getPeerUid()) state.scrollCache[getPeerUid()] = mainEl.scrollTop;
  }

  function showContextMenu(msgId) {
    var msg = getMsgById(msgId);
    if (!msg) return;

    state.contextMsg = msg;

    var menu = byId("cp-context-menu");
    var html =
      '<div class="cp-menu-item" data-action="quote">' +
      ICON.quote +
      ' 引用</div><div class="cp-menu-item" data-action="translate">' +
      ICON.trans +
      " 翻译</div>";

    if (msg.mine) html += '<div class="cp-menu-item danger" data-action="recall">' + ICON.recall + " 撤回</div>";

    html += '<div class="cp-menu-item danger" data-action="delete"><i class="fa fa-trash"></i> 删除</div>';

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
        var res = await fetch("/bridge/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel_id: getPeerUid(),
            message_seq: seq,
            client_msg_no: clientMsgNo
          })
        });

        if (!res.ok) throw new Error("Bridge route failed");
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

    state.messages = state.messages.filter(function (m) {
      return String(m.id) !== String(id);
    });

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
    if (cpIndependentMode()) return;
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
    if (cpIndependentMode()) return;
    if (state.syncScheduled) return;

    state.syncScheduled = true;

    setTimeout(function () {
      state.syncScheduled = false;
      syncFromNative();
    }, 80);
  }


  function syncFromNative() {
    if (cpIndependentMode()) return;
    var rootRows = Array.prototype.slice.call(document.querySelectorAll('[component="chat/messages"] [component="chat/message"]'));

    if (!rootRows.length) {
      if (state.messages.length > 0) {
        state.messages = [];
        state.renderVersion++;
        state.mergedDirty = true;
        state.msgIndexDirty = true;
        incrementalRender("restore");
      }

      return;
    }

    var keepMap = {};

    for (var i = 0; i < state.messages.length; i++) keepMap[state.messages[i].id] = state.messages[i];

    var next = [];
    var changed = false;
    var wasAtBottom = isMainAtBottom();

    for (var idx = 0; idx < rootRows.length; idx++) {
      var row = rootRows[idx];
      var id = row.getAttribute("data-mid") || row.getAttribute("data-id");

      if (state.suppressNativeIds[String(id)]) continue;

      if (id && keepMap[id]) {
        next.push(keepMap[id]);
      } else {
        var m = parseNativeMessage(row);

        if (m) {
          next.push(m);
          changed = true;
        }
      }
    }

    if (next.length !== state.messages.length) changed = true;

    if (!changed) {
      ensurePeerLoaded();
      return;
    }

    state.messages = next;
    pruneAllMessagesInMemory();

    state.renderVersion++;
    state.mergedDirty = true;
    state.msgIndexDirty = true;

    var peerMsg = next.find(function (m) {
      return !m.mine && m.username;
    });

    updateHeaderPeerInfo(peerMsg);
    ensurePeerLoaded();

    // 修复：原生消息更新后，如果在底部就跟随
    if (wasAtBottom) {
      incrementalRender("bottom");
      requestAnimationFrame(forceScrollToBottom);
    } else {
      incrementalRender("restore");
    }
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
          (isError ? ' data-act="retry-translate"' : "") +
        ">" +
          (isLoading ? "⏳ " : "✨ ") +
          esc(m.translation) +
          (isError ? "（点此重试）" : "") +
        "</div>" +
      "</div>"
    );
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
    var renderArr = allMsgs.slice(-state.renderLimit);

    var newHash = state.renderVersion + "|" + renderArr.length + "|";
    var h;

    for (h = 0; h < renderArr.length; h++) {
      newHash += [
        renderArr[h].id,
        renderArr[h]._ver || 0,
        renderArr[h].recalled ? "R" : "",
        renderArr[h].translationOpen ? "T" : "",
        renderArr[h].translation || "",
        renderArr[h].text || "",
        renderArr[h].serverText || ""
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
            '<button class="cp-media-thumb cp-video-wrap" data-act="preview-media">' +
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

        var safeUserSlug = m.userslug || encodeURIComponent(String(m.username || "guest").toLowerCase().replace(/ /g, "-"));

        var avatarWrapHtml = m.mine
          ? ""
          : '<a href="/user/' +
            escAttr(safeUserSlug) +
            '/topics" class="cp-avatar-wrap" title="访问主页">' +
            m.avatarHtml +
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

      targetIds.push(m.id);
      targetNodes[m.id] = node;
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
    updateFooterHeight();
  }

  function initLazyObserver() {
    if (state.lazyObserver) state.lazyObserver.disconnect();

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
      document.querySelectorAll(".cp-lazy-media").forEach(function (el) {
        state.lazyObserver.observe(el);
      });

      document.querySelectorAll(".cp-lazy-audio").forEach(function (el) {
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

      var mediaUrl =
        (img && (img.getAttribute("data-original") || img.getAttribute("src"))) ||
        (vid && (vid.getAttribute("data-original") || vid.getAttribute("src")));

      if (img) openPreview({ type: "image", mediaUrl: mediaUrl });
      else if (vid) openPreview({ type: "video", mediaUrl: mediaUrl });

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
              model: ai.model,
              temperature: Number.isFinite(Number(ai.temperature)) ? Number(ai.temperature) : 0.2,
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
    var provider = forceProvider || getProvider();

    if (provider === "ai") {
      return await translateViaAI(text, from, to, state.cfg.ai || {});
    }

    return await translateViaGoogle(text, to, from);
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
          text: r.slice(0, 10),
          style: "自然",
          affinity_risk: "安全"
        };
      }

      return {
        label: String(r.label || r.style || "回复").slice(0, 6),
        text: String(r.text || r.reply || "").trim().slice(0, 10),
        style: String(r.style || "自然"),
        affinity_risk: String(r.affinity_risk || r.risk || "安全")
      };
    }).filter(function (r) {
      return !!r.text;
    });

    return json;
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
      var text = String(item.text || "").trim().slice(0, 10);

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

  function uploadToNodeBB(file, onProgress) {
    return new Promise(function (resolve, reject) {
      var fd = new FormData();
      fd.append("files[]", file, file.name || "cp_" + Date.now());

      var xhr = new XMLHttpRequest();
      xhr.open("POST", cpIndependentMode() ? (cpApiBase() + "/upload") : ((window.config && config.relative_path ? config.relative_path : "") + "/api/post/upload"));
      xhr.withCredentials = true;

      if (window.config) xhr.setRequestHeader("x-csrf-token", config.csrf_token || config.csrfToken || "");

      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };

      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var json = JSON.parse(xhr.responseText);

            var url =
              (json && json.response && json.response.images && json.response.images[0] && json.response.images[0].url) ||
              (json && json.files && json.files[0] && (json.files[0].url || json.files[0].path)) ||
              "";

            if (url && !/^https?:\/\//i.test(url) && url.charAt(0) !== "/") url = "/" + url;

            if (!url) throw new Error("upload url empty");

            resolve(url);
          } catch (err) {
            reject(err);
          }
        } else {
          reject(new Error("upload failed: " + xhr.status));
        }
      };

      xhr.onerror = function () {
        reject(new Error("network error"));
      };

      xhr.send(fd);
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

  async function compressWithCanvas(file, targetType) {
    var dataUrl = await readFile(file);
    var img = await loadImage(dataUrl);

    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var scale = Math.min(1, IMAGE_CONFIG.maxSide / Math.max(w, h));

    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));

    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    var ctx = canvas.getContext("2d");
    if (!ctx || !canvas.toBlob) return null;

    ctx.drawImage(img, 0, 0, w, h);

    var targetBytes = IMAGE_CONFIG.maxSizeMB * 1024 * 1024;
    var qualities = [IMAGE_CONFIG.quality, 0.52, 0.45, 0.38];
    var best = null;

    for (var i = 0; i < qualities.length; i++) {
      var q = qualities[i];

      var blob = await new Promise(function (resolve) {
        canvas.toBlob(resolve, targetType, q);
      });

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
    maxSizeThreshold = maxSizeThreshold || VIDEO_CONFIG.maxSizeThreshold;
    maxDuration = maxDuration || VIDEO_CONFIG.maxDuration;

    if (!file || !/^video\//i.test(file.type)) return file;
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return file;

    var inputUrl = URL.createObjectURL(file);

    try {
      var video = document.createElement("video");
      video.src = inputUrl;
      video.muted = true;
      video.playsInline = true;

      await new Promise(function (resolve, reject) {
        video.onloadedmetadata = resolve;
        video.onerror = reject;
      });

      if (video.duration > maxDuration) {
        var tooLong = new Error("视频过长，最多 " + maxDuration + " 秒");
        tooLong.code = "VIDEO_TOO_LONG";
        throw tooLong;
      }

      if (file.size <= maxSizeThreshold) return file;
      if (video.videoWidth === 0 || video.videoHeight === 0) throw new Error("视频无效");

      var scale = Math.min(1, VIDEO_CONFIG.maxWidth / Math.max(1, video.videoWidth));
      var width = Math.max(2, Math.round(video.videoWidth * scale));
      var height = Math.max(2, Math.round(video.videoHeight * scale));

      var canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      var ctx = canvas.getContext("2d");
      if (!ctx) return file;

      var canvasStream = canvas.captureStream(VIDEO_CONFIG.fps);
      var audioTracks = [];

      try {
        if (video.captureStream) audioTracks = Array.prototype.slice.call(video.captureStream().getAudioTracks());
      } catch (_) {}

      var tracks = Array.prototype.slice.call(canvasStream.getVideoTracks()).concat(audioTracks);
      var outputStream = new MediaStream(tracks);
      var mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" : "video/webm";
      var chunks = [];

      var recorder = new MediaRecorder(outputStream, {
        mimeType: mimeType,
        videoBitsPerSecond: VIDEO_CONFIG.videoBitsPerSecond,
        audioBitsPerSecond: VIDEO_CONFIG.audioBitsPerSecond
      });

      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size) chunks.push(e.data);
      };

      var drawing = true;

      var draw = function () {
        if (!drawing) return;

        try {
          ctx.drawImage(video, 0, 0, width, height);
        } catch (_) {}

        if (!video.paused && !video.ended) requestAnimationFrame(draw);
      };

      var finished = new Promise(function (resolve) {
        recorder.onstop = resolve;
      });

      recorder.start(500);
      await video.play();
      draw();

      await new Promise(function (resolve) {
        video.onended = resolve;
        video.onerror = resolve;
      });

      drawing = false;
      recorder.stop();

      await finished;

      var blob = new Blob(chunks, { type: mimeType });

      if (!blob.size || blob.size >= file.size) return file;

      return new File([blob], String(file.name || "video-" + Date.now()).replace(/\.[^.]+$/, ".webm"), {
        type: blob.type || "video/webm",
        lastModified: Date.now()
      });
    } catch (err) {
      warn("compress-video", err);

      if (err && err.code === "VIDEO_TOO_LONG") throw err;

      return file;
    } finally {
      URL.revokeObjectURL(inputUrl);
    }
  }

  async function onPickMedia(e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    if (!files.length) return;

    var pWrap = byId("cp-upload-progress-wrap");
    var pBar = byId("cp-upload-progress-bar");

    try {
      for (var i = 0; i < files.length; i++) {
        pWrap.hidden = false;
        pBar.style.width = "0%";

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
          pBar.style.width = pct * 100 + "%";
        });

        if (!url) continue;

        if ((uploadFile.type || rawFile.type || "").indexOf("image/") === 0) {
          sendText("![](" + url + ")");
        } else if ((uploadFile.type || rawFile.type || "").indexOf("video/") === 0) {
          sendText("[视频](" + url + ")");
        } else {
          sendText("[文件](" + url + ")");
        }
      }
    } catch (err) {
      warn("pick-media", err);
      toast(cpT("uploadFailed", "上传失败"));
    } finally {
      pWrap.hidden = true;
      pBar.style.width = "0%";
    }

    e.target.value = "";
  }

  function handleBackgroundUpload(e) {
    var file = e.target.files[0];
    if (!file) return;

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
    byId("cp-toolbar-inputs").hidden = isRec;
    byId("cp-rec-inline").hidden = !isRec;
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

    try {
      var stream = await navigator.mediaDevices.getUserMedia({
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

            pWrap.hidden = false;
            pBar.style.width = "0%";

            var url = await uploadToNodeBB(file, function (pct) {
              pBar.style.width = pct * 100 + "%";
            });

            sendText("[语音消息](" + url + ")");
          } catch (e) {
            warn("record-upload", e);
            toast("语音发送失败");
          } finally {
            pWrap.hidden = true;
            pBar.style.width = "0%";
          }
        }
      };

      toggleUIForRecording(true);

      var icon = byId("cp-rec-pause").querySelector("i");
      icon.className = "fa fa-pause-circle";

      state.rec.mediaRecorder.start(250);

      state.rec.timer = setInterval(function () {
        if (state.rec.paused) return;

        state.rec.sec += 1;
        byId("cp-rec-time").textContent = formatDuration(state.rec.sec);

        if (state.rec.sec >= (state.cfg.voiceMaxDuration || 60)) stopRecording(true);
      }, 1000);
    } catch (e) {
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

    var icon = byId("cp-rec-pause").querySelector("i");

    if (mr.state === "recording") {
      mr.pause();
      state.rec.paused = true;
      icon.className = "fa fa-play-circle";
    } else if (mr.state === "paused") {
      mr.resume();
      state.rec.paused = false;
      icon.className = "fa fa-pause-circle";
    }
  }

  async function openPreview(msg) {
    var body = byId("cp-preview-body");
    var localUrl = await getOrFetchMediaBlob(msg.mediaUrl, msg.type);

    if (msg.type === "image") {
      body.innerHTML =
        '<img src="' +
        escAttr(localUrl) +
        '" style="max-width:100%;max-height:80vh;border-radius:12px;pointer-events:none;"/>';
    } else if (msg.type === "video") {
      body.innerHTML =
        '<video src="' +
        escAttr(localUrl) +
        '" controls autoplay playsinline style="max-width:100%;max-height:80vh;border-radius:12px;"></video>';
    }

    var mask = byId("cp-preview-mask");
    mask.hidden = false;
    mask.style.backgroundColor = "rgba(0,0,0,.9)";
    body.style.transform = "";

    state.previewOpen = true;

    history.pushState({ cpPreview: true }, "", location.href);
  }

  function closePreview(fromPopState) {
    if (!state.previewOpen) return;

    state.previewOpen = false;

    var mask = byId("cp-preview-mask");
    var body = byId("cp-preview-body");

    body.style.transform = "translateY(100vh) scale(.8)";
    mask.style.backgroundColor = "transparent";

    setTimeout(function () {
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
    var s = String(url || "").trim();

    if (!s) return false;
    if (s.charAt(0) === "/" || s.charAt(0) === "#") return true;

    return /^(https?:|mailto:|tel:)/i.test(s);
  }

  function isSafeImgSrc(url) {
    var s = String(url || "").trim();

    if (!s) return false;
    if (s.charAt(0) === "/") return true;

    return /^(https?:|data:image\/)/i.test(s);
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

    bars.innerHTML = waveHeights.slice(0, 5).map(function (h, i) {
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
    document.addEventListener("DOMContentLoaded", boot);

    $(window).on("action:ajaxify.end action:chat.loaded action:chat.switched", function () {
      setTimeout(boot, 80);
      setTimeout(boot, 260);
    });
  } else {
    document.addEventListener("DOMContentLoaded", boot);
    window.addEventListener("load", boot);
  }
})();
