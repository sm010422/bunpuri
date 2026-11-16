package com.bunpuri.vent;

import com.bunpuri.comfort.ComfortService;
import com.bunpuri.common.PiiMasker;
import com.bunpuri.company.CompanyService;
import com.bunpuri.config.BunpuriProperties;
import com.bunpuri.config.BunpuriProperties.Comfort.Mode;
import java.time.Duration;
import java.util.List;
import java.util.NoSuchElementException;
import org.springframework.data.domain.Limit;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class VentService {

    private static final Duration REPORTER_SET_TTL = Duration.ofDays(30);

    private final VentRepository ventRepository;
    private final CompanyService companyService;
    private final ComfortService comfortService;
    private final StringRedisTemplate redis;
    private final TransactionTemplate tx;
    private final Mode comfortMode;
    private final int hideThreshold;

    public VentService(VentRepository ventRepository, CompanyService companyService, ComfortService comfortService,
                       StringRedisTemplate redis, TransactionTemplate tx, BunpuriProperties properties) {
        this.ventRepository = ventRepository;
        this.companyService = companyService;
        this.comfortService = comfortService;
        this.redis = redis;
        this.tx = tx;
        this.comfortMode = properties.comfort().mode();
        this.hideThreshold = properties.vent().hideReportThreshold();
    }

    /**
     * 외침 저장. SYNC는 위로 문구까지 기다렸다 응답하고, ASYNC는 저장 직후 응답한 뒤 문구를 나중에 채운다.
     * 두 모드의 응답 시간·처리량 차이를 k6로 비교한다 (docs/roadmap-mapping.md #4).
     */
    public VentResponse create(Long companyId, String content) {
        if (companyId != null && !companyService.exists(companyId)) {
            throw new IllegalArgumentException("unknown company");
        }
        String masked = PiiMasker.mask(content.strip());
        if (comfortMode == Mode.SYNC) {
            Vent vent = new Vent(companyId, masked);
            vent.comfortWith(comfortService.request(masked).join());
            return toResponse(ventRepository.save(vent));
        }
        Vent saved = ventRepository.save(new Vent(companyId, masked));
        comfortService.request(masked)
                .thenAccept(comfort -> tx.executeWithoutResult(s -> ventRepository.updateComfort(saved.getId(), comfort)));
        return toResponse(saved);
    }

    public List<VentResponse> feed(Long companyId, Long cursor, int size) {
        long before = cursor == null ? Long.MAX_VALUE : cursor;
        Limit limit = Limit.of(Math.clamp(size, 1, 50));
        List<Vent> vents = companyId == null
                ? ventRepository.findByHiddenFalseAndIdLessThanOrderByIdDesc(before, limit)
                : ventRepository.findByCompanyIdAndHiddenFalseAndIdLessThanOrderByIdDesc(companyId, before, limit);
        return vents.stream().map(this::toResponse).toList();
    }

    public VentResponse get(long id) {
        return ventRepository.findById(id)
                .filter(v -> !v.isHidden())
                .map(this::toResponse)
                .orElseThrow(() -> new NoSuchElementException("vent not found"));
    }

    /** 같은 사람이 여러 번 신고해도 한 번만 센다. 신고 수 증가와 숨김 판정은 DB 한 문장으로 처리해 갱신 유실을 막는다. */
    public void report(long id, String clientId) {
        String key = "vent:reporters:" + id;
        Long added = redis.opsForSet().add(key, clientId);
        redis.expire(key, REPORTER_SET_TTL);
        if (added == null || added == 0) {
            return;
        }
        int updated = tx.execute(s -> ventRepository.incrementReport(id, hideThreshold));
        if (updated == 0) {
            throw new NoSuchElementException("vent not found");
        }
    }

    private VentResponse toResponse(Vent v) {
        return new VentResponse(v.getId(), v.getCompanyId(), companyService.nameOf(v.getCompanyId()),
                v.getContent(), v.getComfort(), v.getCreatedAt());
    }
}
