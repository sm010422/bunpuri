package com.bunpuri.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "bunpuri")
public record BunpuriProperties(Rage rage, Vent vent, Comfort comfort) {

    public record Rage(long flushIntervalMs) {
    }

    public record Vent(int hideReportThreshold) {
    }

    public record Comfort(Mode mode, long timeoutMs, long stubLatencyMs) {
        public enum Mode { SYNC, ASYNC }
    }
}
