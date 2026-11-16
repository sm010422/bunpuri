package com.bunpuri.arena;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.bunpuri.IntegrationTestBase;
import com.bunpuri.rage.RageService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ArenaIT extends IntegrationTestBase {

    @LocalServerPort
    int port;

    @Autowired
    RageService rageService;

    final ObjectMapper json = new ObjectMapper();

    @Test
    void attackIsBroadcastToChannelAndCountedInRanking() throws Exception {
        Client alice = connect();
        JsonNode welcome = alice.next("welcome");
        long bagId = welcome.path("bags").get(0).path("id").asLong();
        long before = rageService.todayScores(List.of(bagId)).get(bagId);

        Client bob = connect();
        JsonNode bobWelcome = bob.next("welcome");
        assertThat(bobWelcome.path("ch").asInt()).isEqualTo(welcome.path("ch").asInt());
        assertThat(alice.next("join").path("p").path("id").asInt())
                .isEqualTo(bobWelcome.path("you").path("id").asInt());

        alice.send("{\"t\":\"attack\",\"c\":" + bagId + ",\"w\":\"missile\"}");
        alice.send("{\"t\":\"attack\",\"c\":" + bagId + ",\"w\":\"missile\"}"); // 쿨다운에 걸려 무시돼야 함

        JsonNode tick = bob.next("tick");
        assertThat(tick.path("a")).hasSize(1);
        assertThat(tick.path("a").get(0).get(2).asText()).isEqualTo("missile");
        await().atMost(Duration.ofSeconds(3)).untilAsserted(() ->
                assertThat(rageService.todayScores(List.of(bagId)).get(bagId)).isEqualTo(before + 10));
    }

    private Client connect() throws Exception {
        Client client = new Client();
        client.session = new StandardWebSocketClient()
                .execute(client, "ws://localhost:" + port + "/ws/arena")
                .get(5, TimeUnit.SECONDS);
        return client;
    }

    class Client extends TextWebSocketHandler {
        final BlockingQueue<JsonNode> inbox = new LinkedBlockingQueue<>();
        WebSocketSession session;

        @Override
        protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
            inbox.add(json.readTree(message.getPayload()));
        }

        void send(String payload) throws Exception {
            session.sendMessage(new TextMessage(payload));
        }

        /** 원하는 종류의 메시지가 올 때까지 다른 메시지는 건너뛴다. */
        JsonNode next(String type) throws InterruptedException {
            long deadline = System.currentTimeMillis() + 5000;
            while (System.currentTimeMillis() < deadline) {
                JsonNode node = inbox.poll(deadline - System.currentTimeMillis(), TimeUnit.MILLISECONDS);
                if (node != null && type.equals(node.path("t").asText())) {
                    return node;
                }
            }
            throw new AssertionError("no '" + type + "' message within 5s");
        }
    }
}
