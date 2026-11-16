package com.bunpuri.arena;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * 같은 3D 마당을 공유하는 최대 {@link #CAPACITY}명의 묶음.
 * 위치는 채널 안에서만 주고받는다: 한 채널에 N명이면 틱마다 N×N 메시지가 나가므로 N을 제한해야 서버가 버틴다.
 */
final class Channel {

    static final int CAPACITY = 50;
    static final int MAX_PICKS = 3;

    final int number;
    private final Map<String, Player> players = new ConcurrentHashMap<>();
    private final Queue<AttackEvent> pendingAttacks = new ConcurrentLinkedQueue<>();
    private final Deque<Long> picks = new ArrayDeque<>();
    private volatile List<Long> bagIds = List.of();

    Channel(int number) {
        this.number = number;
    }

    boolean hasRoom() {
        return players.size() < CAPACITY;
    }

    void add(Player player) {
        players.put(player.session.getId(), player);
    }

    Player remove(String sessionId) {
        return players.remove(sessionId);
    }

    Player get(String sessionId) {
        return players.get(sessionId);
    }

    Collection<Player> players() {
        return players.values();
    }

    int size() {
        return players.size();
    }

    void recordAttack(AttackEvent event) {
        pendingAttacks.add(event);
    }

    List<AttackEvent> drainAttacks() {
        List<AttackEvent> drained = new ArrayList<>();
        AttackEvent e;
        while ((e = pendingAttacks.poll()) != null) {
            drained.add(e);
        }
        return drained;
    }

    /** 채널 사람이 지목한 회사. 최근 3개만 남는다. */
    synchronized void pick(long companyId) {
        picks.remove(companyId);
        picks.addFirst(companyId);
        while (picks.size() > MAX_PICKS) {
            picks.removeLast();
        }
    }

    synchronized List<Long> picks() {
        return List.copyOf(picks);
    }

    List<Long> bagIds() {
        return bagIds;
    }

    void bagIds(List<Long> ids) {
        this.bagIds = List.copyOf(ids);
    }

    record AttackEvent(int playerId, long companyId, Weapon weapon) {
    }
}
