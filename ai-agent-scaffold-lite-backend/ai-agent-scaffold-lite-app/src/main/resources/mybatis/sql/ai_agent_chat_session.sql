-- 新数据库初始化脚本：在 application-dev.yml 配置的 agent_chat 数据库中执行
CREATE TABLE IF NOT EXISTS ai_agent_chat_session (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    app_name VARCHAR(128) NOT NULL COMMENT 'Agent 应用名称',
    user_id VARCHAR(128) NOT NULL COMMENT '用户 ID',
    session_id VARCHAR(128) NOT NULL COMMENT 'ADK 会话 ID',
    session_state LONGTEXT NOT NULL COMMENT '不含事件的 Google ADK Session JSON，保存 state 等会话上下文',
    last_update_time BIGINT NOT NULL COMMENT 'ADK 会话最后更新时间（毫秒时间戳）',
    create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_app_user_session (app_name, user_id, session_id),
    KEY idx_app_user_update (app_name, user_id, last_update_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能体聊天会话';

CREATE TABLE IF NOT EXISTS ai_agent_chat_session_event (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '事件记录主键，按写入顺序排序',
    session_pk BIGINT UNSIGNED NOT NULL COMMENT '关联 ai_agent_chat_session.id',
    event_id VARCHAR(128) NOT NULL COMMENT 'Google ADK 事件 ID',
    invocation_id VARCHAR(128) DEFAULT NULL COMMENT 'ADK 调用 ID',
    author VARCHAR(128) DEFAULT NULL COMMENT '事件发起方',
    event_timestamp BIGINT NOT NULL COMMENT '事件时间（毫秒时间戳）',
    event_data LONGTEXT NOT NULL COMMENT '完整 Google ADK Event JSON',
    create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_session_event (session_pk, event_id),
    KEY idx_session_order (session_pk, id),
    CONSTRAINT fk_chat_session_event_session
        FOREIGN KEY (session_pk) REFERENCES ai_agent_chat_session (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能体聊天会话事件';
