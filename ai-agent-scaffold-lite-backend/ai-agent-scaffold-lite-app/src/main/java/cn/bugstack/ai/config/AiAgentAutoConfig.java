package cn.bugstack.ai.config;

import cn.bugstack.ai.domain.agent.repository.IAgentConfigRepository;
import cn.bugstack.ai.domain.agent.service.IArmoryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.context.annotation.Configuration;

import javax.annotation.Resource;
import java.util.List;

@Slf4j
@Configuration
public class AiAgentAutoConfig implements ApplicationListener<ApplicationReadyEvent> {

    @Resource
    private IAgentConfigRepository agentConfigRepository;

    @Resource
    private IArmoryService armoryService;

    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        try {
            List<cn.bugstack.ai.domain.agent.model.valobj.AiAgentConfigTableVO> configs = agentConfigRepository.findEnabled();
            log.info("从数据库读取 {} 个 Agent 配置并开始装配", configs.size());
            if (!configs.isEmpty()) armoryService.acceptArmoryAgents(configs);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

}
