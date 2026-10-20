package cn.bugstack.ai.trigger.http;

import cn.bugstack.ai.api.response.Response;
import cn.bugstack.ai.domain.agent.model.valobj.AiAgentConfigTableVO;
import cn.bugstack.ai.domain.agent.service.IAgentConfigService;
import cn.bugstack.ai.types.enums.ResponseCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/v1/agent-configs")
@CrossOrigin(origins = "*")
public class AgentConfigController {

    @Resource private IAgentConfigService agentConfigService;

    @GetMapping
    public Response<List<AiAgentConfigTableVO>> list() {
        try {
            List<AiAgentConfigTableVO> configs = agentConfigService.list();
            configs.forEach(this::maskSecret);
            return success(configs);
        } catch (Exception e) { return failure(e); }
    }

    @GetMapping("/{agentId}")
    public Response<AiAgentConfigTableVO> get(@PathVariable("agentId") String agentId) {
        try {
            AiAgentConfigTableVO config = agentConfigService.get(agentId);
            maskSecret(config);
            return success(config);
        } catch (Exception e) { return failure(e); }
    }

    @PostMapping
    public Response<AiAgentConfigTableVO> create(@RequestBody AiAgentConfigTableVO config) {
        try {
            AiAgentConfigTableVO saved = agentConfigService.create(config);
            maskSecret(saved);
            return success(saved);
        } catch (Exception e) { return failure(e); }
    }

    @PutMapping("/{agentId}")
    public Response<AiAgentConfigTableVO> update(@PathVariable("agentId") String agentId, @RequestBody AiAgentConfigTableVO config) {
        try {
            AiAgentConfigTableVO saved = agentConfigService.update(agentId, config);
            maskSecret(saved);
            return success(saved);
        } catch (Exception e) { return failure(e); }
    }

    @DeleteMapping("/{agentId}")
    public Response<Boolean> delete(@PathVariable("agentId") String agentId) {
        try {
            agentConfigService.delete(agentId);
            return success(Boolean.TRUE);
        } catch (Exception e) { return failure(e); }
    }

    private void maskSecret(AiAgentConfigTableVO config) {
        if (config != null && config.getModule() != null && config.getModule().getAiApi() != null) {
            AiAgentConfigTableVO.Module.AiApi api = config.getModule().getAiApi();
            api.setApiKeyConfigured(api.getApiKey() != null && !api.getApiKey().isBlank());
            api.setApiKey(null);
        }
    }

    private <T> Response<T> success(T data) {
        return Response.<T>builder().code(ResponseCode.SUCCESS.getCode()).info(ResponseCode.SUCCESS.getInfo()).data(data).build();
    }

    private <T> Response<T> failure(Exception e) {
        log.error("Agent 配置管理失败", e);
        String info = e instanceof IllegalArgumentException ? e.getMessage() : ResponseCode.UN_ERROR.getInfo();
        return Response.<T>builder().code(ResponseCode.UN_ERROR.getCode()).info(info).build();
    }
}
