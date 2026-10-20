package cn.bugstack.ai.infrastructure.dao.po;

import lombok.Data;

@Data
public class AgentChatSessionPO {

    private Long id;
    private String appName;
    private String userId;
    private String sessionId;
    private String sessionState;
    private Long lastUpdateTime;

}
