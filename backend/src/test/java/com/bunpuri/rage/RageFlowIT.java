package com.bunpuri.rage;

import static org.assertj.core.api.Assertions.assertThat;

import com.bunpuri.IntegrationTestBase;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class RageFlowIT extends IntegrationTestBase {

    @Autowired
    RageService rageService;

    @Autowired
    RageFlusher rageFlusher;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void concurrentHitsAreCountedOnceEachAndFlushedToDb() throws Exception {
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            IntStream.range(0, 500).forEach(i -> pool.submit(() -> rageService.hit(1L)));
        }

        rageFlusher.flush();

        Long saved = jdbc.queryForObject(
                "SELECT COALESCE(SUM(count), 0) FROM rage_count WHERE company_id = 1", Long.class);
        assertThat(saved).isEqualTo(500L);
        assertThat(rageService.todayRanking(1).top().getFirst().count()).isEqualTo(500L);
    }
}
