# ST-Preset-Separation

> SillyTavern 第三方扩展插件 —— 彻底解耦 API 预设与对话补全预设

## ✨ 功能

在 SillyTavern 中，对话补全预设（Chat Completion Preset）同时包含了 **对话参数**（temperature、top_p、prompts 等）和 **API 连接设置**（API Source、模型、代理地址等）。默认情况下，切换预设会同时改变这两类设置。

**Preset Separation** 插件可以在切换预设时 **自动保护当前的 API 连接不被改变**，只更新对话参数。

### 被保护的设置

- API Source（`chat_completion_source`）
- 所有模型选择（OpenAI / Claude / Google / OpenRouter / Mistral / DeepSeek / Groq 等）
- 反向代理地址（`reverse_proxy`）
- 自定义 URL（`custom_url`）
- 代理密码（`proxy_password`）
- OpenRouter providers / quantizations
- 以及其他所有 `is_connection: true` 的设置项

### 效果预览

切换预设时，会弹出带有动画对勾的通知，展示被保护的 API 信息：

```
✓ API 连接已保护
  openrouter · deepseek/deepseek-chat-v3-0324
```

## 📦 安装

### 方式一：通过 SillyTavern 安装

1. 打开 SillyTavern → 扩展面板 → 安装扩展
2. 输入仓库地址：
   ```
   https://github.com/Youzini-afk/ST-Preset-Separation.git
   ```
3. 点击安装，刷新页面即可

### 方式二：手动安装

```bash
cd SillyTavern/public/scripts/extensions/third-party/
git clone https://github.com/Youzini-afk/ST-Preset-Separation.git
```

刷新 SillyTavern 页面即可。

## 🚀 使用方法

1. 打开 SillyTavern 右侧面板 → 扩展设置
2. 找到 **Preset Separation** 区块
3. 勾选 **启用预设分离**
4. 正常切换对话补全预设 —— API 连接将不会改变

## ⚙️ 工作原理

```
用户切换预设
    ↓
OAI_PRESET_CHANGED_BEFORE 事件
    ↓
插件保存当前 API 连接设置快照
    ↓
SillyTavern 正常应用预设（包括 API 设置）
    ↓
OAI_PRESET_CHANGED_AFTER 事件
    ↓
插件从快照恢复 API 连接设置
    ↓
结果：仅对话参数更新，API 连接不变 ✓
```

## 📁 文件结构

```
ST-Preset-Separation/
├── manifest.json     # 扩展清单
├── index.js          # 核心逻辑
├── settings.html     # 设置面板模板
├── style.css         # 样式文件
└── README.md         # 说明文档
```
