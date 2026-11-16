package com.bunpuri.rage;

import com.bunpuri.company.CompanyService;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ZSetOperations.TypedTuple;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

/**
 * 분노 버튼. 요청마다 DB에 쓰지 않고 Redis에서 원자적으로 센 뒤, {@link RageFlusher}가 묶어서 DB에 반영한다.
 */
@Service
public class RageService {

    static final ZoneId KST = ZoneId.of("Asia/Seoul");
    static final DateTimeFormatter DAY = DateTimeFormatter.BASIC_ISO_DATE;
    private static final long DAY_KEY_TTL_SECONDS = Duration.ofDays(2).toSeconds();

    private final StringRedisTemplate redis;
    private final RedisScript<Long> rageHitScript;
    private final CompanyService companyService;

    public RageService(StringRedisTemplate redis, RedisScript<Long> rageHitScript, CompanyService companyService) {
        this.redis = redis;
        this.rageHitScript = rageHitScript;
        this.companyService = companyService;
    }

    public long hit(Long companyId) {
        long cid = companyId == null ? CompanyService.NO_COMPANY : companyId;
        if (cid != CompanyService.NO_COMPANY && !companyService.exists(cid)) {
            throw new IllegalArgumentException("unknown company");
        }
        return add(cid, 1);
    }

    /** 검증이 끝난 회사에 점수를 더한다. 3D 공격은 {@code AttackAggregator}가 모아서 이걸로 한 번에 넣는다. */
    public long add(long companyId, long amount) {
        String day = today();
        Long total = redis.execute(rageHitScript,
                List.of(pendingKey(day), rankKey(day), totalKey(day)),
                String.valueOf(companyId), String.valueOf(DAY_KEY_TTL_SECONDS), String.valueOf(amount));
        return total == null ? 0 : total;
    }

    public RankingResponse todayRanking(int size) {
        String day = today();
        Set<TypedTuple<String>> top = redis.opsForZSet().reverseRangeWithScores(rankKey(day), 0, size - 1);
        String total = redis.opsForValue().get(totalKey(day));
        List<RankingResponse.Entry> entries = top == null ? List.of() : top.stream()
                .map(t -> {
                    long id = Long.parseLong(t.getValue());
                    return new RankingResponse.Entry(id, companyService.nameOf(id), t.getScore().longValue());
                })
                .toList();
        return new RankingResponse(total == null ? 0 : Long.parseLong(total), entries);
    }

    /** 오늘 점수. 3D 마당의 샌드백 숫자에 쓴다. 점수가 없는 회사는 0. */
    public Map<Long, Long> todayScores(Collection<Long> companyIds) {
        if (companyIds.isEmpty()) {
            return Map.of();
        }
        List<Long> ids = List.copyOf(companyIds);
        List<Double> scores = redis.opsForZSet().score(rankKey(today()),
                ids.stream().map(String::valueOf).toArray(Object[]::new));
        Map<Long, Long> result = new HashMap<>();
        for (int i = 0; i < ids.size(); i++) {
            Double score = scores == null ? null : scores.get(i);
            result.put(ids.get(i), score == null ? 0L : score.longValue());
        }
        return result;
    }

    static String today() {
        return LocalDate.now(KST).format(DAY);
    }

    /** 날짜별로 나눠 두어야 자정 직전 증분이 다음 날로 집계되지 않는다. */
    static String pendingKey(String day) {
        return "rage:pending:" + day;
    }

    static String rankKey(String day) {
        return "rage:rank:" + day;
    }

    static String totalKey(String day) {
        return "rage:total:" + day;
    }

    public record RankingResponse(long todayTotal, List<Entry> top) {
        public record Entry(long companyId, String companyName, long count) {
        }
    }
}
