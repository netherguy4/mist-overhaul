// ==UserScript==
// @name         Mist Overhaul
// @namespace    https://github.com/netherguy4/mist-overhaul
// @version      2026.08.12.1718
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
  // перекачивал даже после смены ссылок. Обычный url() надёжнее и вдобавок
  // ленивый — качается только тот персонаж, которого встретил. Адрес прибит к
  // коммиту, а такие пути jsDelivr отдаёт с immutable-кешем: за картинкой
  // сходят ровно один раз, а новая версия приезжает вместе с новым адресом.

  // --- ссылки на портреты, дальше до конца блока правит build.py ---
  const URLS = {
    bride_amalia_milton_8thmarch: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/bride_amalia_milton_8thmarch.a9b4fe87.webp",
    caravaneer: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/caravaneer.30518e4e.webp",
    corvin: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/corvin.7a5385be.webp",
    cpt_tirim_mormont: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/cpt_tirim_mormont.34dd6931.webp",
    demandred: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/demandred.e9d423c6.webp",
    ghost_boss_traun: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/ghost_boss_traun.9bc6cb3f.webp",
    ghost_simon_kornish: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/ghost_simon_kornish.ebfe3d4d.webp",
    guild_violett_tari: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/guild_violett_tari.06ff7579.webp",
    ifrit: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/ifrit.294608b3.webp",
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
    white_mage: "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/white_mage.920aa351.webp",
  };
  // --- конец блока ---

  const NPC = /\/npc\/([a-z0-9_]+)\.(?:jpe?g|png)/i;

  function swapBg(el) {
    const cur = getComputedStyle(el).backgroundImage;
    const name = cur.match(NPC)?.[1];
    if (!name || el.dataset.mistOverhaul === name) return;
    const url = URLS[name];
    if (!url) return;                 // персонажа ещё не рисовали — остаётся оригинал
    el.dataset.mistOverhaul = name;
    // оригинал нижним слоем: пока портрет качается, видно его, а не пустоту
    el.style.backgroundImage = `url(${url}), ${cur}`;
    // в игре стоит background-size: auto, а наши картинки вдвое крупнее
    el.style.backgroundSize = '100% 100%';
    el.style.backgroundRepeat = 'no-repeat';
  }

  function swapImg(img) {
    const name = img.src.match(NPC)?.[1];
    if (!name || img.dataset.mistOverhaul === name) return;
    const url = URLS[name];
    if (!url) return;
    img.dataset.mistOverhaul = name;
    const original = img.src;
    img.addEventListener('error', () => { img.src = original; }, { once: true });
    img.src = url;
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

  // Все портреты тянем сразу, не дожидаясь встречи с персонажем. Адреса
  // неизменяемы (хеш в имени), поэтому jsDelivr отдаёт их с вечным кешем:
  // сеть работает один раз, дальше всё берётся с диска. Ждём load, чтобы не
  // отбирать канал у самой игры.
  addEventListener('load', () => {
    for (const url of Object.values(URLS)) new Image().src = url;
  });
})();
