package com.bunpuri.config;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AsyncConfig {

    /** 외부 호출(위로 문구) 전용. 대기 시간이 대부분이라 가상 스레드로 둔다. */
    @Bean(destroyMethod = "close")
    public ExecutorService comfortExecutor() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }
}
