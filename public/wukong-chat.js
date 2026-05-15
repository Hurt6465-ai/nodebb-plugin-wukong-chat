(function () {
  "use strict";

  var APP_KEY = "__nodebbWukongChatV5";
  if (window[APP_KEY]) return;
  window[APP_KEY] = true;

  var PLUGIN_BASE = "/plugins/nodebb-plugin-wukong-chat/static";
  var SDK_URL = "https://cdn.jsdelivr.net/npm/wukongimjssdk@latest/lib/wukongimjssdk.umd.js";

  var DB_NAME = "NBB_Wukong_Chat_V5";
  var MAX_MESSAGES_IN_MEMORY = 900;
  var MAX_PERSIST_MESSAGES = 260;
  var BOTTOM_THRESHOLD = 120;

  var MEDIA_CACHE_MAX_BLOB_BYTES = 5 * 1024 * 1024;
  var MEDIA_CACHE_MAX_TOTAL_BYTES = 40 * 1024 * 1024;
  var MEDIA_CACHE_MAX_ITEMS = 240;
  var MEDIA_CACHE_EXPIRE_MS = 7 * 24 * 3600 * 1000;

  var IMAGE_CONFIG = {
    maxSide: 1440,
    maxSizeMB: 0.45,
    quality: 0.6,
    minCompressBytes: 120 * 1024,
    useWebp: true
  };

  var VIDEO_CONFIG = {
    maxSizeThreshold: 40 * 1024 * 1024,
    maxDuration: 180
  };

  var VOICE_CONFIG = {
    fallbackMimeTypes: ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"],
    audioBitsPerSecond: 16000
  };

  var LANG_LIST = [
    { n: "中文", code: "zh-CN", f: "🇨🇳" },
    { n: "English", code: "en", f: "🇺🇸" },
    { n: "မြန်မာစာ", code: "my", f: "🇲🇲" },
    { n: "日本語", code: "ja", f: "🇯🇵" },
    { n: "한국어", code: "ko", f: "🇰🇷" },
    { n: "ภาษาไทย", code: "th", f: "🇹🇭" },
    { n: "Tiếng Việt", code: "vi", f: "🇻🇳" },
    { n: "Русский", code: "ru", f: "🇷🇺" }
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

  var FALLBACK_I18N = {
    app_name: "悟空聊天",
    loading_chat: "正在加载悟空聊天...",
    connecting: "正在连接悟空...",
    connect_success: "已连接",
    connect_failed: "连接失败",
    not_ready: "悟空未就绪",
    login_required: "请先登录",
    chat: "聊天",
    chat_room: "聊天室",
    conversation: "会话",
    new_chat: "开始聊天",
    enter_uid: "输入 NodeBB 用户 UID",
    open_chat: "打开聊天",
    back: "返回",
    settings: "设置",
    close: "关闭",
    save: "保存配置",
    saved: "配置已保存",
    message_placeholder: "发送消息...",
    send: "发送",
    record: "录音",
    cancel: "取消",
    pause: "暂停",
    resume: "继续",
    delete: "删除",
    quote: "引用",
    translate: "翻译",
    recall: "撤回",
    copy: "复制",
    copied: "已复制",
    retry: "重试",
    loading: "加载中...",
    load_more: "加载更多",
    no_more: "没有更多历史",
    today: "今天",
    yesterday: "昨天",
    before_yesterday: "前天",
    image: "图片",
    video: "视频",
    voice: "语音",
    file: "文件",
    gallery: "图片集",
    recalled: "此消息已被撤回",
    media: "媒体",
    camera: "拍摄",
    album: "相册图片/视频",
    uploading: "正在上传...",
    upload_failed: "上传失败",
    compressing_image: "正在压缩图片...",
    checking_video: "正在检查视频...",
    video_too_long: "视频过长",
    record_unavailable: "当前浏览器不支持录音",
    record_denied: "录音不可用或被拒绝",
    voice_send_failed: "语音发送失败",
    select_language: "选择语言",
    source_language: "我的语言",
    target_language: "对方语言",
    swap: "切换",
    translate_bar: "翻译",
    translate_provider: "翻译方式",
    google_translate: "谷歌翻译",
    ai_translate: "AI 翻译",
    send_translate_on: "译发已开启",
    send_translate_off: "译发已关闭",
    auto_translate: "自动翻译最新对方消息",
    send_translate: "输入内容翻译后发送",
    translation_loading: "翻译中...",
    translation_failed: "翻译失败",
    translation_empty: "翻译为空",
    smart_reply: "追问气囊",
    wingman: "僚机",
    wingman_need_ai: "僚机需要先在设置里填写 AI 接口、Key 和模型，或服务端配置 AI_PROXY。",
    thinking: "思考中…",
    wingman_failed: "僚机分析失败，稍后再试。",
    safe: "安全",
    reply: "回复",
    context_memory: "上下文",
    context_rounds: "历史轮数",
    target_gender: "对方性别",
    girl: "女生",
    boy: "男生",
    unspecified: "不指定",
    relationship_stage: "关系阶段",
    just_met: "刚认识",
    few_chats: "聊过几次",
    flirting: "有点暧昧",
    dated: "已约过会",
    communication_style: "聊天风格",
    communication_style_placeholder: "自然直接，偶尔幽默",
    ai_endpoint: "AI 接口 URL",
    api_key: "API Key",
    model: "模型",
    background: "背景",
    set_background: "设置自定义背景图片",
    fog_mask: "白雾遮罩",
    clear_local_history: "清空本地聊天记录",
    confirm_clear: "确定要清空与该会话的所有本地记录吗？",
    history_cleared: "已清空记录",
    go_bottom: "回到底部",
    peer_loading: "加载中...",
    topic: "主题聊天室",
    uid_invalid: "请输入用户 UID",
    same_user: "不能和自己聊天",
    open_failed: "打开失败",
    network_error: "网络错误",
    sdk_loading: "正在加载悟空 SDK...",
    sdk_failed: "悟空 SDK 加载失败",
    empty_history: "暂无历史",
    unknown_user: "用户"
  };

  var DEFAULT_TRANSLATE_PROMPT =
    "将以下消息翻译成 {{myLang}}。\n\n" +
    "要求：\n" +
    "- 采用自然直译风格：保留原文结构、语气、表情符号和换行，译文读起来像 {{myLang}} 原生消息，不生硬。\n" +
    "- 若原文带有暧昧、调侃、冷淡、敷衍、撒娇、抱怨等语气，译文必须保留这种聊天感觉。\n" +
    "- 保留链接、用户名、代码块、Markdown、列表和表情。\n" +
    "- 只输出 JSON：{\"translation\":\"译文\"}\n" +
    "- 不要添加任何解释或额外文字。\n\n" +
    "待翻译消息：\n" +
    "\"{{peerMessage}}\"";

  var DEFAULT_WINGMAN_PROMPT =
    "你是我的情感顾问和聊天僚机。根据历史聊天上下文，以及以下信息，帮我分析对方消息并生成短回复建议。\n\n" +
    "【我的信息】\n" +
    "- 我的语言：{{myLang}}\n" +
    "- 对方性别：{{targetGender}}（女生/男生/不指定）\n" +
    "- 当前关系阶段：{{relationshipStage}}（刚认识/聊过几次/有点暧昧/已约过会）\n" +
    "- 我的聊天风格：{{communicationStyle}}（默认：自然直接，偶尔幽默）\n\n" +
    "【最近对话历史】\n" +
    "{{history}}\n\n" +
    "【对方刚发的消息】\n" +
    "\"{{peerMessage}}\"\n\n" +
    "【你需要完成的任务】\n" +
    "1. 做情感分析。50字以内，格式严格写为：\"[情绪状态]，[表面意思]，[可能潜台词]。\" 若消息太短无法判断，写\"消息很短，正常接即可。\"\n" +
    "2. 生成3-5条短回复。每条必须能直接发送，10字以内，口语化，有接话钩子。\n\n" +
    "【输出格式】\n" +
    "只输出一个 JSON，不要任何 Markdown 标记，格式如下：\n" +
    "{\"emotion_analysis\":\"这里填情感分析\",\"quick_replies\":[{\"label\":\"6字内标签\",\"text\":\"10字内短回复\",\"style\":\"轻松幽默/温暖关心/真诚走心/推进关系/化解尴尬\",\"affinity_risk\":\"风险说明\"}]}";

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
    gear: '<i class="fa fa-ellipsis-v"></i>',
    trash: '<i class="fa fa-trash"></i>',
    copy: '<i class="fa fa-copy"></i>',
    ai: '<span class="nbb-wk-ai-mark">译</span>'
  };

  var waveHeights = [5, 8, 12, 16, 10, 7, 14, 9, 13, 6, 11, 15];

  var state = {
    root: null,
    i18n: Object.assign({}, FALLBACK_I18N),
    lang: "zh-CN",
    cfg: null,
    bg: null,
    booted: false,
    mounted: false,
    page: null,
    me: null,
    peer: null,
    peerCache: {},
    channelId: "",
    channelType: 1,
    channelTitle: "",
    sdkReady: false,
    wkReady: false,
    connectStatus: 0,
    messages: [],
    renderLimit: 80,
    renderVersion: 0,
    lastRenderHash: "",
    renderPending: false,
    loadingHistory: false,
    hasNoMoreHistory: false,
    localMaxSeq: 0,
    msgIndex: null,
    msgIndexDirty: true,
    quoteTarget: null,
    contextMsg: null,
    pickingLangFor: null,
    previewOpen: false,
    settingsOpen: false,
    unreadCount: 0,
    stickToBottom: true,
    readTimer: null,
    vvHandler: null,
    audio: new Audio(),
    currentAudioEl: null,
    audioDurCache: {},
    blobUrlCache: {},
    blobKeys: [],
    aiCache: {},
    aiCacheKeys: [],
    translateInflight: {},
    wingmanRequestId: 0,
    rec: {
      mediaRecorder: null,
      stream: null,
      mimeType: "",
      chunks: [],
      timer: null,
      sec: 0,
      paused: false,
      shouldSend: false
    }
  };

  function warn(scope, err) {
    try { console.warn("[nbb-wukong][" + scope + "]", err); } catch (_) {}
  }

  function byId(id) { return document.getElementById(id); }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escAttr(str) {
    return esc(str).replace(/"/g, "&quot;");
  }

  function normalizeTextKey(text) {
    return String(text == null ? "" : text).replace(/\s+/g, " ").trim().slice(0, 800);
  }

  function t(key) {
    return state.i18n[key] || FALLBACK_I18N[key] || key;
  }

  function toast(text) {
    var old = document.querySelector(".nbb-wk-toast");
    if (old) old.remove();
    var n = document.createElement("div");
    n.className = "nbb-wk-toast";
    n.textContent = text;
    document.body.appendChild(n);
    setTimeout(function () { if (n.parentNode) n.remove(); }, 2200);
  }

  function api(path, opts) {
    opts = opts || {};
    opts.credentials = "include";
    opts.headers = Object.assign({ "Accept": "application/json" }, opts.headers || {});
    return fetch(path, opts).then(function (r) {
      return r.text().then(function (txt) {
        var data = txt;
        try { data = txt ? JSON.parse(txt) : {}; } catch (_) {}
        if (!r.ok) {
          var err = new Error((data && data.error) || ("HTTP " + r.status));
          err.status = r.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function postJSON(path, body) {
    return api(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
  }

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return Object.assign({}, fallback, JSON.parse(raw));
    } catch (e) {
      warn("load-json", e);
      return fallback;
    }
  }

  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { warn("save-json", e); }
  }

  function detectUILang() {
    var saved = localStorage.getItem("nbb_wk_lang");
    if (saved) return saved;
    var raw =
      (window.app && app.user && (app.user.language || app.user.userLang)) ||
      document.documentElement.getAttribute("lang") ||
      navigator.language ||
      "zh-CN";
    raw = String(raw).toLowerCase();
    if (raw.indexOf("my") === 0 || raw.indexOf("mm") === 0 || raw.indexOf("bur") === 0) return "my-MM";
    if (raw.indexOf("en") === 0) return "en-GB";
    return "zh-CN";
  }

  function loadI18n() {
    state.lang = detectUILang();
    return fetch(PLUGIN_BASE + "/i18n/" + encodeURIComponent(state.lang) + ".json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("i18n " + r.status); return r.json(); })
      .then(function (json) { state.i18n = Object.assign({}, FALLBACK_I18N, json || {}); })
      .catch(function () { state.i18n = Object.assign({}, FALLBACK_I18N); });
  }

  function normalizeConfig(cfg) {
    var defaults = {
      uiLang: detectUILang(),
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
      translateProvider: "google",
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
    if (cfg.translateProvider !== "ai" && cfg.translateProvider !== "google") cfg.translateProvider = "google";
    if (!cfg.sourceLang) cfg.sourceLang = defaults.sourceLang;
    if (!cfg.targetLang) cfg.targetLang = defaults.targetLang;
    cfg.contextRounds = Number(cfg.contextRounds) || 30;
    if ([10, 30, 50, 100].indexOf(cfg.contextRounds) === -1) cfg.contextRounds = 30;
    if (["女生", "男生", "不指定"].indexOf(cfg.targetGender) === -1) cfg.targetGender = "女生";
    if (!cfg.relationshipStage) cfg.relationshipStage = "刚认识";
    if (!cfg.communicationStyle) cfg.communicationStyle = "自然直接，偶尔幽默";
    if (!Number.isFinite(Number(cfg.ai.temperature))) cfg.ai.temperature = 0.2;
    return cfg;
  }

  function storageKey(suffix) {
    var id = state.channelId || "landing";
    return "nbb_wk_" + String(id).replace(/[^\w.-]/g, "_") + "_" + suffix;
  }

  var dbPromise = new Promise(function (resolve) {
    if (!window.indexedDB) return resolve(null);
    var req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function (e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains("chats")) db.createObjectStore("chats", { keyPath: "key" });
      if (!db.objectStoreNames.contains("media")) db.createObjectStore("media", { keyPath: "url" });
    };
    req.onsuccess = function (e) { resolve(e.target.result); };
    req.onerror = function (e) { warn("idb-open", e); resolve(null); };
  });

  async function idbGet(storeName, key) {
    var db = await dbPromise;
    if (!db) return null;
    return new Promise(function (resolve) {
      try {
        var req = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
        req.onsuccess = function (e) { resolve(e.target.result); };
        req.onerror = function () { resolve(null); };
      } catch (_) { resolve(null); }
    });
  }

  async function idbPut(storeName, val) {
    var db = await dbPromise;
    if (!db) return;
    try { db.transaction(storeName, "readwrite").objectStore(storeName).put(val); } catch (e) { warn("idb-put", e); }
  }

  async function idbDelete(storeName, key) {
    var db = await dbPromise;
    if (!db) return;
    try { db.transaction(storeName, "readwrite").objectStore(storeName).delete(key); } catch (e) { warn("idb-delete", e); }
  }

  async function persistChat() {
    if (!state.channelId) return;
    await idbPut("chats", {
      key: state.channelType + ":" + state.channelId,
      messages: state.messages.slice(-MAX_PERSIST_MESSAGES),
      maxSeq: state.localMaxSeq || 0,
      ts: Date.now()
    });
  }

  async function loadChatFromDB() {
    if (!state.channelId) return;
    var data = await idbGet("chats", state.channelType + ":" + state.channelId);
    if (!data || !Array.isArray(data.messages)) return;
    state.messages = data.messages.slice(-MAX_PERSIST_MESSAGES);
    state.localMaxSeq = Number(data.maxSeq || 0);
    state.renderVersion++;
    state.msgIndexDirty = true;
    incrementalRender("restore");
  }

  async function idbPutMedia(url, blob) {
    if (!url || !blob || blob.size > MEDIA_CACHE_MAX_BLOB_BYTES) return;
    await idbPut("media", { url: url, blob: blob, size: blob.size || 0, ts: Date.now() });
  }

  async function cleanUpOldMedia() {
    var db = await dbPromise;
    if (!db) return;
    try {
      var items = [];
      await new Promise(function (resolve) {
        var req = db.transaction("media", "readonly").objectStore("media").openCursor();
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
        req.onerror = function () { resolve(); };
      });
      if (!items.length) return;
      var now = Date.now();
      items.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
      var total = 0;
      var keep = [];
      var del = [];
      for (var i = 0; i < items.length; i++) {
        if (!items[i].ts || now - items[i].ts > MEDIA_CACHE_EXPIRE_MS) del.push(items[i].key);
        else { keep.push(items[i]); total += items[i].size || 0; }
      }
      while (keep.length > MEDIA_CACHE_MAX_ITEMS || total > MEDIA_CACHE_MAX_TOTAL_BYTES) {
        var old = keep.shift();
        if (!old) break;
        del.push(old.key);
        total -= old.size || 0;
      }
      for (var d = 0; d < del.length; d++) await idbDelete("media", del[d]);
    } catch (e) { warn("cleanup-media", e); }
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
        if (blob.size <= MEDIA_CACHE_MAX_BLOB_BYTES) idbPutMedia(url, blob);
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
      try { URL.revokeObjectURL(state.blobUrlCache[oldUrl]); } catch (_) {}
      delete state.blobUrlCache[oldUrl];
    }
    return blobUrl;
  }

  function findOrCreateRoot() {
    var root =
      document.querySelector("#nodebb-wukong-root") ||
      document.querySelector("#wukong-chat-root") ||
      document.querySelector(".nbb-wk-root") ||
      document.querySelector("[data-wukong-root]");
    if (!root && /^\/wukong(?:\/|$)/.test(location.pathname)) {
      root = document.createElement("div");
      root.id = "nodebb-wukong-root";
      root.className = "nbb-wk-root";
      root.setAttribute("data-wukong-root", "1");
      document.body.appendChild(root);
    }
    return root;
  }

  function parsePage(root) {
    var cfg = window.__NBB_WUKONG_PAGE__ || {};
    var pathMatch = location.pathname.match(/\/wukong\/([^/?#]+)/);
    var targetUid =
      String((root && root.getAttribute("data-target-uid")) || cfg.targetUid || (pathMatch && pathMatch[1]) || "").replace(/[^0-9]/g, "");
    var tid = String((root && root.getAttribute("data-tid")) || cfg.tid || "").replace(/[^0-9]/g, "");
    var channelId = String((root && root.getAttribute("data-channel-id")) || cfg.channelId || "").trim();
    var channelType = Number((root && root.getAttribute("data-channel-type")) || cfg.channelType || 0);
    var q = new URLSearchParams(location.search);
    if (!targetUid && q.get("uid")) targetUid = String(q.get("uid")).replace(/[^0-9]/g, "");
    if (!tid && q.get("tid")) tid = String(q.get("tid")).replace(/[^0-9]/g, "");
    if (!channelId && q.get("channel_id")) channelId = String(q.get("channel_id")).trim();
    if (!channelType && q.get("channel_type")) channelType = Number(q.get("channel_type"));
    return { targetUid: targetUid, tid: tid, channelId: channelId, channelType: channelType || 1 };
  }

  function getFlag(langName) {
    for (var i = 0; i < LANG_LIST.length; i++) if (LANG_LIST[i].n === langName) return LANG_LIST[i].f;
    return "🌐";
  }

  function getLangCode(langName, fallback) {
    var raw = String(langName || "").trim();
    return LANG_CODE_MAP[raw] || LANG_CODE_MAP[raw.toLowerCase()] || fallback || raw || "auto";
  }

  function formatTime(ts) {
    var d = new Date(ts || Date.now());
    var h = d.getHours();
    var suffix = h >= 12 ? "PM" : "AM";
    var hour12 = h % 12 || 12;
    return String(hour12) + ":" + String(d.getMinutes()).padStart(2, "0") + " " + suffix;
  }

  function formatDuration(sec) {
    sec = Number(sec || 0);
    if (!sec || isNaN(sec)) return "0:00";
    sec = Math.floor(sec);
    return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  }

  function formatDateDivider(ts) {
    var d = new Date(ts);
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var diff = Math.floor((today - msgDay) / (1000 * 60 * 60 * 24));
    if (diff === 0) return t("today");
    if (diff === 1) return t("yesterday");
    if (diff === 2) return t("before_yesterday");
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + "/" + d.getDate();
    return d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate();
  }

  function isMainAtBottom() {
    var main = byId("nbb-wk-main");
    if (!main) return true;
    return main.scrollHeight - main.scrollTop - main.clientHeight < BOTTOM_THRESHOLD;
  }

  function forceScrollToBottom() {
    var main = byId("nbb-wk-main");
    if (!main) return;
    main.scrollTop = main.scrollHeight;
  }

  function smoothScrollToBottom() {
    var main = byId("nbb-wk-main");
    if (!main) return;
    var gap = main.scrollHeight - main.scrollTop - main.clientHeight;
    if (gap < 800) main.scrollTo({ top: main.scrollHeight, behavior: "smooth" });
    else main.scrollTop = main.scrollHeight;
  }

  function safeUrl(url) {
    var s = String(url || "").trim();
    if (!s) return "";
    if (s.charAt(0) === "/" || s.indexOf("blob:") === 0 || s.indexOf("data:image/") === 0) return s;
    if (/^https?:\/\//i.test(s)) return s;
    return "";
  }

  function avatarHtml(user) {
    user = user || {};
    var pic = user.picture || user.avatar || "";
    var name = user.displayname || user.username || t("unknown_user");
    var text = user.icontext || String(name || "?").charAt(0).toUpperCase();
    var bg = user.iconbgColor || "#72a5f2";
    if (pic) {
      return '<img class="nbb-wk-avatar-img" src="' + escAttr(pic) + '" alt="" />';
    }
    return '<div class="nbb-wk-avatar-fallback" style="background:' + escAttr(bg) + '">' + esc(text) + "</div>";
  }

  function displayName(user) {
    user = user || {};
    return user.displayname || user.fullname || user.username || (t("unknown_user") + (user.uid ? user.uid : ""));
  }

  function buildLanding() {
    state.root.innerHTML =
      '<div class="nbb-wk-shell nbb-wk-landing">' +
        '<div class="nbb-wk-bg"></div>' +
        '<div class="nbb-wk-landing-card">' +
          '<div class="nbb-wk-landing-logo">WK</div>' +
          '<h1>' + esc(t("app_name")) + '</h1>' +
          '<p>' + esc(t("new_chat")) + '</p>' +
          '<div class="nbb-wk-landing-row">' +
            '<input id="nbb-wk-open-uid" inputmode="numeric" autocomplete="off" placeholder="' + escAttr(t("enter_uid")) + '" />' +
            '<button id="nbb-wk-open-btn">' + esc(t("open_chat")) + '</button>' +
          '</div>' +
          '<div class="nbb-wk-landing-meta" id="nbb-wk-landing-meta"></div>' +
        '</div>' +
      '</div>';
    var input = byId("nbb-wk-open-uid");
    var btn = byId("nbb-wk-open-btn");
    if (btn) btn.addEventListener("click", function () {
      var uid = String(input && input.value || "").replace(/[^0-9]/g, "");
      if (!uid) return toast(t("uid_invalid"));
      if (state.me && uid === String(state.me.uid)) return toast(t("same_user"));
      location.href = "/wukong/" + encodeURIComponent(uid);
    });
    if (input) input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") btn.click();
    });
  }

  function buildChatShell() {
    var peerName = state.channelType === 2 ? t("topic") : (state.peer ? displayName(state.peer) : t("peer_loading"));
    var peerAvatar = state.channelType === 2 ? '<div class="nbb-wk-avatar-fallback nbb-wk-topic-avatar">#</div>' : avatarHtml(state.peer);
    state.root.innerHTML =
      '<div class="nbb-wk-shell" id="nbb-wk-shell">' +
        '<div class="nbb-wk-bg" id="nbb-wk-bg"></div>' +
        '<div class="nbb-wk-bg-mask" id="nbb-wk-bg-mask"></div>' +
        '<header class="nbb-wk-header">' +
          '<button type="button" class="nbb-wk-back" id="nbb-wk-back" aria-label="' + escAttr(t("back")) + '">‹</button>' +
          '<div class="nbb-wk-peer">' +
            '<div class="nbb-wk-avatar" id="nbb-wk-peer-avatar">' + peerAvatar + '</div>' +
            '<div class="nbb-wk-peer-info">' +
              '<div class="nbb-wk-peer-name" id="nbb-wk-peer-name">' + esc(peerName) + '</div>' +
              '<div class="nbb-wk-peer-tip" id="nbb-wk-peer-tip">' + esc(t("connecting")) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="nbb-wk-header-actions">' +
            '<button type="button" id="nbb-wk-header-more" aria-label="' + escAttr(t("settings")) + '">' + ICON.gear + '</button>' +
          '</div>' +
        '</header>' +
        '<main class="nbb-wk-main" id="nbb-wk-main">' +
          '<div id="nbb-wk-top-spinner" class="nbb-wk-spinner" hidden><i class="fa fa-circle-o-notch"></i> ' + esc(t("loading")) + '</div>' +
          '<div id="nbb-wk-msg-list"></div>' +
          '<div id="nbb-wk-bottom-anchor"></div>' +
        '</main>' +
        '<button id="nbb-wk-fab-bottom" class="nbb-wk-fab-bottom" title="' + escAttr(t("go_bottom")) + '">' +
          '<i class="fa fa-angle-down"></i><span id="nbb-wk-fab-badge" hidden>0</span>' +
        '</button>' +
        '<div id="nbb-wk-context-overlay" class="nbb-wk-context-overlay" hidden><div id="nbb-wk-context-menu" class="nbb-wk-context-menu"></div></div>' +
        '<footer class="nbb-wk-footer" id="nbb-wk-footer">' +
          '<div class="nbb-wk-translate-line">' +
            '<div class="nbb-wk-translate-bar" id="nbb-wk-translate-bar">' +
              '<button type="button" class="nbb-wk-lang-btn" id="nbb-wk-src-lang-btn"></button>' +
              '<button type="button" class="nbb-wk-swap-btn" id="nbb-wk-lang-swap">⇄</button>' +
              '<button type="button" class="nbb-wk-lang-btn" id="nbb-wk-tgt-lang-btn"></button>' +
              '<button type="button" class="nbb-wk-toggle-ai-send" id="nbb-wk-send-translate-toggle" title="' + escAttr(t("send_translate")) + '">译</button>' +
            '</div>' +
          '</div>' +
          '<div id="nbb-wk-wingman-panel" class="nbb-wk-wingman-panel" hidden>' +
            '<div id="nbb-wk-wingman-analysis" class="nbb-wk-wingman-analysis"></div>' +
            '<div id="nbb-wk-smart-replies-bar" class="nbb-wk-smart-replies-bar"></div>' +
          '</div>' +
          '<div id="nbb-wk-quote-preview" class="nbb-wk-quote-preview" hidden>' +
            '<div class="nbb-wk-quote-preview-bar"></div>' +
            '<div class="nbb-wk-quote-preview-body">' +
              '<div class="nbb-wk-quote-preview-name" id="nbb-wk-quote-preview-name"></div>' +
              '<div class="nbb-wk-quote-preview-text" id="nbb-wk-quote-preview-text"></div>' +
            '</div>' +
            '<button id="nbb-wk-quote-close" class="nbb-wk-quote-preview-close">✕</button>' +
          '</div>' +
          '<div class="nbb-wk-toolbar" id="nbb-wk-toolbar">' +
            '<div id="nbb-wk-upload-progress-wrap" class="nbb-wk-progress-wrap" hidden><div id="nbb-wk-upload-progress-bar"></div></div>' +
            '<div id="nbb-wk-toolbar-inputs" class="nbb-wk-toolbar-inputs">' +
              '<button id="nbb-wk-media-btn" class="nbb-wk-tool-btn" type="button">' + ICON.photo + '</button>' +
              '<div class="nbb-wk-input-box"><textarea id="nbb-wk-input" rows="1" placeholder="' + escAttr(t("message_placeholder")) + '" autocomplete="off"></textarea></div>' +
              '<button id="nbb-wk-primary-btn" class="nbb-wk-primary-btn" type="button"><span id="nbb-wk-primary-icon">' + ICON.mic + '</span></button>' +
            '</div>' +
            '<div id="nbb-wk-rec-inline" class="nbb-wk-rec-inline" hidden>' +
              '<button id="nbb-wk-rec-cancel" class="nbb-wk-rec-btn-icon" type="button"><i class="fa fa-trash-o"></i></button>' +
              '<div class="nbb-wk-rec-vis"><span class="nbb-wk-rec-dot"></span><div class="nbb-wk-rec-dash"></div><div class="nbb-wk-rec-bars" id="nbb-wk-rec-bars"></div></div>' +
              '<button id="nbb-wk-rec-pause" class="nbb-wk-rec-btn-icon" type="button"><i class="fa fa-pause-circle"></i></button>' +
              '<span id="nbb-wk-rec-time" class="nbb-wk-rec-time">0:00</span>' +
              '<button id="nbb-wk-rec-send" class="nbb-wk-rec-btn-icon" type="button"><i class="fa fa-paper-plane"></i></button>' +
            '</div>' +
          '</div>' +
          '<div class="nbb-wk-media-pop" id="nbb-wk-media-pop" hidden>' +
            '<button id="nbb-wk-pick-camera" type="button"><span>' + ICON.camera + '</span><span>' + esc(t("camera")) + '</span></button>' +
            '<button id="nbb-wk-pick-album" type="button"><span>' + ICON.album + '</span><span>' + esc(t("album")) + '</span></button>' +
          '</div>' +
        '</footer>' +
        '<input id="nbb-wk-media-file" type="file" accept="image/*,video/*" multiple hidden />' +
        '<input id="nbb-wk-camera-file" type="file" accept="image/*" capture="environment" hidden />' +
        '<input id="nbb-wk-bg-file" type="file" accept="image/*" hidden />' +
        buildLangModalHtml() +
        buildSettingsHtml() +
        '<div class="nbb-wk-preview-mask" id="nbb-wk-preview-mask" hidden><div id="nbb-wk-preview-body"></div></div>' +
      '</div>';
    renderRecBars();
    syncTranslateBar();
    syncSettingsUI();
    applyBackground();
    bindUI();
    updateFooterHeight();
  }

  function buildLangModalHtml() {
    var items = LANG_LIST.map(function (it) {
      return '<div class="nbb-wk-lang-item" data-lang="' + escAttr(it.n) + '"><span>' + it.f + '</span><span>' + esc(it.n) + '</span></div>';
    }).join("");
    return '<div class="nbb-wk-modal-mask" id="nbb-wk-lang-mask" hidden>' +
      '<div class="nbb-wk-modal nbb-wk-lang-modal">' +
        '<div class="nbb-wk-modal-head"><h3>' + esc(t("select_language")) + '</h3><button id="nbb-wk-lang-close">✕</button></div>' +
        '<div class="nbb-wk-lang-grid" id="nbb-wk-lang-grid">' + items + '</div>' +
      '</div>' +
    '</div>';
  }

  function buildSettingsHtml() {
    return '<div class="nbb-wk-modal-mask" id="nbb-wk-settings-mask" hidden>' +
      '<div class="nbb-wk-modal nbb-wk-settings-modal">' +
        '<div class="nbb-wk-settings-head"><h3>' + esc(t("settings")) + '</h3><button id="nbb-wk-settings-close-x"><i class="fa fa-times"></i></button></div>' +
        '<div class="nbb-wk-settings-body">' +
          '<div class="nbb-wk-settings-section"><div class="nbb-wk-settings-section-title">🌐 ' + esc(t("translate_provider")) + '</div>' +
            '<div class="nbb-wk-provider-tabs">' +
              '<button type="button" class="nbb-wk-provider-tab" id="nbb-wk-provider-google" data-provider="google">' + esc(t("google_translate")) + '</button>' +
              '<button type="button" class="nbb-wk-provider-tab" id="nbb-wk-provider-ai" data-provider="ai">' + esc(t("ai_translate")) + '</button>' +
            '</div>' +
            '<div id="nbb-wk-ai-pane" class="nbb-wk-ai-pane">' +
              '<label class="nbb-wk-setting-field"><span>' + esc(t("ai_endpoint")) + '</span><input id="nbb-wk-ai-endpoint" type="text" placeholder="https://api.openai.com/v1" /></label>' +
              '<label class="nbb-wk-setting-field"><span>' + esc(t("api_key")) + '</span><input id="nbb-wk-ai-key" type="password" /></label>' +
              '<label class="nbb-wk-setting-field"><span>' + esc(t("model")) + '</span><input id="nbb-wk-ai-model" type="text" placeholder="gpt-4o-mini / qwen / deepseek" /></label>' +
            '</div>' +
          '</div>' +
          '<div class="nbb-wk-settings-section"><div class="nbb-wk-settings-section-title">🧠 ' + esc(t("wingman")) + '</div>' +
            '<div class="nbb-wk-setting-row">' +
              '<label class="nbb-wk-setting-field"><span>' + esc(t("target_gender")) + '</span><select id="nbb-wk-target-gender"><option value="女生">' + esc(t("girl")) + '</option><option value="男生">' + esc(t("boy")) + '</option><option value="不指定">' + esc(t("unspecified")) + '</option></select></label>' +
              '<label class="nbb-wk-setting-field"><span>' + esc(t("relationship_stage")) + '</span><select id="nbb-wk-relationship-stage"><option value="刚认识">' + esc(t("just_met")) + '</option><option value="聊过几次">' + esc(t("few_chats")) + '</option><option value="有点暧昧">' + esc(t("flirting")) + '</option><option value="已约过会">' + esc(t("dated")) + '</option></select></label>' +
            '</div>' +
            '<label class="nbb-wk-setting-field"><span>' + esc(t("communication_style")) + '</span><input id="nbb-wk-communication-style" type="text" placeholder="' + escAttr(t("communication_style_placeholder")) + '" /></label>' +
            '<div class="nbb-wk-setting-row nbb-wk-setting-row-toggles">' +
              '<label class="nbb-wk-setting-toggle"><span>' + esc(t("smart_reply")) + '</span><input id="nbb-wk-sr-setting" type="checkbox" /></label>' +
              '<label class="nbb-wk-setting-toggle"><span>' + esc(t("context_memory")) + '</span><input id="nbb-wk-context-memory-setting" type="checkbox" /></label>' +
            '</div>' +
            '<label class="nbb-wk-setting-field"><span>' + esc(t("context_rounds")) + '</span><select id="nbb-wk-context-rounds-setting"><option value="10">10</option><option value="30">30</option><option value="50">50</option><option value="100">100</option></select></label>' +
          '</div>' +
          '<div class="nbb-wk-settings-section"><div class="nbb-wk-settings-section-title">✨ ' + esc(t("chat")) + '</div>' +
            '<label class="nbb-wk-setting-toggle"><span>' + esc(t("auto_translate")) + '</span><input id="nbb-wk-auto-trans-setting" type="checkbox" /></label>' +
          '</div>' +
          '<div class="nbb-wk-settings-section"><div class="nbb-wk-settings-section-title">🖼️ ' + esc(t("background")) + '</div>' +
            '<button id="nbb-wk-bg-upload-btn" class="nbb-wk-bg-upload-btn" type="button">' + esc(t("set_background")) + '</button>' +
            '<label class="nbb-wk-setting-field"><span>' + esc(t("fog_mask")) + ' <em id="nbb-wk-bg-op-val">85%</em></span><input id="nbb-wk-bg-opacity" type="range" min="0" max="1" step="0.05" /></label>' +
          '</div>' +
          '<button id="nbb-wk-clear-history" class="nbb-wk-clear-history" type="button">' + esc(t("clear_local_history")) + '</button>' +
          '<div class="nbb-wk-settings-actions"><button type="button" class="nbb-wk-settings-secondary" id="nbb-wk-settings-close-btn">' + esc(t("close")) + '</button><button type="button" class="nbb-wk-settings-primary" id="nbb-wk-settings-save">' + esc(t("save")) + '</button></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function bindUI() {
    var input = byId("nbb-wk-input");
    var btnPrimary = byId("nbb-wk-primary-btn");
    var main = byId("nbb-wk-main");
    var fabBtn = byId("nbb-wk-fab-bottom");
    var scrollRAF = null;

    if (main) {
      main.addEventListener("scroll", function () {
        if (scrollRAF) return;
        scrollRAF = requestAnimationFrame(function () {
          scrollRAF = null;
          handleScrollLogic(main, fabBtn);
        });
      }, { passive: true });
    }

    if (fabBtn) fabBtn.addEventListener("click", function () {
      state.unreadCount = 0;
      state.stickToBottom = true;
      updateUnreadBadge();
      smoothScrollToBottom();
    });

    if (input) {
      input.addEventListener("focus", function () { clearWingmanPanel(); });
      input.addEventListener("click", function () { clearWingmanPanel(); });
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
    }

    if (btnPrimary) btnPrimary.addEventListener("click", function () {
      handlePrimaryAction();
      if (input) input.style.height = "36px";
      updateFooterHeight();
    });

    byId("nbb-wk-back") && byId("nbb-wk-back").addEventListener("click", function () {
      if (history.length > 1) history.back();
      else location.href = "/";
    });

    byId("nbb-wk-header-more") && byId("nbb-wk-header-more").addEventListener("click", function (e) {
      e.stopPropagation();
      openSettings();
    });

    byId("nbb-wk-media-btn") && byId("nbb-wk-media-btn").addEventListener("click", function () {
      var pop = byId("nbb-wk-media-pop");
      if (pop) pop.hidden = !pop.hidden;
    });

    byId("nbb-wk-pick-camera") && byId("nbb-wk-pick-camera").addEventListener("click", function () {
      byId("nbb-wk-media-pop").hidden = true;
      byId("nbb-wk-camera-file").click();
    });

    byId("nbb-wk-pick-album") && byId("nbb-wk-pick-album").addEventListener("click", function () {
      byId("nbb-wk-media-pop").hidden = true;
      byId("nbb-wk-media-file").click();
    });

    byId("nbb-wk-media-file") && byId("nbb-wk-media-file").addEventListener("change", onPickMedia);
    byId("nbb-wk-camera-file") && byId("nbb-wk-camera-file").addEventListener("change", onPickMedia);
    byId("nbb-wk-quote-close") && byId("nbb-wk-quote-close").addEventListener("click", hideQuoteBar);

    byId("nbb-wk-send-translate-toggle") && byId("nbb-wk-send-translate-toggle").addEventListener("click", function () {
      state.cfg.sendTranslateEnabled = !state.cfg.sendTranslateEnabled;
      saveConfig();
      syncTranslateBar();
      toast(state.cfg.sendTranslateEnabled ? t("send_translate_on") : t("send_translate_off"));
    });

    byId("nbb-wk-lang-swap") && byId("nbb-wk-lang-swap").addEventListener("click", function () {
      var a = state.cfg.sourceLang;
      state.cfg.sourceLang = state.cfg.targetLang;
      state.cfg.targetLang = a;
      saveConfig();
      syncTranslateBar();
      clearWingmanPanel();
    });

    byId("nbb-wk-src-lang-btn") && byId("nbb-wk-src-lang-btn").addEventListener("click", function () {
      state.pickingLangFor = "source";
      byId("nbb-wk-lang-mask").hidden = false;
    });

    byId("nbb-wk-tgt-lang-btn") && byId("nbb-wk-tgt-lang-btn").addEventListener("click", function () {
      state.pickingLangFor = "target";
      byId("nbb-wk-lang-mask").hidden = false;
    });

    byId("nbb-wk-lang-close") && byId("nbb-wk-lang-close").addEventListener("click", function () {
      byId("nbb-wk-lang-mask").hidden = true;
    });

    byId("nbb-wk-lang-grid") && byId("nbb-wk-lang-grid").addEventListener("click", function (e) {
      var item = e.target.closest(".nbb-wk-lang-item");
      if (!item) return;
      var lang = item.getAttribute("data-lang");
      if (state.pickingLangFor === "source") state.cfg.sourceLang = lang;
      else state.cfg.targetLang = lang;
      saveConfig();
      syncTranslateBar();
      byId("nbb-wk-lang-mask").hidden = true;
      clearWingmanPanel();
    });

    byId("nbb-wk-bg-upload-btn") && byId("nbb-wk-bg-upload-btn").addEventListener("click", function () {
      byId("nbb-wk-bg-file").click();
    });

    byId("nbb-wk-bg-file") && byId("nbb-wk-bg-file").addEventListener("change", handleBackgroundUpload);

    byId("nbb-wk-bg-opacity") && byId("nbb-wk-bg-opacity").addEventListener("input", function (e) {
      var val = parseFloat(e.target.value);
      state.bg.opacity = val;
      byId("nbb-wk-bg-op-val").innerText = Math.round(val * 100) + "%";
      saveBackground();
      applyBackground();
    });

    byId("nbb-wk-provider-google") && byId("nbb-wk-provider-google").addEventListener("click", function () { setTranslateProvider("google"); });
    byId("nbb-wk-provider-ai") && byId("nbb-wk-provider-ai").addEventListener("click", function () { setTranslateProvider("ai"); });
    byId("nbb-wk-settings-close-btn") && byId("nbb-wk-settings-close-btn").addEventListener("click", function () { closeSettings(false); });
    byId("nbb-wk-settings-close-x") && byId("nbb-wk-settings-close-x").addEventListener("click", function () { closeSettings(false); });
    byId("nbb-wk-settings-save") && byId("nbb-wk-settings-save").addEventListener("click", saveSettings);
    byId("nbb-wk-clear-history") && byId("nbb-wk-clear-history").addEventListener("click", clearChatHistory);

    function closeOnMaskClick(e) {
      if (e.target === this) {
        if (this.id === "nbb-wk-settings-mask") closeSettings(false);
        else this.hidden = true;
      }
    }

    byId("nbb-wk-lang-mask") && byId("nbb-wk-lang-mask").addEventListener("click", closeOnMaskClick);
    byId("nbb-wk-settings-mask") && byId("nbb-wk-settings-mask").addEventListener("click", closeOnMaskClick);

    var list = byId("nbb-wk-msg-list");
    if (list) {
      list.addEventListener("click", onListClick);
      bindLongPress(list);
      list.addEventListener("contextmenu", function (e) {
        var bubble = e.target.closest(".nbb-wk-bubble");
        if (!bubble || bubble.classList.contains("media-shell")) return;
        var row = bubble.closest(".nbb-wk-row");
        if (!row) return;
        e.preventDefault();
        showContextMenu(row.getAttribute("data-id"));
      });
    }

    byId("nbb-wk-context-overlay") && byId("nbb-wk-context-overlay").addEventListener("click", function (e) {
      if (e.target === this) hideContextMenu();
    });

    byId("nbb-wk-context-menu") && byId("nbb-wk-context-menu").addEventListener("click", onContextMenuClick);
    byId("nbb-wk-smart-replies-bar") && byId("nbb-wk-smart-replies-bar").addEventListener("click", onSmartReplyClick);
    byId("nbb-wk-rec-cancel") && byId("nbb-wk-rec-cancel").addEventListener("click", function () { stopRecording(false); });
    byId("nbb-wk-rec-send") && byId("nbb-wk-rec-send").addEventListener("click", function () { stopRecording(true); });
    byId("nbb-wk-rec-pause") && byId("nbb-wk-rec-pause").addEventListener("click", togglePauseRecording);

    bindPreviewUI();

    state.vvHandler = handleViewport;
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", state.vvHandler, { passive: true });
      window.visualViewport.addEventListener("scroll", state.vvHandler, { passive: true });
    }
    document.addEventListener("click", function (e) {
      var pop = byId("nbb-wk-media-pop");
      if (pop && !pop.hidden && !e.target.closest("#nbb-wk-media-pop") && !e.target.closest("#nbb-wk-media-btn")) pop.hidden = true;
    });
    window.addEventListener("popstate", function () {
      if (state.previewOpen) closePreview(true);
      if (state.settingsOpen) closeSettings(true);
    });
    handleViewport();
  }

  function bindLongPress(list) {
    var longPressTimer = null;
    var start = null;
    list.addEventListener("touchstart", function (e) {
      var bubble = e.target.closest(".nbb-wk-bubble");
      if (!bubble || bubble.classList.contains("media-shell")) return;
      var row = bubble.closest(".nbb-wk-row");
      if (!row) return;
      start = e.touches && e.touches[0] ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
      longPressTimer = setTimeout(function () {
        showContextMenu(row.getAttribute("data-id"));
        longPressTimer = null;
      }, 430);
    }, { passive: true });
    list.addEventListener("touchmove", function (e) {
      if (!longPressTimer || !start || !e.touches || !e.touches[0]) return;
      var dx = Math.abs(e.touches[0].clientX - start.x);
      var dy = Math.abs(e.touches[0].clientY - start.y);
      if (dx > 10 || dy > 10) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }, { passive: true });
    ["touchend", "touchcancel"].forEach(function (name) {
      list.addEventListener(name, function () {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }, { passive: true });
    });
  }

  function bindPreviewUI() {
    var mask = byId("nbb-wk-preview-mask");
    var body = byId("nbb-wk-preview-body");
    if (!mask || !body) return;
    var touchStartY = 0;
    var touchCurrentY = 0;
    mask.addEventListener("click", function (e) {
      if (e.target === this) closePreview();
    });
    mask.addEventListener("touchstart", function (e) {
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
        touchCurrentY = touchStartY;
        body.style.transition = "none";
      }
    }, { passive: true });
    mask.addEventListener("touchmove", function (e) {
      if (e.touches.length === 1 && touchStartY > 0) {
        touchCurrentY = e.touches[0].clientY;
        var diff = touchCurrentY - touchStartY;
        if (diff > 0) {
          body.style.transform = "translateY(" + diff + "px) scale(" + (1 - diff / 2000) + ")";
          mask.style.backgroundColor = "rgba(0,0,0," + Math.max(0, 0.9 - diff / 500) + ")";
        }
      }
    }, { passive: true });
    mask.addEventListener("touchend", function () {
      if (touchStartY > 0) {
        var diff = touchCurrentY - touchStartY;
        body.style.transition = "all .25s";
        if (diff > 100) closePreview();
        else {
          body.style.transform = "";
          mask.style.backgroundColor = "rgba(0,0,0,.9)";
        }
      }
      touchStartY = 0;
      touchCurrentY = 0;
    }, { passive: true });
  }

  function saveConfig() {
    saveJSON(storageKey("cfg"), state.cfg);
  }

  function saveBackground() {
    saveJSON(storageKey("bg"), state.bg);
  }

  function syncTranslateBar() {
    var src = byId("nbb-wk-src-lang-btn");
    var tgt = byId("nbb-wk-tgt-lang-btn");
    if (src) src.innerHTML = getFlag(state.cfg.sourceLang) + " " + esc(state.cfg.sourceLang);
    if (tgt) tgt.innerHTML = getFlag(state.cfg.targetLang) + " " + esc(state.cfg.targetLang);
    var toggle = byId("nbb-wk-send-translate-toggle");
    if (toggle) toggle.classList.toggle("active", !!state.cfg.sendTranslateEnabled);
    syncProviderUI();
  }

  function syncProviderUI() {
    var provider = state.cfg && state.cfg.translateProvider === "ai" ? "ai" : "google";
    var google = byId("nbb-wk-provider-google");
    var ai = byId("nbb-wk-provider-ai");
    var pane = byId("nbb-wk-ai-pane");
    if (google) google.classList.toggle("active", provider === "google");
    if (ai) ai.classList.toggle("active", provider === "ai");
    if (pane) pane.classList.toggle("show", provider === "ai");
  }

  function syncSettingsUI() {
    if (!state.cfg) return;
    var endpoint = byId("nbb-wk-ai-endpoint");
    var key = byId("nbb-wk-ai-key");
    var model = byId("nbb-wk-ai-model");
    if (endpoint) endpoint.value = state.cfg.ai.endpoint || "";
    if (key) key.value = state.cfg.ai.apiKey || "";
    if (model) model.value = state.cfg.ai.model || "gpt-4o-mini";
    byId("nbb-wk-sr-setting") && (byId("nbb-wk-sr-setting").checked = !!state.cfg.smartReplyEnabled);
    byId("nbb-wk-auto-trans-setting") && (byId("nbb-wk-auto-trans-setting").checked = !!state.cfg.autoTranslateLastMsg);
    byId("nbb-wk-context-memory-setting") && (byId("nbb-wk-context-memory-setting").checked = !!state.cfg.contextMemoryEnabled);
    byId("nbb-wk-context-rounds-setting") && (byId("nbb-wk-context-rounds-setting").value = String(state.cfg.contextRounds || 30));
    byId("nbb-wk-target-gender") && (byId("nbb-wk-target-gender").value = state.cfg.targetGender || "女生");
    byId("nbb-wk-relationship-stage") && (byId("nbb-wk-relationship-stage").value = state.cfg.relationshipStage || "刚认识");
    byId("nbb-wk-communication-style") && (byId("nbb-wk-communication-style").value = state.cfg.communicationStyle || "自然直接，偶尔幽默");
    var op = state.bg && state.bg.opacity !== undefined ? state.bg.opacity : 0.85;
    byId("nbb-wk-bg-opacity") && (byId("nbb-wk-bg-opacity").value = op);
    byId("nbb-wk-bg-op-val") && (byId("nbb-wk-bg-op-val").innerText = Math.round(op * 100) + "%");
    syncProviderUI();
    syncTranslateBar();
  }

  function saveSettings() {
    state.cfg.smartReplyEnabled = !!(byId("nbb-wk-sr-setting") && byId("nbb-wk-sr-setting").checked);
    state.cfg.autoTranslateLastMsg = !!(byId("nbb-wk-auto-trans-setting") && byId("nbb-wk-auto-trans-setting").checked);
    state.cfg.contextMemoryEnabled = !!(byId("nbb-wk-context-memory-setting") && byId("nbb-wk-context-memory-setting").checked);
    state.cfg.contextRounds = Number(byId("nbb-wk-context-rounds-setting") && byId("nbb-wk-context-rounds-setting").value) || 30;
    state.cfg.targetGender = (byId("nbb-wk-target-gender") && byId("nbb-wk-target-gender").value) || "女生";
    state.cfg.relationshipStage = (byId("nbb-wk-relationship-stage") && byId("nbb-wk-relationship-stage").value) || "刚认识";
    state.cfg.communicationStyle = (byId("nbb-wk-communication-style") && byId("nbb-wk-communication-style").value.trim()) || "自然直接，偶尔幽默";
    state.cfg.ai.endpoint = (byId("nbb-wk-ai-endpoint") && byId("nbb-wk-ai-endpoint").value.trim()) || "";
    state.cfg.ai.apiKey = (byId("nbb-wk-ai-key") && byId("nbb-wk-ai-key").value.trim()) || "";
    state.cfg.ai.model = (byId("nbb-wk-ai-model") && byId("nbb-wk-ai-model").value.trim()) || "gpt-4o-mini";
    state.bg.opacity = parseFloat(byId("nbb-wk-bg-opacity") && byId("nbb-wk-bg-opacity").value);
    saveConfig();
    saveBackground();
    applyBackground();
    syncTranslateBar();
    clearWingmanPanel();
    closeSettings(false);
    toast(t("saved"));
  }

  function setTranslateProvider(provider) {
    state.cfg.translateProvider = provider === "ai" ? "ai" : "google";
    saveConfig();
    syncProviderUI();
    syncTranslateBar();
  }

  function openSettings() {
    var mask = byId("nbb-wk-settings-mask");
    if (!mask) return;
    mask.hidden = false;
    state.settingsOpen = true;
    history.pushState({ nbbWkSettings: true }, "", location.href);
  }

  function closeSettings(fromPopState) {
    if (!state.settingsOpen) return;
    state.settingsOpen = false;
    var mask = byId("nbb-wk-settings-mask");
    if (mask) mask.hidden = true;
    if (!fromPopState) {
      try { history.back(); } catch (_) {}
    }
  }

  function applyBackground() {
    var bg = byId("nbb-wk-bg");
    var mask = byId("nbb-wk-bg-mask");
    if (!bg) return;
    if (state.bg && state.bg.dataUrl) {
      bg.style.backgroundImage = "url('" + state.bg.dataUrl + "')";
      document.body.classList.add("nbb-wk-has-bg");
    } else {
      bg.style.backgroundImage = "none";
      document.body.classList.remove("nbb-wk-has-bg");
    }
    if (mask) mask.style.setProperty("--nbb-wk-bg-op", state.bg && state.bg.opacity !== undefined ? state.bg.opacity : 0.85);
  }

  function handleBackgroundUpload(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        var ctx = canvas.getContext("2d");
        var max = 1080;
        var w = img.width, h = img.height;
        if (w > max || h > max) {
          if (w > h) { h = Math.round((h * max) / w); w = max; }
          else { w = Math.round((w * max) / h); h = max; }
        }
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        state.bg.dataUrl = canvas.toDataURL("image/jpeg", 0.6);
        saveBackground();
        applyBackground();
        toast(t("saved"));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleViewport() {
    var vv = window.visualViewport;
    var offset = 0;
    if (vv) offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    var footer = byId("nbb-wk-footer");
    if (footer) footer.style.bottom = offset + "px";
    updateFooterHeight();
  }

  function updateFooterHeight() {
    setTimeout(function () {
      var footer = byId("nbb-wk-footer");
      var shell = byId("nbb-wk-shell");
      if (!footer || !shell) return;
      var wasAtBottom = state.stickToBottom;
      var h = Math.max(110, Math.ceil(footer.offsetHeight || 110));
      shell.style.setProperty("--nbb-wk-footer-h", h + "px");
      if (wasAtBottom) requestAnimationFrame(forceScrollToBottom);
    }, 0);
  }

  function renderRecBars() {
    var bars = byId("nbb-wk-rec-bars");
    if (!bars) return;
    bars.innerHTML = waveHeights.slice(0, 5).map(function (h, i) {
      return '<i style="height:' + h + "px;animation-delay:" + i * 0.05 + 's"></i>';
    }).join("");
  }

  function updatePrimaryButton() {
    var input = byId("nbb-wk-input");
    var hasText = String(input && input.value || "").trim().length > 0;
    var btn = byId("nbb-wk-primary-btn");
    var icon = byId("nbb-wk-primary-icon");
    if (!btn || !icon) return;
    btn.classList.toggle("send", hasText);
    icon.innerHTML = hasText ? ICON.send : ICON.mic;
  }

  function updateUnreadBadge() {
    var badge = byId("nbb-wk-fab-badge");
    var fab = byId("nbb-wk-fab-bottom");
    if (!badge || !fab) return;
    if (state.unreadCount > 0) {
      badge.textContent = state.unreadCount > 99 ? "99+" : String(state.unreadCount);
      badge.hidden = false;
      fab.classList.add("show");
    } else {
      badge.hidden = true;
    }
  }

  function handleScrollLogic(main, fab) {
    var atBottom = main.scrollHeight - main.scrollTop - main.clientHeight < BOTTOM_THRESHOLD;
    state.stickToBottom = atBottom;
    if (!fab) return;
    if (!atBottom || state.unreadCount > 0) fab.classList.add("show");
    else fab.classList.remove("show");
    if (atBottom && state.unreadCount > 0) {
      state.unreadCount = 0;
      updateUnreadBadge();
    }
    clearTimeout(state.readTimer);
    state.readTimer = setTimeout(markVisibleAsRead, 300);
    if (main.scrollTop < 300 && !state.loadingHistory && !state.hasNoMoreHistory) {
      fetchWukongHistory(state.oldestSeq || 0, { prepend: true });
    }
  }

  function loadSDK() {
    if (window.wk && window.wk.WKSDK) return Promise.resolve(window.wk);
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-nbb-wk-sdk="1"]');
      if (existing) {
        existing.addEventListener("load", function () { resolve(window.wk); });
        existing.addEventListener("error", reject);
        return;
      }
      var s = document.createElement("script");
      s.src = SDK_URL;
      s.async = true;
      s.setAttribute("data-nbb-wk-sdk", "1");
      s.onload = function () {
        if (window.wk && window.wk.WKSDK) resolve(window.wk);
        else reject(new Error("WKSDK missing"));
      };
      s.onerror = function () { reject(new Error("load sdk failed")); };
      document.head.appendChild(s);
    });
  }

  function setPeerInfo() {
    var nameEl = byId("nbb-wk-peer-name");
    var tipEl = byId("nbb-wk-peer-tip");
    var avatarEl = byId("nbb-wk-peer-avatar");
    if (state.channelType === 2) {
      if (nameEl) nameEl.textContent = state.channelTitle || t("topic");
      if (avatarEl) avatarEl.innerHTML = '<div class="nbb-wk-avatar-fallback nbb-wk-topic-avatar">#</div>';
    } else if (state.peer) {
      if (nameEl) nameEl.textContent = displayName(state.peer);
      if (avatarEl) avatarEl.innerHTML = avatarHtml(state.peer);
    }
    if (tipEl) {
      tipEl.textContent = state.wkReady ? t("connect_success") : t("connecting");
    }
  }

  async function initWukong() {
    if (state.wkReady) return;
    setPeerInfo();
    toast(t("sdk_loading"));
    var tokenData = await api("/api/wukong/token");
    state.me = tokenData.user || { uid: tokenData.uid, username: tokenData.username };
    await loadSDK();
    var wk = window.wk;
    wk.WKSDK.shared().config.uid = String(tokenData.wkUid || tokenData.uid);
    wk.WKSDK.shared().config.token = String(tokenData.token);
    wk.WKSDK.shared().config.addr = String(tokenData.addr || tokenData.wsAddr || tokenData.wkws);
    wk.WKSDK.shared().chatManager.addMessageListener(onWkMessage);
    wk.WKSDK.shared().connectManager.addConnectStatusListener(function (status) {
      state.connectStatus = status;
      if (status === 1) {
        state.wkReady = true;
        setPeerInfo();
        if (state.localMaxSeq > 0) fetchWukongHistory(state.localMaxSeq + 1, { offline: true });
      }
    });
    wk.WKSDK.shared().connectManager.connect();
    state.sdkReady = true;
  }

  async function prepareChannel() {
    var p = state.page || {};
    if (p.tid) {
      var ensured = await postJSON("/api/wukong/topic-channel/ensure", { tid: p.tid });
      state.channelId = ensured.channel_id || ("nbb_topic_" + p.tid);
      state.channelType = Number(ensured.channel_type || 2);
      state.channelTitle = t("topic") + " #" + p.tid;
      return;
    }
    if (p.channelId) {
      state.channelId = p.channelId;
      state.channelType = Number(p.channelType || (String(p.channelId).indexOf("nbb_topic_") === 0 ? 2 : 1));
      state.channelTitle = state.channelType === 2 ? t("topic") : "";
      return;
    }
    if (p.targetUid) {
      if (state.me && String(p.targetUid) === String(state.me.uid)) throw new Error("same_user");
      state.peer = await api("/api/wukong/user/" + encodeURIComponent(p.targetUid));
      state.channelId = String(p.targetUid);
      state.channelType = 1;
      state.channelTitle = displayName(state.peer);
      return;
    }
    state.channelId = "";
  }

  function extractWkPayload(m) {
    try {
      if (m.payload) {
        if (typeof m.payload === "string") {
          if (m.payload.charAt(0) === "{") return JSON.parse(m.payload);
          return JSON.parse(decodeURIComponent(atob(m.payload).split("").map(function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          }).join("")));
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
    } catch (e) { warn("extract-payload", e); }
    return {};
  }

  function detectMessageType(text, payload) {
    text = String(text || "");
    payload = payload || {};
    var match;
    if (payload.type === "image" && payload.url) return { type: "image", text: t("image"), mediaUrl: payload.url };
    if (payload.type === "video" && payload.url) return { type: "video", text: t("video"), mediaUrl: payload.url };
    if (payload.type === "voice" && payload.url) return { type: "voice", text: t("voice"), audioUrl: payload.url, durationStr: payload.duration ? formatDuration(payload.duration) : "" };
    if ((match = text.match(/^!\[\]\((.+?)\)$/)) || (match = text.match(/^\[图片\]\((.+?)\)$/))) {
      return { type: "image", text: t("image"), mediaUrl: match[1] };
    }
    if ((match = text.match(/^\[视频\]\((.+?)\)$/))) {
      return { type: "video", text: t("video"), mediaUrl: match[1] };
    }
    if ((match = text.match(/^\[语音消息\]\((.+?)\)$/))) {
      return { type: "voice", text: t("voice"), audioUrl: match[1] };
    }
    if ((match = text.match(/^\[文件\]\((.+?)\)$/))) {
      return { type: "file", text: t("file"), mediaUrl: match[1] };
    }
    return { type: "text", text: text };
  }

  function createMessageObj(text, isMine, uid, wkMsg, payloadObj) {
    var parsed = detectMessageType(text, payloadObj);
    var user = isMine ? state.me : (state.peerCache[String(uid)] || (String(uid) === String(state.peer && state.peer.uid) ? state.peer : null));
    var username = isMine ? displayName(state.me) : (user ? displayName(user) : (t("unknown_user") + uid));
    var id = "wk_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
    var obj = {
      id: id,
      seq: Number.MAX_SAFE_INTEGER,
      mine: !!isMine,
      ts: Date.now(),
      username: username,
      uid: String(uid || ""),
      user: user || null,
      type: parsed.type,
      text: parsed.text,
      html: parsed.type === "text" ? esc(parsed.text) : "",
      quote: payloadObj && payloadObj.quote || "",
      quoteUser: payloadObj && payloadObj.quoteUser || "",
      recalled: false,
      mediaUrl: parsed.mediaUrl || "",
      audioUrl: parsed.audioUrl || "",
      durationStr: parsed.durationStr || "",
      translation: "",
      translationOpen: false,
      wkMsg: wkMsg || null,
      read: false,
      serverText: text || "",
      _ver: 1
    };
    if (obj.type === "voice" && obj.audioUrl && !obj.durationStr) {
      getAudioDuration(obj.audioUrl, function (sec) {
        obj.durationStr = formatDuration(sec);
        msgTouch(obj);
        var dur = byId("dur_" + obj.id);
        if (dur) dur.innerText = obj.durationStr;
        incrementalRender("keep");
      });
    }
    return obj;
  }

  function onWkMessage(m) {
    if (!state.mounted) return;
    var payloadObj = extractWkPayload(m) || {};
    if (m.contentType === 1006 || payloadObj.type === 1006) {
      var targetId = payloadObj.client_msg_no || payloadObj.message_id || payloadObj.clientMsgNo;
      var target = state.messages.find(function (x) {
        return x.id === targetId || (x.wkMsg && (x.wkMsg.clientMsgNo === targetId || x.wkMsg.messageID === targetId));
      });
      if (target) {
        target.recalled = true;
        target.text = t("recalled");
        msgTouch(target);
        incrementalRender("keep");
      }
      return;
    }
    var fromUid = String(m.fromUID || m.from_uid || "");
    if (!fromUid || (state.me && fromUid === String(state.me.uid))) return;
    if (state.channelType === 1 && fromUid !== String(state.channelId)) return;
    var ttext = payloadObj.text || payloadObj.content || "";
    if (!ttext) return;
    var msg = createMessageObj(ttext, false, fromUid, m, payloadObj);
    msg.serverText = ttext;
    msg.seq = Number(m.messageSeq || m.message_seq || 0) || Number.MAX_SAFE_INTEGER;
    if (msg.seq && msg.seq < Number.MAX_SAFE_INTEGER && msg.seq > state.localMaxSeq) state.localMaxSeq = msg.seq;
    appendMessage(msg, isMainAtBottom() ? "bottom" : "keep");
    if (state.cfg.autoTranslateLastMsg && msg.type === "text") {
      setTimeout(function () { executePeerTranslateOnly(msg); }, 0);
    }
  }

  function appendMessage(msg, mode) {
    if (!msg) return;
    if (messageExists(msg)) return;
    state.messages.push(msg);
    pruneMessages();
    state.renderVersion++;
    state.msgIndexDirty = true;
    persistChat();
    if (mode === "bottom") {
      state.unreadCount = 0;
      updateUnreadBadge();
      incrementalRender("bottom");
      requestAnimationFrame(forceScrollToBottom);
    } else {
      if (!msg.mine) state.unreadCount++;
      updateUnreadBadge();
      incrementalRender("keep");
      if (!msg.mine && navigator.vibrate) navigator.vibrate([50, 100, 50]);
    }
  }

  function messageExists(msg) {
    if (!msg) return false;
    var id = String(msg.id || "");
    if (id && state.messages.some(function (m) { return String(m.id) === id; })) return true;
    var key = (msg.mine ? "me" : msg.uid) + "|" + (msg.type || "text") + "|" + normalizeTextKey(msg.serverText || msg.text || msg.mediaUrl || msg.audioUrl) + "|" + Math.floor((msg.ts || 0) / 5000);
    return state.messages.some(function (m) {
      var k = (m.mine ? "me" : m.uid) + "|" + (m.type || "text") + "|" + normalizeTextKey(m.serverText || m.text || m.mediaUrl || m.audioUrl) + "|" + Math.floor((m.ts || 0) / 5000);
      return key === k;
    });
  }

  function pruneMessages() {
    if (state.messages.length <= MAX_MESSAGES_IN_MEMORY) return;
    state.messages = state.messages.slice(-MAX_MESSAGES_IN_MEMORY);
  }

  function msgTouch(m) {
    if (!m) return;
    m._ver = (Number(m._ver) || 0) + 1;
    state.renderVersion++;
    state.msgIndexDirty = true;
  }

  async function fetchWukongHistory(startSeq, opts) {
    opts = opts || {};
    if (!state.channelId || state.loadingHistory || (state.hasNoMoreHistory && opts.prepend)) return;
    state.loadingHistory = true;
    var spin = byId("nbb-wk-top-spinner");
    if (spin) spin.hidden = false;
    try {
      var params = new URLSearchParams();
      params.set("channel_id", state.channelId);
      params.set("channel_type", String(state.channelType || 1));
      params.set("limit", String(opts.offline ? 80 : 50));
      if (startSeq && startSeq > 0) params.set("start_message_seq", String(startSeq));
      if (opts.prepend) params.set("pull_mode", "0");
      var json = await api("/api/wukong/history?" + params.toString());
      var msgs = normalizeHistoryMessages(json);
      if (msgs.length) {
        processHistoryMessages(msgs, !!opts.prepend);
        if (msgs.length < 50 && opts.prepend) state.hasNoMoreHistory = true;
      } else if (opts.prepend) {
        state.hasNoMoreHistory = true;
      }
    } catch (e) {
      warn("history", e);
    } finally {
      state.loadingHistory = false;
      if (spin) spin.hidden = true;
    }
  }

  function normalizeHistoryMessages(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.data)) return json.data;
    if (json && json.data && Array.isArray(json.data.messages)) return json.data.messages;
    if (json && Array.isArray(json.messages)) return json.messages;
    if (json && Array.isArray(json.message_list)) return json.message_list;
    return [];
  }

  function processHistoryMessages(rawMsgs, isLoadMore) {
    var added = false;
    var oldScrollHeight = byId("nbb-wk-main") ? byId("nbb-wk-main").scrollHeight : 0;
    var oldScrollTop = byId("nbb-wk-main") ? byId("nbb-wk-main").scrollTop : 0;
    for (var i = 0; i < rawMsgs.length; i++) {
      var m = rawMsgs[i];
      var payload = extractWkPayload(m) || {};
      var fromUid = String(m.from_uid || m.fromUID || m.from || "");
      var isMine = state.me && fromUid === String(state.me.uid);
      var serverText = payload.text || payload.content || m.content || "";
      var displayText = isMine && payload.originalText ? payload.originalText : serverText;
      if (!displayText || typeof displayText !== "string") continue;
      var msg = createMessageObj(displayText, isMine, fromUid, m, payload);
      msg.id = String(m.message_id || m.messageID || m.client_msg_no || m.clientMsgNo || "hist_" + Math.random());
      msg.seq = Number(m.message_seq || m.messageSeq || 0) || 0;
      msg.serverText = serverText || displayText;
      if (m.timestamp) msg.ts = Number(m.timestamp) * 1000;
      else if (m.created_at) msg.ts = new Date(m.created_at).getTime() || Date.now();
      if (msg.seq && msg.seq < Number.MAX_SAFE_INTEGER) {
        if (!state.oldestSeq || msg.seq < state.oldestSeq) state.oldestSeq = msg.seq;
        if (msg.seq > state.localMaxSeq) state.localMaxSeq = msg.seq;
      }
      if (!messageExists(msg)) {
        state.messages.push(msg);
        added = true;
      }
    }
    if (!added) return;
    state.messages.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    pruneMessages();
    state.renderVersion++;
    state.msgIndexDirty = true;
    persistChat();
    if (isLoadMore) {
      incrementalRender("prepend");
      requestAnimationFrame(function () {
        var main = byId("nbb-wk-main");
        if (main) main.scrollTop = oldScrollTop + (main.scrollHeight - oldScrollHeight);
      });
    } else {
      incrementalRender(isMainAtBottom() ? "bottom" : "keep");
      if (isMainAtBottom()) requestAnimationFrame(forceScrollToBottom);
    }
  }

  function rebuildMsgIndex() {
    var map = new Map();
    for (var i = 0; i < state.messages.length; i++) map.set(String(state.messages[i].id), state.messages[i]);
    state.msgIndex = map;
    state.msgIndexDirty = false;
  }

  function getMsgById(id) {
    if (state.msgIndexDirty || !state.msgIndex) rebuildMsgIndex();
    return state.msgIndex.get(String(id)) || null;
  }

  function buildNodeHash(m, isLastInGroup) {
    return [
      m.id || "", m._ver || 0, m.recalled ? "R" : "", m.translationOpen ? "T" : "",
      isLastInGroup ? "L" : "", m.durationStr || "", m.text || "", m.mediaUrl || "",
      m.audioUrl || "", m.translation || "", m.serverText || ""
    ].join("|");
  }

  function incrementalRender(mode) {
    if (state.renderPending) return;
    state.renderPending = true;
    requestAnimationFrame(function () {
      state.renderPending = false;
      doIncrementalRender(mode);
    });
  }

  function doIncrementalRender(mode) {
    var list = byId("nbb-wk-msg-list");
    var main = byId("nbb-wk-main");
    if (!list || !main) return;

    var oldTop = main.scrollTop;
    var oldHeight = main.scrollHeight;
    var wasAtBottom = oldHeight - oldTop - main.clientHeight < BOTTOM_THRESHOLD;

    var renderArr = state.messages.slice(-state.renderLimit);
    var newHash = state.renderVersion + "|" + renderArr.length + "|";
    for (var h = 0; h < renderArr.length; h++) {
      newHash += [renderArr[h].id, renderArr[h]._ver || 0, renderArr[h].translation || "", renderArr[h].text || "", renderArr[h].serverText || ""].join("|");
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

    var existing = {};
    var child = list.firstElementChild;
    while (child) {
      var did = child.getAttribute("data-id");
      if (did) existing[did] = child;
      child = child.nextElementSibling;
    }

    var targetIds = [];
    var targetNodes = {};
    var prevDay = "";
    for (var i = 0; i < renderArr.length; i++) {
      var m = renderArr[i];
      var day = formatDateDivider(Number(m.ts || Date.now()));
      if (day !== prevDay) {
        var sepId = "sep_" + day;
        targetIds.push(sepId);
        var sep = existing[sepId];
        if (!sep) {
          sep = document.createElement("div");
          sep.className = "nbb-wk-time-sep";
          sep.setAttribute("data-id", sepId);
          sep.innerHTML = "<span>" + esc(day) + "</span>";
        }
        targetNodes[sepId] = sep;
        prevDay = day;
      }

      var isLast = true;
      if (i < renderArr.length - 1) {
        var next = renderArr[i + 1];
        if ((m.mine ? "me" : m.uid) === (next.mine ? "me" : next.uid) && next.ts - m.ts < 180000) isLast = false;
      }

      var isMedia = m.type === "image" || m.type === "video" || m.type === "gallery";
      var showTail = isLast && !m.recalled && !isMedia;
      var rowClass = "nbb-wk-row " + (m.mine ? "mine" : "other") + (showTail ? " has-tail" : "") + (isLast ? " is-last" : "");
      var bubbleClass = "nbb-wk-bubble" + (m.recalled ? " recalled" : "") + (m.type === "voice" ? " voice-shell" : "") + (isMedia ? " media-shell" : "");
      var hash = buildNodeHash(m, isLast);
      var node = existing[m.id];

      if (node && node.getAttribute("data-hash") === hash) {
        if (node.className !== rowClass) node.className = rowClass;
      } else {
        if (!node) {
          node = document.createElement("div");
          node.setAttribute("data-id", m.id);
        }
        node.className = rowClass;
        node.innerHTML = buildMessageNodeHtml(m, bubbleClass, lastPeerTextMsgId);
        node.setAttribute("data-hash", hash);
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
    for (var r = 0; r < toRemove.length; r++) list.removeChild(toRemove[r]);

    var ref = list.firstElementChild;
    for (var tId = 0; tId < targetIds.length; tId++) {
      var target = targetNodes[targetIds[tId]];
      if (ref === target) ref = ref.nextElementSibling;
      else list.insertBefore(target, ref);
    }

    if (mode === "bottom") {
      main.scrollTop = main.scrollHeight;
      state.stickToBottom = true;
    } else if (mode === "prepend") {
      main.scrollTop = oldTop + (main.scrollHeight - oldHeight);
    } else if (mode === "restore") {
      main.scrollTop = main.scrollHeight;
      state.stickToBottom = true;
    } else if (mode === "keep") {
      if (wasAtBottom) {
        main.scrollTop = main.scrollHeight;
        state.stickToBottom = true;
      } else {
        main.scrollTop = oldTop;
      }
    }
    observeLazyElements();
    updateFooterHeight();
  }

  function buildMessageNodeHtml(m, bubbleClass, lastPeerTextMsgId) {
    var timeStr = formatTime(Number(m.ts || Date.now()));
    var avatarWrap = m.mine ? "" :
      '<div class="nbb-wk-avatar-wrap">' + (m.user ? avatarHtml(m.user) : '<div class="nbb-wk-avatar-fallback">' + esc(String(m.username || "?").charAt(0).toUpperCase()) + '</div>') + '</div>';
    var body = "";
    if (m.recalled) {
      body = '<div class="nbb-wk-text">' + esc(t("recalled")) + '</div>';
    } else if (m.type === "voice") {
      body =
        '<button class="nbb-wk-voice nbb-wk-lazy-audio" data-act="play-voice" data-audio-src="' + escAttr(m.audioUrl || m.mediaUrl || "") + '">' +
          '<span class="nbb-wk-play-circle">' + ICON.play + '</span>' +
          '<span class="nbb-wk-wave">' + waveHeights.map(function (height) { return '<i style="height:' + height + 'px"></i>'; }).join("") + '</span>' +
          '<span class="nbb-wk-voice-dur" id="dur_' + escAttr(m.id) + '">' + esc(m.durationStr || "--:--") + '</span>' +
          '<span class="nbb-wk-voice-time">' + esc(timeStr) + '</span>' +
        '</button>';
    } else if (m.type === "image") {
      body =
        '<button class="nbb-wk-media-thumb" data-act="preview-media">' +
          '<div class="nbb-wk-lazy-media nbb-wk-lazy-loading" data-type="img" data-src="' + escAttr(m.mediaUrl || "") + '">' +
            '<i class="fa fa-image fa-2x"></i>' +
          '</div>' +
        '</button><span class="nbb-wk-media-time">' + esc(timeStr) + '</span>';
    } else if (m.type === "video") {
      body =
        '<button class="nbb-wk-media-thumb nbb-wk-video-wrap" data-act="preview-media">' +
          '<div class="nbb-wk-lazy-media nbb-wk-lazy-loading" data-type="video" data-src="' + escAttr(m.mediaUrl || "") + '">' +
            '<i class="fa fa-video-camera fa-2x"></i>' +
          '</div>' +
          '<span class="nbb-wk-video-mark">' + esc(t("video")) + '</span>' +
        '</button><span class="nbb-wk-media-time">' + esc(timeStr) + '</span>';
    } else if (m.type === "file") {
      body = '<a class="nbb-wk-file-link" href="' + escAttr(m.mediaUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(t("file")) + '</a><span class="nbb-wk-inline-time">' + esc(timeStr) + '</span>';
    } else {
      var q = "";
      if (m.quote) {
        q = '<div class="nbb-wk-quote-card"><div class="nbb-wk-quote-bar"></div><div class="nbb-wk-quote-body"><div class="nbb-wk-quote-name">' + esc(m.quoteUser || t("message")) + '</div><div class="nbb-wk-quote-text">' + esc(m.quote) + '</div></div></div>';
      }
      body = q + '<div class="nbb-wk-text">' + (m.html || esc(m.text || "")) + '<span class="nbb-wk-inline-time">' + esc(timeStr) + '</span></div>' + buildTranslationAreaHtml(m);
    }
    var quick = m.id === lastPeerTextMsgId ? '<button class="nbb-wk-quick-trans" data-act="quick-translate" data-id="' + escAttr(m.id) + '" title="' + escAttr(t("translate")) + '">' + ICON.ai + '</button>' : "";
    return avatarWrap + '<div class="nbb-wk-bubble-wrap"><div class="' + bubbleClass + '">' + body + '</div>' + quick + '</div>';
  }

  function buildTranslationAreaHtml(m) {
    if (!m.translation || !m.translationOpen) return "";
    var loading = m.translation === t("translation_loading") || m.translation === "翻译中...";
    var isError = /^翻译失败|Translation failed|ဘာသာပြန်/.test(m.translation || "");
    return '<div class="nbb-wk-translation-wrap"><div class="nbb-wk-translation-text' + (isError ? " is-error" : "") + '"' + (isError ? ' data-act="retry-translate"' : "") + '>' +
      (loading ? "⏳ " : "✨ ") + esc(m.translation) + (isError ? "（" + esc(t("retry")) + "）" : "") + '</div></div>';
  }

  function observeLazyElements() {
    document.querySelectorAll(".nbb-wk-lazy-media").forEach(loadLazyMedia);
    document.querySelectorAll(".nbb-wk-lazy-audio").forEach(loadLazyAudio);
  }

  function loadLazyMedia(el) {
    if (!el || el.getAttribute("data-loaded") === "1") return;
    el.setAttribute("data-loaded", "1");
    var src = el.getAttribute("data-src");
    var type = el.getAttribute("data-type");
    if (!src) return;
    var wasAtBottom = isMainAtBottom();
    getOrFetchMediaBlob(src, type).then(function (url) {
      if (!el.parentNode) return;
      if (type === "img") {
        var img = document.createElement("img");
        img.src = url;
        img.setAttribute("data-original", src);
        img.onload = function () { if (wasAtBottom) requestAnimationFrame(forceScrollToBottom); };
        el.replaceWith(img);
      } else if (type === "video") {
        var video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.setAttribute("data-original", src);
        video.src = url.indexOf("#") === -1 && url.indexOf("blob:") !== 0 ? url + "#t=0.001" : url;
        video.addEventListener("loadeddata", function () { if (wasAtBottom) requestAnimationFrame(forceScrollToBottom); });
        el.replaceWith(video);
      }
    });
  }

  function loadLazyAudio(el) {
    if (!el || el.getAttribute("data-loaded") === "1") return;
    el.setAttribute("data-loaded", "1");
    var src = el.getAttribute("data-audio-src");
    if (!src) return;
    getOrFetchMediaBlob(src, "voice").then(function (url) {
      el.setAttribute("data-url", url);
      el.classList.remove("nbb-wk-lazy-audio");
    });
  }

  function onListClick(e) {
    var retry = e.target.closest('[data-act="retry-translate"]');
    if (retry) {
      var row = retry.closest(".nbb-wk-row");
      if (row) executePeerTranslateAndWingman(getMsgById(row.getAttribute("data-id")), { forceRetry: true, forceOpen: true });
      return;
    }
    var quick = e.target.closest(".nbb-wk-quick-trans");
    if (quick) {
      e.preventDefault();
      e.stopPropagation();
      executePeerTranslateAndWingman(getMsgById(quick.getAttribute("data-id")), { forceOpen: true });
      return;
    }
    var actEl = e.target.closest("[data-act]");
    if (!actEl) return;
    var act = actEl.getAttribute("data-act");
    if (act === "play-voice") {
      e.stopPropagation();
      playVoice(actEl);
    } else if (act === "preview-media") {
      e.stopPropagation();
      var img = actEl.querySelector("img");
      var vid = actEl.querySelector("video");
      var mediaUrl = (img && (img.getAttribute("data-original") || img.getAttribute("src"))) || (vid && (vid.getAttribute("data-original") || vid.getAttribute("src")));
      if (img) openPreview({ type: "image", mediaUrl: mediaUrl });
      else if (vid) openPreview({ type: "video", mediaUrl: mediaUrl });
    }
  }

  function playVoice(el) {
    var url = el.getAttribute("data-url");
    var icon = el.querySelector(".nbb-wk-play-circle");
    if (!url) {
      loadLazyAudio(el);
      setTimeout(function () {
        var lazyUrl = el.getAttribute("data-url");
        if (lazyUrl) el.click();
      }, 80);
      return;
    }
    if (state.audio.src.indexOf(url) > -1 && !state.audio.paused) {
      state.audio.pause();
      el.classList.remove("playing");
      if (icon) icon.innerHTML = ICON.play;
    } else {
      if (state.currentAudioEl) {
        state.currentAudioEl.classList.remove("playing");
        var old = state.currentAudioEl.querySelector(".nbb-wk-play-circle");
        if (old) old.innerHTML = ICON.play;
      }
      state.audio.src = url;
      state.audio.play().catch(function (err) {
        warn("audio-play", err);
        toast(t("open_failed"));
      });
      el.classList.add("playing");
      if (icon) icon.innerHTML = ICON.pause;
      state.currentAudioEl = el;
    }
  }

  state.audio.addEventListener("ended", function () {
    if (state.currentAudioEl) {
      state.currentAudioEl.classList.remove("playing");
      var icon = state.currentAudioEl.querySelector(".nbb-wk-play-circle");
      if (icon) icon.innerHTML = ICON.play;
    }
    state.currentAudioEl = null;
  });

  function getAudioDuration(url, cb) {
    if (state.audioDurCache[url]) return cb(state.audioDurCache[url]);
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
          state.audioDurCache[url] = temp.duration || 0;
          cb(temp.duration || 0);
        };
      } else {
        clearTimeout(fallback);
        state.audioDurCache[url] = temp.duration || 0;
        cb(temp.duration || 0);
      }
    };
    temp.onerror = function () { clearTimeout(fallback); cb(0); };
  }

  async function openPreview(msg) {
    var body = byId("nbb-wk-preview-body");
    if (!body) return;
    var url = await getOrFetchMediaBlob(msg.mediaUrl, msg.type);
    if (msg.type === "image") body.innerHTML = '<img src="' + escAttr(url) + '" />';
    else if (msg.type === "video") body.innerHTML = '<video src="' + escAttr(url) + '" controls autoplay playsinline></video>';
    var mask = byId("nbb-wk-preview-mask");
    mask.hidden = false;
    mask.style.backgroundColor = "rgba(0,0,0,.9)";
    body.style.transform = "";
    state.previewOpen = true;
    history.pushState({ nbbWkPreview: true }, "", location.href);
  }

  function closePreview(fromPopState) {
    if (!state.previewOpen) return;
    state.previewOpen = false;
    var mask = byId("nbb-wk-preview-mask");
    var body = byId("nbb-wk-preview-body");
    body.style.transform = "translateY(100vh) scale(.8)";
    mask.style.backgroundColor = "transparent";
    setTimeout(function () { mask.hidden = true; body.innerHTML = ""; }, 250);
    if (!fromPopState) {
      try { history.back(); } catch (_) {}
    }
  }

  function showContextMenu(msgId) {
    var msg = getMsgById(msgId);
    if (!msg) return;
    state.contextMsg = msg;
    var menu = byId("nbb-wk-context-menu");
    var html =
      '<div class="nbb-wk-menu-item" data-action="quote">' + ICON.quote + ' ' + esc(t("quote")) + '</div>' +
      '<div class="nbb-wk-menu-item" data-action="translate">' + ICON.trans + ' ' + esc(t("translate")) + '</div>' +
      '<div class="nbb-wk-menu-item" data-action="copy">' + ICON.copy + ' ' + esc(t("copy")) + '</div>';
    if (msg.mine) html += '<div class="nbb-wk-menu-item danger" data-action="recall">' + ICON.recall + ' ' + esc(t("recall")) + '</div>';
    html += '<div class="nbb-wk-menu-item danger" data-action="delete">' + ICON.trash + ' ' + esc(t("delete")) + '</div>';
    menu.innerHTML = html;
    byId("nbb-wk-context-overlay").hidden = false;
  }

  function hideContextMenu() {
    byId("nbb-wk-context-overlay").hidden = true;
    state.contextMsg = null;
  }

  function onContextMenuClick(e) {
    var item = e.target.closest(".nbb-wk-menu-item");
    if (!item || !state.contextMsg) return;
    var action = item.getAttribute("data-action");
    if (action === "quote") showQuoteBar(state.contextMsg);
    else if (action === "translate") executePeerTranslateAndWingman(state.contextMsg, { forceOpen: true });
    else if (action === "copy") copyMessage(state.contextMsg);
    else if (action === "recall") recallMessage(state.contextMsg.id);
    else if (action === "delete") deleteMessage(state.contextMsg.id);
    hideContextMenu();
  }

  function copyMessage(msg) {
    var text = msg && (msg.serverText || msg.text || msg.mediaUrl || msg.audioUrl) || "";
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast(t("copied")); });
    else toast(text);
  }

  function showQuoteBar(msg) {
    state.quoteTarget = msg;
    byId("nbb-wk-quote-preview-name").textContent = msg.username || t("unknown_user");
    byId("nbb-wk-quote-preview-text").textContent = msg.text || msg.serverText || "";
    byId("nbb-wk-quote-preview").hidden = false;
    byId("nbb-wk-input").focus();
    updateFooterHeight();
  }

  function hideQuoteBar() {
    state.quoteTarget = null;
    byId("nbb-wk-quote-preview").hidden = true;
    updateFooterHeight();
  }

  function recallMessage(id) {
    var msg = getMsgById(id);
    if (!msg) return;
    try {
      if (msg.wkMsg && window.wk) {
        var targetId = msg.wkMsg.clientMsgNo || msg.wkMsg.client_msg_no || msg.wkMsg.messageID || msg.wkMsg.message_id || msg.id;
        var channel = new window.wk.Channel(state.channelId, state.channelType);
        var revoke = new window.wk.MessageText(t("recalled"));
        revoke.encode = function () {
          return JSON.stringify({ type: 1006, message_id: targetId, client_msg_no: targetId, content: t("recalled") });
        };
        window.wk.WKSDK.shared().chatManager.send(revoke, channel);
      }
    } catch (e) { warn("recall", e); }
    msg.recalled = true;
    msg.text = t("recalled");
    msgTouch(msg);
    incrementalRender("keep");
    toast(t("recalled"));
  }

  function deleteMessage(id) {
    state.messages = state.messages.filter(function (m) { return String(m.id) !== String(id); });
    state.renderVersion++;
    state.msgIndexDirty = true;
    persistChat();
    incrementalRender("keep");
  }

  async function clearChatHistory() {
    if (!confirm(t("confirm_clear"))) return;
    state.messages = [];
    state.localMaxSeq = 0;
    state.renderVersion++;
    state.msgIndexDirty = true;
    await persistChat();
    closeSettings(false);
    clearWingmanPanel();
    incrementalRender("bottom");
    toast(t("history_cleared"));
  }

  function markVisibleAsRead() {
    if (!state.wkReady || !window.wk) return;
    var main = byId("nbb-wk-main");
    if (!main) return;
    var unread = [];
    var top = main.scrollTop;
    var bottom = top + main.clientHeight;
    document.querySelectorAll(".nbb-wk-row.other").forEach(function (n) {
      var ntop = n.offsetTop;
      var nbottom = ntop + n.offsetHeight;
      if (nbottom > top && ntop < bottom) {
        var msg = getMsgById(n.getAttribute("data-id"));
        if (msg && msg.wkMsg && !msg.read) {
          msg.read = true;
          unread.push(msg.wkMsg);
        }
      }
    });
    if (!unread.length) return;
    try {
      var ch = new window.wk.Channel(state.channelId, state.channelType);
      window.wk.WKSDK.shared().receiptManager.addReceiptMessages(ch, unread);
    } catch (e) { warn("mark-read", e); }
  }

  function handlePrimaryAction() {
    var input = byId("nbb-wk-input");
    var text = String(input && input.value || "").trim();
    if (text) return sendByPolicy(text);
    if (!state.rec.mediaRecorder || state.rec.mediaRecorder.state === "inactive") startRecording();
    else stopRecording(true);
  }

  async function sendByPolicy(text) {
    if (!state.cfg.sendTranslateEnabled) {
      sendText(text, null);
      return;
    }
    var btn = byId("nbb-wk-primary-btn");
    var icon = byId("nbb-wk-primary-icon");
    if (btn) btn.disabled = true;
    if (icon) icon.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
    try {
      var translated = await translateByProvider(text, state.cfg.sourceLang, state.cfg.targetLang);
      sendText(translated || text, translated ? text : null);
    } catch (e) {
      warn("send-translate", e);
      toast(t("translation_failed"));
      sendText(text, null);
    } finally {
      if (btn) btn.disabled = false;
      updatePrimaryButton();
    }
  }

  function sendText(text, originalText) {
    if (!state.wkReady || !window.wk) return toast(t("not_ready"));
    var channel = new window.wk.Channel(state.channelId, state.channelType);
    var displayText = originalText || text;
    var wkMsg = null;
    try {
      var content = new window.wk.MessageText(text);
      if (originalText || state.quoteTarget) {
        var origEncode = content.encode.bind(content);
        content.encode = function () {
          var p = origEncode();
          var obj = {};
          if (typeof p === "string") {
            try { obj = JSON.parse(p); } catch (_) { obj = { content: text, text: text }; }
          } else if (p && typeof p === "object") obj = p;
          if (originalText) obj.originalText = originalText;
          if (state.quoteTarget) {
            obj.quote = state.quoteTarget.text || state.quoteTarget.serverText || "";
            obj.quoteUser = state.quoteTarget.username || "";
          }
          return JSON.stringify(obj);
        };
      }
      wkMsg = window.wk.WKSDK.shared().chatManager.send(content, channel);
    } catch (e) {
      warn("wk-send", e);
      toast(t("connect_failed"));
      return;
    }
    var payload = { text: displayText, originalText: originalText || "" };
    if (state.quoteTarget) {
      payload.quote = state.quoteTarget.text || state.quoteTarget.serverText || "";
      payload.quoteUser = state.quoteTarget.username || "";
    }
    var msg = createMessageObj(displayText, true, state.me && state.me.uid, wkMsg, payload);
    msg.serverText = text;
    if (state.quoteTarget) {
      msg.quote = state.quoteTarget.text || "";
      msg.quoteUser = state.quoteTarget.username || "";
      hideQuoteBar();
    }
    appendMessage(msg, "bottom");
    var input = byId("nbb-wk-input");
    if (input) {
      input.value = "";
      input.style.height = "36px";
    }
    updatePrimaryButton();
    updateFooterHeight();
  }

  function uploadToNodeBB(file, onProgress) {
    return new Promise(function (resolve, reject) {
      var fd = new FormData();
      fd.append("files[]", file, file.name || ("wk_" + Date.now()));
      var xhr = new XMLHttpRequest();
      xhr.open("POST", (window.config && config.relative_path ? config.relative_path : "") + "/api/post/upload");
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
              (json && json.url) || "";
            if (url && !/^https?:\/\//i.test(url) && url.charAt(0) !== "/") url = "/" + url;
            if (!url) throw new Error("upload url empty");
            resolve(url);
          } catch (e) { reject(e); }
        } else reject(new Error("upload failed: " + xhr.status));
      };
      xhr.onerror = function () { reject(new Error("network error")); };
      xhr.send(fd);
    });
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) { resolve(e.target.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  async function canEncode(type) {
    var canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    if (!canvas.toBlob) return false;
    return await new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(!!blob && blob.type === type); }, type, 0.8);
    });
  }

  function extForMime(type) {
    if (type === "image/webp") return ".webp";
    if (type === "image/png") return ".png";
    return ".jpg";
  }

  async function compressImage(file) {
    if (!file || !/^image\//i.test(file.type)) return file;
    if (/image\/(gif|svg\+xml)/i.test(file.type)) return file;
    if (file.size < IMAGE_CONFIG.minCompressBytes) return file;
    var targetType = IMAGE_CONFIG.useWebp && (await canEncode("image/webp")) ? "image/webp" : "image/jpeg";
    try {
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
      if (!ctx || !canvas.toBlob) return file;
      ctx.drawImage(img, 0, 0, w, h);
      var targetBytes = IMAGE_CONFIG.maxSizeMB * 1024 * 1024;
      var qualities = [IMAGE_CONFIG.quality, 0.52, 0.45, 0.38];
      var best = null;
      for (var i = 0; i < qualities.length; i++) {
        var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, targetType, qualities[i]); });
        if (!blob) continue;
        best = blob;
        if (blob.size <= targetBytes) break;
      }
      if (!best || best.size >= file.size * 0.95) return file;
      var base = String(file.name || "image-" + Date.now()).replace(/\.[^.]+$/, "");
      return new File([best], base + extForMime(targetType), { type: targetType, lastModified: Date.now() });
    } catch (e) {
      warn("compress-image", e);
      return file;
    }
  }

  async function onPickMedia(e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    if (!files.length) return;
    var wrap = byId("nbb-wk-upload-progress-wrap");
    var bar = byId("nbb-wk-upload-progress-bar");
    try {
      for (var i = 0; i < files.length; i++) {
        if (wrap) wrap.hidden = false;
        if (bar) bar.style.width = "0%";
        var raw = files[i];
        var uploadFile = raw;
        try {
          if ((raw.type || "").indexOf("image/") === 0) {
            toast(t("compressing_image"));
            uploadFile = await compressImage(raw);
          } else if ((raw.type || "").indexOf("video/") === 0) {
            toast(t("checking_video"));
            if (raw.size > VIDEO_CONFIG.maxSizeThreshold) warn("video-large", raw.size);
          }
        } catch (mediaErr) {
          warn("media-prepare", mediaErr);
          toast(mediaErr && mediaErr.message ? mediaErr.message : t("upload_failed"));
          continue;
        }
        var url = await uploadToNodeBB(uploadFile, function (pct) {
          if (bar) bar.style.width = (pct * 100) + "%";
        });
        if (!url) continue;
        if ((uploadFile.type || raw.type || "").indexOf("image/") === 0) sendText("![](" + url + ")");
        else if ((uploadFile.type || raw.type || "").indexOf("video/") === 0) sendText("[视频](" + url + ")");
        else sendText("[文件](" + url + ")");
      }
    } catch (err) {
      warn("pick-media", err);
      toast(t("upload_failed"));
    } finally {
      if (wrap) wrap.hidden = true;
      if (bar) bar.style.width = "0%";
      e.target.value = "";
    }
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
    var options = { audioBitsPerSecond: VOICE_CONFIG.audioBitsPerSecond };
    if (mimeType) options.mimeType = mimeType;
    try { return new MediaRecorder(stream, options); }
    catch (e) {
      warn("audio-recorder-bitrate", e);
      return mimeType ? new MediaRecorder(stream, { mimeType: mimeType }) : new MediaRecorder(stream);
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !window.MediaRecorder) return toast(t("record_unavailable"));
    try {
      var stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      state.rec.stream = stream;
      state.rec.chunks = [];
      state.rec.sec = 0;
      state.rec.paused = false;
      state.rec.shouldSend = false;
      state.rec.mediaRecorder = createAudioRecorder(stream);
      state.rec.mimeType = state.rec.mediaRecorder.mimeType || getSupportedMimeType() || "audio/webm";
      byId("nbb-wk-rec-time").textContent = "0:00";
      state.rec.mediaRecorder.ondataavailable = function (ev) {
        if (ev.data && ev.data.size > 0) state.rec.chunks.push(ev.data);
      };
      state.rec.mediaRecorder.onstop = async function () {
        stream.getTracks().forEach(function (tr) { tr.stop(); });
        clearInterval(state.rec.timer);
        state.rec.timer = null;
        toggleUIForRecording(false);
        updatePrimaryButton();
        if (state.rec.shouldSend && state.rec.chunks.length) {
          var wrap = byId("nbb-wk-upload-progress-wrap");
          var bar = byId("nbb-wk-upload-progress-bar");
          try {
            var actualMime = state.rec.mediaRecorder.mimeType || state.rec.mimeType || "audio/webm";
            var ext = actualMime.indexOf("ogg") > -1 ? "ogg" : actualMime.indexOf("mp4") > -1 ? "m4a" : "webm";
            var blob = new Blob(state.rec.chunks, { type: actualMime });
            var file = new File([blob], "voice_" + Date.now() + "." + ext, { type: actualMime });
            if (wrap) wrap.hidden = false;
            if (bar) bar.style.width = "0%";
            var url = await uploadToNodeBB(file, function (pct) { if (bar) bar.style.width = (pct * 100) + "%"; });
            sendText("[语音消息](" + url + ")");
          } catch (e) {
            warn("record-upload", e);
            toast(t("voice_send_failed"));
          } finally {
            if (wrap) wrap.hidden = true;
            if (bar) bar.style.width = "0%";
          }
        }
      };
      toggleUIForRecording(true);
      var icon = byId("nbb-wk-rec-pause").querySelector("i");
      if (icon) icon.className = "fa fa-pause-circle";
      state.rec.mediaRecorder.start(250);
      state.rec.timer = setInterval(function () {
        if (state.rec.paused) return;
        state.rec.sec += 1;
        byId("nbb-wk-rec-time").textContent = formatDuration(state.rec.sec);
        if (state.rec.sec >= (state.cfg.voiceMaxDuration || 60)) stopRecording(true);
      }, 1000);
    } catch (e) {
      warn("start-recording", e);
      toast(t("record_denied"));
    }
  }

  function toggleUIForRecording(isRec) {
    var inputs = byId("nbb-wk-toolbar-inputs");
    var rec = byId("nbb-wk-rec-inline");
    if (inputs) inputs.hidden = isRec;
    if (rec) rec.hidden = !isRec;
    updateFooterHeight();
  }

  function stopRecording(shouldSend) {
    if (!state.rec.mediaRecorder || state.rec.mediaRecorder.state === "inactive") return;
    state.rec.shouldSend = !!shouldSend;
    state.rec.mediaRecorder.stop();
  }

  function togglePauseRecording() {
    var mr = state.rec.mediaRecorder;
    if (!mr) return;
    var icon = byId("nbb-wk-rec-pause").querySelector("i");
    if (typeof mr.pause !== "function" || typeof mr.resume !== "function") return;
    if (mr.state === "recording") {
      mr.pause();
      state.rec.paused = true;
      if (icon) icon.className = "fa fa-play-circle";
    } else if (mr.state === "paused") {
      mr.resume();
      state.rec.paused = false;
      if (icon) icon.className = "fa fa-pause-circle";
    }
  }

  function fillTemplate(tpl, data) {
    return String(tpl || "").replace(/{{\s*(\w+)\s*}}/g, function (_, key) {
      return data[key] !== undefined ? String(data[key]) : "";
    });
  }

  function extractAIText(data) {
    if (data && Array.isArray(data.choices) && data.choices[0] && data.choices[0].message) {
      var content = data.choices[0].message.content;
      if (typeof content === "string") return content.trim();
      if (Array.isArray(content)) return content.map(function (p) { return (p && (p.text || p.output_text || "")) || ""; }).join("").trim();
    }
    if (data && typeof data.output_text === "string") return data.output_text.trim();
    if (data && Array.isArray(data.output)) {
      return data.output.map(function (item) {
        if (item && Array.isArray(item.content)) return item.content.map(function (part) { return (part && (part.text || part.output_text || "")) || ""; }).join("");
        return "";
      }).join("").trim();
    }
    return "";
  }

  function parseJsonLoose(raw) {
    var text = String(raw || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    try { return JSON.parse(text); } catch (_) {}
    var match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (_) {}
    }
    return null;
  }

  async function rawAIRequest(messages, ai, timeoutMs) {
    ai = ai || state.cfg.ai || {};
    var body = {
      endpoint: ai.endpoint || "",
      apiKey: ai.apiKey || "",
      model: ai.model || "gpt-4o-mini",
      temperature: Number.isFinite(Number(ai.temperature)) ? Number(ai.temperature) : 0.2,
      messages: messages
    };
    var data = await postJSON("/api/wukong/ai/chat", body);
    var out = extractAIText(data);
    if (!out) throw new Error("AI empty");
    return out;
  }

  async function translateViaGoogle(text, from, to) {
    var sl = getLangCode(from, "auto");
    var tl = getLangCode(to, "en");
    if (sl !== "auto" && sl.indexOf("-") > -1) sl = sl.split("-")[0];
    if (tl.indexOf("-") > -1) tl = tl.split("-")[0];
    var params = new URLSearchParams();
    params.set("q", text);
    params.set("sl", sl || "auto");
    params.set("tl", tl || "en");
    var data = await api("/api/wukong/translate/google?" + params.toString());
    return String(data.translation || "").trim();
  }

  async function translateViaAI(text, from, to, ai) {
    ai = ai || state.cfg.ai || {};
    var prompt = fillTemplate(ai.translatePrompt || DEFAULT_TRANSLATE_PROMPT, {
      myLang: to || state.cfg.sourceLang || "中文",
      peerMessage: text,
      sourceLang: from || "auto",
      targetLang: to || state.cfg.sourceLang || "中文"
    });
    var raw = await rawAIRequest([
      { role: "system", content: "你是极速聊天翻译器。必须只输出可解析 JSON。" },
      { role: "user", content: prompt }
    ], ai, 9000);
    var json = parseJsonLoose(raw);
    return (json && typeof json.translation === "string" ? json.translation : raw).trim();
  }

  async function translateByProvider(text, from, to) {
    if (state.cfg.translateProvider === "ai") return await translateViaAI(text, from, to, state.cfg.ai || {});
    return await translateViaGoogle(text, from, to);
  }

  function addToAiCache(key, val, ttlMs) {
    state.aiCache[key] = { value: val, expiresAt: Date.now() + (ttlMs || 3600000) };
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
    var isRetry = !!opts.forceRetry || /^翻译失败|Translation failed|ဘာသာပြန်/.test(msg.translation || "");
    if (state.translateInflight[msg.id] && !isRetry) {
      if (opts.forceOpen) {
        msg.translationOpen = true;
        msgTouch(msg);
        incrementalRender("keep");
      }
      return state.translateInflight[msg.id];
    }
    if (msg.translation && msg.translation !== t("translation_loading") && !isRetry) {
      if (opts.forceOpen) {
        msg.translationOpen = true;
        msgTouch(msg);
        incrementalRender("keep");
      }
      return Promise.resolve(msg.translation);
    }
    msg.translation = t("translation_loading");
    msg.translationOpen = true;
    msgTouch(msg);
    incrementalRender("keep");
    var provider = state.cfg.translateProvider;
    var cacheKey = "translate|" + provider + "|" + state.cfg.targetLang + ">" + state.cfg.sourceLang + "|" + String(msg.text || "").slice(0, 800);
    var cached = getAiCache(cacheKey);
    if (cached && !isRetry) {
      msg.translation = cached;
      msg.translationOpen = true;
      msgTouch(msg);
      incrementalRender("keep");
      return Promise.resolve(cached);
    }
    var p = translateByProvider(msg.text, state.cfg.targetLang, state.cfg.sourceLang)
      .then(function (out) {
        msg.translation = out || t("translation_empty");
        msg.translationOpen = true;
        addToAiCache(cacheKey, msg.translation, 3 * 24 * 3600000);
        msgTouch(msg);
        incrementalRender("keep");
        persistChat();
        return msg.translation;
      })
      .catch(function (err) {
        warn("peer-translate", err);
        msg.translation = t("translation_failed");
        msg.translationOpen = true;
        msgTouch(msg);
        incrementalRender("keep");
        throw err;
      })
      .finally(function () { delete state.translateInflight[msg.id]; });
    state.translateInflight[msg.id] = p;
    return p;
  }

  function executePeerTranslateAndWingman(msg, opts) {
    opts = opts || {};
    if (!msg || msg.recalled || msg.type !== "text" || msg.mine) return;
    var isRetry = !!opts.forceRetry || /^翻译失败|Translation failed|ဘာသာပြန်/.test(msg.translation || "");
    if (msg.translation && msg.translation !== t("translation_loading") && !isRetry) {
      msg.translationOpen = opts.forceOpen ? true : !msg.translationOpen;
      msgTouch(msg);
      incrementalRender("keep");
      if (msg.translationOpen && state.cfg.smartReplyEnabled) setTimeout(function () { startWingmanForMessage(msg); }, 180);
      return;
    }
    executePeerTranslateOnly(msg, { forceRetry: isRetry, forceOpen: true }).catch(function () {});
    if (state.cfg.smartReplyEnabled) setTimeout(function () { startWingmanForMessage(msg); }, 180);
    else clearWingmanPanel();
  }

  function buildHistoryForPrompt(currentMsg) {
    if (!state.cfg.contextMemoryEnabled) return "（未启用上下文记忆）";
    var all = state.messages.filter(function (m) {
      return m && m.type === "text" && !m.recalled && m.text && String(m.id) !== String(currentMsg.id);
    });
    var max = Math.max(1, Number(state.cfg.contextRounds || 30)) * 2;
    var slice = all.slice(-max);
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
    var requestId = ++state.wingmanRequestId;
    renderWingmanLoading();
    var cacheKey = "wingman|" + String(msg.text || "").slice(0, 700) + "|" + state.cfg.sourceLang + "|" + state.cfg.targetGender + "|" + state.cfg.relationshipStage + "|" + state.cfg.contextRounds + "|" + (state.cfg.contextMemoryEnabled ? "1" : "0") + "|" + (state.cfg.ai.model || "");
    var cached = getAiCache(cacheKey);
    if (cached) {
      renderSmartReplies(cached.emotion_analysis || cached.analysis || "", cached.quick_replies || []);
      return;
    }
    fetchAIWingman(msg).then(function (json) {
      if (requestId !== state.wingmanRequestId) return;
      addToAiCache(cacheKey, json, 45 * 60 * 1000);
      renderSmartReplies(json.emotion_analysis || "", json.quick_replies || []);
    }).catch(function (err) {
      if (requestId !== state.wingmanRequestId) return;
      warn("wingman", err);
      renderWingmanInfo(t("wingman_failed"), []);
    });
  }

  async function fetchAIWingman(msg) {
    var ai = state.cfg.ai || {};
    var prompt = fillTemplate(ai.wingmanPrompt || DEFAULT_WINGMAN_PROMPT, {
      myLang: state.cfg.sourceLang,
      targetGender: state.cfg.targetGender,
      relationshipStage: state.cfg.relationshipStage,
      communicationStyle: state.cfg.communicationStyle,
      history: buildHistoryForPrompt(msg),
      peerMessage: msg.text
    });
    var raw = await rawAIRequest([
      { role: "system", content: "只输出可解析的 JSON，不要使用 Markdown，不要解释。所有 quick_replies.text 必须 10 字以内。" },
      { role: "user", content: prompt }
    ], ai, 18000);
    var json = parseJsonLoose(raw);
    if (!json) return { emotion_analysis: raw.slice(0, 80), quick_replies: [] };
    if (!Array.isArray(json.quick_replies)) json.quick_replies = [];
    json.quick_replies = json.quick_replies.slice(0, 5).map(function (r) {
      if (typeof r === "string") return { label: t("reply"), text: r.slice(0, 10), style: "自然", affinity_risk: t("safe") };
      return {
        label: String(r.label || r.style || t("reply")).slice(0, 6),
        text: String(r.text || r.reply || "").trim().slice(0, 10),
        style: String(r.style || "自然"),
        affinity_risk: String(r.affinity_risk || r.risk || t("safe"))
      };
    }).filter(function (r) { return !!r.text; });
    return json;
  }

  function renderWingmanLoading() {
    var p = byId("nbb-wk-wingman-panel");
    var a = byId("nbb-wk-wingman-analysis");
    var bar = byId("nbb-wk-smart-replies-bar");
    if (!p || !a || !bar) return;
    p.hidden = false;
    a.innerHTML = '<span class="nbb-wk-thinking-dot"></span><span>' + esc(t("thinking")) + '</span>';
    bar.innerHTML = "";
    updateFooterHeight();
  }

  function renderWingmanInfo(text, replies) {
    var p = byId("nbb-wk-wingman-panel");
    var a = byId("nbb-wk-wingman-analysis");
    var bar = byId("nbb-wk-smart-replies-bar");
    if (!p || !a || !bar) return;
    p.hidden = false;
    a.textContent = text;
    bar.innerHTML = "";
    if (replies && replies.length) renderSmartReplies(text, replies);
    updateFooterHeight();
  }

  function renderSmartReplies(analysisText, replies) {
    var p = byId("nbb-wk-wingman-panel");
    var a = byId("nbb-wk-wingman-analysis");
    var bar = byId("nbb-wk-smart-replies-bar");
    if (!p || !a || !bar) return;
    p.hidden = false;
    a.innerHTML = '<i class="fa fa-heart-o"></i><span>' + esc(analysisText || "") + '</span>';
    var html = "";
    for (var i = 0; i < Math.min(5, replies.length); i++) {
      var item = replies[i];
      var text = String(item.text || "").trim().slice(0, 10);
      if (!text) continue;
      html += '<button class="nbb-wk-sr-pill" data-text="' + escAttr(text) + '" title="' + escAttr((item.style || "") + " · " + (item.affinity_risk || "")) + '">' + esc(text) + '<em>' + esc(item.label || item.style || "") + '</em></button>';
    }
    bar.innerHTML = html;
    updateFooterHeight();
  }

  function clearWingmanPanel() {
    var p = byId("nbb-wk-wingman-panel");
    if (p) p.hidden = true;
    updateFooterHeight();
  }

  function onSmartReplyClick(e) {
    var item = e.target.closest(".nbb-wk-sr-pill");
    if (!item) return;
    var text = item.getAttribute("data-text");
    var input = byId("nbb-wk-input");
    if (!input || !text) return;
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    clearWingmanPanel();
    updatePrimaryButton();
    updateFooterHeight();
  }

  async function init() {
    state.root = findOrCreateRoot();
    if (!state.root) return;
    state.root.innerHTML = '<div class="nbb-wk-loading">' + esc(FALLBACK_I18N.loading_chat) + '</div>';
    await loadI18n();
    state.page = parsePage(state.root);
    state.cfg = normalizeConfig(loadJSON(storageKey("cfg"), {}));
    state.bg = loadJSON(storageKey("bg"), { dataUrl: null, opacity: 0.85 });
    cleanUpOldMedia();

    try {
      var token = await api("/api/wukong/token");
      state.me = token.user || { uid: token.uid, username: token.username };
    } catch (e) {
      state.root.innerHTML = '<div class="nbb-wk-error">' + esc(t("login_required")) + '</div>';
      return;
    }

    try {
      await prepareChannel();
    } catch (e) {
      warn("prepare-channel", e);
      state.root.innerHTML = '<div class="nbb-wk-error">' + esc(e.message === "same_user" ? t("same_user") : t("open_failed")) + '</div>';
      return;
    }

    if (!state.channelId) {
      buildLanding();
      return;
    }

    buildChatShell();
    state.mounted = true;
    await loadChatFromDB();
    setPeerInfo();
    try {
      await initWukong();
      await fetchWukongHistory(0, { initial: true });
      requestAnimationFrame(forceScrollToBottom);
    } catch (e) {
      warn("init-wukong", e);
      toast(t("connect_failed"));
      setPeerInfo();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
