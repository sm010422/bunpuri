package com.bunpuri.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PiiMaskerTest {

    @Test
    void masksPhoneEmailAndResidentNumber() {
        String masked = PiiMasker.mask("연락 010-1234-5678 / hr@gana.co.kr / 990101-1234567");

        assertThat(masked).isEqualTo("연락 [전화번호] / [이메일] / [주민번호]");
    }

    @Test
    void keepsOrdinaryText() {
        assertThat(PiiMasker.mask("서류 합격 후 3주째 연락 없음")).isEqualTo("서류 합격 후 3주째 연락 없음");
    }
}
