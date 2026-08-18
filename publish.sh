#!/bin/bash
# Собрать, закоммитить, запушить.
#
# Кеш инвалидируется сам: в имени файла лежит хеш содержимого, так что
# изменившийся портрет приезжает под новым адресом мимо любого кеша, а
# нетронутый сохраняет прежний и не перекачивается.
set -e
cd "$(dirname "$0")"

.venv/bin/python build.py
ver=$(grep -m1 '^// @version' mist-overhaul.user.js | awk '{print $3}')
git add -A
git diff --cached --quiet && { echo "нечего публиковать"; exit 0; }
git commit -q -m "${1:-обновление портретов}"

# Обновление раздаёт Codeberg: raw.githubusercontent открывается не у всех в
# РФ, а jsDelivr держал бы ветку 12 часов (purge на это не годится, проверяли).
# .mirror — отдельный репозиторий на один файл, заведён вручную один раз.
# Пушим до GitHub: не уедет зеркало — не уедет и версия, которая на него шлёт.
cp mist-overhaul.user.js .mirror/
git -C .mirror diff --quiet || git -C .mirror commit -qam "$ver"
git -C .mirror push -q origin main

git push

# Версию проставляет build.py, и коммит мимо этого скрипта уезжает со старой —
# Tampermonkey тогда обновления не видит. Поэтому дожидаемся, пока адрес из
# @updateURL действительно отдаст новую версию.
raw=https://codeberg.org/netherguy/mist-overhaul-script/raw/branch/main/mist-overhaul.user.js
for i in $(seq 24); do
  curl -sS "$raw" | grep -q "$ver" && {
    echo "опубликовано $ver, Codeberg отдаёт её через $((i * 5)) с"
    exit 0
  }
  sleep 5
done
echo "опубликовано $ver, но Codeberg ещё отдаёт старое — Tampermonkey увидит позже"
