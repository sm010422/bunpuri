package com.bunpuri.vent;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/vents")
public class VentController {

    private final VentService ventService;

    public VentController(VentService ventService) {
        this.ventService = ventService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public VentResponse create(@Valid @RequestBody CreateRequest request) {
        return ventService.create(request.companyId(), request.content());
    }

    @GetMapping
    public List<VentResponse> feed(@RequestParam(required = false) Long companyId,
                                   @RequestParam(required = false) Long cursor,
                                   @RequestParam(defaultValue = "20") int size) {
        return ventService.feed(companyId, cursor, size);
    }

    @GetMapping("/{id}")
    public VentResponse get(@PathVariable long id) {
        return ventService.get(id);
    }

    /** X-Client-Id: 프론트가 처음 접속 때 만들어 저장해 두는 익명 UUID. */
    @PostMapping("/{id}/report")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void report(@PathVariable long id, @RequestHeader("X-Client-Id") String clientId) {
        ventService.report(id, clientId);
    }

    public record CreateRequest(Long companyId, @NotBlank @Size(max = 200) String content) {
    }
}
