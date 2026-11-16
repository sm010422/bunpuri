package com.bunpuri.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.bunpuri.IntegrationTestBase;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@AutoConfigureMockMvc
class RateLimitIT extends IntegrationTestBase {

    @Autowired
    MockMvc mvc;

    @Test
    void ventIsRejectedAfterFivePerMinuteForSameClient() throws Exception {
        String clientId = UUID.randomUUID().toString();
        for (int i = 0; i < 5; i++) {
            mvc.perform(vent(clientId)).andExpect(status().isCreated());
        }

        mvc.perform(vent(clientId))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "60"));

        mvc.perform(vent(UUID.randomUUID().toString())).andExpect(status().isCreated());
    }

    private static org.springframework.test.web.servlet.RequestBuilder vent(String clientId) {
        return post("/api/vents")
                .header("X-Client-Id", clientId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"면접 결과 안내가 없어요\"}");
    }
}
