// ==UserScript==
// @name         Mist Overhaul
// @namespace    https://github.com/netherguy4/mist-overhaul
// @version      2026.08.12.2031
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
    bride_amalia_milton_8thmarch: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/bride_amalia_milton_8thmarch.2d8cc84a.webm", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/bride_amalia_milton_8thmarch.4e996156.webm", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/bride_amalia_milton_8thmarch.5b7812c2.webm"},
    caravaneer: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/caravaneer.c9c9da59.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/caravaneer.ab604c7b.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/caravaneer.df3be187.webp"},
    corvin: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/corvin.c52eaeb1.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/corvin.a2092c7b.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/corvin.bf3fed7f.webp"},
    cpt_tirim_mormont: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/cpt_tirim_mormont.0b6ef0b7.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/cpt_tirim_mormont.cdfc20ca.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/cpt_tirim_mormont.5fe81384.webp"},
    demandred: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/demandred.f615eb7b.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/demandred.b973b627.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/demandred.f61e2f92.webp"},
    ghost_boss_traun: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/ghost_boss_traun.baa80ddb.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/ghost_boss_traun.55da66de.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/ghost_boss_traun.8155df8d.webp"},
    ghost_simon_kornish: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/ghost_simon_kornish.4b559c5f.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/ghost_simon_kornish.48b3db15.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/ghost_simon_kornish.a97aea42.webp"},
    guild_violett_tari: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/guild_violett_tari.484369db.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/guild_violett_tari.883b8c87.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/guild_violett_tari.be0f55eb.webp"},
    ifrit: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/ifrit.6d061a5c.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/ifrit.cda3abf1.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/ifrit.1f11e127.webp"},
    indiana_lester: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/indiana_lester.e5a3abbe.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/indiana_lester.d47c3775.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/indiana_lester.55dad1d2.webp"},
    innkeeper: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/innkeeper.e6fee2f1.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/innkeeper.fe19e8b4.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/innkeeper.cff3773d.webp"},
    lumberjack: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/lumberjack.c3a7304f.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/lumberjack.a9517d8e.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/lumberjack.a9c9d041.webp"},
    oracle: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/oracle.06f4a3cf.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/oracle.980adb81.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/oracle.b48931d6.webp"},
    overseas_koitira: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/overseas_koitira.89cba6dd.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/overseas_koitira.ec2632f6.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/overseas_koitira.4176e79e.webp"},
    poacher_vargo: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/poacher_vargo.99c4ecc2.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/poacher_vargo.7d01dd1f.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/poacher_vargo.b553b3b2.webp"},
    postman: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/postman.00e24b2d.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/postman.540a5072.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/postman.c4b73980.webp"},
    prisoner_toivo_beilish: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/prisoner_toivo_beilish.8f325849.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/prisoner_toivo_beilish.a3bb7d4a.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/prisoner_toivo_beilish.b7e22af7.webp"},
    rogue_boss_eshtar: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/rogue_boss_eshtar.d2899307.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/rogue_boss_eshtar.5ad82356.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/rogue_boss_eshtar.5fd83653.webp"},
    rogue_brun: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/rogue_brun.d5060527.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/rogue_brun.c59a36f7.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/rogue_brun.99500840.webp"},
    rogue_girl_deina: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/rogue_girl_deina.cf5c3650.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/rogue_girl_deina.ebcb7a95.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/rogue_girl_deina.898102bd.webp"},
    scientist_arvin_pottery_jr: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/scientist_arvin_pottery_jr.fe8f0630.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/scientist_arvin_pottery_jr.3edb4eb4.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/scientist_arvin_pottery_jr.9baa2dab.webp"},
    white_mage: {"1x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/1x/white_mage.27281ef6.webp", "2x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/2x/white_mage.047cffed.webp", "3x": "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/3x/white_mage.ee2d73db.webp"},
  };
  // --- конец блока ---

  // Размер под конкретный экран. Отдавать всем 3x нельзя: на обычном мониторе
  // браузер ужимает 544x800 до 182 физических пикселей, и его фильтр
  // превращает мелкие детали в кашу. Здесь картинка почти совпадает с рамкой,
  // так что масштабирования почти нет.
  const TIER = devicePixelRatio < 1.25 ? '1x' : devicePixelRatio < 2.25 ? '2x' : '3x';

  const NPC = /\/npc\/([a-z0-9_]+)\.(?:jpe?g|png)/i;
  const CACHE = 'mist-overhaul';

  let store = null;
  // хранилище открываем сразу, а не по load: подмена случается раньше, и иначе
  // портрет каждый раз шёл бы с CDN мимо уже скачанного
  const ready = self.caches ? caches.open(CACHE).then(c => (store = c), () => {})
                            : Promise.resolve();
  const blobs = new Map();              // адрес -> blob:, только для показанных

  /** Адрес для показа: из хранилища, а пока его нет — прямо с CDN. */
  async function source(url) {
    if (blobs.has(url)) return blobs.get(url);
    await ready;
    const hit = store && await store.match(url);
    if (!hit) return url;
    blobs.set(url, URL.createObjectURL(await hit.blob()));
    // портрет на экране один, держать больше пары незачем: это десятки мегабайт
    for (const old of [...blobs.keys()].slice(0, -2)) {
      URL.revokeObjectURL(blobs.get(old));
      blobs.delete(old);
    }
    return blobs.get(url);
  }

  async function swapBg(el) {
    const cur = getComputedStyle(el).backgroundImage;
    const name = cur.match(NPC)?.[1];
    if (!name || el.dataset.mistOverhaul === name) return;
    const url = URLS[name]?.[TIER];
    if (!url) return;                 // персонажа ещё не рисовали — остаётся оригинал
    el.dataset.mistOverhaul = name;
    // в игре стоит background-size: auto, а наши картинки вдвое крупнее
    el.style.backgroundSize = '100% 100%';
    el.style.backgroundRepeat = 'no-repeat';
    const src = await source(url);

    el.querySelector('video.mist-overhaul')?.remove();
    if (!url.endsWith('.webm')) {
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
    const url = URLS[name]?.[TIER];
    if (!url || url.endsWith('.webm')) return;
    img.dataset.mistOverhaul = name;
    const original = img.src;
    img.addEventListener('error', () => { img.src = original; }, { once: true });
    img.src = await source(url);
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
    if (!store) return;               // не защищённый контекст — работаем прямо с CDN
    const want = new Set(Object.values(URLS).map(v => v[TIER]));
    for (const req of await store.keys()) {
      if (!want.has(req.url)) await store.delete(req);   // адрес сменился = старый файл
    }
    for (const url of want) {
      if (!await store.match(url)) await store.add(url).catch(() => {});
    }
  }

  // Тянем всё сразу, не дожидаясь встречи с персонажем, но после load —
  // чтобы не отбирать канал у самой игры.
  addEventListener('load', prime);
})();
