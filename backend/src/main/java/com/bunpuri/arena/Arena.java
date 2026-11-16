package com.bunpuri.arena;

import com.bunpuri.arena.Channel.AttackEvent;
import com.bunpuri.company.CompanyService;
import com.bunpuri.rage.RageService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentSkipListMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

/**
 * 3D 마당의 상태와 방송.
 * - 접속자를 최대 50명짜리 채널에 나눠 담는다.
 * - 100ms마다(10Hz) 채널별로 "움직인 사람 위치 + 그 사이 공격"을 한 메시지로 묶어 보낸다.
 * - 2초마다 채널별 샌드백 목록(오늘 상위 5 + 채널 지목 3)과 점수를 보낸다.
 */
@Component
class Arena {

    static final int TOP_BAGS = 5;
    private static final Logger log = LoggerFactory.getLogger(Arena.class);

    private final Map<Integer, Channel> channels = new ConcurrentSkipListMap<>();
    private final AtomicInteger playerIds = new AtomicInteger();
    private final ObjectMapper json;
    private final RageService rageService;
    private final CompanyService companyService;
    private final AttackAggregator attackAggregator;
    private final ExecutorService broadcaster = Executors.newVirtualThreadPerTaskExecutor();
    private final Timer tickTimer;
    private final Counter messagesSent;
    private final MeterRegistry meters;

    Arena(ObjectMapper json, RageService rageService, CompanyService companyService,
          AttackAggregator attackAggregator, MeterRegistry meters) {
        this.json = json;
        this.rageService = rageService;
        this.companyService = companyService;
        this.attackAggregator = attackAggregator;
        this.meters = meters;
        this.tickTimer = meters.timer("arena.tick");
        this.messagesSent = meters.counter("arena.messages.sent");
        Gauge.builder("arena.players", this, a -> a.channels.values().stream().mapToInt(Channel::size).sum())
                .register(meters);
        Gauge.builder("arena.channels", channels, Map::size).register(meters);
    }

    // ---- 접속·퇴장 ----

    synchronized Join join(WebSocketSession session) {
        Channel channel = channels.values().stream().filter(Channel::hasRoom).findFirst()
                .orElseGet(this::openChannel);
        Player player = new Player(playerIds.incrementAndGet(), Nicknames.name(), Nicknames.color(), session);
        if (channel.bagIds().isEmpty()) {
            channel.bagIds(bagIdsFor(channel, globalTop()));
        }
        channel.add(player);
        broadcast(channel, Map.of("t", "join", "p", playerView(player)), player);
        return new Join(channel, player);
    }

    synchronized void leave(Channel channel, String sessionId) {
        Player player = channel.remove(sessionId);
        if (player != null) {
            broadcast(channel, Map.of("t", "leave", "id", player.id), null);
        }
        if (channel.size() == 0) {
            channels.remove(channel.number);
        }
    }

    private Channel openChannel() {
        int number = 1;
        while (channels.containsKey(number)) {
            number++;
        }
        Channel channel = new Channel(number);
        channels.put(number, channel);
        return channel;
    }

    Map<String, Object> welcome(Join join) {
        List<Map<String, Object>> others = join.channel().players().stream()
                .filter(p -> p != join.player())
                .map(this::playerView)
                .toList();
        return Map.of("t", "welcome", "you", playerView(join.player()), "ch", join.channel().number,
                "players", others, "bags", bagsView(join.channel().bagIds(), scores(join.channel().bagIds())));
    }

    // ---- 행동 ----

    boolean attack(Channel channel, Player player, long companyId, Weapon weapon) {
        if (!channel.bagIds().contains(companyId) || !player.tryAttack(weapon, System.currentTimeMillis())) {
            return false;
        }
        attackAggregator.add(companyId, weapon.points);
        channel.recordAttack(new AttackEvent(player.id, companyId, weapon));
        meters.counter("arena.attacks", "weapon", weapon.code()).increment();
        return true;
    }

    void pick(Channel channel, long companyId) {
        if (!companyService.exists(companyId)) {
            return;
        }
        channel.pick(companyId);
        refreshBags(channel, globalTop());
    }

