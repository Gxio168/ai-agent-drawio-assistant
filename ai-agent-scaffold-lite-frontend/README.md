# AI 流程图助手（ai-agent-scaffold-lite-frontend）

React 19 + TypeScript + Vite 前端，对接 `ai-agent-scaffold-lite` 后端（`http://localhost:8091`），
左侧会话 / 中间 draw.io 画布 / 右侧智能体对话。

## 快速开始

```bash
pnpm install
pnpm dev
```

1. 先启动后端 `ai-agent-scaffold-lite`（默认 8091 端口）。
2. 打开前端页面，用演示账号 **admin / admin** 登录（mock 登录，登录后固定 `userId = 1`）。
3. 选中左侧智能体 → 在右侧描述你想要的流程 → 智能体回复后图形会自动载入中间画布。

左侧“智能体”标题旁的“管理”按钮会打开独立的全屏配置工作台，不会占用画布或聊天面板空间。工作台支持拖入 Agent 与串行、并行、循环节点，通过拖线编排拓扑，并可调整串行节点顺序和 Runner 入口；保存会调用后端管理接口并触发装配，删除会清理后端运行时注册。

## 反向代理

前端所有请求都发往同源相对路径 `/api/v1/**`，由 Vite dev server 反向代理到后端，
因此浏览器端不产生跨域请求（见 [`vite.config.ts`](vite.config.ts)）：

| 前端请求 | 实际转发 |
| --- | --- |
| `/api/v1/query_ai_agent_config_list` | `http://localhost:8091/api/v1/query_ai_agent_config_list` |
| `/api/v1/agent-configs/**` | `http://localhost:8091/api/v1/agent-configs/**` |
| `/api/v1/create_session` | `http://localhost:8091/api/v1/create_session` |
| `/api/v1/chat` | `http://localhost:8091/api/v1/chat` |

- 修改后端地址：设置环境变量 `VITE_API_PROXY_TARGET`（构建期读取）。
- 需要直连后端（不走代理）时，在项目根目录建 `.env.local`：

  ```dotenv
  VITE_API_BASE_URL=http://localhost:8091/api/v1
  ```

## 已对接的后端接口

对应 `cn.bugstack.ai.trigger.http.AgentServiceController`：

| 接口 | 方法 | 请求 | 响应 | 前端调用位置 |
| --- | --- | --- | --- | --- |
| `/api/v1/query_ai_agent_config_list` | GET | — | `Response<AiAgentConfigResponseDTO[]>` | [`agent-api.ts`](src/api/agent-api.ts) |
| `/api/v1/create_session` | POST | `CreateSessionRequestDTO` | `Response<CreateSessionResponseDTO>` | [`chat-api.ts`](src/api/chat-api.ts) |
| `/api/v1/chat` | POST | `ChatRequestDTO` | `Response<ChatResponseDTO>` | [`chat-api.ts`](src/api/chat-api.ts) |
| `/api/v1/chat_stream` | POST | `ChatRequestDTO` | HTTP 流式响应：逐个写入 ADK `Event.stringifyContent()` JSON 对象 | [`chat-api.ts`](src/api/chat-api.ts) |

Agent 管理页另行对接 `AgentConfigController` 的 `GET/POST /api/v1/agent-configs`、
`GET/PUT/DELETE /api/v1/agent-configs/{agentId}`，调用封装在 [`agent-api.ts`](src/api/agent-api.ts)。

除流式接口外，普通 API 使用统一响应包装 `Response<T>` = `{ code, info, data }`，成功码为 `0000`；
`src/api/http.ts` 负责超时、拆包与错误归一化（失败抛 `ApiError`）。

当前对话主链路使用 `/api/v1/chat_stream`：后端通过 `ResponseBodyEmitter` 发送
`Event.stringifyContent()` 生成的 JSON 事件，并在事件流完成时结束 HTTP 响应；前端通过
Fetch `ReadableStream` 逐段读取响应、解析连续的 JSON 对象并更新聊天消息。此接口不是
SSE 格式（没有 `data:` 等事件封装）。`/api/v1/chat` 仍保留为一次性返回接口。

### 关于 `/chat` 的 `ChatResponseDTO.content`

后端返回的是 ADK `Event.stringifyContent()` 结果按 `\n` 拼接的字符串，例如：

```text
{"role":"model","parts":[{"text":"好的，这是流程图："}]}
{"role":"model","parts":[{"text":"<mxGraphModel>...</mxGraphModel>"}]}
```

[`src/utils/agent-content.ts`](src/utils/agent-content.ts) 的 `parseAgentContent()` 负责把它还原为可读文本，
[`src/utils/drawio.ts`](src/utils/drawio.ts) 的 `extractDrawioXml()` 再从文本里嗅探 draw.io 图形并注入画布。

