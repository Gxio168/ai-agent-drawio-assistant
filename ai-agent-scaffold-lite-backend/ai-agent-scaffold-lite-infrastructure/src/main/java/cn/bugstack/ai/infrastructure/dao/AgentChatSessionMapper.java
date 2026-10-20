package cn.bugstack.ai.infrastructure.dao;

import cn.bugstack.ai.infrastructure.dao.po.AgentChatSessionPO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AgentChatSessionMapper {

    int insert(AgentChatSessionPO session);

    AgentChatSessionPO findOne(@Param("appName") String appName,
                               @Param("userId") String userId,
                               @Param("sessionId") String sessionId);

    AgentChatSessionPO findOneForUpdate(@Param("appName") String appName,
                                        @Param("userId") String userId,
                                        @Param("sessionId") String sessionId);

    List<AgentChatSessionPO> findByUser(@Param("appName") String appName, @Param("userId") String userId);

    int updateState(AgentChatSessionPO session);

    int deleteById(@Param("id") long id);
}
