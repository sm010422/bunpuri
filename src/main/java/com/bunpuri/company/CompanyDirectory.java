package com.bunpuri.company;

import com.bunpuri.config.CacheConfig;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Component;

/**
 * 회사 id → 이름 전체 목록. 자동완성·랭킹·외침 응답이 모두 이 목록을 쓰므로 요청마다 DB에 가지 않도록 L1에 둔다.
 * 같은 클래스 안에서 부르면 @Cacheable 프록시를 거치지 않으므로 별도 빈으로 분리했다.
 */
@Component
public class CompanyDirectory {

    private final CompanyRepository companyRepository;

    public CompanyDirectory(CompanyRepository companyRepository) {
        this.companyRepository = companyRepository;
    }

    @Cacheable(CacheConfig.COMPANIES)
    public Map<Long, String> namesById() {
        return companyRepository.findAll().stream()
                .collect(Collectors.toUnmodifiableMap(Company::getId, Company::getName));
    }
}
