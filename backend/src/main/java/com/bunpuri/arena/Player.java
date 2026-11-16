package com.bunpuri.arena;

import java.util.EnumMap;
import java.util.Map;
import org.springframework.web.socket.WebSocketSession;

/** 채널에 접속한 한 사람. 위치는 소켓 스레드가 쓰고 틱 스레드가 읽으므로 volatile로 둔다. */
final class Player {

    static final float ARENA_RADIUS = 22f;

    final int id;
    final String name;
    final String color;
    final WebSocketSession session;

    private volatile float x;
    private volatile float z;
    private volatile float rotation;
    private volatile boolean moved = true;
    private final Map<Weapon, Long> lastAttackAt = new EnumMap<>(Weapon.class);

    Player(int id, String name, String color, WebSocketSession session) {
        this.id = id;
        this.name = name;
        this.color = color;
        this.session = session;
        double angle = Math.random() * Math.PI * 2;
        this.x = (float) (Math.cos(angle) * 12);
        this.z = (float) (Math.sin(angle) * 12);
    }

    void moveTo(float x, float z, float rotation) {
        if (!Float.isFinite(x) || !Float.isFinite(z) || !Float.isFinite(rotation)) {
            return;
        }
        float distance = (float) Math.hypot(x, z);
        float scale = distance > ARENA_RADIUS ? ARENA_RADIUS / distance : 1f;
        this.x = x * scale;
        this.z = z * scale;
        this.rotation = rotation;
        this.moved = true;
    }

    /** 무기별 최소 간격을 지켰으면 기록하고 true. 한 사람의 메시지는 한 소켓 스레드에서만 처리된다. */
    boolean tryAttack(Weapon weapon, long now) {
        Long last = lastAttackAt.get(weapon);
        if (last != null && now - last < weapon.minIntervalMs) {
            return false;
        }
        lastAttackAt.put(weapon, now);
        return true;
    }

    /** 지난 틱 이후 움직였으면 true를 돌려주고 표시를 지운다. */
    boolean consumeMoved() {
        if (!moved) {
            return false;
        }
        moved = false;
        return true;
    }

    float x() {
        return x;
    }

    float z() {
        return z;
    }

    float rotation() {
        return rotation;
    }
}
