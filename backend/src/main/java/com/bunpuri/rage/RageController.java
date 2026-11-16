package com.bunpuri.rage;

import com.bunpuri.rage.RageService.RankingResponse;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rage")
public class RageController {

    private final RageService rageService;

    public RageController(RageService rageService) {
        this.rageService = rageService;
    }

    /** 샌드백 한 대. companyId가 없으면 "회사 미지정"으로 센다. */
    @PostMapping
    public Map<String, Long> hit(@RequestBody(required = false) HitRequest request) {
        long todayTotal = rageService.hit(request == null ? null : request.companyId());
        return Map.of("todayTotal", todayTotal);
    }

    @GetMapping("/ranking")
    public RankingResponse ranking(@RequestParam(defaultValue = "10") int size) {
        return rageService.todayRanking(Math.clamp(size, 1, 50));
    }

    public record HitRequest(Long companyId) {
    }
}
