package com.bunpuri.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "bunpuri")
public record BunpuriProperties(Rage rage, Vent vent, Comfort comfort, RateLimit rateLimit, Cors cors) {

    public record Rage(long flushIntervalMs) {
    }

    public record Vent(int hideReportThreshold) {
    }

    public record Comfort(Mode mode, long timeoutMs, long stubLatencyMs) {
        public enum Mode { SYNC, ASYNC }
    }

    /** k6 부하 테스트 때는 enabled=false로 끄고 잰다. */
    public record RateLimit(boolean enabled) {
    }

    public record Cors(List<String> allowedOrigins) {
    }
}
