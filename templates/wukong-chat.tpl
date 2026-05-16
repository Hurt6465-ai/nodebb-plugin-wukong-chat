<link rel="stylesheet" href="/plugins/nodebb-plugin-wukong-chat/static/wukong-chat.css?v=16">

<div id="nodebb-wukong-root" class="nbb-wk-root" data-wukong-root="1">
  <div class="nbb-wk-loading">正在加载悟空聊天...</div>
</div>

<script>
(function () {
  var m = location.pathname.match(/\/wukong\/(\d+)/);
  var q = new URLSearchParams(location.search);
  var targetUid = (m && m[1]) || q.get("uid") || "";
  var tid = q.get("tid") || "";
  var channelId = q.get("channel_id") || "";
  var channelType = q.get("channel_type") || (tid ? "2" : "1");

  var root = document.getElementById("nodebb-wukong-root");
  if (root) {
    root.setAttribute("data-target-uid", targetUid);
    root.setAttribute("data-tid", tid);
    root.setAttribute("data-channel-id", channelId);
    root.setAttribute("data-channel-type", channelType);
  }

  window.__NBB_WUKONG_PAGE__ = {
    targetUid: targetUid,
    tid: tid,
    channelId: channelId,
    channelType: channelType
  };
})();
</script>

<script charset="utf-8" src="/plugins/nodebb-plugin-wukong-chat/static/wukong-chat.js?v=16"></script>
