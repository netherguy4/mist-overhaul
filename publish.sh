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

ver=$(grep -m1 '^// @version' mist-overhaul.user.js | awk '{print $3}')

# Версию проставляет build.py, и коммит мимо этого скрипта уезжает со старой —
# Tampermonkey тогда обновления не видит. Поэтому дожидаемся, пока адрес из
# @updateURL действительно отдаст новую версию.
for i in $(seq 24); do
  curl -sS "https://raw.githubusercontent.com/netherguy4/mist-overhaul/main/mist-overhaul.user.js" \
    | grep -q "$ver" && {
    echo "опубликовано $ver, raw отдаёт её через $((i * 5)) с"
    exit 0
  }
  sleep 5
done
echo "опубликовано $ver, но raw ещё отдаёт старое — Tampermonkey увидит позже"
