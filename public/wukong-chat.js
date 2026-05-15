(function () {
  'use strict';

  var API = '/api/wukong';
  var SDK_URL = 'https://cdn.jsdelivr.net/npm/wukongimjssdk@latest/lib/wukongimjssdk.umd.js';
  var BOTTOM_THRESHOLD = 120;
  var audio = new Audio();
  var audioEl = null;

  var state = {
    root: null,
    sdkReady: false,
    connected: false,
    me: null,
    token: null,
    profiles: {},
    conversations: [],
    channel: null,
    channelType: 1,
    channelTitle: '',
    messages: [],
    localMessages: [],
    renderLimit: 80,
    lastSeq: 0,
    hasNoMore: false,
    loadingHistory: false,
    quote: null,
    rec: { recorder: null, stream: null, chunks: [], sec: 0, timer: null, shouldSend: false },
  };

  function qs(sel) { return document.querySelector(sel); }
  function byId(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function normalizeKey(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function fmtTime(ts) { var d = new Date(ts || Date.now()); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function fmtDate(ts) { var d = new Date(ts || Date.now()); var n = new Date(); var today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime(); var day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); var diff = Math.floor((today - day) / 86400000); if (diff === 0) return '今天'; if (diff === 1) return '昨天'; return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function toast(text) { var n = document.createElement('div'); n.className = 'nbb-wk-toast'; n.textContent = text; document.body.appendChild(n); setTimeout(function () { n.remove(); }, 1800); }

  function request(url, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    opts.headers = Object.assign({ 'Accept': 'application/json' }, opts.headers || {});
    if (opts.body && !(opts.body instanceof FormData)) opts.headers['Content-Type'] = 'application/json';
    return fetch(url, opts).then(function (r) {
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (_) { data = t; }
        if (!r.ok) {
          var e = new Error((data && data.error) || ('HTTP ' + r.status));
          e.data = data;
          throw e;
        }
        return data;
      });
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.wk && window.wk.WKSDK) return resolve();
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function extractPayload(m) {
    try {
      if (!m) return {};
      var payload = m.payload || m.content || m.messageContent || m.message_content;
      if (!payload) return {};
      if (typeof payload === 'object' && !(payload instanceof Uint8Array)) return payload;
      if (payload instanceof Uint8Array && window.TextDecoder) return JSON.parse(new TextDecoder('utf-8').decode(payload));
      if (typeof payload === 'string') {
        var p = payload.trim();
        if (!p) return {};
        if (p.charAt(0) === '{') return JSON.parse(p);
        try {
          return JSON.parse(decodeURIComponent(atob(p).split('').map(function (c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')));
        } catch (_) {
          return { text: p };
        }
      }
    } catch (_) {}
    return {};
  }

  function parseMedia(text) {
    var match;
    if ((match = String(text || '').match(/^!\[\]\((.+?)\)$/)) || (match = String(text || '').match(/^\[图片\]\((.+?)\)$/))) return { type: 'image', url: match[1], text: '[图片]' };
    if ((match = String(text || '').match(/^\[视频\]\((.+?)\)$/))) return { type: 'video', url: match[1], text: '[视频]' };
    if ((match = String(text || '').match(/^\[语音消息\]\((.+?)\)$/))) return { type: 'voice', url: match[1], text: '[语音]' };
    return { type: 'text', text: String(text || '') };
  }

  function normalizeMsg(raw, fallbackMine) {
    var p = extractPayload(raw);
    var from = String(raw && (raw.from_uid || raw.fromUID || raw.from || raw.fromUid || raw.sender_uid || raw.senderUID || '') || '');
    var mine = from && state.me && from === String(state.me.uid);
    if (!from && fallbackMine !== undefined) mine = !!fallbackMine;
    var serverText = p.text || p.content || raw.text || raw.content || '';
    if (mine && p.originalText) serverText = p.originalText;
    var media = parseMedia(serverText);
    var id = String((raw && (raw.message_id || raw.messageID || raw.client_msg_no || raw.clientMsgNo || raw.id)) || ('local_' + Date.now() + '_' + Math.random().toString(16).slice(2)));
    var seq = Number(raw && (raw.message_seq || raw.messageSeq || raw.seq || 0)) || 0;
    var ts = Number(raw && (raw.timestamp || raw.time || raw.ts || Date.now())) || Date.now();
    if (ts < 100000000000) ts *= 1000;
    return {
      id: id,
      seq: seq,
      mine: !!mine,
      uid: from || (mine && state.me ? String(state.me.uid) : ''),
      ts: ts,
      type: media.type,
      text: media.text,
      mediaUrl: media.type === 'image' || media.type === 'video' ? media.url : '',
      audioUrl: media.type === 'voice' ? media.url : '',
      serverText: serverText,
      translation: '',
      quote: p.quote || p.reply || null,
      raw: raw,
    };
  }

  function getMessageList(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data && data.messages)) return data.messages;
    if (Array.isArray(data && data.data)) return data.data;
    if (data && data.data && Array.isArray(data.data.messages)) return data.data.messages;
    return [];
  }

  function mergeMessages(newItems) {
    var map = {};
    var all = state.messages.concat(state.localMessages).concat(newItems || []);
    var out = [];
    all.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    all.forEach(function (m) {
      var key = m.id || (m.uid + '|' + normalizeKey(m.serverText) + '|' + Math.floor((m.ts || 0) / 5000));
      if (map[key]) return;
      map[key] = true;
      out.push(m);
      if (m.seq && m.seq > state.lastSeq) state.lastSeq = m.seq;
    });
    state.messages = out;
    state.localMessages = state.localMessages.filter(function (lm) {
      return !state.messages.some(function (m) { return m !== lm && m.mine && normalizeKey(m.serverText) === normalizeKey(lm.serverText) && Math.abs((m.ts || 0) - (lm.ts || 0)) < 15000; });
    });
  }

  function avatarHtml(user) {
    user = user || {};
    var name = user.displayname || user.username || user.uid || '?';
    if (user.picture) return '<img src="' + escAttr(user.picture) + '" alt="" style="width:100%;height:100%;object-fit:cover;" />';
    return esc(String(name).charAt(0).toUpperCase() || '?');
  }

  function profile(uid) { return state.profiles[String(uid)] || { uid: String(uid), username: '用户' + uid, displayname: '用户' + uid }; }

  function fetchProfile(uid) {
    uid = String(uid || '').trim();
    if (!/^\d+$/.test(uid)) return Promise.resolve(null);
    if (state.profiles[uid]) return Promise.resolve(state.profiles[uid]);
    return request(API + '/user/' + encodeURIComponent(uid)).then(function (u) { state.profiles[uid] = u; return u; }).catch(function () { return null; });
  }

  function fetchProfiles(uids) {
    uids = (uids || []).map(String).filter(function (uid) { return /^\d+$/.test(uid) && !state.profiles[uid]; });
    if (!uids.length) return Promise.resolve([]);
    return request(API + '/users?uids=' + encodeURIComponent(uids.join(','))).then(function (data) {
      (data.users || []).forEach(function (u) { state.profiles[String(u.uid)] = u; });
      return data.users || [];
    }).catch(function () { return []; });
  }

  function renderShell() {
    state.root.innerHTML = '' +
      '<div class="nbb-wk-shell" id="nbb-wk-shell">' +
      '  <aside class="nbb-wk-left">' +
      '    <div class="nbb-wk-left-head"><div class="nbb-wk-title">悟空聊天</div><div class="nbb-wk-me" id="nbb-wk-me"></div></div>' +
      '    <div class="nbb-wk-start"><input id="nbb-wk-peer-input" inputmode="numeric" placeholder="输入 NodeBB 用户 UID"/><button class="nbb-wk-btn" id="nbb-wk-start-btn">聊天</button></div>' +
      '    <div class="nbb-wk-list" id="nbb-wk-list"><div class="nbb-wk-empty">正在加载会话...</div></div>' +
      '  </aside>' +
      '  <section class="nbb-wk-right" id="nbb-wk-right">' +
      '    <div class="nbb-wk-placeholder" id="nbb-wk-placeholder">选择或输入一个用户开始聊天</div>' +
      '  </section>' +
      '</div>';
    byId('nbb-wk-me').textContent = state.me ? ('UID ' + state.me.uid) : '';
    byId('nbb-wk-start-btn').onclick = function () { var uid = byId('nbb-wk-peer-input').value.trim(); if (uid) openPeer(uid); };
    byId('nbb-wk-peer-input').onkeydown = function (e) { if (e.key === 'Enter') byId('nbb-wk-start-btn').click(); };
  }

  function renderConversations() {
    var el = byId('nbb-wk-list');
    if (!el) return;
    if (!state.conversations.length) {
      el.innerHTML = '<div class="nbb-wk-empty">暂无会话<br/>输入 UID 可直接开始单聊</div>';
      return;
    }
    el.innerHTML = state.conversations.map(function (c) {
      var active = state.channel && String(c.channel_id) === String(state.channel) && Number(c.channel_type || 1) === Number(state.channelType);
      var p = c.channel_type === 1 ? profile(c.channel_id) : { displayname: c.title || c.channel_id, username: c.channel_id };
      return '<div class="nbb-wk-conv ' + (active ? 'active' : '') + '" data-channel="' + escAttr(c.channel_id) + '" data-type="' + escAttr(c.channel_type || 1) + '">' +
        '<div class="nbb-wk-avatar">' + avatarHtml(p) + '</div>' +
        '<div class="nbb-wk-conv-body"><div class="nbb-wk-conv-name">' + esc(p.displayname || p.username || c.channel_id) + '</div><div class="nbb-wk-conv-last">' + esc(c.last_msg || c.lastMessage || c.last || '') + '</div></div>' +
        '</div>';
    }).join('');
    el.querySelectorAll('.nbb-wk-conv').forEach(function (node) {
      node.onclick = function () {
        var cid = node.getAttribute('data-channel');
        var type = Number(node.getAttribute('data-type') || 1);
        if (type === 1) openPeer(cid); else openChannel(cid, type, cid);
      };
    });
  }

  function renderChatFrame() {
    var right = byId('nbb-wk-right');
    if (!right) return;
    var title = esc(state.channelTitle || state.channel || '聊天');
    right.innerHTML = '' +
      '<header class="nbb-wk-header">' +
      '  <button class="nbb-wk-back" id="nbb-wk-back">‹</button>' +
      '  <div class="nbb-wk-avatar" id="nbb-wk-peer-avatar"></div>' +
      '  <div class="nbb-wk-peer-name" id="nbb-wk-peer-name">' + title + '</div>' +
      '  <div class="nbb-wk-status" id="nbb-wk-status">' + (state.connected ? '已连接' : '连接中') + '</div>' +
      '</header>' +
      '<main class="nbb-wk-main" id="nbb-wk-main"><div id="nbb-wk-msg-list"></div></main>' +
      '<button class="nbb-wk-fab" id="nbb-wk-fab">⌄</button>' +
      '<footer class="nbb-wk-footer" id="nbb-wk-footer">' +
      '  <div class="nbb-wk-quote" id="nbb-wk-quote" hidden><span id="nbb-wk-quote-text"></span><button class="nbb-wk-mini" id="nbb-wk-quote-close">×</button></div>' +
      '  <div class="nbb-wk-composer">' +
      '    <button class="nbb-wk-icon-btn" id="nbb-wk-media-btn" title="图片/视频">＋</button>' +
      '    <textarea class="nbb-wk-input" id="nbb-wk-input" rows="1" placeholder="发送消息..."></textarea>' +
      '    <button class="nbb-wk-icon-btn" id="nbb-wk-voice-btn" title="语音">🎙</button>' +
      '    <button class="nbb-wk-send" id="nbb-wk-send">↑</button>' +
      '  </div>' +
      '  <input type="file" id="nbb-wk-file" accept="image/*,video/*" multiple hidden />' +
      '</footer>';
    byId('nbb-wk-back').onclick = function () { closeChat(); };
    byId('nbb-wk-send').onclick = function () { sendCurrentText(); };
    byId('nbb-wk-input').oninput = autoGrow;
    byId('nbb-wk-input').onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrentText(); } };
    byId('nbb-wk-media-btn').onclick = function () { byId('nbb-wk-file').click(); };
    byId('nbb-wk-file').onchange = onPickFiles;
    byId('nbb-wk-voice-btn').onclick = toggleVoice;
    byId('nbb-wk-quote-close').onclick = function () { state.quote = null; updateQuote(); };
    byId('nbb-wk-fab').onclick = scrollBottom;
    var main = byId('nbb-wk-main');
    main.onscroll = function () {
      byId('nbb-wk-fab').classList.toggle('show', !isAtBottom());
      if (main.scrollTop < 160) loadOlder();
    };
    updatePeerHeader();
    renderMessages('bottom');
    handleViewport();
  }

  function updatePeerHeader() {
    var av = byId('nbb-wk-peer-avatar');
    var name = byId('nbb-wk-peer-name');
    if (!av || !name) return;
    var p = state.channelType === 1 ? profile(state.channel) : { displayname: state.channelTitle || state.channel };
    av.innerHTML = avatarHtml(p);
    name.textContent = p.displayname || p.username || state.channelTitle || state.channel || '聊天';
  }

  function autoGrow() { this.style.height = '36px'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; handleViewport(); }

  function isAtBottom() { var main = byId('nbb-wk-main'); if (!main) return true; return main.scrollHeight - main.scrollTop - main.clientHeight < BOTTOM_THRESHOLD; }
  function scrollBottom() { var main = byId('nbb-wk-main'); if (main) main.scrollTop = main.scrollHeight; }

  function renderMessages(mode) {
    var list = byId('nbb-wk-msg-list');
    var main = byId('nbb-wk-main');
    if (!list || !main) return;
    var oldHeight = main.scrollHeight;
    var oldTop = main.scrollTop;
    var wasBottom = isAtBottom();
    var arr = state.messages.slice(-state.renderLimit);
    var html = '';
    var lastDay = '';
    arr.forEach(function (m) {
      var day = fmtDate(m.ts);
      if (day !== lastDay) { html += '<div class="nbb-wk-empty" style="padding:12px 0 8px;font-size:12px">' + esc(day) + '</div>'; lastDay = day; }
      html += renderMessage(m);
    });
    list.innerHTML = html;
    list.querySelectorAll('[data-act="preview"]').forEach(function (n) { n.onclick = function () { openPreview(n.getAttribute('data-url'), n.getAttribute('data-type')); }; });
    list.querySelectorAll('[data-act="voice"]').forEach(function (n) { n.onclick = function () { playVoice(n); }; });
    list.querySelectorAll('[data-act="quote"]').forEach(function (n) { n.onclick = function () { var m = getMsg(n.getAttribute('data-id')); if (m) { state.quote = m; updateQuote(); byId('nbb-wk-input').focus(); } }; });
    list.querySelectorAll('[data-act="translate"]').forEach(function (n) { n.onclick = function () { translateMsg(n.getAttribute('data-id')); }; });
    if (mode === 'prepend') main.scrollTop = oldTop + (main.scrollHeight - oldHeight);
    else if (mode === 'bottom' || wasBottom) requestAnimationFrame(scrollBottom);
  }

  function renderMessage(m) {
    var p = m.mine ? (state.me || {}) : profile(m.uid || state.channel);
    var body = '';
    if (m.type === 'image') body = '<img class="nbb-wk-img" data-act="preview" data-type="image" data-url="' + escAttr(m.mediaUrl) + '" src="' + escAttr(m.mediaUrl) + '" />';
    else if (m.type === 'video') body = '<video class="nbb-wk-video" data-act="preview" data-type="video" data-url="' + escAttr(m.mediaUrl) + '" src="' + escAttr(m.mediaUrl) + '#t=0.001" muted playsinline preload="metadata"></video>';
    else if (m.type === 'voice') body = '<button class="nbb-wk-voice" data-act="voice" data-url="' + escAttr(m.audioUrl) + '"><span class="nbb-wk-play">▶</span><span class="nbb-wk-wave"><i style="height:6px"></i><i style="height:12px"></i><i style="height:8px"></i><i style="height:15px"></i><i style="height:10px"></i></span><span>语音</span></button>';
    else body = '<div class="nbb-wk-text">' + esc(m.text || m.serverText || '') + '</div>';
    if (m.translation) body += '<div class="nbb-wk-trans">✨ ' + esc(m.translation) + '</div>';
    var tools = m.type === 'text' ? '<div class="nbb-wk-tools"><button class="nbb-wk-mini" data-act="translate" data-id="' + escAttr(m.id) + '">译</button><button class="nbb-wk-mini" data-act="quote" data-id="' + escAttr(m.id) + '">引用</button></div>' : '<div class="nbb-wk-tools"><button class="nbb-wk-mini" data-act="quote" data-id="' + escAttr(m.id) + '">引用</button></div>';
    return '<div class="nbb-wk-row ' + (m.mine ? 'mine' : 'other') + '" data-id="' + escAttr(m.id) + '">' +
      (m.mine ? '' : '<div class="nbb-wk-msg-avatar">' + avatarHtml(p) + '</div>') +
      '<div class="nbb-wk-bubble-wrap"><div class="nbb-wk-bubble">' + body + '<div class="nbb-wk-time">' + esc(fmtTime(m.ts)) + '</div></div>' + tools + '</div>' +
      '</div>';
  }

  function getMsg(id) { return state.messages.find(function (m) { return String(m.id) === String(id); }); }

  function updateQuote() {
    var q = byId('nbb-wk-quote');
    if (!q) return;
    if (!state.quote) { q.hidden = true; return; }
    byId('nbb-wk-quote-text').textContent = '引用：' + (state.quote.text || state.quote.serverText || '[消息]').slice(0, 80);
    q.hidden = false;
    handleViewport();
  }

  function openPreview(url, type) {
    var mask = document.createElement('div');
    mask.className = 'nbb-wk-preview';
    mask.innerHTML = type === 'video' ? '<video src="' + escAttr(url) + '" controls autoplay playsinline></video>' : '<img src="' + escAttr(url) + '" />';
    mask.onclick = function (e) { if (e.target === mask) mask.remove(); };
    document.body.appendChild(mask);
  }

  function playVoice(btn) {
    var url = btn.getAttribute('data-url');
    if (!url) return;
    if (audioEl === btn && !audio.paused) { audio.pause(); btn.querySelector('.nbb-wk-play').textContent = '▶'; return; }
    if (audioEl) audioEl.querySelector('.nbb-wk-play').textContent = '▶';
    audioEl = btn;
    audio.src = url;
    audio.play().catch(function () { toast('播放失败'); });
    btn.querySelector('.nbb-wk-play').textContent = 'Ⅱ';
  }
  audio.onended = function () { if (audioEl) audioEl.querySelector('.nbb-wk-play').textContent = '▶'; audioEl = null; };

  function translateMsg(id) {
    var m = getMsg(id);
    if (!m || m.type !== 'text') return;
    request(API + '/translate/google?sl=auto&tl=zh-CN&q=' + encodeURIComponent(m.serverText || m.text || '')).then(function (r) {
      m.translation = r.translation || '';
      renderMessages('keep');
    }).catch(function () { toast('翻译失败'); });
  }

  function handleViewport() {
    var footer = byId('nbb-wk-footer');
    if (!footer) return;
    var vv = window.visualViewport;
    var offset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    footer.style.marginBottom = offset + 'px';
    if (isAtBottom()) requestAnimationFrame(scrollBottom);
  }
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', handleViewport, { passive: true }); window.visualViewport.addEventListener('scroll', handleViewport, { passive: true }); }

  function openPeer(uid) {
    uid = String(uid || '').trim();
    if (!/^\d+$/.test(uid)) { toast('请输入正确 UID'); return; }
    fetchProfile(uid).then(function (u) {
      state.channel = uid;
      state.channelType = 1;
      state.channelTitle = (u && (u.displayname || u.username)) || ('用户' + uid);
      state.messages = [];
      state.localMessages = [];
      state.lastSeq = 0;
      state.hasNoMore = false;
      byId('nbb-wk-shell').classList.add('open');
      renderConversations();
      renderChatFrame();
      return loadHistory(false);
    });
  }

  function openChannel(channelId, channelType, title) {
    state.channel = String(channelId);
    state.channelType = Number(channelType || 1);
    state.channelTitle = title || channelId;
    state.messages = [];
    state.localMessages = [];
    state.lastSeq = 0;
    state.hasNoMore = false;
    byId('nbb-wk-shell').classList.add('open');
    renderConversations();
    renderChatFrame();
    loadHistory(false);
  }

  function openTopic(tid, cid) {
    var channelId = 'nbb_topic_' + tid;
    request(API + '/topic-channel/ensure', { method: 'POST', body: JSON.stringify({ tid: tid, cid: cid || '', channel_id: channelId, channel_type: 2 }) }).then(function () {
      openChannel(channelId, 2, '主题 #' + tid);
    }).catch(function () { toast('主题聊天室初始化失败'); });
  }

  function closeChat() { byId('nbb-wk-shell').classList.remove('open'); state.channel = null; renderConversations(); }

  function loadHistory(prepend) {
    if (!state.channel || state.loadingHistory || state.hasNoMore) return Promise.resolve();
    state.loadingHistory = true;
    var start = prepend ? getOldestSeq() - 1 : 0;
    var url = API + '/history?channel_id=' + encodeURIComponent(state.channel) + '&channel_type=' + encodeURIComponent(state.channelType) + '&limit=50';
    if (start > 0) url += '&start_message_seq=' + encodeURIComponent(start) + '&pull_mode=0';
    return request(url).then(function (data) {
      var list = getMessageList(data).map(function (x) { return normalizeMsg(x); });
      if (list.length < 50) state.hasNoMore = true;
      mergeMessages(list);
      var fromUids = list.map(function (m) { return m.uid; }).filter(function (u) { return u && u !== String(state.me.uid); });
      return fetchProfiles(fromUids).then(function () { renderMessages(prepend ? 'prepend' : 'bottom'); updatePeerHeader(); });
    }).catch(function (e) { console.warn(e); toast('历史加载失败'); }).finally(function () { state.loadingHistory = false; });
  }

  function loadOlder() { if (!state.hasNoMore) loadHistory(true); }
  function getOldestSeq() { var seqs = state.messages.map(function (m) { return m.seq || 0; }).filter(Boolean); return seqs.length ? Math.min.apply(Math, seqs) : 0; }

  function sendCurrentText() {
    var input = byId('nbb-wk-input');
    var text = String(input.value || '').trim();
    if (!text) return;
    sendText(text);
    input.value = '';
    input.style.height = '36px';
    state.quote = null;
    updateQuote();
  }

  function sendText(text) {
    if (!state.channel || !state.sdkReady) return;
    var wk = window.wk;
    var displayText = text;
    try {
      var channel = new wk.Channel(String(state.channel), Number(state.channelType || 1));
      var content = new wk.MessageText(text);
      if (state.quote) {
        var originalEncode = content.encode.bind(content);
        content.encode = function () {
          var p = originalEncode();
          try { var obj = typeof p === 'string' ? JSON.parse(p) : (p || {}); obj.quote = { text: state.quote.text || state.quote.serverText || '', uid: state.quote.uid || '', id: state.quote.id || '' }; return typeof p === 'string' ? JSON.stringify(obj) : obj; } catch (_) { return p; }
        };
      }
      var wkMsg = wk.WKSDK.shared().chatManager.send(content, channel);
      var local = normalizeMsg({ id: 'local_' + Date.now(), text: displayText, timestamp: Date.now() }, true);
      local.uid = String(state.me.uid);
      local.raw = wkMsg || local.raw;
      state.localMessages.push(local);
      mergeMessages([]);
      renderMessages('bottom');
    } catch (e) { console.warn(e); toast('发送失败'); }
  }

  function onPickFiles(e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    var csrf = (window.config && (config.csrf_token || config.csrfToken)) || (window.ajaxify && ajaxify.data && (ajaxify.data.csrf_token || ajaxify.data.csrfToken)) || '';
    files.reduce(function (p, file) {
      return p.then(function () {
        var fd = new FormData();
        fd.append('files[]', file, file.name || ('file_' + Date.now()));
        toast('正在上传...');
        return fetch('/api/post/upload', { method: 'POST', credentials: 'same-origin', headers: csrf ? { 'x-csrf-token': csrf } : {}, body: fd }).then(function (r) { return r.json(); }).then(function (json) {
          var url = (json && json.response && json.response.images && json.response.images[0] && json.response.images[0].url) || (json && json.files && json.files[0] && (json.files[0].url || json.files[0].path)) || '';
          if (url && !/^https?:\/\//i.test(url) && url.charAt(0) !== '/') url = '/' + url;
          if (!url) throw new Error('upload url empty');
          if (/^image\//i.test(file.type)) sendText('![](' + url + ')');
          else if (/^video\//i.test(file.type)) sendText('[视频](' + url + ')');
          else sendText('[文件](' + url + ')');
        });
      });
    }, Promise.resolve()).catch(function (err) { console.warn(err); toast('上传失败'); });
  }

  function getVoiceMime() {
    var arr = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    for (var i = 0; i < arr.length; i++) if (MediaRecorder.isTypeSupported(arr[i])) return arr[i];
    return '';
  }

  function toggleVoice() {
    if (state.rec.recorder && state.rec.recorder.state !== 'inactive') return stopVoice(true);
    startVoice();
  }

  function startVoice() {
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast('浏览器不支持录音'); return; }
    navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (stream) {
      state.rec.stream = stream;
      state.rec.chunks = [];
      var mime = getVoiceMime();
      var opts = mime ? { mimeType: mime, audioBitsPerSecond: 16000 } : { audioBitsPerSecond: 16000 };
      state.rec.recorder = new MediaRecorder(stream, opts);
      state.rec.recorder.ondataavailable = function (ev) { if (ev.data && ev.data.size) state.rec.chunks.push(ev.data); };
      state.rec.recorder.onstop = uploadVoice;
      state.rec.recorder.start(250);
      byId('nbb-wk-voice-btn').textContent = '■';
      toast('开始录音，再点发送');
    }).catch(function () { toast('录音权限被拒绝'); });
  }

  function stopVoice(shouldSend) { state.rec.shouldSend = !!shouldSend; state.rec.recorder.stop(); }

  function uploadVoice() {
    if (state.rec.stream) state.rec.stream.getTracks().forEach(function (t) { t.stop(); });
    byId('nbb-wk-voice-btn').textContent = '🎙';
    if (!state.rec.shouldSend || !state.rec.chunks.length) return;
    var type = (state.rec.recorder && state.rec.recorder.mimeType) || 'audio/webm';
    var ext = type.indexOf('ogg') >= 0 ? 'ogg' : 'webm';
    var file = new File([new Blob(state.rec.chunks, { type: type })], 'voice_' + Date.now() + '.' + ext, { type: type });
    var fake = { target: { files: [file], value: '' } };
    onPickFiles(fake);
  }

  function normalizeConversation(x) {
    var channelId = String(x.channel_id || x.channelID || x.channelId || (x.channel && x.channel.channelID) || '');
    var type = Number(x.channel_type || x.channelType || (x.channel && x.channel.channelType) || (channelId.indexOf('nbb_topic_') === 0 ? 2 : 1) || 1);
    var payload = extractPayload(x.last_msg || x.lastMessage || x.last_msg_payload || x.lastMessagePayload || x);
    var last = payload.text || payload.content || x.last_msg || x.lastMessage || '';
    if (!channelId) return null;
    return { channel_id: channelId, channel_type: type, last_msg: typeof last === 'string' ? last : '', title: channelId, raw: x };
  }

  function syncConversations() {
    return request(API + '/conversation/sync?version=0&msg_count=30').then(function (data) {
      var list = Array.isArray(data) ? data : (Array.isArray(data && data.conversations) ? data.conversations : (Array.isArray(data && data.data) ? data.data : []));
      state.conversations = list.map(normalizeConversation).filter(Boolean).filter(function (c) { return c.channel_id !== String(state.me.uid); });
      var uids = state.conversations.filter(function (c) { return Number(c.channel_type) === 1; }).map(function (c) { return c.channel_id; });
      return fetchProfiles(uids).then(renderConversations);
    }).catch(function () { state.conversations = []; renderConversations(); });
  }

  function bindWukongListeners() {
    var wk = window.wk;
    wk.WKSDK.shared().chatManager.addMessageListener(function (raw) {
      var p = extractPayload(raw);
      if (p && (p.type === 1006 || raw.contentType === 1006)) return;
      var m = normalizeMsg(raw);
      var match = false;
      if (state.channelType === 1) match = String(m.uid) === String(state.channel) || String(raw.channelID || raw.channel_id || '') === String(state.channel);
      else match = String(raw.channelID || raw.channel_id || raw.channel_id_str || '') === String(state.channel) || String(raw.channelId || '') === String(state.channel);
      if (!match) return;
      mergeMessages([m]);
      if (m.uid) fetchProfile(m.uid).then(function () { renderMessages(isAtBottom() ? 'bottom' : 'keep'); });
      else renderMessages(isAtBottom() ? 'bottom' : 'keep');
    });
    wk.WKSDK.shared().connectManager.addConnectStatusListener(function (status) {
      state.connected = status === 1;
      var el = byId('nbb-wk-status');
      if (el) el.textContent = state.connected ? '已连接' : '连接中';
      if (state.connected && state.channel && state.lastSeq) loadHistory(false);
    });
  }

  function initWukong() {
    return request(API + '/config').then(function (cfg) { SDK_URL = cfg.sdk || SDK_URL; return loadScript(SDK_URL); }).then(function () {
      return request(API + '/token');
    }).then(function (res) {
      state.token = res;
      state.me = res.user || { uid: res.uid, username: res.username };
      state.profiles[String(res.uid)] = state.me;
      var wk = window.wk;
      wk.WKSDK.shared().config.uid = String(res.uid);
      wk.WKSDK.shared().config.token = String(res.token);
      wk.WKSDK.shared().config.addr = String(res.wsAddr || res.addr || res.wkws);
      bindWukongListeners();
      wk.WKSDK.shared().connectManager.connect();
      state.sdkReady = true;
    });
  }

  function autoOpenFromRoot() {
    var uid = state.root.getAttribute('data-target-uid') || new URLSearchParams(location.search).get('uid') || '';
    var tid = state.root.getAttribute('data-tid') || new URLSearchParams(location.search).get('tid') || '';
    var channelId = state.root.getAttribute('data-channel-id') || new URLSearchParams(location.search).get('channel_id') || '';
    var channelType = Number(state.root.getAttribute('data-channel-type') || new URLSearchParams(location.search).get('channel_type') || 0);
    if (tid) return openTopic(tid, new URLSearchParams(location.search).get('cid') || '');
    if (channelId) return openChannel(channelId, channelType || (channelId.indexOf('nbb_topic_') === 0 ? 2 : 1), channelId);
    if (uid) return openPeer(uid);
  }

  function boot() {
    state.root = byId('nbb-wukong-root');
    if (!state.root || state.root.__wkBooted) return;
    state.root.__wkBooted = true;
    document.body.classList.add('nbb-wk-on');
    initWukong().then(function () {
      renderShell();
      syncConversations().then(autoOpenFromRoot);
    }).catch(function (err) {
      console.error(err);
      state.root.innerHTML = '<div class="nbb-wk-loading">悟空聊天加载失败：' + esc(err.message || err) + '</div>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  if (window.$) $(window).on('action:ajaxify.end', function () { setTimeout(boot, 50); });
})();
