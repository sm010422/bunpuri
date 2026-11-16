// 분노 버튼 연타 시나리오. 한계점(p95가 꺾이는 VU)을 찾는 용도.
// 실행: k6 run -e BASE_URL=http://localhost:8080 k6/rage-spike.js --summary-export k6/results/rage-$(date +%s).json
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '1m', target: 500 },
        { duration: '1m', target: 1000 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:hit}': ['p(95)<200'],
  },
};

export default function () {
  const companyId = Math.random() < 0.3 ? null : 1 + Math.floor(Math.random() * 10);
  const res = http.post(`${BASE_URL}/api/rage`, JSON.stringify({ companyId }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'hit' },
  });
  check(res, { 'hit 200': (r) => r.status === 200 });

  if (Math.random() < 0.1) {
    http.get(`${BASE_URL}/api/rage/ranking`, { tags: { name: 'ranking' } });
  }
  sleep(0.2 + Math.random() * 0.3);
}
