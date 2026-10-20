package cn.bugstack.ai.infrastructure.dao;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface AgentConfigMapper {

    List<Map<String, Object>> findApps();
    List<Map<String, Object>> findEnabledApps();
    Map<String, Object> findApp(@Param("agentId") String agentId);
    int insertApp(@Param("agentId") String agentId, @Param("appName") String appName,
                  @Param("agentName") String agentName, @Param("agentDesc") String agentDesc,
                  @Param("enabled") boolean enabled);
    int updateApp(@Param("agentId") String agentId, @Param("appName") String appName,
                  @Param("agentName") String agentName, @Param("agentDesc") String agentDesc,
                  @Param("enabled") boolean enabled);
    int deleteApp(@Param("agentId") String agentId);

    Map<String, Object> findModule(@Param("agentId") String agentId);
    int insertModule(@Param("agentId") String agentId, @Param("apiConfig") String apiConfig,
                     @Param("chatModelConfig") String chatModelConfig, @Param("runnerConfig") String runnerConfig);
    int updateModule(@Param("agentId") String agentId, @Param("apiConfig") String apiConfig,
                     @Param("chatModelConfig") String chatModelConfig, @Param("runnerConfig") String runnerConfig);

    List<Map<String, Object>> findNodes(@Param("agentId") String agentId);
    int deleteNodes(@Param("agentId") String agentId);
    int insertNode(@Param("agentId") String agentId, @Param("nodeType") String nodeType,
                   @Param("nodeName") String nodeName, @Param("sortOrder") int sortOrder,
                   @Param("configJson") String configJson);

    List<Map<String, Object>> findTools(@Param("agentId") String agentId);
    int deleteTools(@Param("agentId") String agentId);
    int insertTool(@Param("agentId") String agentId, @Param("toolType") String toolType,
                   @Param("sortOrder") int sortOrder, @Param("configJson") String configJson);
}
