package com.bunpuri.arena;

import com.bunpuri.rage.RageService;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 3D 공격을 메모리에서 회사별로 모았다가 200ms마다 Redis에 한 번씩 넣는다.
 * 합격 발표 날처럼 한 회사에 공격이 몰려도 Redis 호출은 회사 수 × 초당 5회로 고정된다 (핫키 완화).
 * 대가: 인스턴스가 죽으면 마지막 200ms분은 잃는다.
 */
@Component
class AttackAggregator {

    private static final Logger log = LoggerFactory.getLogger(AttackAggregator.class);

    private final Map<Long, LongAdder> pending = new ConcurrentHashMap<>();
    private final RageService rageService;

    AttackAggregator(RageService rageService) {
        this.rageService = rageService;
    }

    void add(long companyId, int points) {
        pending.computeIfAbsent(companyId, id -> new LongAdder()).add(points);
    }

    @Scheduled(fixedDelay = 200)
    void flush() {
        for (Map.Entry<Long, LongAdder> entry : pending.entrySet()) {
            long points = entry.getValue().sumThenReset();
            if (points == 0) {
                continue;
            }
            try {
                rageService.add(entry.getKey(), points);
            } catch (DataAccessException e) {
                entry.getValue().add(points); // 다음 주기에 다시 시도
                log.warn("attack flush failed for company {}: {}", entry.getKey(), e.getMessage());
            }
        }
    }
}
