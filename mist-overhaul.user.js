// ==UserScript==
// @name         Mist Overhaul
// @namespace    https://github.com/netherguy4/mist-overhaul
// @version      2026.08.22.1626
// @description  Анимированные портреты персонажей в Mist
// @author       nether
// @match        *://*.mist-game.ru/*
// @run-at       document-start
// @grant        none
// сам скрипт раздаёт Codeberg: raw.githubusercontent открывается не у всех в
// РФ, а jsDelivr держал бы ветку 12 часов — purge на это не годится, проверяли.
// У Codeberg тот же профиль, что у raw: анонимно, text/plain, max-age=300.
// Туда его кладёт publish.sh, отдельным репозиторием на один файл.
// @updateURL    https://codeberg.org/netherguy/mist-overhaul-script/raw/branch/main/mist-overhaul.user.js
// @downloadURL  https://codeberg.org/netherguy/mist-overhaul-script/raw/branch/main/mist-overhaul.user.js
// ==/UserScript==

(() => {
  'use strict';

  // Портреты не через @resource: Tampermonkey держал их с первой установки и не
  // перекачивал даже после смены ссылок — в игре отдавал сборку, которой на CDN
  // давно не было. Здесь всё хранится в Cache Storage: у него, в отличие от
  // обычного кеша браузера, нет срока (jsDelivr отдаёт max-age=604800, то есть
  // неделю) и его не сносит чистка истории. Складываются все сразу, при первом
  // же заходе — см. prime() в конце файла.
  //
  // Инвалидация — в имени файла: там хеш содержимого, поэтому изменившийся
  // портрет приезжает под новым адресом, а старый вычищается из хранилища.

  // --- ссылки на портреты, дальше до конца блока правит build.py ---
  const URLS = {
    bride_amalia_milton_8thmarch: {"2x": "2x/bride_amalia_milton_8thmarch.fdbbe937.webm", "3x": "3x/bride_amalia_milton_8thmarch.202b834c.webm"},
    caravaneer: {"2x": "2x/caravaneer.8a3a4992.webm", "3x": "3x/caravaneer.6e911852.webm"},
    corvin: {"2x": "2x/corvin.c0f15317.webm", "3x": "3x/corvin.b8778f58.webm"},
    cpt_tirim_mormont: {"2x": "2x/cpt_tirim_mormont.6e0e738a.webm", "3x": "3x/cpt_tirim_mormont.5163d0da.webm"},
    demandred: {"2x": "2x/demandred.904ebbad.webm", "3x": "3x/demandred.02c5b758.webm"},
    ghost_boss_traun: {"2x": "2x/ghost_boss_traun.9dea8278.webm", "3x": "3x/ghost_boss_traun.3c31bb1b.webm"},
    ghost_simon_kornish: {"2x": "2x/ghost_simon_kornish.73b8088b.webm", "3x": "3x/ghost_simon_kornish.c2b4b696.webm"},
    guild_violett_tari: {"2x": "2x/guild_violett_tari.9463d60d.webm", "3x": "3x/guild_violett_tari.d68275f1.webm"},
    ifrit: {"2x": "2x/ifrit.b581d0d6.webm", "3x": "3x/ifrit.c1e307f4.webm"},
    indiana_lester: {"2x": "2x/indiana_lester.92b95e79.webm", "3x": "3x/indiana_lester.bfe423ec.webm"},
    innkeeper: {"2x": "2x/innkeeper.5ff02954.webm", "3x": "3x/innkeeper.bcfeed9b.webm"},
    lumberjack: {"2x": "2x/lumberjack.133323bc.webm", "3x": "3x/lumberjack.afb44538.webm"},
    oracle: {"2x": "2x/oracle.c396239f.webm", "3x": "3x/oracle.96411739.webm"},
    overseas_koitira: {"2x": "2x/overseas_koitira.0e6c3453.webm", "3x": "3x/overseas_koitira.eadce047.webm"},
    poacher_vargo: {"2x": "2x/poacher_vargo.293b0b71.webm", "3x": "3x/poacher_vargo.de774094.webm"},
    postman: {"2x": "2x/postman.f85074f9.webm", "3x": "3x/postman.0ba5b680.webm"},
    prisoner_toivo_beilish: {"2x": "2x/prisoner_toivo_beilish.c6186ca1.webm", "3x": "3x/prisoner_toivo_beilish.75ae55b1.webm"},
    rogue_boss_eshtar: {"2x": "2x/rogue_boss_eshtar.11570265.webm", "3x": "3x/rogue_boss_eshtar.b06000b6.webm"},
    rogue_brun: {"2x": "2x/rogue_brun.be298cab.webm", "3x": "3x/rogue_brun.0bb338f4.webm"},
    rogue_girl_deina: {"2x": "2x/rogue_girl_deina.b8bc8f9f.webm", "3x": "3x/rogue_girl_deina.b7001e6f.webm"},
    scientist_arvin_pottery_jr: {"2x": "2x/scientist_arvin_pottery_jr.394cd7ca.webm", "3x": "3x/scientist_arvin_pottery_jr.97e6288a.webm"},
    white_mage: {"2x": "2x/white_mage.16ae480c.webm", "3x": "3x/white_mage.69c642c6.webm"},
  };
  // --- конец блока ---

  // Размер под конкретный экран. Отдавать всем 3x нельзя: на обычном мониторе
  // браузер ужимает 544x800 до 182 физических пикселей, и его фильтр
  // превращает мелкие детали в кашу. Здесь картинка почти совпадает с рамкой,
  // так что масштабирования почти нет.
  const TIER = devicePixelRatio < 2.25 ? '2x' : '3x';

  const NPC = /\/npc\/([a-z0-9_]+)\.(?:jpe?g|png)/i;
  const CACHE = 'mist-overhaul';

  // Одно и то же содержимое на нескольких зеркалах: из РФ jsDelivr достаётся
  // не у всех, и тогда портреты просто не качались. Пробуем по порядку, первое
  // ответившее запоминаем — иначе каждая страница заново ждала бы таймаут на
  // заблокированном хосте. raw последний: он не CDN и медленнее, зато без
  // кеша — когда зеркала jsDelivr ещё отдают прошлый коммит (у них до 12 ч),
  // свежий файл лежит только там, и перебор доходит до него сам.
  const HOSTS = [
    'https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc',
    'https://gcore.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc',
    'https://fastly.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc',
    'https://raw.githubusercontent.com/netherguy4/mist-overhaul/main/extension/npc',
  ];
  let host = Math.min(+localStorage.mistOverhaulHost || 0, HOSTS.length - 1);
  let known = 'mistOverhaulHost' in localStorage;

  // Ключ в хранилище — свой, а не адрес зеркала: иначе смена зеркала выглядела
  // бы как новый файл и всё качалось бы заново.
  const KEY = 'https://mist-overhaul.invalid/';

  let store = null;
  // хранилище открываем сразу, а не по load: подмена случается раньше, и иначе
  // портрет каждый раз шёл бы с CDN мимо уже скачанного
  const ready = self.caches ? caches.open(CACHE).then(c => (store = c), () => {})
                            : Promise.resolve();
  const blobs = new Map();              // адрес -> blob:, только для показанных

  function pick(at) {
    localStorage.mistOverhaulHost = host = at;
    known = true;
  }

  /** Скачать файл, перебирая зеркала подряд от запомненного. */
  async function walk(path) {
    for (let i = 0; i < HOSTS.length; i++) {
      const at = (host + i) % HOSTS.length;
      const res = await fetch(`${HOSTS[at]}/${path}`).catch(() => null);
      if (res?.ok) {
        pick(at);
        return res;
      }
    }
    return null;
  }

  /** Первый файл — вперегонки: спросить зеркала разом и оставить победителя.
   *
   * Заблокированный хост не отвечает отказом, а молчит до таймаута, поэтому
   * последовательный перебор задержал бы первый портрет на полминуты. Дальше
   * гонка не нужна: победитель запомнен, и остальные файлы идут прямо к нему.
   *
   * raw в гонке не участвует (потому и `-1`): он не CDN, и, выиграй он
   * случайно, скрипт остался бы на нём насовсем. Своё место запасного он не
   * теряет — до него доходит walk(). Гонка ждёт, пока ответят все, так что
   * молчащий хост вместе с протухшими остальными её подвесит; лечится это
   * само, когда зеркала обновятся.
   */
  async function race(path) {
    const racers = HOSTS.slice(0, -1);
    const stops = racers.map(() => new AbortController());
    const won = await Promise.any(racers.map((h, at) =>
      fetch(`${h}/${path}`, { signal: stops[at].signal })
        .then(res => res.ok ? [at, res] : Promise.reject(res.status)))).catch(() => null);
    if (!won) return walk(path);      // все зеркала мимо — остаётся raw
    // проигравших обрываем, иначе они докачают файл впустую
    stops.forEach((stop, at) => at !== won[0] && stop.abort());
    pick(won[0]);
    return won[1];
  }

  const grab = path => (known ? walk(path) : race(path));

  /** Адрес для показа: из хранилища, а пока его нет — прямо с зеркала. */
  async function source(path) {
    if (blobs.has(path)) return blobs.get(path);
    await ready;
    const hit = store && await store.match(KEY + path);
    if (!hit) return `${HOSTS[host]}/${path}`;
    blobs.set(path, URL.createObjectURL(await hit.blob()));
    // портрет на экране один, держать больше пары незачем: это десятки мегабайт
    for (const old of [...blobs.keys()].slice(0, -2)) {
      URL.revokeObjectURL(blobs.get(old));
      blobs.delete(old);
    }
    return blobs.get(path);
  }

  /** Постер анимации: первый кадр под тем же хешем, что и webm. */
  const poster = path => path.replace(/\.webm$/, '.webp');

  async function swapBg(el) {
    const cur = getComputedStyle(el).backgroundImage;
    const name = cur.match(NPC)?.[1];
    if (!name || el.dataset.mistOverhaul === name) return;
    const path = URLS[name]?.[TIER];
    if (!path) return;                 // персонажа ещё не рисовали — остаётся оригинал
    el.dataset.mistOverhaul = name;
    // в игре стоит background-size: auto, а наши картинки вдвое крупнее
    el.style.backgroundSize = '100% 100%';
    el.style.backgroundRepeat = 'no-repeat';
    const src = await source(path);

    el.querySelector('video.mist-overhaul')?.remove();
    if (!path.endsWith('.webm')) {
      // статичный портрет — обычным фоном, оригинал остаётся нижним слоем
      el.style.backgroundImage = `url(${src}), ${cur}`;
      return;
    }
    // анимацию фоном не поставить, поэтому кладём <video> поверх, а под него —
    // постер с первым кадром: без него на кадр-два виден оригинал
    el.style.backgroundImage = `url(${await source(poster(path))}), ${cur}`;
    const v = document.createElement('video');
    v.className = 'mist-overhaul';
    Object.assign(v, { src, autoplay: true, loop: true, muted: true, playsInline: true });
    v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
                    + 'object-fit:fill;pointer-events:none';
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.appendChild(v);
  }

  // <img> с портретом в игре пока не встречался, поэтому здесь только статика:
  // видео в img не вставить, а городить замену элемента ради гипотезы незачем
  async function swapImg(img) {
    const name = img.src.match(NPC)?.[1];
    if (!name || img.dataset.mistOverhaul === name) return;
    const path = URLS[name]?.[TIER];
    if (!path || path.endsWith('.webm')) return;
    img.dataset.mistOverhaul = name;
    const original = img.src;
    img.addEventListener('error', () => { img.src = original; }, { once: true });
    img.src = await source(path);
  }

  function scan(root) {
    if (!root.querySelectorAll) return;
    root.querySelectorAll('[style*="/npc/"]').forEach(swapBg);
    root.querySelectorAll('img[src*="/npc/"]').forEach(swapImg);
  }

  // портрет меняется без перезагрузки страницы — и заменой узла, и правкой style
  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'attributes') {
        r.target.tagName === 'IMG' ? swapImg(r.target) : swapBg(r.target);
      } else {
        r.addedNodes.forEach(n => { scan(n); if (n.nodeType === 1) swapBg(n); });
      }
    }
  }).observe(document.documentElement, {
    childList: true, subtree: true, attributeFilter: ['style', 'src'],
  });

  scan(document);
  document.addEventListener('DOMContentLoaded', () => scan(document));

  /** Сложить все портреты в хранилище и выкинуть оставшиеся от прошлых версий. */
  async function prime() {
    await ready;
    if (!store) return;               // не защищённый контекст — работаем прямо с зеркала
    const want = new Set(Object.values(URLS).flatMap(v =>
      v[TIER].endsWith('.webm') ? [v[TIER], poster(v[TIER])] : [v[TIER]]));
    for (const req of await store.keys()) {
      if (!want.has(req.url.slice(KEY.length))) await store.delete(req);   // имя сменилось = старый файл
    }
    for (const path of want) {
      if (await store.match(KEY + path)) continue;
      const res = await grab(path);
      if (res) await store.put(KEY + path, res).catch(() => {});
    }
  }

  // Тянем всё сразу, не дожидаясь встречи с персонажем, но после load —
  // чтобы не отбирать канал у самой игры. Ждём его не дольше пяти секунд:
  // молчащее зеркало держит незагруженным портрет, который уже на странице, а
  // с ним и сам load — и предзагрузка не начиналась бы вовсе.
  let started;
  const start = () => (started ||= prime());
  addEventListener('load', start);
  setTimeout(start, 5000);
})();
