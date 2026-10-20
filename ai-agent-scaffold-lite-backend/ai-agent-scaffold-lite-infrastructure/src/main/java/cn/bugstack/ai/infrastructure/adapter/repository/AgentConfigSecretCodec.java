package cn.bugstack.ai.infrastructure.adapter.repository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/** 使用 AES-GCM 加密存入数据库的模型 API 密钥。 */
@Component
public class AgentConfigSecretCodec {

    private static final String PREFIX = "enc:";
    private static final int IV_SIZE = 12;
    private static final int TAG_BITS = 128;
    private static final SecureRandom RANDOM = new SecureRandom();

    @Value("${agent.config.encryption-key:}")
    private String encryptionKey;

    public String encrypt(String value) {
        if (value == null || value.isBlank()) return value;
        if (value.startsWith(PREFIX)) return value;
        try {
            byte[] iv = new byte[IV_SIZE];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(keyBytes(), "AES"), new GCMParameterSpec(TAG_BITS, iv));
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] payload = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, payload, 0, iv.length);
            System.arraycopy(encrypted, 0, payload, iv.length, encrypted.length);
            return PREFIX + Base64.getEncoder().encodeToString(payload);
        } catch (Exception e) {
            throw new IllegalStateException("Agent API 密钥加密失败", e);
        }
    }

    public String decrypt(String value) {
        if (value == null || value.isBlank()) return value;
        if (!value.startsWith(PREFIX)) return value;
        try {
            byte[] payload = Base64.getDecoder().decode(value.substring(PREFIX.length()));
            byte[] iv = new byte[IV_SIZE];
            byte[] encrypted = new byte[payload.length - IV_SIZE];
            System.arraycopy(payload, 0, iv, 0, IV_SIZE);
            System.arraycopy(payload, IV_SIZE, encrypted, 0, encrypted.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(keyBytes(), "AES"), new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Agent API 密钥解密失败；请确认 agent.config.encryption-key 与写入时一致", e);
        }
    }

    private byte[] keyBytes() throws Exception {
        if (encryptionKey == null || encryptionKey.isBlank())
            throw new IllegalStateException("未配置 agent.config.encryption-key，无法安全存储 Agent API 密钥");
        return MessageDigest.getInstance("SHA-256").digest(encryptionKey.getBytes(StandardCharsets.UTF_8));
    }
}
