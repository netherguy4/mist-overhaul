// ==UserScript==
// @name         Mist Overhaul
// @namespace    https://github.com/netherguy4/mist-overhaul
// @version      2026.08.12.1845
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
    bride_amalia_milton_8thmarch: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/bride_amalia_milton_8thmarch.413c5125.webm",
    caravaneer: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/caravaneer.a7985f66.webp",
    corvin: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/corvin.be8f8927.webp",
    cpt_tirim_mormont: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/cpt_tirim_mormont.2b975809.webp",
    demandred: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/demandred.2706d5a4.webp",
    ghost_boss_traun: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/ghost_boss_traun.94cdbff9.webp",
    ghost_simon_kornish: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/ghost_simon_kornish.ee85a3ee.webp",
    guild_violett_tari: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/guild_violett_tari.d45dd6d5.webp",
    ifrit: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/ifrit.c8f1d842.webp",
    indiana_lester: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/indiana_lester.1a3e47be.webp",
    innkeeper: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/innkeeper.2b745fa5.webp",
    lumberjack: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/lumberjack.7cdf6d49.webp",
    oracle: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/oracle.4f4236f0.webp",
    overseas_koitira: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/overseas_koitira.b4dabb53.webp",
    poacher_vargo: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/poacher_vargo.07f14792.webp",
    postman: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/postman.bf42d710.webp",
    prisoner_toivo_beilish: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/prisoner_toivo_beilish.d5f8cf9a.webp",
    rogue_boss_eshtar: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/rogue_boss_eshtar.b60c9191.webp",
    rogue_brun: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/rogue_brun.9942b815.webp",
    rogue_girl_deina: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/rogue_girl_deina.21114ad4.webp",
    scientist_arvin_pottery_jr: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/scientist_arvin_pottery_jr.26d21bdc.webp",
    white_mage: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/white_mage.c38dbedf.webp",
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
