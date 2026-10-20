package cn.bugstack.ai.infrastructure.adapter.repository;

import cn.bugstack.ai.domain.agent.model.valobj.AiAgentConfigTableVO;
import cn.bugstack.ai.domain.agent.repository.IAgentConfigRepository;
import cn.bugstack.ai.infrastructure.dao.AgentConfigMapper;
import com.alibaba.fastjson.JSON;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Repository
public class MybatisAgentConfigRepository implements IAgentConfigRepository {

    @Resource
    private AgentConfigMapper mapper;

    @Resource
    private AgentConfigSecretCodec secretCodec;

    @Override
    public List<AiAgentConfigTableVO> findAll() {
        List<AiAgentConfigTableVO> result = new ArrayList<>();
        for (Map<String, Object> app : mapper.findApps()) {
            result.add(load((String) app.get("agentId"), app));
        }
        return result;
    }

    @Override
    public List<AiAgentConfigTableVO> findEnabled() {
        List<AiAgentConfigTableVO> result = new ArrayList<>();
        for (Map<String, Object> app : mapper.findEnabledApps()) result.add(load((String) app.get("agentId"), app));
        return result;
    }

    @Override
    public AiAgentConfigTableVO findByAgentId(String agentId) {
        Map<String, Object> app = mapper.findApp(agentId);
        return app == null ? null : load(agentId, app);
    }

    private AiAgentConfigTableVO load(String agentId, Map<String, Object> app) {
        AiAgentConfigTableVO vo = new AiAgentConfigTableVO();
        vo.setAppName((String) app.get("appName"));
        vo.setEnabled((Boolean) app.get("enabled"));
        AiAgentConfigTableVO.Agent agent = new AiAgentConfigTableVO.Agent();
        agent.setAgentId(agentId);
        agent.setAgentName((String) app.get("agentName"));
        agent.setAgentDesc((String) app.get("agentDesc"));
        vo.setAgent(agent);

        AiAgentConfigTableVO.Module module = new AiAgentConfigTableVO.Module();
        Map<String, Object> moduleRow = mapper.findModule(agentId);
        if (moduleRow != null) {
            module.setAiApi(JSON.parseObject((String) moduleRow.get("apiConfig"), AiAgentConfigTableVO.Module.AiApi.class));
            module.getAiApi().setApiKey(secretCodec.decrypt(module.getAiApi().getApiKey()));
            module.setChatModel(JSON.parseObject((String) moduleRow.get("chatModelConfig"), AiAgentConfigTableVO.Module.ChatModel.class));
            module.setRunner(JSON.parseObject((String) moduleRow.get("runnerConfig"), AiAgentConfigTableVO.Module.Runner.class));
        }
        List<AiAgentConfigTableVO.Module.Agent> agents = new ArrayList<>();
        List<AiAgentConfigTableVO.Module.AgentWorkflow> workflows = new ArrayList<>();
        for (Map<String, Object> node : mapper.findNodes(agentId)) {
            String type = (String) node.get("nodeType");
            String json = (String) node.get("configJson");
            if ("AGENT".equals(type)) agents.add(JSON.parseObject(json, AiAgentConfigTableVO.Module.Agent.class));
            else if ("WORKFLOW".equals(type)) workflows.add(JSON.parseObject(json, AiAgentConfigTableVO.Module.AgentWorkflow.class));
        }
        module.setAgents(agents);
        module.setAgentWorkflows(workflows);

        List<AiAgentConfigTableVO.Module.ChatModel.ToolMcp> mcps = new ArrayList<>();
        List<AiAgentConfigTableVO.Module.ChatModel.ToolSkills> skills = new ArrayList<>();
        for (Map<String, Object> tool : mapper.findTools(agentId)) {
            String type = (String) tool.get("toolType");
            String json = (String) tool.get("configJson");
            if ("MCP".equals(type)) mcps.add(JSON.parseObject(secretCodec.decrypt(json), AiAgentConfigTableVO.Module.ChatModel.ToolMcp.class));
            else if ("SKILL".equals(type)) skills.add(JSON.parseObject(json, AiAgentConfigTableVO.Module.ChatModel.ToolSkills.class));
        }
        if (module.getChatModel() != null) {
            module.getChatModel().setToolMcpList(mcps);
            module.getChatModel().setToolSkillsList(skills);
        }
        vo.setModule(module);
        return vo;
    }

    @Override
    @Transactional
    public void save(AiAgentConfigTableVO config) {
        String agentId = config.getAgent().getAgentId();
        boolean exists = mapper.findApp(agentId) != null;
        boolean enabled = config.getEnabled() == null || config.getEnabled();
        if (exists) mapper.updateApp(agentId, config.getAppName(), config.getAgent().getAgentName(), config.getAgent().getAgentDesc(), enabled);
        else mapper.insertApp(agentId, config.getAppName(), config.getAgent().getAgentName(), config.getAgent().getAgentDesc(), enabled);

        AiAgentConfigTableVO.Module module = config.getModule();
        AiAgentConfigTableVO.Module.ChatModel chat = module.getChatModel();
        AiAgentConfigTableVO.Module.ChatModel chatModelConfig = new AiAgentConfigTableVO.Module.ChatModel();
        chatModelConfig.setModel(chat.getModel());
        chatModelConfig.setReasoningEffort(chat.getReasoningEffort());
        AiAgentConfigTableVO.Module.AiApi apiConfig = new AiAgentConfigTableVO.Module.AiApi();
        apiConfig.setBaseUrl(module.getAiApi().getBaseUrl());
        apiConfig.setApiKey(secretCodec.encrypt(module.getAiApi().getApiKey()));
        apiConfig.setCompletionsPath(module.getAiApi().getCompletionsPath());
        apiConfig.setEmbeddingsPath(module.getAiApi().getEmbeddingsPath());
        String apiJson = JSON.toJSONString(apiConfig);
        String modelJson = JSON.toJSONString(chatModelConfig);
        String runnerJson = JSON.toJSONString(module.getRunner());
        if (exists && mapper.findModule(agentId) != null) mapper.updateModule(agentId, apiJson, modelJson, runnerJson);
        else mapper.insertModule(agentId, apiJson, modelJson, runnerJson);

        mapper.deleteNodes(agentId);
        int order = 0;
        if (module.getAgents() != null) for (AiAgentConfigTableVO.Module.Agent item : module.getAgents())
            mapper.insertNode(agentId, "AGENT", item.getName(), order++, JSON.toJSONString(item));
        if (module.getAgentWorkflows() != null) for (AiAgentConfigTableVO.Module.AgentWorkflow item : module.getAgentWorkflows())
            mapper.insertNode(agentId, "WORKFLOW", item.getName(), order++, JSON.toJSONString(item));

        mapper.deleteTools(agentId);
        int toolOrder = 0;
        if (chat.getToolMcpList() != null) for (AiAgentConfigTableVO.Module.ChatModel.ToolMcp item : chat.getToolMcpList())
            mapper.insertTool(agentId, "MCP", toolOrder++, secretCodec.encrypt(JSON.toJSONString(item)));
        if (chat.getToolSkillsList() != null) for (AiAgentConfigTableVO.Module.ChatModel.ToolSkills item : chat.getToolSkillsList())
            mapper.insertTool(agentId, "SKILL", toolOrder++, JSON.toJSONString(item));
    }

    @Override
    @Transactional
    public void deleteByAgentId(String agentId) {
        mapper.deleteApp(agentId);
    }
}
