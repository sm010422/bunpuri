-- 분노 1회를 원자적으로 반영한다.
-- KEYS[1] = rage:pending:{yyyyMMdd} (DB 반영 대기 증분 Hash)
-- KEYS[2] = rage:rank:{yyyyMMdd} (오늘 랭킹 ZSet)
-- KEYS[3] = rage:total:{yyyyMMdd} (오늘 전체 횟수)
-- ARGV[1] = companyId, ARGV[2] = 랭킹 키 TTL(초)
redis.call('HINCRBY', KEYS[1], ARGV[1], 1)
redis.call('ZINCRBY', KEYS[2], 1, ARGV[1])
redis.call('EXPIRE', KEYS[2], ARGV[2])
local total = redis.call('INCR', KEYS[3])
redis.call('EXPIRE', KEYS[3], ARGV[2])
return total
