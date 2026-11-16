-- 분노 N점을 원자적으로 반영한다. (HTTP 샌드백은 1점, 3D 공격은 무기별 점수를 모아서 한 번에)
-- KEYS[1] = rage:pending:{yyyyMMdd} (DB 반영 대기 증분 Hash)
-- KEYS[2] = rage:rank:{yyyyMMdd} (오늘 랭킹 ZSet)
-- KEYS[3] = rage:total:{yyyyMMdd} (오늘 전체 점수)
-- ARGV[1] = companyId, ARGV[2] = 날짜 키 TTL(초), ARGV[3] = 더할 점수
local amount = tonumber(ARGV[3])
redis.call('HINCRBY', KEYS[1], ARGV[1], amount)
redis.call('ZINCRBY', KEYS[2], amount, ARGV[1])
redis.call('EXPIRE', KEYS[2], ARGV[2])
local total = redis.call('INCRBY', KEYS[3], amount)
redis.call('EXPIRE', KEYS[3], ARGV[2])
return total
