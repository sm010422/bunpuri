package com.bunpuri.arena;

import com.bunpuri.arena.Arena.Join;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator.OverflowStrategy;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * 클라이언트 메시지:
 * <pre>
 * {"t":"move","x":1.2,"z":-3.4,"r":0.5}   위치·방향 (클라이언트가 초당 최대 10번)
 * {"t":"attack","c":3,"w":"gun"}          샌드백 공격 (punch | gun | missile)
 * {"t":"pick","c":7}                      채널에 이 회사 샌드백 세우기
 * </pre>
 */
@Component
class ArenaHandler extends TextWebSocketHandler {

    private static final String JOIN = "arena.join";
    /** 이 이상 밀린 소켓은 오래된 메시지부터 버린다. 실시간 위치는 최신 것만 의미가 있다. */
    private static final int SEND_BUFFER_BYTES = 128 * 1024;
    private static final int SEND_TIME_LIMIT_MS = 2000;
    private static final int MAX_MESSAGE_CHARS = 512;

    private final Arena arena;
    private final ObjectMapper json;

    ArenaHandler(Arena arena, ObjectMapper json) {
        this.arena = arena;
        this.json = json;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        WebSocketSession safe = new ConcurrentWebSocketSessionDecorator(
                session, SEND_TIME_LIMIT_MS, SEND_BUFFER_BYTES, OverflowStrategy.DROP);
        Join join = arena.join(safe);
        session.getAttributes().put(JOIN, join);
        arena.send(safe, arena.welcome(join));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        Join join = (Join) session.getAttributes().get(JOIN);
        if (join == null || message.getPayloadLength() > MAX_MESSAGE_CHARS) {
            return;
        }
        JsonNode node = json.readTree(message.getPayload());
        switch (node.path("t").asText()) {
            case "move" -> join.player().moveTo(
                    (float) node.path("x").asDouble(Double.NaN),
                    (float) node.path("z").asDouble(Double.NaN),
                    (float) node.path("r").asDouble(0));
            case "attack" -> {
                Weapon weapon = Weapon.parse(node.path("w").asText(null));
                if (weapon != null && node.path("c").canConvertToLong()) {
                    arena.attack(join.channel(), join.player(), node.path("c").asLong(), weapon);
                }
            }
            case "pick" -> {
                if (node.path("c").canConvertToLong()) {
                    arena.pick(join.channel(), node.path("c").asLong());
                }
            }
            default -> {
                // 모르는 메시지는 무시한다
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        Join join = (Join) session.getAttributes().remove(JOIN);
        if (join != null) {
            arena.leave(join.channel(), session.getId());
        }
    }
}
