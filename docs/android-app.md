# AI 随身同传 Android App

这个 Android App 使用 Capacitor 打包当前前端界面，前端资源内置在 App 中。

生产 Realtime 连接继续走云端服务。开源版本不内置任何个人 Gateway 地址，构建时需要提供你自己的 WSS 地址：

```text
wss://your-gateway.example.com/realtime
```

`DASHSCOPE_API_KEY`、`DASHSCOPE_WORKSPACE_ID`、`DASHSCOPE_REGION` 仍然只在阿里云 Function Compute 服务端环境变量中配置，不写入 Android App。

## 已完成

- Android 工程：`android`
- 静态前端包：`out`
- App 同步脚本：`npm run app:android:sync`
- Android 麦克风权限：`RECORD_AUDIO`
- Android 网络权限：`INTERNET`
- 竖屏启动：portrait

## 同步 Android 工程

同步 Android 工程前，先通过环境变量或参数提供 Gateway WSS 地址：

```powershell
$env:REALTIME_PROXY_URL = "wss://your-gateway.example.com/realtime"
npm run app:android:sync
```

也可以直接传参：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-android-app.ps1 -RealtimeProxyUrl "wss://your-gateway.example.com/realtime"
```

## 编译 APK

当前项目已经支持在 E 盘准备便携 Android 构建工具链：

```powershell
npm run app:android:apk
```

构建工具会放在：

```text
<project-root>\.android-tools
<project-root>\.gradle-home
```

也可以用 Android Studio 打开：

```text
<project-root>\android
```

也可以在命令行编译 debug APK：

```powershell
cd <project-root>\android
.\gradlew.bat assembleDebug
```

debug APK 通常生成在：

```text
<project-root>\android\app\build\outputs\apk\debug\app-debug.apk
```

## 真机测试

1. 手机安装 APK。
2. 打开 App。
3. 点击“开始同传”，允许麦克风权限。
4. 测试日语/英语到中文实时翻译。
5. 测试“按住说中文”到日语/英语翻译和语音播放。
6. 蓝牙耳机连接后，使用手机系统默认输入和输出。

## 当前限制

- Windows 环境可以准备 Android 工程；iOS 原生 App 需要 macOS、Xcode 和 Apple 开发者账号。
- App 仍然需要阿里云 Function Compute 云端 Realtime Proxy 正常运行。
- 不建议把 API Key 写进 App 或任何前端配置。
