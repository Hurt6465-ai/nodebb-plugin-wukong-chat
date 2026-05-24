<link rel="preload" as="script" href="/plugins/nodebb-plugin-wukong-chat/static/wukong-conversations.js?v=5">
<link rel="stylesheet" href="/plugins/nodebb-plugin-wukong-chat/static/wukong-conversations.css?v=5">

<div id="nodebb-wukong-conversations-root" class="wkconv-root" data-wkconv-root="1">
  <div class="wkconv-loading">正在加载消息...</div>
</div>

<script>
(function () {
  var meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
  }
  meta.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';

  window.NBBWukongConversations = window.NBBWukongConversations || {};
  window.NBBWukongConversations.config = Object.assign({}, window.NBBWukongConversations.config || {}, {
    apiBase: "/api/wukong",
    chatBase: "/wukong",
    topicBase: "/topic",
    wkSdkUrl: "/plugins/nodebb-plugin-wukong-chat/static/vendor/wukongimjssdk.umd.js?v=1",
    i18nBase: "/plugins/nodebb-plugin-wukong-chat/static/i18n",
    maxConversations: 500,
    openTopicPage: true
  });
})();
</script>
<script charset="utf-8" src="/plugins/nodebb-plugin-wukong-chat/static/wukong-conversations.js?v=5"></script>
