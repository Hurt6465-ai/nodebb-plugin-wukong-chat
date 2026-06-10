# nodebb-plugin-wukong-chat v0.2

独立 NodeBB 悟空聊天页插件。这个版本把你原来的外部 bridge 参数内置到 NodeBB 插件后端，不再依赖注入 NodeBB 原生聊天 DOM。



## 安装

```bash
docker update --restart=no nodebb

if docker exec nodebb sh -lc '
set -e
cd /usr/src/app

if [ -f /opt/config/config.json ]; then
  CFG=/opt/config/config.json
elif [ -f /usr/src/app/config.json ]; then
  CFG=/usr/src/app/config.json
else
  echo "找不到 NodeBB config.json，停止执行，避免启动 web installer。"
  exit 1
fi

echo "使用配置文件: $CFG"

npm uninstall nodebb-plugin-wukong-chat || true
npm cache clean --force

npm install --legacy-peer-deps --force https://github.com/Hurt6465-ai/nodebb-plugin-wukong-chat/archive/refs/heads/main.tar.gz

./nodebb build --config="$CFG"
'; then
  docker restart nodebb
  docker update --restart=always nodebb
  docker logs --tail 120 -f nodebb
else
  echo "插件安装或 NodeBB build 失败，未重启 nodebb。"
  docker update --restart=always nodebb
fi
```

也可以在后台插件页启用。

## 访问

```txt
/wukong              会话首页
/wukong/123          和 NodeBB UID=123 单聊
/wukong?uid=123      和 NodeBB UID=123 单聊
/wukong?tid=456      主题聊天室，频道 nbb_topic_456，channel_type=2
```

## 已包含

- `/wukong` 独立移动端优先聊天页
- `/api/wukong/token` 基于 `sha256(wk:{uid}:{secret})` 签发 token 并同步到 WuKongIM
- `/api/wukong/history` 代理 WuKongIM `/channel/messagesync`
- `/api/wukong/conversation/sync` 代理 WuKongIM 会话同步
- `/api/wukong/user/:uid` 和 `/api/wukong/users` 读取 NodeBB 用户资料并同步 WuKongIM 用户
- `/api/wukong/topic-channel/ensure` 创建/加入 `nbb_topic_{tid}` 群频道
- 文本、图片、视频、语音消息
- Google 翻译代理 `/api/wukong/translate/google`
- AI 代理 `/api/wukong/ai/chat`，需要设置 `AI_PROXY_ENDPOINT` 和 `AI_PROXY_API_KEY`

## 说明

这版没有复制唐僧叨叨 React/TS 文件，而是把你原来的注入式聊天逻辑改成 NodeBB 插件独立页。唐僧叨叨可以后续再作为 UI 参考，但不建议直接塞进 NodeBB 插件。

如果 `/wukong` 能打开但连接失败，先检查：
