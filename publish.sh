#!/bin/bash
# Собрать, закоммитить, запушить.
#
# Кеш инвалидируется сам: в имени файла лежит хеш содержимого, так что
# изменившийся портрет приезжает под новым адресом мимо любого кеша, а
# нетронутый сохраняет прежний и не перекачивается.
set -e
cd "$(dirname "$0")"

.venv/bin/python build.py
git add -A
git diff --cached --quiet && { echo "нечего публиковать"; exit 0; }
git commit -q -m "${1:-обновление портретов}"
git push

echo "опубликовано $(grep -m1 '^// @version' mist-overhaul.user.js | awk '{print $3}')"
