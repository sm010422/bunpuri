#!/usr/bin/env bash
# PreToolUse(Bash) 가드 — 로드맵 3 "hooks를 통한 권한 가드".
# Claude Code가 넘겨주는 JSON(stdin)에서 명령을 꺼내, 되돌리기 어려운 명령이면 exit 2로 막는다.
# exit 2의 stderr는 Claude에게 그대로 전달되어 왜 막혔는지 알 수 있다.
set -euo pipefail

input="$(cat)"
cmd="$(printf '%s' "$input" | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')"

block() {
  echo "차단됨: $1 — 필요하면 사용자가 직접 실행하세요. (.claude/hooks/guard-bash.sh)" >&2
  exit 2
}

case "$cmd" in
  *"rm -rf /"*|*"rm -rf ~"*|*"rm -rf ."*)       block "광범위한 rm -rf" ;;
  *"git push"*"--force"*|*"git push"*" -f"*)     block "force push" ;;
  *"git reset --hard"*)                           block "git reset --hard" ;;
  *"docker compose down -v"*|*"docker volume rm"*|*"docker system prune"*) block "Docker 볼륨(DB 데이터) 삭제" ;;
  *"FLUSHALL"*|*"FLUSHDB"*|*"flushall"*|*"flushdb"*) block "Redis 전체 삭제" ;;
esac

if printf '%s' "$cmd" | grep -qiE 'drop[[:space:]]+(table|database|schema)|truncate[[:space:]]+table'; then
  block "DB 스키마·데이터 삭제 SQL"
fi

# 홈서버 접속은 읽기 확인만 허용하고, 변경 명령은 사람이 직접 한다.
if printf '%s' "$cmd" | grep -qE '(^|[[:space:]])ssh[[:space:]]' && printf '%s' "$cmd" | grep -qiE 'sudo|systemctl (stop|restart)|kill|rm '; then
  block "원격 서버에서의 변경 명령"
fi

exit 0
