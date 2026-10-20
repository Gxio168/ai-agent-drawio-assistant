-- 仅用于升级已执行旧版 ai_agent_chat_session.sql 的数据库。
-- 请先备份数据库，再按顺序执行；新数据库应执行上级目录的 ai_agent_chat_session.sql。

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

ALTER TABLE ai_agent_chat_session
    ADD COLUMN session_state LONGTEXT NULL COMMENT '不含事件的 Google ADK Session JSON，保存 state 等会话上下文';

UPDATE ai_agent_chat_session
SET session_state = JSON_SET(session_data, '$.events', JSON_ARRAY())
WHERE session_data IS NOT NULL;

INSERT INTO ai_agent_chat_session_event
    (session_pk, event_id, invocation_id, author, event_timestamp, event_data)
SELECT s.id,
       e.event_id,
       e.invocation_id,
       e.author,
       COALESCE(e.event_timestamp, 0),
       CAST(JSON_EXTRACT(s.session_data, CONCAT('$.events[', e.event_order - 1, ']')) AS CHAR)
FROM ai_agent_chat_session AS s
JOIN JSON_TABLE(
    s.session_data,
    '$.events[*]' COLUMNS (
        event_order FOR ORDINALITY,
        event_id VARCHAR(128) PATH '$.id' NULL ON EMPTY,
        invocation_id VARCHAR(128) PATH '$.invocationId' NULL ON EMPTY,
        author VARCHAR(128) PATH '$.author' NULL ON EMPTY,
        event_timestamp BIGINT PATH '$.timestamp' NULL ON EMPTY
    )
) AS e
WHERE s.session_data IS NOT NULL
ORDER BY s.id, e.event_order;

ALTER TABLE ai_agent_chat_session
    MODIFY COLUMN session_state LONGTEXT NOT NULL COMMENT '不含事件的 Google ADK Session JSON，保存 state 等会话上下文',
    DROP COLUMN session_data;
