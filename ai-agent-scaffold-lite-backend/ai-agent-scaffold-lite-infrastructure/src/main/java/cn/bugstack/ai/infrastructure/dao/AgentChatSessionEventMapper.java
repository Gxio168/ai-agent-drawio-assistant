package cn.bugstack.ai.infrastructure.dao;

import cn.bugstack.ai.infrastructure.dao.po.AgentChatSessionEventPO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AgentChatSessionEventMapper {

    int insert(AgentChatSessionEventPO event);

    List<AgentChatSessionEventPO> findBySession(@Param("sessionPk") long sessionPk);

    int deleteBySession(@Param("sessionPk") long sessionPk);
}
