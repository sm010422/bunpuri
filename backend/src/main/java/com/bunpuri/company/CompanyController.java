package com.bunpuri.company;

import com.bunpuri.company.CompanyService.CompanyResponse;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/companies")
public class CompanyController {

    private final CompanyService companyService;

    public CompanyController(CompanyService companyService) {
        this.companyService = companyService;
    }

    @GetMapping
    public List<CompanyResponse> search(@RequestParam("q") String query) {
        if (query.strip().length() < 1) {
            return List.of();
        }
        return companyService.search(query);
    }
}
