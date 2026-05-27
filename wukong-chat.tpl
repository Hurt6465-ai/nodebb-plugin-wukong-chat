<div id="nbb-wukong-root"
     data-target-uid="{targetUid}"
     data-channel-id="{channelId}"
     data-channel-type="{channelType}"
     data-tid="{tid}"
     data-title="{title}">
  <div class="nbb-wk-loading">正在加载悟空聊天...</div>
</div>

<script>
(function () {
  window.CPHarmonyCallConfig = Object.assign({}, window.CPHarmonyCallConfig || {}, {
    enabled: true,
    showButton: true,
    enableVideo: true,
    tokenPath: "/api/wukong/token",
    tokenFallbackPath: "/bridge/token",
    wkWsPath: "/wkws/",
    wkSdkUrl: "/plugins/nodebb-plugin-wukong-chat/static/vendor/wukongimjssdk.umd.js?v=28",
    peerjsUrl: "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js",
    autoConnectWukong: true
  });
})();
</script>
<script charset="utf-8" src="/plugins/nodebb-plugin-wukong-chat/static/cp-harmony-call.js?v=48"></script>
