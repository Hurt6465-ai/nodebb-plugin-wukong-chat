/* Update Wukong conversation list when the independent chat page sends a message.
 * This fixes "my sent message does not appear in the conversation list" when the
 * conversation-list page is not open.
 */
(function () {
  "use strict";

  if (window.__NBB_WUKONG_CHAT_UPSERT_INJECTED__) return;
  window.__NBB_WUKONG_CHAT_UPSERT_INJECTED__ = true;

  function cfg() {
    return (window.CPChatHarmony && window.CPChatHarmony.config) || window.__NBB_WUKONG_PAGE__ || {};
  }

  function apiBase() {
    return ((window.CPChatHarmony && window.CPChatHarmony.config && window.CPChatHarmony.config.apiBase) || "/api/wukong").replace(/\/+$/, "");
  }

  function channelInfo() {
    var c = cfg();
    var q = new URLSearchParams(location.search || "");
    var m = location.pathname.match(/\/wukong\/(\d+)/i);
    var targetUid = String(c.targetUid || (m && m[1]) || q.get("uid") || "").trim();
    var tid = String(c.tid || q.get("tid") || "").trim();
    var channelId = String(c.channelId || c.channel_id || q.get("channel_id") || (tid ? ("nbb_topic_" + tid) : targetUid)).trim();
    var channelType = Number(c.channelType || c.channel_type || q.get("channel_type") || (tid ? 2 : 1)) || 1;
    return { targetUid: targetUid, tid: tid, channelId: channelId, channelType: channelType };
  }

  function previewFromText(text) {
    text = String(text || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    if (/!\[[^\]]*\]\([^)]+\)/.test(text)) return "[图片]";
    if (/\[(?:视频|video)\]/i.test(text)) return "[视频]";
    if (/\[(?:语音消息|voice|audio)\]/i.test(text)) return "[语音]";
    return text.slice(0, 180);
  }

  function upsert(text, incoming) {
    var ch = channelInfo();
    if (!ch.channelId) return;
    text = previewFromText(text);
    if (!text) return;

    fetch(apiBase() + "/conversations/upsert", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        channel_id: ch.channelId,
        channel_type: ch.channelType,
        ts: Date.now(),
        text: text,
        incoming: !!incoming
      })
    }).catch(function () {});
  }

  function elementText(el) {
    if (!el) return "";
    var media = el.querySelector && el.querySelector("img,video,audio");
    if (media) {
      if (media.tagName === "IMG") return "[图片]";
      if (media.tagName === "VIDEO") return "[视频]";
      if (media.tagName === "AUDIO") return "[语音]";
    }
    return String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function looksMine(el) {
    if (!el || !el.classList) return false;
    var s = String(el.className || "");
    if (/\b(mine|self|me|right|out|outgoing|sent)\b/i.test(s)) return true;
    var p = el.closest && el.closest('[class*="mine"],[class*="self"],[class*="right"],[class*="outgoing"],[class*="sent"]');
    return !!p;
  }

  function installDomObserver() {
    var root = document.getElementById("nodebb-wukong-root") || document.body;
    if (!root || !window.MutationObserver) return;

    var seen = new WeakSet();
    var obs = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes || [], function (node) {
          if (!node || node.nodeType !== 1 || seen.has(node)) return;
          seen.add(node);

          var candidates = [];
          if (looksMine(node)) candidates.push(node);
          if (node.querySelectorAll) {
            Array.prototype.forEach.call(node.querySelectorAll('[class*="mine"],[class*="self"],[class*="right"],[class*="outgoing"],[class*="sent"]'), function (el) {
              candidates.push(el);
            });
          }

          candidates.slice(0, 4).forEach(function (el) {
            var text = elementText(el);
            if (text) upsert(text, false);
          });
        });
      });
    });

    obs.observe(root, { childList: true, subtree: true });
  }

  // Expose a direct call for the main chat script if it wants to use it later.
  window.NBBWukongConversationUpsert = upsert;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installDomObserver, { once: true });
  else installDomObserver();
})();
