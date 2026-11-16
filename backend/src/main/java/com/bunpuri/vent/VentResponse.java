package com.bunpuri.vent;

import java.time.OffsetDateTime;

public record VentResponse(Long id, Long companyId, String companyName, String content, String comfort,
                           OffsetDateTime createdAt) {
}