    // ---- 주기 방송 ----

    @Scheduled(fixedRate = 100)
    void tick() {
        Timer.Sample sample = Timer.start();
        for (Channel channel : channels.values()) {
            List<float[]> moved = new ArrayList<>();
            for (Player p : channel.players()) {
                if (p.consumeMoved()) {
                    moved.add(new float[] {p.id, round(p.x()), round(p.z()), round(p.rotation())});
                }
            }
            List<AttackEvent> attacks = channel.drainAttacks();
            if (moved.isEmpty() && attacks.isEmpty()) {
                continue;
            }
            List<Object[]> attackView = attacks.stream()
                    .map(a -> new Object[] {a.playerId(), a.companyId(), a.weapon().code()})
                    .toList();
            broadcast(channel, Map.of("t", "tick", "p", moved, "a", attackView), null);
        }
        sample.stop(tickTimer);
    }

    @Scheduled(fixedRate = 2000)
    void refreshAllBags() {
        if (channels.isEmpty()) {
            return;
        }
        try {
            List<Long> top = globalTop();
            channels.values().forEach(channel -> refreshBags(channel, top));
        } catch (DataAccessException e) {
            log.warn("bag refresh skipped: {}", e.getMessage());
        }
    }

    private void refreshBags(Channel channel, List<Long> top) {
        List<Long> ids = bagIdsFor(channel, top);
        channel.bagIds(ids);
        broadcast(channel, Map.of("t", "bags", "bags", bagsView(ids, scores(ids))), null);
    }

    private List<Long> globalTop() {
        List<Long> top = rageService.todayRanking(TOP_BAGS + 1).top().stream()
                .map(RageService.RankingResponse.Entry::companyId)
                .filter(id -> id != CompanyService.NO_COMPANY)
                .limit(TOP_BAGS)
                .toList();
        if (top.size() >= TOP_BAGS) {
            return top;
        }
        Set<Long> filled = new LinkedHashSet<>(top);
        companyService.firstIds(TOP_BAGS * 2).forEach(id -> {
            if (filled.size() < TOP_BAGS) {
                filled.add(id);
            }
        });
        return List.copyOf(filled);
    }

    private static List<Long> bagIdsFor(Channel channel, List<Long> top) {
        Set<Long> ids = new LinkedHashSet<>(top);
        ids.addAll(channel.picks());
        return List.copyOf(ids);
    }

    private Map<Long, Long> scores(List<Long> ids) {
        try {
            return rageService.todayScores(ids);
        } catch (DataAccessException e) {
            return Map.of();
        }
    }

    private List<Map<String, Object>> bagsView(List<Long> ids, Map<Long, Long> scores) {
        return ids.stream()
                .map(id -> Map.<String, Object>of("id", id, "name", companyService.nameOf(id),
                        "score", scores.getOrDefault(id, 0L)))
                .toList();
    }

    private Map<String, Object> playerView(Player p) {
        return Map.of("id", p.id, "name", p.name, "color", p.color,
                "x", round(p.x()), "z", round(p.z()), "r", round(p.rotation()));
    }

    /** 같은 문자열을 채널 전원에게 보낸다. 느린 소켓 하나가 틱 스레드를 붙잡지 않도록 가상 스레드에서 보낸다. */
    private void broadcast(Channel channel, Map<String, Object> message, Player except) {
        TextMessage text;
        try {
            text = new TextMessage(json.writeValueAsString(message));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        for (Player p : channel.players()) {
            if (p == except || !p.session.isOpen()) {
                continue;
            }
            broadcaster.execute(() -> send(p.session, text));
        }
    }

    void send(WebSocketSession session, Map<String, Object> message) {
        try {
            send(session, new TextMessage(json.writeValueAsString(message)));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private void send(WebSocketSession session, TextMessage text) {
        try {
            session.sendMessage(text);
            messagesSent.increment();
        } catch (IOException | IllegalStateException e) {
            log.debug("send failed to {}: {}", session.getId(), e.getMessage());
        }
    }

    private static float round(float v) {
        return Math.round(v * 100) / 100f;
    }

    record Join(Channel channel, Player player) {
    }
}
