#!/bin/bash
# Собрать, запушить и сбросить кеш jsDelivr, иначе обновление доедет до игроков
# в течение 12 часов вместо минуты.
set -e
cd "$(dirname "$0")"

.venv/bin/python build.py
git add -A
git diff --cached --quiet && { echo "нечего публиковать"; exit 0; }
git commit -m "${1:-обновление портретов}"
git push

echo "сброс кеша jsDelivr:"
grep -hoE 'https://cdn\.jsdelivr\.net/\S+' mist-overhaul.user.js | sort -u |
  sed 's|https://cdn\.jsdelivr\.net|https://purge.jsdelivr.net|' |
  while read -r u; do
    printf '  %-40s %s\n' "${u##*/}" "$(curl -s -m 60 "$u" | grep -o '"status": *"[a-z]*"' | head -1)"
  done
