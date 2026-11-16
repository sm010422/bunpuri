package com.bunpuri.vent;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import java.time.OffsetDateTime;

@Entity
public class Vent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long companyId;

    private String content;

    private String comfort;

    private int reportCount;

    private boolean hidden;

    @Column(insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    protected Vent() {
    }

    public Vent(Long companyId, String content) {
        this.companyId = companyId;
        this.content = content;
    }

    public void comfortWith(String comfort) {
        this.comfort = comfort;
    }

    public Long getId() {
        return id;
    }

    public Long getCompanyId() {
        return companyId;
    }

    public String getContent() {
        return content;
    }

    public String getComfort() {
        return comfort;
    }

    public boolean isHidden() {
        return hidden;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
