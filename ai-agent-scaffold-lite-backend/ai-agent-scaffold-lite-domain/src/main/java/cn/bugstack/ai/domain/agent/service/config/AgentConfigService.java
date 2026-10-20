package cn.bugstack.ai.domain.agent.service.config;

import cn.bugstack.ai.domain.agent.model.valobj.AiAgentConfigTableVO;
import cn.bugstack.ai.domain.agent.repository.IAgentConfigRepository;
import cn.bugstack.ai.domain.agent.service.IAgentConfigService;
import cn.bugstack.ai.domain.agent.service.IArmoryService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class AgentConfigService implements IAgentConfigService {

    @Resource private IAgentConfigRepository repository;
    @Resource private IArmoryService armoryService;

    @Override public List<AiAgentConfigTableVO> list() { return repository.findAll(); }

    @Override
    public AiAgentConfigTableVO get(String agentId) {
        AiAgentConfigTableVO config = repository.findByAgentId(agentId);
        if (config == null) throw new IllegalArgumentException("Agent 配置不存在");
        return config;
    }

    @Override
    @Transactional
    public AiAgentConfigTableVO create(AiAgentConfigTableVO config) throws Exception {
        validate(config);
        if (repository.findByAgentId(config.getAgent().getAgentId()) != null)
            throw new IllegalArgumentException("agentId 已存在");
        repository.save(config);
        if (Boolean.TRUE.equals(config.getEnabled())) armoryService.acceptArmoryAgents(List.of(config));
        return repository.findByAgentId(config.getAgent().getAgentId());
    }

    @Override
    @Transactional
    public AiAgentConfigTableVO update(String agentId, AiAgentConfigTableVO config) throws Exception {
        AiAgentConfigTableVO previous = get(agentId);
        if (!agentId.equals(config.getAgent().getAgentId())) throw new IllegalArgumentException("agentId 不允许通过更新修改");
        if (config.getEnabled() == null) config.setEnabled(previous.getEnabled());
        if (config.getModule().getAiApi().getApiKey() == null || config.getModule().getAiApi().getApiKey().isBlank())
            config.getModule().getAiApi().setApiKey(previous.getModule().getAiApi().getApiKey());
        validate(config);
        repository.save(config);
        if (Boolean.TRUE.equals(config.getEnabled())) armoryService.acceptArmoryAgents(List.of(config));
        else armoryService.removeAgent(agentId);
        return repository.findByAgentId(agentId);
    }

    @Override
    @Transactional
    public void delete(String agentId) {
        get(agentId);
        repository.deleteByAgentId(agentId);
        armoryService.removeAgent(agentId);
    }

    private void validate(AiAgentConfigTableVO config) {
        if (config == null || config.getAgent() == null || blank(config.getAgent().getAgentId())
                || blank(config.getAgent().getAgentName()) || blank(config.getAppName()) || config.getModule() == null)
            throw new IllegalArgumentException("应用名称、Agent 标识、名称和模块配置不能为空");
        AiAgentConfigTableVO.Module module = config.getModule();
        if (module.getAiApi() == null || blank(module.getAiApi().getBaseUrl()) || blank(module.getAiApi().getApiKey())
                || module.getChatModel() == null || blank(module.getChatModel().getModel()) || module.getRunner() == null
                || blank(module.getRunner().getAgentName()))
            throw new IllegalArgumentException("API、模型和 Runner 配置不完整");

        Set<String> names = new HashSet<>();
        if (module.getAgents() != null) for (AiAgentConfigTableVO.Module.Agent agent : module.getAgents()) {
            if (agent == null || blank(agent.getName()) || !names.add(agent.getName()))
                throw new IllegalArgumentException("普通 Agent 名称不能为空且不能重复");
        }
        if (module.getAgentWorkflows() != null) for (AiAgentConfigTableVO.Module.AgentWorkflow workflow : module.getAgentWorkflows()) {
            if (workflow == null || blank(workflow.getName()) || !names.add(workflow.getName()))
                throw new IllegalArgumentException("Workflow 名称不能为空且不能重复");
            if (workflow.getType() == null || !("sequential".equalsIgnoreCase(workflow.getType())
                    || "parallel".equalsIgnoreCase(workflow.getType()) || "loop".equalsIgnoreCase(workflow.getType())))
                throw new IllegalArgumentException("Workflow 类型仅支持 sequential、parallel、loop");
        }

        // 工作流按声明顺序装配，子节点必须是此前已声明的节点。
        Set<String> available = new HashSet<>();
        if (module.getAgents() != null) for (AiAgentConfigTableVO.Module.Agent agent : module.getAgents()) available.add(agent.getName());
        if (module.getAgentWorkflows() != null) for (AiAgentConfigTableVO.Module.AgentWorkflow workflow : module.getAgentWorkflows()) {
            List<String> children = workflow.getSubAgents();
            if (children == null || children.isEmpty()) throw new IllegalArgumentException("Workflow 至少需要一个子 Agent");
            for (String child : children) if (!available.contains(child))
                throw new IllegalArgumentException("Workflow 子节点不存在或尚未定义: " + child);
            available.add(workflow.getName());
        }
        if (!available.contains(module.getRunner().getAgentName()))
            throw new IllegalArgumentException("Runner 指向的入口 Agent 不存在");
    }

    private boolean blank(String value) { return value == null || value.isBlank(); }
}
