// ==UserScript==
// @name         Mist Overhaul
// @namespace    https://github.com/netherguy4/mist-overhaul
// @version      2026.08.12.1814
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
    bride_amalia_milton_8thmarch: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/bride_amalia_milton_8thmarch.7b305b9a.webm",
    caravaneer: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/caravaneer.8b72da77.webp",
    corvin: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/corvin.7a5385be.webp",
    cpt_tirim_mormont: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/cpt_tirim_mormont.84bb7f27.webp",
    demandred: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/demandred.e9d423c6.webp",
    ghost_boss_traun: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/ghost_boss_traun.9bc6cb3f.webp",
    ghost_simon_kornish: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/ghost_simon_kornish.ebfe3d4d.webp",
    guild_violett_tari: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/guild_violett_tari.06ff7579.webp",
    ifrit: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/ifrit.386e8562.webp",
    indiana_lester: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/indiana_lester.88391638.webp",
    innkeeper: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/innkeeper.7d53e6d9.webp",
    lumberjack: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/lumberjack.18128d81.webp",
    oracle: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/oracle.e3b195e3.webp",
    overseas_koitira: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/overseas_koitira.53bd8115.webp",
    poacher_vargo: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/poacher_vargo.ada88acc.webp",
    postman: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/postman.3707b1b1.webp",
    prisoner_toivo_beilish: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/prisoner_toivo_beilish.38da288f.webp",
    rogue_boss_eshtar: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/rogue_boss_eshtar.c85fc95b.webp",
    rogue_brun: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/rogue_brun.87712dec.webp",
    rogue_girl_deina: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/rogue_girl_deina.5adb079c.webp",
    scientist_arvin_pottery_jr: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/scientist_arvin_pottery_jr.fcd7a9e1.webp",
    white_mage: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/white_mage.a84b043d.webp",
  };
  // --- конец блока ---

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
    const url = URLS[name];
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
    const url = URLS[name];
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
    const want = new Set(Object.values(URLS));
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
