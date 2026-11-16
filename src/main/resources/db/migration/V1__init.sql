CREATE TABLE company (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE
);

-- 회사별·일별 분노 횟수. Redis에서 모은 증분을 주기적으로 더한다. company_id = 0은 "회사 미지정".
CREATE TABLE rage_count (
    company_id  BIGINT NOT NULL,
    day         DATE   NOT NULL,
    count       BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (company_id, day)
);

CREATE TABLE vent (
    id            BIGSERIAL PRIMARY KEY,
    company_id    BIGINT REFERENCES company (id),
    content       VARCHAR(200) NOT NULL,
    comfort       VARCHAR(200),
    report_count  INT     NOT NULL DEFAULT 0,
    hidden        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 로드맵 1-EXPLAIN: 회사별 피드 조회(company_id + hidden + id 정렬)용 인덱스는 일부러 두지 않았다.
-- 데이터를 쌓은 뒤 EXPLAIN ANALYZE로 전후를 비교하고 V2에서 추가한다. (docs/roadmap-mapping.md #1)

INSERT INTO company (name) VALUES
    ('가나전자'), ('다라제약'), ('마바건설'), ('사아물산'), ('자차금융'),
    ('카타소프트'), ('파하모빌리티'), ('한빛유통'), ('누리게임즈'), ('바다식품');
