package com.bunpuri.common;

import java.util.regex.Pattern;

/** 익명 외침에 개인정보가 그대로 노출되지 않도록 가린다. */
public final class PiiMasker {

    private static final Pattern RRN = Pattern.compile("\\d{6}\\s*-\\s*[1-4]\\d{6}");
    private static final Pattern PHONE = Pattern.compile("01[016789][\\s-]?\\d{3,4}[\\s-]?\\d{4}");
    private static final Pattern EMAIL = Pattern.compile("[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+");

    private PiiMasker() {
    }

    public static String mask(String text) {
        String masked = RRN.matcher(text).replaceAll("[주민번호]");
        masked = PHONE.matcher(masked).replaceAll("[전화번호]");
        return EMAIL.matcher(masked).replaceAll("[이메일]");
    }
}
