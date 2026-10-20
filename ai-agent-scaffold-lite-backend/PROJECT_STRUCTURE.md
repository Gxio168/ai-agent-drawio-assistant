# 项目结构与开发约定

本项目使用 Java 17、Spring Boot 和 Maven 多模块，按 DDD 思路组织。新增或修改功能时，先按职责放入对应模块，并保持依赖方向清晰。

## 模块职责

| 模块 | 职责 | 当前内容 |
| --- | --- | --- |
| `ai-agent-scaffold-lite-api` | 对外服务契约、请求/响应 DTO 和统一响应结构。 | Agent 查询、会话创建、对话及流式对话接口。 |
| `ai-agent-scaffold-lite-trigger` | 接入 HTTP 等外部请求，将协议数据转换后调用领域服务。 | REST Controller、接口异常到响应的处理。 |
| `ai-agent-scaffold-lite-app` | Spring Boot 启动入口与应用组装。 | 启动类、配置、Agent 启动装配、环境配置和资源文件；也是可执行部署模块。 |
| `ai-agent-scaffold-lite-domain` | 核心业务模型与规则，不承载 HTTP 协议。 | Agent 配置、对话/会话、Agent 装配流程，以及模型、工作流、MCP 和 Skills 构建。 |
| `ai-agent-scaffold-lite-infrastructure` | 实现领域定义的仓储接口，并封装数据库、缓存及外部系统访问。 | MyBatis 会话服务持久化 ADK Session 与事件；DAO、Repository、Gateway 目录供其他适配实现使用。 |
| `ai-agent-scaffold-lite-types` | 跨模块共享的基础类型。 | 常量、响应码和应用异常。 |

根目录 `pom.xml` 管理模块、Java 版本及依赖版本。`docs/` 存放运维部署资料、提示词和其他项目文档；`data/` 用于运行数据和日志。各模块的 `src/main/resources/` 存放应用配置、Agent 配置及运行资源，`src/test/` 存放测试代码和测试资源。

## 开发约定

1. **按职责放置代码：** API 契约放 `api`；接入与协议转换放 `trigger`；业务规则和领域模型放 `domain`；持久化、缓存及外部系统实现放 `infrastructure`；启动、依赖注入和环境配置放 `app`；通用错误码、异常和常量放 `types`。
2. **保持依赖边界：** `trigger` 调用 `domain`，`infrastructure` 实现 `domain` 定义的端口，`app` 负责装配模块。领域规则不要依赖 Controller、数据库实现或具体传输协议；跨模块调用优先依赖接口和 DTO。
3. **扩展领域能力时：** 将业务输入整理为领域命令/模型，由领域服务处理；外部资源访问通过领域端口抽象，并在基础设施层实现。不要把业务流程写进 Controller 或启动配置。
4. **遵循现有命名和目录：** Java 包名使用 `cn.bugstack.ai` 下与模块、领域相对应的路径；接口以 `I` 开头，DTO、Entity、VO 按用途命名。新增配置按环境放入 `application-*.yml` 或对应资源目录。
5. **新增功能时同步维护：** 在适当模块补充测试，并在行为或模块职责变化时更新本文档及相关 `docs/` 说明。
