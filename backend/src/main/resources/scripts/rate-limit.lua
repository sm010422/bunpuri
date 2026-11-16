-- 고정 윈도우 카운터. 윈도우의 첫 요청에서만 만료를 건다.
-- KEYS[1] = ratelimit:{정책}:{클라이언트}:{윈도우 번호}
-- ARGV[1] = 윈도우 길이(초)
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
