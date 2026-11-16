package com.bunpuri.arena;

import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

/** 로그인 없이 들어온 사람에게 붙여 주는 이름. */
final class Nicknames {

    private static final List<String> MOODS = List.of(
            "광탈한", "버티는", "지친", "열받은", "멘탈 나간", "다시 쓰는", "서류 붙은", "면접 본", "연락 기다리는", "꿋꿋한");
    private static final List<String> THINGS = List.of(
            "고구마", "감자", "자소서", "포트폴리오", "취준생", "이력서", "만두", "호빵", "두부", "떡볶이");
    private static final List<String> COLORS = List.of(
            "#e4572e", "#f3a712", "#29335c", "#669bbc", "#a8c686", "#c1666b", "#7b2cbf", "#2a9d8f");

    private Nicknames() {
    }

    static String name() {
        ThreadLocalRandom r = ThreadLocalRandom.current();
        return MOODS.get(r.nextInt(MOODS.size())) + " " + THINGS.get(r.nextInt(THINGS.size()));
    }

    static String color() {
        return COLORS.get(ThreadLocalRandom.current().nextInt(COLORS.size()));
    }
}
