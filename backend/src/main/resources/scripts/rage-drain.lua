-- 대기 증분을 꺼내면서 비운다. 읽기와 삭제 사이에 들어온 증분이 사라지지 않도록 한 번에 실행한다.
-- KEYS[1] = rage:pending:{yyyyMMdd}
local entries = redis.call('HGETALL', KEYS[1])
redis.call('DEL', KEYS[1])
return entries
