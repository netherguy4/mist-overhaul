// ==UserScript==
// @name         Mist Overhaul
// @namespace    https://github.com/netherguy4/mist-overhaul
// @version      2026.08.18.1447
// @description  Анимированные портреты персонажей в Mist
// @author       nether
// @match        *://*.mist-game.ru/*
// @run-at       document-start
// @grant        none
// сам скрипт берётся с raw.githubusercontent: кеш ~5 минут против 12 часов
// у jsDelivr на ветке, а вес крошечный
// @updateURL    https://raw.githubusercontent.com/netherguy4/mist-overhaul/main/mist-overhaul.user.js
// @downloadURL  https://raw.githubusercontent.com/netherguy4/mist-overhaul/main/mist-overhaul.user.js
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
    caravaneer: {"2x": "2x/caravaneer.15d44026.webm", "3x": "3x/caravaneer.2e58466e.webm"},
    corvin: {"2x": "2x/corvin.a2092c7b.webp", "3x": "3x/corvin.bf3fed7f.webp"},
    cpt_tirim_mormont: {"2x": "2x/cpt_tirim_mormont.d9d3867f.webp", "3x": "3x/cpt_tirim_mormont.146d5a06.webp"},
    demandred: {"2x": "2x/demandred.904ebbad.webm", "3x": "3x/demandred.02c5b758.webm"},
    ghost_boss_traun: {"2x": "2x/ghost_boss_traun.41ce6c86.webp", "3x": "3x/ghost_boss_traun.c0865292.webp"},
    ghost_simon_kornish: {"2x": "2x/ghost_simon_kornish.ba75c970.webm", "3x": "3x/ghost_simon_kornish.6b126db2.webm"},
    guild_violett_tari: {"2x": "2x/guild_violett_tari.d89abf3f.webm", "3x": "3x/guild_violett_tari.2940d08c.webm"},
    ifrit: {"2x": "2x/ifrit.16378a84.webp", "3x": "3x/ifrit.f5db6560.webp"},
    indiana_lester: {"2x": "2x/indiana_lester.0e4263a4.webm", "3x": "3x/indiana_lester.b1b9f024.webm"},
    innkeeper: {"2x": "2x/innkeeper.d1d7bfa3.webp", "3x": "3x/innkeeper.4633aff4.webp"},
    lumberjack: {"2x": "2x/lumberjack.c492abd8.webp", "3x": "3x/lumberjack.aa9bd73e.webp"},
    oracle: {"2x": "2x/oracle.9619b07c.webm", "3x": "3x/oracle.7474caeb.webm"},
    overseas_koitira: {"2x": "2x/overseas_koitira.11c9b661.webm", "3x": "3x/overseas_koitira.11f4ddff.webm"},
    poacher_vargo: {"2x": "2x/poacher_vargo.2531e493.webp", "3x": "3x/poacher_vargo.5c7fb77e.webp"},
    postman: {"2x": "2x/postman.74a8bc0b.webp", "3x": "3x/postman.a660e171.webp"},
    prisoner_toivo_beilish: {"2x": "2x/prisoner_toivo_beilish.a3bb7d4a.webp", "3x": "3x/prisoner_toivo_beilish.b7e22af7.webp"},
    rogue_boss_eshtar: {"2x": "2x/rogue_boss_eshtar.360c11ff.webp", "3x": "3x/rogue_boss_eshtar.e991ff5b.webp"},
    rogue_brun: {"2x": "2x/rogue_brun.196f85aa.webp", "3x": "3x/rogue_brun.82c1714e.webp"},
    rogue_girl_deina: {"2x": "2x/rogue_girl_deina.28076e4a.webp", "3x": "3x/rogue_girl_deina.28382d46.webp"},
    scientist_arvin_pottery_jr: {"2x": "2x/scientist_arvin_pottery_jr.e060d7e2.webp", "3x": "3x/scientist_arvin_pottery_jr.ba215311.webp"},
    white_mage: {"2x": "2x/white_mage.047cffed.webp", "3x": "3x/white_mage.ee2d73db.webp"},
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
    // анимацию фоном не поставить, поэтому кладём <video> поверх; оригинал под
    // ним виден, пока кадр не поехал
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
    const want = new Set(Object.values(URLS).map(v => v[TIER]));
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
