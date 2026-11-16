package com.bunpuri.rage;

import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Redis에 쌓인 분노 증분을 주기적으로 DB에 더한다 (write-behind).
 * DB 반영에 실패하면 꺼낸 증분을 Redis에 되돌려 다음 주기에 다시 시도한다.
 * 한계: 인스턴스가 꺼내고 DB에 쓰기 전에 죽으면 그 주기의 증분은 잃는다 (docs/roadmap-mapping.md #3).
 */
@Component
public class RageFlusher {

    private static final Logger log = LoggerFactory.getLogger(RageFlusher.class);
    private static final String UPSERT = """
            INSERT INTO rage_count (company_id, day, count) VALUES (?, ?, ?)
            ON CONFLICT (company_id, day) DO UPDATE SET count = rage_count.count + EXCLUDED.count
            """;

    private final StringRedisTemplate redis;
    private final RedisScript<List<String>> rageDrainScript;
    private final JdbcTemplate jdbc;

    public RageFlusher(StringRedisTemplate redis, RedisScript<List<String>> rageDrainScript, JdbcTemplate jdbc) {
        this.redis = redis;
        this.rageDrainScript = rageDrainScript;
        this.jdbc = jdbc;
    }

    @Scheduled(fixedDelayString = "${bunpuri.rage.flush-interval-ms}")
    public void flush() {
        LocalDate today = LocalDate.now(RageService.KST);
        // 자정을 넘긴 직후에는 어제 키에 남은 증분도 함께 비운다.
        flushDay(today.minusDays(1));
        flushDay(today);
    }

    void flushDay(LocalDate day) {
        String key = RageService.pendingKey(day.format(RageService.DAY));
        List<String> drained = redis.execute(rageDrainScript, List.of(key));
        if (drained == null || drained.isEmpty()) {
            return;
        }
        List<Object[]> rows = new ArrayList<>();
        for (int i = 0; i < drained.size(); i += 2) {
            rows.add(new Object[] {Long.parseLong(drained.get(i)), Date.valueOf(day), Long.parseLong(drained.get(i + 1))});
        }
        try {
            jdbc.batchUpdate(UPSERT, rows);
        } catch (DataAccessException e) {
            log.warn("rage flush failed, restoring {} entries to {}", rows.size(), key, e);
            for (Object[] row : rows) {
                redis.opsForHash().increment(key, row[0].toString(), (Long) row[2]);
            }
        }
    }
}
