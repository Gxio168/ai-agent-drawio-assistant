package cn.bugstack.ai.domain.agent.model.valobj;

import lombok.Data;

@Data
public class ChatMessageVO {

    private String eventId;
    private String role;
    private String content;
    private long timestamp;

}
