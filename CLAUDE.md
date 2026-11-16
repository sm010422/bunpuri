# bunpuri

- 구조: `backend/`(Spring, Gradle 명령은 이 안에서), `frontend/`(Vite+React), `k8s/`(ArgoCD 동기화 대상), `k6/`.
- 목적: 백엔드 로드맵 갭을 실측으로 채우는 프로젝트. 작업 전 `docs/roadmap-mapping.md`에서 어느 항목인지 확인하고, 끝나면 그 표의 "지금 상태"를 갱신한다. (`docs/`는 git 제외, 로컬 전용)
- 성능 관련 변경은 반드시 **변경 전 k6 측정 → 변경 → 같은 스크립트로 재측정** 순서. 결과 JSON은 `k6/results/`(git 제외)에 두고 수치는 `docs/measurements/`에 기록한다. 부하 테스트 때는 `RATE_LIMIT_ENABLED=false`.
- 측정 수치는 실행한 환경(로컬/홈서버, VU, 시간)과 함께 적는다. 측정하지 않은 수치를 문서에 쓰지 않는다.
- 스키마 변경은 Flyway 새 버전 파일로만 (V1 수정 금지).
- 테스트: `cd backend && ./gradlew test` (Docker 없으면 통합 테스트는 자동 건너뜀).
  colima 사용 시 Testcontainers가 소켓을 못 찾아 건너뛰므로 먼저:
  `export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`
- 배포: k8s 리소스는 전부 worker2 고정(메모리 여유가 거기뿐). Service 이름과 겹치는 환경변수 자동 주입 때문에 `enableServiceLinks: false` 유지.
