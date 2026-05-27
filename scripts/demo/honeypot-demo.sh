#!/usr/bin/env bash
# Scripted demo for the asciinema recording.
#
# Recorded as:
#   asciinema rec --cols 96 --rows 28 --command \
#     "./scripts/demo/honeypot-demo.sh" assets/honeypot-demo.cast
#
# Then converted to GIF via:
#   agg --theme github-dark --font-size 14 --speed 1.4 \
#     assets/honeypot-demo.cast assets/honeypot-demo.gif

set -u

# Pretend a human is typing. Per-character delay tuned to feel
# unhurried but not sluggish; faster than slowMo in Playwright demos
# because terminal output is denser.
say() {
  local s="$1"
  for ((i = 0; i < ${#s}; i++)); do
    printf '%s' "${s:$i:1}"
    sleep 0.025
  done
  printf '\n'
}

prompt() { printf '\033[1;36m$\033[0m '; }
comment() { printf '\033[2m%s\033[0m\n' "$1"; }
pause() { sleep "${1:-1.2}"; }

clear

comment "# Halberd: deliberately-vulnerable honeypot wrapped by the policy proxy"
pause 1.5

prompt
say 'echo $REQ | bin/halberd-stdio --policy policies/halberd-honeypot.yaml \\'
say '                              --audit  /tmp/audit.jsonl \\'
say '                              -- bin/halberd-honeypot'
pause 0.4

comment "# request:  DROP TABLE users"
REQ='{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"execute_sql","arguments":{"query":"DROP TABLE users"}}}'
echo "$REQ" | bin/halberd-stdio \
  --policy policies/halberd-honeypot.yaml \
  --audit  /tmp/audit.jsonl \
  -- bin/halberd-honeypot 2>/dev/null

pause 1.8

printf '\n'
comment "# A second request — list_users — returns a response carrying fake"
comment "# AWS / GitHub / RSA secrets. Halberd amends it before delivery."
pause 1.2

prompt
say 'echo $REQ | bin/halberd-stdio ...'
pause 0.4

REQ='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_users","arguments":{}}}'
echo "$REQ" | bin/halberd-stdio \
  --policy policies/halberd-honeypot.yaml \
  --audit  /tmp/audit.jsonl \
  -- bin/halberd-honeypot 2>/dev/null

pause 1.8

printf '\n'
comment "# Every decision lands in the audit log:"
pause 0.6
prompt
say 'cat /tmp/audit.jsonl'
pause 0.3
cat /tmp/audit.jsonl | head -3
pause 2.5

printf '\n'
comment "# DROP TABLE refused. Secrets redacted. Audit trail intact."
pause 1.5
