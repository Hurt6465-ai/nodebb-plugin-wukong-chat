<link rel="preload" as="script" href="/plugins/nodebb-plugin-wukong-chat/static/wukong-conversations.js?v=18safe2">
<link rel="stylesheet" href="/plugins/nodebb-plugin-wukong-chat/static/wukong-conversations.css?v=18safe2">

<div id="nodebb-wukong-conversations-root" class="wkconv-root" data-wkconv-root="1">
  <div class="wkconv-loading">正在加载消息...</div>
</div>

<script>
(function () {
  window.NBBWukongConversations = window.NBBWukongConversations || {};
  window.NBBWukongConversations.config = Object.assign({}, window.NBBWukongConversations.config || {}, {
    apiBase: "/api/wukong",
    chatBase: "/wukong",
    topicBase: "/topic",

    wkSdkUrl: "/plugins/nodebb-plugin-wukong-chat/static/vendor/wukongimjssdk.umd.js?v=1",
    i18nBase: "/plugins/nodebb-plugin-wukong-chat/static/i18n",

    syncIntervalConnected: 45000,
    syncIntervalFallback: 30000,
    maxConversations: 300,

    // 聊天室就是板块 7 的帖子
    createTopicCid: 7,
    roomCategoryCid: 7,
    roomSourceCid: 7,
    openTopicPage: true,

    composeApi: "/api/wukong/topics/create",

    roomBgBase: "/plugins/nodebb-plugin-wukong-chat/static/images/rooms",
    roomBgCount: 20,

    translateSourceLang: "auto",
    translateTargetLang: "zh-CN"
  });
})();
</script>

<script charset="utf-8" src="/plugins/nodebb-plugin-wukong-chat/static/wukong-conversations.js?v=18safe2"></script>
