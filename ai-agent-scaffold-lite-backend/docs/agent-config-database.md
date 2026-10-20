# Agent 配置数据库化

Agent 配置不再从 `resources/agent/*.yml` 加载。应用启动时读取 `ai_agent_app_config` 中启用的配置，再交给 armory 装配。数据库没有配置时应用仍可启动，管理接口可用于创建第一条配置。

## 初始化

1. 在 `application-<profile>.yml` 中配置数据库连接。
2. 在目标数据库执行 `ai-agent-scaffold-lite-app/src/main/resources/mybatis/sql/ai_agent_config.sql` 创建表。
3. AES-GCM 加密主钥直接配置在 `application.yml` 的 `agent.config.encryption-key` 中；该值已生成并写入。通过管理接口保存时，模型 API key 和 MCP 配置会使用 AES-GCM 加密后写入数据库。更换加密主钥会导致已有加密配置无法解密。
4. 数据库初始为空时，可通过管理接口或前端保存 Agent 配置；保存成功后会立即装配并缓存运行时 Agent。

## 管理接口

所有接口使用现有 `Response<T>` 响应结构。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/agent-configs` | 查询所有配置（包括停用配置） |
| GET | `/api/v1/agent-configs/{agentId}` | 查询配置详情 |
| POST | `/api/v1/agent-configs` | 新增配置并立即装配 |
| PUT | `/api/v1/agent-configs/{agentId}` | 修改配置并立即重新装配 |
| DELETE | `/api/v1/agent-configs/{agentId}` | 删除配置并移除运行时注册 |

请求体沿用 `AiAgentConfigTableVO` 的 JSON 形状：顶层包含 `appName`、`agent`、`module`；`module` 包含 `aiApi`、`chatModel`、`agents`、`agentWorkflows`、`runner`。`chatModel` 中的 MCP、skills 列表分别以 `toolMcpList`、`toolSkillsList` 传入。workflow 的 `subAgents` 顺序就是子 Agent 的装配顺序；子节点必须已经在普通 Agent 或前序 workflow 中定义。

详情响应不会包含密钥值，只包含 `module.aiApi.apiKeyConfigured`。更新请求省略或留空 `apiKey` 时保留数据库中已有的密钥；新增时必须提交密钥。`enabled` 默认为 `true`；将其设为 `false` 会停用并从运行时移除 Agent。

## 数据结构

- `ai_agent_app_config`：应用和 Agent 基本信息。
- `ai_agent_model_config`：API、模型、Runner 配置。
- `ai_agent_node_config`：普通 Agent 与 workflow 节点，保留声明顺序。
- `ai_agent_tool_config`：MCP 与 skills 工具配置。

删除应用配置时，关联配置由外键级联删除。
