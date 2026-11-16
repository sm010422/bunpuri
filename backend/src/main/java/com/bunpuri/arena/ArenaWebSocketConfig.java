package com.bunpuri.arena;

import com.bunpuri.config.BunpuriProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
class ArenaWebSocketConfig implements WebSocketConfigurer {

    private final ArenaHandler arenaHandler;
    private final BunpuriProperties properties;

    ArenaWebSocketConfig(ArenaHandler arenaHandler, BunpuriProperties properties) {
        this.arenaHandler = arenaHandler;
        this.properties = properties;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // 브라우저는 Origin을 보내므로 CORS와 같은 허용 목록으로 다른 사이트의 접속을 막는다.
        registry.addHandler(arenaHandler, "/ws/arena")
                .setAllowedOrigins(properties.cors().allowedOrigins().toArray(String[]::new));
    }
}
