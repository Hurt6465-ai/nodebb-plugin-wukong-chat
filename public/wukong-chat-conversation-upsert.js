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

  function upsert(text, incoming, extra) {
    extra = extra || {};
    var ch = channelInfo();
    if (!ch.channelId) return;
    text = previewFromText(text);
    if (!text) return;

    var selfUid = getSelfUid();
    var isSelf = extra.is_self !== undefined ? !!extra.is_self : !incoming;
    var eventId = String(extra.event_id || extra.eventId || "");
    if (!eventId) {
      eventId = "local:" + ch.channelType + ":" + ch.channelId + ":" + (isSelf ? "self" : "peer") + ":" + Date.now() + ":" + text.slice(0, 40);
    }

    fetch(apiBase() + "/conversations/upsert", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        channel_id: extra.channel_id || ch.channelId,
        channel_type: extra.channel_type || ch.channelType,
        ts: extra.ts || Date.now(),
        text: text,
        incoming: !!incoming && !isSelf,
        is_self: isSelf,
        event_id: eventId,
        last_from_uid: extra.last_from_uid || (isSelf ? selfUid : ""),
        last_from_name: extra.last_from_name || (isSelf ? "我" : "")
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


  function digestFromMsgContent(content) {
    try {
      if (!content) return "";
      if (typeof content === "string") return previewFromText(content);
      if (content.conversationDigest) return previewFromText(content.conversationDigest);
      if (content._conversationDigest) return previewFromText(content._conversationDigest);
      if (content.text) return previewFromText(content.text);
      if (content.content) return previewFromText(content.content);
      var type = String(content.type || content.contentType || content.content_type || "").toLowerCase();
      var url = String(content.url || content.remoteUrl || content.path || "");
      if (type.indexOf("image") !== -1 || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)) return "[图片]";
      if (type.indexOf("video") !== -1 || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return "[视频]";
      if (type.indexOf("voice") !== -1 || type.indexOf("audio") !== -1 || /\.(mp3|wav|ogg|aac|m4a)(\?|$)/i.test(url)) return "[语音]";
    } catch (_) {}
    return "";
  }

  function getSelfUid() {
    return String(
      (window.app && app.user && app.user.uid) ||
      (window.ajaxify && ajaxify.data && ajaxify.data.loggedInUser && ajaxify.data.loggedInUser.uid) ||
      ""
    ).trim();
  }

  function installSdkSendHook() {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      try {
        var sdk = window.wk && window.wk.WKSDK && window.wk.WKSDK.shared && window.wk.WKSDK.shared();
        var cm = sdk && sdk.chatManager;
        if (!cm || typeof cm.send !== "function") {
          if (tries > 80) clearInterval(timer);
          return;
        }
        if (cm.__nbbConvUpsertWrapped) {
          clearInterval(timer);
          return;
        }
        var rawSend = cm.send;
        cm.send = function (content, channel) {
          var ret = rawSend.apply(this, arguments);
          try {
            var text = digestFromMsgContent(content);
            var ch = channelInfo();
            if (channel && channel.channelID) ch.channelId = String(channel.channelID || ch.channelId || "");
            if (channel && channel.channelType) ch.channelType = Number(channel.channelType || ch.channelType || 1);
            if (text && ch.channelId) {
              fetch(apiBase() + "/conversations/upsert", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({
                  channel_id: ch.channelId,
                  channel_type: ch.channelType,
                  ts: Date.now(),
                  text: text,
                  incoming: false,
                  is_self: true,
                  event_id: String((ret && (ret.messageID || ret.messageId || ret.clientMsgNo || ret.clientSeq)) || ("sdk:" + ch.channelType + ":" + ch.channelId + ":" + Date.now() + ":" + text.slice(0, 40))),
                  last_from_uid: getSelfUid(),
                  last_from_name: "我"
                })
              }).catch(function () {});
            }
          } catch (_) {}
          return ret;
        };
        cm.__nbbConvUpsertWrapped = true;
        clearInterval(timer);
      } catch (_) {
        if (tries > 80) clearInterval(timer);
      }
    }, 250);
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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { installDomObserver(); installSdkSendHook(); }, { once: true });
  else { installDomObserver(); installSdkSendHook(); }
})();