图形提取采用「定位 → 切片 → 修复 → 校验」四步，而不是单个正则，因此能覆盖这些真实情况：

| 情况 | 处理方式 |
| --- | --- |
| ` ```xml ` 代码块正常闭合 | 直接取块内容 |
| ` ```xml ` **代码块未闭合**（模型输出被 maxTokens 截断，实际遇到过） | 把围栏之后的内容当作块内容 |
| 没有代码块，正文里裸的 `<mxGraphModel>` / `<mxfile>` | 直接从正文切片 |
| XML 被 HTML 转义成 `&lt;mxGraphModel&gt;` | 先反转义再切片 |
| XML 尾部截断（`mxCell` 没闭合） | 丢弃半截元素，补齐 `root` / `mxGraphModel` 结构标签 |
| 回复末尾停在标签中间（`<mxCell id="n2" value="输入`） | 舍弃这一小段，保留之前所有完整节点 |

## 登录态

后端暂未提供登录接口，前端采用 mock 登录：

- 账号密码固定为 **admin / admin**（见 [`src/config/auth-config.ts`](src/config/auth-config.ts)）。
- 通过后写入 `localStorage`（键 `ai-agent:auth`），刷新页面保持登录，无需重新登录。
- 退出登录只清理本应用自己的存储键。

## 目录结构

```text
src/
├─ api/                 # 接口对接层
│  ├─ http.ts           #   fetch 封装：超时 / Response<T> 拆包 / ApiError
│  ├─ agent-api.ts      #   智能体配置列表
│  ├─ chat-api.ts       #   创建会话 + 对话
│  └─ index.ts
├─ config/              # 配置集中管理
│  ├─ api-config.ts     #   接口基地址、路径表、成功码、超时
│  ├─ auth-config.ts    #   mock 登录凭证与登录态读写
│  └─ storage-config.ts #   localStorage 键名
├─ models/              # 类型定义（原 types 包，改名避免与 api 包语义混淆）
│  ├─ api.ts            #   后端契约类型（DTO / Response<T>）
│  └─ index.ts          #   前端视图模型（User / Message / Conversation）
├─ utils/               # 工具
│  ├─ agent-content.ts  #   ADK Event 文本解析
│  ├─ drawio.ts         #   draw.io XML 嗅探 + 会话标题生成
│  ├─ storage.ts        #   localStorage 安全读写 + 超配额自动裁剪
│  ├─ time.ts           #   时间格式化
│  └─ id.ts
├─ hooks/
│  ├─ use-auth.ts       #   登录态（localStorage 持久化）
│  ├─ use-agents.ts     #   拉取智能体列表
│  └─ use-workspace.ts  #   会话 / 消息 / 画布编排
├─ pages/
│  ├─ LoginPage.tsx     #   登录页
│  └─ Workspace.tsx     #   工作台
├─ components/
│  ├─ sidebar/          #   Sidebar / AgentPanel / ConversationList
│  ├─ canvas/           #   CanvasArea（draw.io iframe）
│  └─ chat/             #   ChatPanel
├─ styles/app.css
├─ App.tsx
└─ main.tsx
```

## 设计说明

- **会话与后端 session 的映射**：后端没有会话列表接口，因此会话元数据存在 `localStorage`
  （键 `ai-agent:conversations`），每条记录持有后端返回的 `sessionId` 与本地对话记录；
  发送消息时复用该 `sessionId`，会话不存在时先调用 `create_session`。
- **对话记录持久化**：每条消息（含解析出的 `diagramXml`）都写回所属会话，刷新页面、切换会话
  都能恢复气泡。超过 localStorage 软上限（约 2M 字符）时会自动裁剪最旧的消息，
  优先保住会话列表与画布图形（见 `writeStorageWithTrim`）。
- **画布载入策略**：`CanvasArea` 在 draw.io iframe 发出 `load` 事件（编辑器就绪）后，
  把最新的 AI 图形通过 `load` action 灌入画布；手动改动不会被覆盖，只有新的图形到来时才替换。
  每个会话会把最近一次图形一起持久化，切回该会话时自动还原。
  若某条回复里有图形但没自动载入，气泡右下角会出现 **载入画布** 按钮，可手动重新注入。
- **气泡操作**：每条消息（无论用户还是 AI）都带 **复制** 按钮；新消息到来或生成状态变化时，
  会话区会自动滚动到底部。

## 校验

```bash
pnpm build   # tsc -b && vite build（类型检查 + 产物构建）
pnpm lint    # oxlint
```

当前 `tsc -b` 与 `oxlint` 均为 **0 error / 0 warning**。

## 脚本

```bash
pnpm dev      # 开发（含 /api 反向代理）
pnpm build    # tsc -b && vite build
pnpm lint     # oxlint
pnpm preview
```
