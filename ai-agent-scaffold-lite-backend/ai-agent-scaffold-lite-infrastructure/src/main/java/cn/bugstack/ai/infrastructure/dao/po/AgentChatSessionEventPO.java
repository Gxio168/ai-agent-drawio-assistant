package cn.bugstack.ai.infrastructure.dao.po;

import lombok.Data;

@Data
public class AgentChatSessionEventPO {

    private Long id;
    private Long sessionPk;
    private String eventId;
    private String invocationId;
    private String author;
    private Long eventTimestamp;
    private String eventData;

}
