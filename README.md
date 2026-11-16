# bunpuri (분풀이)

취업 준비하며 쌓인 분노를 익명으로 풀고 가는 서비스. 샌드백을 치면 오늘 회사별 분노 랭킹에 반영되고, 한 줄 외침을 남기면 위로 문구가 돌아온다.

기능보다 **부하 상황에서의 실측**(커넥션 풀, 스레드 모델, 캐시, JVM)에 무게를 둔 프로젝트다.

## 기능
| API | 설명 |
|---|---|
| `POST /api/rage` `{companyId?}` | 샌드백 한 대. Redis Lua로 원자적으로 세고 5초마다 DB에 묶어서 반영 |
| `GET /api/rage/ranking` | 오늘 회사별 분노 랭킹 (Redis ZSet) |
| `POST /api/vents` `{companyId?, content}` | 한 줄 외침 (200자, 개인정보 자동 가림) + 위로 문구 |
| `GET /api/vents?companyId=&cursor=&size=` | 피드 (키셋 페이지네이션) |
| `POST /api/vents/{id}/report` (헤더 `X-Client-Id`) | 신고. 같은 사람 중복 신고는 한 번만, 3회면 숨김 |
| `GET /api/companies?q=` | 회사 검색 (Caffeine L1 캐시) |

## 실행
```bash
docker compose up -d                      # postgres, redis
./gradlew bootRun                          # 앱 (localhost:8080)
docker compose --profile monitoring up -d  # prometheus :9090, grafana :3000
k6 run k6/rage-spike.js                    # 부하 테스트
```
앱까지 컨테이너로: `docker compose --profile app up -d --build`

측정용 스위치(환경변수): `COMFORT_MODE=sync|async`, `VIRTUAL_THREADS=true|false`

## 스택
Java 21 · Spring Boot 3.5 · PostgreSQL 16 (Flyway) · Redis 7 (Lua) · Caffeine · Testcontainers · k6 · Prometheus/Grafana

## 운영 원칙 (명예훼손 방지)
- 회사는 **목록에서 고르는 태그**로만 붙는다. 랭킹은 숫자 집계만 보여준다.
- 외침은 익명이고 개인정보(전화번호·이메일·주민번호)를 자동으로 가린다.
- 특정인 실명·사실 적시형 비방은 신고 3회로 자동 숨김. 공개 전 금칙어 필터와 운영자 검토 기능을 추가한다.
- 시드 회사 이름(가나전자 등)은 가상의 이름이다.

## 배포 대상
홈서버 MacBook Air M2 8GB (K3s VM 3대와 메모리 공유, Tailscale). 목표는 동시 수백 명. 정적 프론트는 CDN으로 분리 예정.
