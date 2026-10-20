package cn.bugstack.ai.api.dto;

import lombok.Data;

import java.time.Instant;

@Data
public class ChatSessionDTO {

    private String sessionId;
    private Instant lastUpdateTime;

}
