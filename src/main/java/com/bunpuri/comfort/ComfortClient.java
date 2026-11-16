package com.bunpuri.comfort;

/** 외침 한 줄에 대한 위로 문구를 만들어 주는 외부 서비스. 지금은 스텁, 이후 LLM API 어댑터로 교체한다. */
public interface ComfortClient {

    String comfort(String ventContent);
}
