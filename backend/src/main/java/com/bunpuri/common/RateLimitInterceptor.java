package com.bunpuri.common;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 쓰기 요청 제한 (Redis 고정 윈도우).
 * 클라이언트 단위 한도로 연타·도배를 막고, 전체 한도로 홈서버(worker2)가 감당할 쓰기량을 넘지 않게 한다.
 * 클라이언트 식별은 프론트가 만든 익명 X-Client-Id, 없으면 원격 IP. X-Client-Id는 바꿔 가며 우회할 수 있어
 * 전체 한도가 최종 방어선이다. Redis 장애 시에는 막지 않고 통과시킨다(fail-open).
 */
public class RateLimitInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(RateLimitInterceptor.class);
    private static final Pattern CLIENT_ID = Pattern.compile("[A-Za-z0-9-]{8,64}");

    private final StringRedisTemplate redis;
    private final RedisScript<Long> rateLimitScript;

    public RateLimitInterceptor(StringRedisTemplate redis, RedisScript<Long> rateLimitScript) {
        this.redis = redis;
        this.rateLimitScript = rateLimitScript;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if (!"POST".equals(request.getMethod())) {
            return true;
        }
        Policy policy = Policy.of(request.getRequestURI());
        if (policy == null) {
            return true;
        }
        try {
            if (exceeded("global", "all", Policy.GLOBAL_LIMIT, Policy.GLOBAL_WINDOW_SECONDS)
                    || exceeded(policy.name(), clientKey(request), policy.limit, policy.windowSeconds)) {
                reject(response, policy.windowSeconds);
                return false;
            }
        } catch (DataAccessException e) {
            log.warn("rate limit check skipped (redis unavailable): {}", e.getMessage());
        }
        return true;
    }

    private boolean exceeded(String policy, String client, int limit, int windowSeconds) {
        long window = System.currentTimeMillis() / 1000 / windowSeconds;
        String key = "ratelimit:" + policy + ":" + client + ":" + window;
        Long count = redis.execute(rateLimitScript, List.of(key), String.valueOf(windowSeconds));
        return count != null && count > limit;
    }

    private static String clientKey(HttpServletRequest request) {
        String clientId = request.getHeader("X-Client-Id");
        if (clientId != null && CLIENT_ID.matcher(clientId).matches()) {
            return "c:" + clientId;
        }
        return "ip:" + request.getRemoteAddr();
    }

    private static void reject(HttpServletResponse response, int retryAfterSeconds) throws Exception {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setHeader("Retry-After", String.valueOf(retryAfterSeconds));
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write("{\"error\":\"잠깐 숨 좀 고르고 다시 해요\"}");
    }

    enum Policy {
        RAGE(20, 5),     // 샌드백: 5초에 20대 (초당 4대 연타)
        VENT(5, 60),     // 외침: 1분에 5개
        REPORT(10, 60);  // 신고: 1분에 10건

        static final int GLOBAL_LIMIT = 300;
        static final int GLOBAL_WINDOW_SECONDS = 1;

        final int limit;
        final int windowSeconds;

        Policy(int limit, int windowSeconds) {
            this.limit = limit;
            this.windowSeconds = windowSeconds;
        }

        static Policy of(String uri) {
            if (uri.equals("/api/rage")) {
                return RAGE;
            }
            if (uri.equals("/api/vents")) {
                return VENT;
            }
            if (uri.startsWith("/api/vents/") && uri.endsWith("/report")) {
                return REPORT;
            }
            return null;
        }
    }
}
