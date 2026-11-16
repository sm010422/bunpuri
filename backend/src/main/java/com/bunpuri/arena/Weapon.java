package com.bunpuri.arena;

import java.util.Locale;

/** 무기별 분노 점수와 최소 간격. 서버는 클라이언트 쿨다운보다 조금 느슨하게(80%) 검사해 네트워크 지터를 허용한다. */
public enum Weapon {
    PUNCH(1, 250),
    GUN(1, 120),
    MISSILE(10, 3000);

    final int points;
    final long minIntervalMs;

    Weapon(int points, long cooldownMs) {
        this.points = points;
        this.minIntervalMs = cooldownMs * 8 / 10;
    }

    static Weapon parse(String value) {
        return value == null ? null : switch (value.toLowerCase(Locale.ROOT)) {
            case "punch" -> PUNCH;
            case "gun" -> GUN;
            case "missile" -> MISSILE;
            default -> null;
        };
    }

    String code() {
        return name().toLowerCase(Locale.ROOT);
    }
}
