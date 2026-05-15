# v0.2 改动

- 使用上传的后端 bridge 参数重写 NodeBB 插件后端。
- 不再使用 `/bridge/token`、`/bridge/get-history`，改为 `/api/wukong/token`、`/api/wukong/history`。
- 保留原注入式聊天的移动端全屏布局、消息解析、媒体发送、语音发送、翻译入口思路。
- 删除 NodeBB 原生聊天 DOM 监听/隐藏/原生发送按钮点击逻辑。
