package cn.bugstack.ai.domain.agent.model.valobj;

import lombok.Data;

import java.time.Instant;

@Data
public class ChatSessionVO {

    private String sessionId;
    private Instant lastUpdateTime;

}
