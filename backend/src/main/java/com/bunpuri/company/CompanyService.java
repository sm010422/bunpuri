package com.bunpuri.company;

import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class CompanyService {

    public static final long NO_COMPANY = 0L;

    private final CompanyDirectory companyDirectory;

    public CompanyService(CompanyDirectory companyDirectory) {
        this.companyDirectory = companyDirectory;
    }

    public List<CompanyResponse> search(String query) {
        String q = query.strip();
        return companyDirectory.namesById().entrySet().stream()
                .filter(e -> e.getValue().contains(q))
                .limit(10)
                .map(e -> new CompanyResponse(e.getKey(), e.getValue()))
                .toList();
    }

    public boolean exists(long companyId) {
        return companyDirectory.namesById().containsKey(companyId);
    }

    public String nameOf(Long companyId) {
        if (companyId == null || companyId == NO_COMPANY) {
            return "회사 미지정";
        }
        return companyDirectory.namesById().getOrDefault(companyId, "알 수 없음");
    }

    public record CompanyResponse(Long id, String name) {
    }
}
