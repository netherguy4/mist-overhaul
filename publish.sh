#!/bin/bash
# Собрать, закоммитить и запушить вместе с тегом версии.
#
# Тег обязателен: @resource в скрипте ссылаются на cdn.jsdelivr.net/...@vВЕРСИЯ,
# и тег должен указывать ровно на тот коммит, где лежат эти картинки. Ссылка на
# тег для jsDelivr неизменяема и кешируется навсегда, поэтому устаревший файл
# игроку прийти не может — в отличие от ветки @main, где кеш живёт до 12 часов,
# а purge.jsdelivr.net срабатывает через раз.
set -e
cd "$(dirname "$0")"

.venv/bin/python build.py

version=$(grep -m1 '^// @version' mist-overhaul.user.js | awk '{print $3}')
[ -n "$version" ] || { echo "не нашёл @version в скрипте"; exit 1; }

git add -A
git diff --cached --quiet && { echo "нечего публиковать"; exit 0; }
git commit -m "${1:-обновление портретов}"
if git rev-parse -q --verify "refs/tags/v$version" > /dev/null; then
  echo "тег v$version уже есть — картинки не менялись"
else
  # именно аннотированный: легковесные теги --follow-tags не пушит
  git tag -a "v$version" -m "${1:-обновление портретов}"
fi
git push --follow-tags

echo "опубликовано v$version"
