package cn.bugstack.ai.domain.agent.repository;

import cn.bugstack.ai.domain.agent.model.valobj.AiAgentConfigTableVO;

import java.util.List;

/** 数据库存储的 Agent 配置仓储端口。 */
public interface IAgentConfigRepository {

    List<AiAgentConfigTableVO> findAll();

    List<AiAgentConfigTableVO> findEnabled();

    AiAgentConfigTableVO findByAgentId(String agentId);

    void save(AiAgentConfigTableVO config);

    void deleteByAgentId(String agentId);
}
