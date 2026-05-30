"use strict";

/*
 * Redirects NodeBB's native chat / "messages" entry points to the Wukong
 * independent chat:
 *   - header chat icon / dropdown / "/chats" links  -> /wukong/conversations
 *   - a user profile "Chat" button                  -> /wukong/{uid}
 *
 * Loaded globally on every page (see plugin.json "scripts").
 */
(function () {
  if (window.__wkNavRedirectBooted) return;
  window.__wkNavRedirectBooted = true;

  var CONV_ROUTE = "/wukong/conversations";

  function relPath() {
    return (window.config && window.config.relative_path) || "";
  }

  function withRel(path) {
    path = String(path || "");
    if (/^https?:\/\//i.test(path)) return path;
    if (path.charAt(0) !== "/") path = "/" + path;
    return relPath() + path;
  }

  function go(path) {
    window.location.href = withRel(path);
  }

  // Pull the target user id for a profile "chat with user" action.
  function chatTargetUid(el) {
    var node = el;
    while (node && node.getAttribute) {
      var uid = node.getAttribute("data-uid") || node.getAttribute("data-touid") || node.getAttribute("data-to-uid");
      if (uid && /^\d+$/.test(String(uid))) return String(uid);
      node = node.parentElement;
    }
    try {
      var d = (window.ajaxify && ajaxify.data) || {};
      var fromData = d.uid || d.theirid || d.toUid || (d.userData && d.userData.uid);
      if (fromData && /^\d+$/.test(String(fromData))) return String(fromData);
    } catch (_) {}
    return "";
  }

  // True when an anchor points at NodeBB's native chat list.
  function isNativeChatHref(href) {
    if (!href) return false;
    var path = href;
    try { path = new URL(href, window.location.origin).pathname; } catch (_) {}
    var rel = relPath();
    if (rel && path.indexOf(rel) === 0) path = path.slice(rel.length) || "/";
    return /^\/chats(?:\/|$)/.test(path) || /^\/user\/[^/]+\/chats(?:\/|$)/.test(path);
  }

  var CHAT_TRIGGER_SELECTOR = [
    '[component="account/chat"]',
    '[component="chat/dropdown"]',
    '[component="chat/icon"]',
    '[component="chats/dropdown"]',
    '[data-action="chat"]'
  ].join(",");

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

    var trigger = e.target.closest ? e.target.closest(CHAT_TRIGGER_SELECTOR) : null;
    if (trigger) {
      var uid = chatTargetUid(trigger);
      e.preventDefault();
      e.stopPropagation();
      go(uid ? "/wukong/" + encodeURIComponent(uid) : CONV_ROUTE);
      return;
    }

    var link = e.target.closest ? e.target.closest("a[href]") : null;
    if (link && isNativeChatHref(link.getAttribute("href"))) {
      e.preventDefault();
      e.stopPropagation();
      go(CONV_ROUTE);
    }
  }, true);

  // Rewrite native chat links so hover/middle-click also resolve correctly.
  function rewriteChatLinks() {
    var links = document.querySelectorAll('a[href*="/chats"]');
    for (var i = 0; i < links.length; i++) {
      if (isNativeChatHref(links[i].getAttribute("href"))) {
        links[i].setAttribute("href", withRel(CONV_ROUTE));
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", rewriteChatLinks, { once: true });
  } else {
    rewriteChatLinks();
  }
  if (window.$ && typeof $(window).on === "function") {
    $(window).on("action:ajaxify.end", rewriteChatLinks);
  }
})();
