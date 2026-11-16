package com.bunpuri.config;

import com.bunpuri.common.RateLimitInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final BunpuriProperties properties;
    private final StringRedisTemplate redis;

    public WebConfig(BunpuriProperties properties, StringRedisTemplate redis) {
        this.properties = properties;
        this.redis = redis;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(properties.cors().allowedOrigins().toArray(String[]::new))
                .allowedMethods("GET", "POST")
                .allowedHeaders("Content-Type", "X-Client-Id")
                .exposedHeaders("Retry-After")
                .maxAge(3600);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        if (!properties.rateLimit().enabled()) {
            return;
        }
        RedisScript<Long> script = RedisScript.of(new ClassPathResource("scripts/rate-limit.lua"), Long.class);
        registry.addInterceptor(new RateLimitInterceptor(redis, script)).addPathPatterns("/api/**");
    }
}
