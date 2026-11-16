package com.bunpuri.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * L1 로컬 캐시. 회사 목록은 거의 바뀌지 않아 인스턴스마다 들고 있어도 불일치 위험이 작다.
 * 회사 추가·수정 기능이 생기면 Redis Pub/Sub으로 무효화 신호를 보낸다 (docs/roadmap-mapping.md #2).
 */
@Configuration
public class CacheConfig {

    public static final String COMPANIES = "companies";

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager(COMPANIES);
        manager.setCaffeine(Caffeine.newBuilder()
                .maximumSize(10_000)
                .expireAfterWrite(Duration.ofMinutes(10))
                .recordStats());
        return manager;
    }
}
