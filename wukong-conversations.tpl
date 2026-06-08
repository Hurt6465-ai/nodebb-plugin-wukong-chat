<link rel="preload" as="script" href="/plugins/nodebb-plugin-wukong-chat/static/wukong-conversations.js?v=17room">
<link rel="stylesheet" href="/plugins/nodebb-plugin-wukong-chat/static/wukong-conversations.css?v=17room">

<div id="nodebb-wukong-conversations-root" class="wkconv-root" data-wkconv-root="1">
  <div class="wkconv-loading">正在加载悟空会话...</div>
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

    // 聊天室实际对应 NodeBB 板块 7 的帖子
    createTopicCid: 7,
    roomCategoryCid: 7,
    roomSourceCid: 7,
    openTopicPage: true,

    // 右下角笔按钮发布接口
    composeApi: "/api/wukong/topics/create",

    // 聊天室卡片背景图
    roomBgBase: "/plugins/nodebb-plugin-wukong-chat/static/images/rooms",
    roomBgCount: 20,

    // 标题翻译
    translateSourceLang: "auto",
    translateTargetLang: "zh-CN"
  });
})();
</script>

<script charset="utf-8" src="/plugins/nodebb-plugin-wukong-chat/static/wukong-conversations.js?v=17room"></script>
