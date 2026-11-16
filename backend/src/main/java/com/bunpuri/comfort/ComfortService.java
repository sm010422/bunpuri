package com.bunpuri.comfort;

import com.bunpuri.config.BunpuriProperties;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 외부 호출에 타임아웃과 기본값을 씌운다. 외부 서비스가 느리거나 죽어도 외침 저장은 실패하지 않아야 한다.
 * 재시도·서킷브레이커는 실제 어댑터를 붙일 때 추가한다 (docs/roadmap-mapping.md #4).
 */
@Service
public class ComfortService {

    public static final String FALLBACK = "오늘도 수고 많았어요.";
    private static final Logger log = LoggerFactory.getLogger(ComfortService.class);

    private final ComfortClient comfortClient;
    private final ExecutorService comfortExecutor;
    private final long timeoutMs;

    public ComfortService(ComfortClient comfortClient, ExecutorService comfortExecutor, BunpuriProperties properties) {
        this.comfortClient = comfortClient;
        this.comfortExecutor = comfortExecutor;
        this.timeoutMs = properties.comfort().timeoutMs();
    }

    public CompletableFuture<String> request(String ventContent) {
        return CompletableFuture.supplyAsync(() -> comfortClient.comfort(ventContent), comfortExecutor)
                .orTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .exceptionally(e -> {
                    log.debug("comfort fallback: {}", e.toString());
                    return FALLBACK;
                });
    }
}
