package cn.bugstack.ai.api.dto;

import lombok.Data;

@Data
public class ChatMessageDTO {

    private String eventId;
    private String role;
    private String content;
    private long timestamp;

}
