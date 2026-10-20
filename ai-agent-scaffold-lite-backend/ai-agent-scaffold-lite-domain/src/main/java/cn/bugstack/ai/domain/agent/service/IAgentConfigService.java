package cn.bugstack.ai.domain.agent.service;

import cn.bugstack.ai.domain.agent.model.valobj.AiAgentConfigTableVO;

import java.util.List;

public interface IAgentConfigService {
    List<AiAgentConfigTableVO> list();
    AiAgentConfigTableVO get(String agentId);
    AiAgentConfigTableVO create(AiAgentConfigTableVO config) throws Exception;
    AiAgentConfigTableVO update(String agentId, AiAgentConfigTableVO config) throws Exception;
    void delete(String agentId);
}
