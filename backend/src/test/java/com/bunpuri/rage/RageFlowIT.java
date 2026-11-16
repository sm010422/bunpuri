package com.bunpuri.rage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.bunpuri.IntegrationTestBase;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class RageFlowIT extends IntegrationTestBase {

    /** 컨테이너를 공유하는 다른 테스트(ArenaIT 등)가 쓰지 않는 회사. 3D 마당 기본 샌드백은 1~5번이다. */
    static final long COMPANY = 9L;

    @Autowired
    RageService rageService;

    @Autowired
    RageFlusher rageFlusher;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void concurrentHitsAreCountedOnceEachAndFlushedToDb() throws Exception {
        long savedBefore = savedCount();
        long scoreBefore = rageService.todayScores(List.of(COMPANY)).get(COMPANY);

        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            IntStream.range(0, 500).forEach(i -> pool.submit(() -> rageService.hit(COMPANY)));
        }
        rageFlusher.flush();

        // 다른 스프링 컨텍스트의 스케줄된 flush가 먼저 꺼내 갔을 수도 있어 DB 반영을 잠시 기다린다.
        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> assertThat(savedCount()).isEqualTo(savedBefore + 500));
        assertThat(rageService.todayScores(List.of(COMPANY)).get(COMPANY)).isEqualTo(scoreBefore + 500);
    }

    private long savedCount() {
        return jdbc.queryForObject(
                "SELECT COALESCE(SUM(count), 0) FROM rage_count WHERE company_id = ?", Long.class, COMPANY);
    }
}
