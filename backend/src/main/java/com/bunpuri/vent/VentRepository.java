package com.bunpuri.vent;

import java.util.List;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface VentRepository extends JpaRepository<Vent, Long> {

    /** 키셋 페이지네이션: OFFSET 대신 마지막 id 기준으로 다음 페이지를 읽는다. */
    List<Vent> findByHiddenFalseAndIdLessThanOrderByIdDesc(long cursor, Limit limit);

    /** 회사별 피드. 전용 인덱스가 아직 없다 (V1 주석, docs/roadmap-mapping.md #1). */
    List<Vent> findByCompanyIdAndHiddenFalseAndIdLessThanOrderByIdDesc(long companyId, long cursor, Limit limit);

    @Modifying
    @Query("update Vent v set v.comfort = :comfort where v.id = :id")
    int updateComfort(long id, String comfort);

    @Modifying
    @Query("""
            update Vent v set v.reportCount = v.reportCount + 1,
                              v.hidden = case when v.reportCount + 1 >= :hideThreshold then true else v.hidden end
            where v.id = :id
            """)
    int incrementReport(long id, int hideThreshold);
}
