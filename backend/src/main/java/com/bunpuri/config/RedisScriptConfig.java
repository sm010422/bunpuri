package com.bunpuri.config;

import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.script.RedisScript;

@Configuration
public class RedisScriptConfig {

    @Bean
    public RedisScript<Long> rageHitScript() {
        return RedisScript.of(new ClassPathResource("scripts/rage-hit.lua"), Long.class);
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    @Bean
    public RedisScript<List<String>> rageDrainScript() {
        return (RedisScript) RedisScript.of(new ClassPathResource("scripts/rage-drain.lua"), List.class);
    }
}
