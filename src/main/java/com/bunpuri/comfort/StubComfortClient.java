package com.bunpuri.comfort;

import com.bunpuri.config.BunpuriProperties;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.stereotype.Component;

/** 외부 API 지연을 흉내 낸다. 동기/비동기 비교 측정에서 지연 시간을 설정값으로 바꿔 가며 쓴다. */
@Component
public class StubComfortClient implements ComfortClient {

    private static final List<String> MESSAGES = List.of(
            "그 회사가 당신을 알아볼 안목이 없었던 거예요.",
            "오늘 버틴 것만으로도 충분히 잘했어요.",
            "떨어진 건 서류 한 장이지 당신이 아니에요.",
            "다음 문은 분명 더 잘 맞는 문일 거예요.");

    private final long latencyMs;

    public StubComfortClient(BunpuriProperties properties) {
        this.latencyMs = properties.comfort().stubLatencyMs();
    }

    @Override
    public String comfort(String ventContent) {
        try {
            Thread.sleep(latencyMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("interrupted", e);
        }
        return MESSAGES.get(ThreadLocalRandom.current().nextInt(MESSAGES.size()));
    }
}
