// 외침 쓰기 + 피드 읽기 혼합. COMFORT_MODE=sync / async로 앱을 띄워 두 번 돌리고 비교한다.
// 실행: k6 run -e BASE_URL=http://localhost:8080 k6/vent-mixed.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  if (Math.random() < 0.2) {
    const body = { companyId: 1 + Math.floor(Math.random() * 10), content: `서류 광탈 ${__VU}-${__ITER}` };
    const res = http.post(`${BASE_URL}/api/vents`, JSON.stringify(body), { headers: JSON_HEADERS, tags: { name: 'create' } });
    check(res, { 'create 201': (r) => r.status === 201 });
  } else {
    const companyId = Math.random() < 0.5 ? `&companyId=${1 + Math.floor(Math.random() * 10)}` : '';
    const res = http.get(`${BASE_URL}/api/vents?size=20${companyId}`, { tags: { name: 'feed' } });
    check(res, { 'feed 200': (r) => r.status === 200 });
  }
  sleep(0.5 + Math.random());
}
