// ==UserScript==
// @name         Mist Overhaul
// @namespace    https://github.com/netherguy4/mist-overhaul
// @version      2026.08.12.1344
// @description  Анимированные портреты персонажей в Mist
// @author       nether
// @match        *://*.mist-game.ru/*
// @run-at       document-start
// @grant        GM_getResourceURL
// @updateURL    https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/mist-overhaul.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/mist-overhaul.user.js
// --- портреты, дальше до конца блока правит build.py, руками не трогать ---
// @resource     bride_amalia_milton_8thmarch https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/bride_amalia_milton_8thmarch.webp
// @resource     caravaneer https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/caravaneer.webp
// @resource     corvin https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/corvin.webp
// @resource     cpt_tirim_mormont https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/cpt_tirim_mormont.webp
// @resource     demandred https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/demandred.webp
// @resource     ghost_boss_traun https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/ghost_boss_traun.webp
// @resource     ghost_simon_kornish https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/ghost_simon_kornish.webp
// @resource     guild_violett_tari https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/guild_violett_tari.webp
// @resource     ifrit https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/ifrit.webp
// @resource     indiana_lester https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/indiana_lester.webp
// @resource     innkeeper https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/innkeeper.webp
// @resource     lumberjack https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/lumberjack.webp
// @resource     oracle https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/oracle.webp
// @resource     overseas_koitira https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/overseas_koitira.webp
// @resource     poacher_vargo https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/poacher_vargo.webp
// @resource     postman https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/postman.webp
// @resource     prisoner_toivo_beilish https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/prisoner_toivo_beilish.webp
// @resource     rogue_boss_eshtar https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/rogue_boss_eshtar.webp
// @resource     rogue_brun https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/rogue_brun.webp
// @resource     rogue_girl_deina https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/rogue_girl_deina.webp
// @resource     scientist_arvin_pottery_jr https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/scientist_arvin_pottery_jr.webp
// @resource     white_mage https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc/white_mage.webp
// ==/UserScript==

(() => {
  'use strict';

  // Картинки лежат локально: Tampermonkey скачал их по @resource при установке
  // и обновит только вместе со скриптом. В игру за ними никто не ходит.
  const NPC = /\/npc\/([a-z0-9_]+)\.(?:jpe?g|png)/i;
  const local = name => { try { return GM_getResourceURL(name); } catch { return null; } };

  function swapBg(el) {
    const cur = getComputedStyle(el).backgroundImage;
    const name = cur.match(NPC)?.[1];
    if (!name || el.dataset.mistOverhaul === name) return;
    const url = local(name);
    if (!url) return;                 // персонажа ещё не рисовали — остаётся оригинал
    el.dataset.mistOverhaul = name;
    el.style.backgroundImage = `url(${url}), ${cur}`;
    // в игре стоит background-size: auto, а наши картинки вдвое крупнее
    el.style.backgroundSize = '100% 100%';
    el.style.backgroundRepeat = 'no-repeat';
  }

  function swapImg(img) {
    const name = img.src.match(NPC)?.[1];
    if (!name || img.dataset.mistOverhaul === name) return;
    const url = local(name);
    if (!url) return;
    img.dataset.mistOverhaul = name;
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
})();
