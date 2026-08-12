#!/bin/bash
# Собрать, закоммитить и запушить.
#
# Два коммита не для красоты: @resource в скрипте ссылаются на коммит, в котором
# картинка менялась в последний раз, а узнать его можно только после того, как
# картинки закоммичены. Отсюда порядок: сначала картинки, потом шапка скрипта.
#
# Что это даёт: ссылка на коммит для jsDelivr неизменяема (на ветке @main кеш до
# 12 часов, а purge.jsdelivr.net отрабатывает через раз), и у нетронутых
# портретов ссылка не меняется — Tampermonkey качает только изменившееся.
set -e
cd "$(dirname "$0")"

msg="${1:-обновление портретов}"

.venv/bin/python build.py
git add -A
git diff --cached --quiet || git commit -q -m "$msg"

.venv/bin/python build.py --pin
git add -A
if git diff --cached --quiet; then
  echo "нечего публиковать"
  exit 0
fi
git commit -q -m "$msg: ссылки на картинки"
git push

echo "опубликовано $(grep -m1 '^// @version' mist-overhaul.user.js | awk '{print $3}')"
