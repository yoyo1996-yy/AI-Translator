# 阿里云 Function Compute ZIP 部署说明

这是 V0.3 第一阶段的首选部署包：Function Compute Web 函数、Custom Runtime、ZIP 代码包、HTTP Trigger。

当前不需要自定义域名、SSL 证书、ICP备案、容器镜像仓库、ECS、数据库、API 网关。`Dockerfile` 保留为备用方案，本阶段不用。

## 生成 ZIP

运行 `npm run package:fc` 后上传这个文件：

```text
deploy/aliyun-fc/ai-translator-fc-v04.zip
```

当前 ZIP 已按 Next.js standalone 形态打包，并包含自定义 Node.js 服务：

```text
/          -> AI 随身同传网页和 PWA 文件
/realtime  -> Browser 到阿里云百炼 Realtime 的 WebSocket Proxy
```

本地已验证打包目录可以用 `0.0.0.0:9000` 启动，并且 `/` 返回 HTTP 200。

## Function Compute 控制台选择

函数类型：

```text
Web 函数
```

运行环境：

```text
Custom Runtime
```

如果控制台还要求选择语言或模板，选择 `Node.js 20` / Node.js Web 应用模板。

部署方式：

```text
ZIP 代码包上传
```

监听端口：

```text
9000
```

启动命令：

```bash
npm run start:fc
```

如果控制台要求填写 bootstrap 或启动文件，ZIP 根目录也包含 `bootstrap`，它会执行同一个 `npm run start:fc`。

## 环境变量

必填：

```text
DASHSCOPE_API_KEY=<只填在 FC 环境变量中>
DASHSCOPE_WORKSPACE_ID=<只填在 FC 环境变量中>
DASHSCOPE_REGION=cn-beijing
```

建议填写：

```text
REALTIME_PROXY_PATH=/realtime
DEBUG_REALTIME=false
ENABLE_TRANSLATION_GLOSSARY=false
```

第一阶段可以先不填：

```text
NEXT_PUBLIC_REALTIME_PROXY_URL=
ALLOWED_ORIGINS=
```

不填 `NEXT_PUBLIC_REALTIME_PROXY_URL` 时，手机浏览器会自动使用当前 FC 公网 HTTPS 地址推导：

```text
wss://<FC 公网 Host>/realtime
```

等你拿到 FC 公网地址后，也可以再把它显式填成：

```text
NEXT_PUBLIC_REALTIME_PROXY_URL=wss://<FC 公网 Host>/realtime
ALLOWED_ORIGINS=https://<FC 公网 Host>
```

不要把真实 `DASHSCOPE_API_KEY` 写入代码包、前端代码、PWA 文件或文档。

## HTTP Trigger

创建 HTTP Trigger：

```text
认证方式：anonymous 或无需认证
请求方法：GET、POST、OPTIONS
公网访问：开启
HTTPS：使用 Function Compute 自动提供的公网 HTTPS 地址
WebSocket Upgrade：确认 HTTP Trigger 支持 WebSocket 请求
```

部署后，在函数详情页或触发器详情页找到 HTTP Trigger 的公网访问地址。

网页地址：

```text
https://<FC 公网地址>/
```

WebSocket 地址：

```text
wss://<FC 公网地址>/realtime
```

## 重新生成 ZIP

在项目根目录执行：

```powershell
npm run package:fc
```

输出：

```text
<project-root>\deploy\aliyun-fc\ai-translator-fc-v04.zip
```

## 官方文档

- Function Compute Web 函数：https://help.aliyun.com/zh/functioncompute/web-function-quick-start
- Custom Runtime：https://help.aliyun.com/zh/functioncompute/custom-runtime/
- HTTP Trigger WebSocket：https://help.aliyun.com/zh/functioncompute/configure-an-http-trigger-for-a-function-that-is-triggered-by-websocket-requests-1
- 自定义运行时监听端口要求：https://help.aliyun.com/zh/functioncompute/principles-1
- 环境变量：https://help.aliyun.com/zh/functioncompute/environment-variables
