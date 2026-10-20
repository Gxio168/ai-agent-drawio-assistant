-- Agent 应用配置。JSON 字段仅承载类型内部参数；应用、模型、节点、工具仍分表管理。
CREATE TABLE IF NOT EXISTS ai_agent_app_config (
    agent_id VARCHAR(64) NOT NULL,
    app_name VARCHAR(128) NOT NULL,
    agent_name VARCHAR(128) NOT NULL,
    agent_desc VARCHAR(512) DEFAULT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (agent_id),
    UNIQUE KEY uk_agent_app_name (app_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent 应用配置';

CREATE TABLE IF NOT EXISTS ai_agent_model_config (
    agent_id VARCHAR(64) NOT NULL,
    api_config_json LONGTEXT NOT NULL,
    chat_model_json LONGTEXT NOT NULL,
    runner_config_json LONGTEXT NOT NULL,
    PRIMARY KEY (agent_id),
    CONSTRAINT fk_agent_model_app FOREIGN KEY (agent_id) REFERENCES ai_agent_app_config(agent_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent API、模型及 Runner 配置';

CREATE TABLE IF NOT EXISTS ai_agent_node_config (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    agent_id VARCHAR(64) NOT NULL,
    node_type VARCHAR(16) NOT NULL COMMENT 'AGENT 或 WORKFLOW',
    node_name VARCHAR(128) NOT NULL,
    sort_order INT NOT NULL,
    config_json LONGTEXT NOT NULL COMMENT '节点配置；workflow 子节点及顺序保存在配置中',
    PRIMARY KEY (id),
    UNIQUE KEY uk_agent_node_name (agent_id, node_name),
    KEY idx_agent_node_order (agent_id, sort_order),
    CONSTRAINT fk_agent_node_app FOREIGN KEY (agent_id) REFERENCES ai_agent_app_config(agent_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent 节点和工作流定义';

CREATE TABLE IF NOT EXISTS ai_agent_tool_config (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    agent_id VARCHAR(64) NOT NULL,
    tool_type VARCHAR(16) NOT NULL COMMENT 'MCP 或 SKILL',
    sort_order INT NOT NULL,
    config_json LONGTEXT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_agent_tool_order (agent_id, tool_type, sort_order),
    KEY idx_agent_tool_order (agent_id, sort_order),
    CONSTRAINT fk_agent_tool_app FOREIGN KEY (agent_id) REFERENCES ai_agent_app_config(agent_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent 工具配置';
