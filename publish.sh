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
url=gh/netherguy4/mist-overhaul@main/mist-overhaul.user.js

# Ветку jsDelivr держит 12 часов, поэтому сам скрипт выбиваем из кеша руками.
# На 22 портретах purge отрабатывал через раз, но здесь файл один — и мы всё
# равно не верим ему на слово, а ждём, пока зеркало отдаст новую версию.
curl -sS "https://purge.jsdelivr.net/$url" > /dev/null
for i in $(seq 24); do
  curl -sS "https://fastly.jsdelivr.net/$url" | grep -q "$ver" && {
    echo "опубликовано $ver, зеркало подхватило за $((i * 5)) с"
    exit 0
  }
  sleep 5
done
echo "опубликовано $ver, но fastly ещё отдаёт старое — обновление приедет позже"
