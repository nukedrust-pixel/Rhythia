(function rhythia() {
    const S = window.Spicetify;
    // Spicetify only links Player to Spotify's PlayerAPI on the first playback state change,
    // so after a start or reload with no state change every Player call would throw until then.
    const api = S?.Platform?.PlayerAPI;
    if (S?.Player && api?._state && !S.Player.origin) S.Player.origin = api;
    if (!(api?._state || S?.Player?.data) || !S.Platform?.History || !document.querySelector(".Root__top-container")) {
        setTimeout(rhythia, 300);
        return;
    }

    const P = S.Player;
    const H = S.Platform.History;
    // Read playback straight from Spotify's live PlayerAPI state: Spicetify's Player.data and its
    // songchange/onplaypause events are not reliable until Spicetify hooks itself up.
    const state = () => S.Platform.PlayerAPI?._state || P.data || {};
    const nowItem = () => state().item || P.data?.item || P.data?.track;
    const songFns = [];
    const playFns = [];
    const onSong = (fn) => songFns.push(fn);
    const onPlayPause = (fn) => playFns.push(fn);

    // Spicetify's readable class names (.Root__main-view etc.) lag behind new Spotify versions, so the layout
    // regions are tagged by their grid area instead, which Spotify has kept stable.
    const AREAS = { "main-view": "main", "left-sidebar": "left", "right-sidebar": "right", "now-playing-bar": "bar" };
    function tagAreas() {
        const top = document.querySelector(".Root__top-container");
        if (!top) return;
        for (const c of top.children) {
            if (c.id?.startsWith("rh-") || c.dataset.rhArea) continue;
            const area = getComputedStyle(c).gridArea.trim();
            let tag = AREAS[area];
            if (!tag && (c.id === "global-nav-bar" || c.classList.contains("Root__globalNav"))) tag = "gnav";
            if (
                !tag &&
                c.id !== "lyrics-cinema" &&
                (c.classList.contains("Root__cinema-view") || area === "left-sidebar / left-sidebar / main-view / main-view" || c.querySelector("video"))
            )
                tag = "cinema";
            if (tag) c.dataset.rhArea = tag;
        }
    }
    tagAreas();

    // Spotify's design-system classes carry a build prefix (e-10451-, e-10860-, ...). user.css is written
    // against e-10451-; when Spotify ships a different prefix, re-inject those rules with the live one.
    const CSS_PREFIX = "e-10451-";
    let prefixSig = "";
    function adaptPrefix() {
        const m = document.querySelector('[class*="encore-text"]')?.className.match(/\be-\d+-/);
        if (!m || m[0] === CSS_PREFIX) return;
        const live = m[0];
        const rules = [];
        for (const sh of document.styleSheets) {
            const node = sh.ownerNode;
            const isTheme =
                node && (node.id === "userCSS" || node.classList?.contains("marketplaceUserCSS") || /user\.css/.test(node.getAttribute?.("href") || ""));
            if (!isTheme) continue;
            let list;
            try {
                list = sh.cssRules;
            } catch {
                continue;
            }
            for (const r of list) if (r.cssText.includes(CSS_PREFIX)) rules.push(r.cssText.split(CSS_PREFIX).join(live));
        }
        const sig = live + rules.length + ":" + rules.reduce((a, t) => a + t.length, 0);
        if (!rules.length || sig === prefixSig) return;
        prefixSig = sig;
        let st = document.getElementById("rh-prefix");
        if (!st) {
            st = document.createElement("style");
            st.id = "rh-prefix";
        }
        st.textContent = rules.join("\n");
        document.head.appendChild(st);
    }

    // Spicetify maps Spotify's hashed class names to readable ones (main-card-cardContainer, ...), but that
    // map lags behind new Spotify builds. Add the readable names the theme relies on by recognizing structure.
    const add = (e, ...c) => e && c.forEach((x) => e.classList.contains(x) || e.classList.add(x));
    function shimClasses(root) {
        root.querySelectorAll('[data-encore-id="card"]').forEach((card) => {
            const img = card.querySelector("img");
            const r = img?.getBoundingClientRect();
            if (img && (!r || !r.width || !r.height)) return;
            const video = !!img && r.width > r.height * 1.25;
            card.dataset.rhShim = video ? "video" : "card";
            if (video) {
                card.classList.remove("main-card-cardContainer");
                add(img, "main-image-image");
                return;
            }
            add(card, "main-card-cardContainer");
            if (img) {
                add(img, "main-image-image", "main-cardImage-image");
                const wrap = img.parentElement?.parentElement;
                if (wrap && wrap !== card) {
                    add(wrap, "main-cardImage-imageWrapper");
                    if (wrap.parentElement !== card) add(wrap.parentElement, "main-card-imageContainer");
                }
            }
            add(card.querySelector('[data-encore-id="cardTitle"]'), "main-card-cardTitle");
            add(card.querySelector('[data-encore-id="cardSubtitle"]'), "main-card-cardMetadata");
        });
        root.querySelectorAll("button[data-is-icon-only]").forEach((b) => {
            if (/legacy-button-primary/.test(b.className) && b.parentElement) add(b.parentElement, "main-playButton-PlayButton");
        });
        root.querySelectorAll("section h2").forEach((h) => {
            const g = h.closest('[role="group"]');
            if (!g || !/legacy-list-row/.test(g.className)) return;
            add(h, "main-shelf-title");
            add(g, "main-shelf-titleWrapper");
        });
        root.querySelectorAll('[style*="--min-column-width"]').forEach((g) => add(g, "main-gridContainer-gridContainer"));
        root.querySelectorAll('[role="row"]').forEach((row) => {
            const inner = row.firstElementChild;
            if (!inner) return;
            const cells = [...inner.children];
            if (cells.some((c) => c.getAttribute("role") === "columnheader")) {
                add(inner, "main-trackList-trackListHeader");
                return;
            }
            if (cells.length < 3 || !cells.every((c) => c.getAttribute("role") === "gridcell")) return;
            add(inner, "main-trackList-trackListRow", "main-trackList-trackListRowGrid");
            add(cells[0], "main-trackList-rowSectionIndex");
            add(cells[0].firstElementChild, "main-trackList-rowMarker");
            add(cells[1], "main-trackList-rowSectionStart");
            const img = cells[1].querySelector("img");
            add(img, "main-image-image", "main-trackList-rowImage");
            add(cells[1].querySelector('[data-encore-id="text"]'), "main-trackList-rowMainContentTitle");
        });
        root.querySelectorAll('[data-testid="media"] img, li[role="row"] img').forEach((img) => {
            add(img, "main-image-image");
            if (img.parentElement?.tagName === "DIV") add(img.parentElement, "x-entityImage-imageContainer");
        });
    }
    // Full-width coloured header bands (Home, playlist and album headers) that hide the theme background.
    function stripHeaderBands() {
        const mv = document.querySelector(".main-view-container");
        if (!mv) return;
        const box = mv.getBoundingClientRect();
        mv.querySelectorAll("div:not([data-rh-bgchk])").forEach((e) => {
            const r = e.getBoundingClientRect();
            if (!r.height) return;
            e.dataset.rhBgchk = "1";
            if (r.width < box.width * 0.6 || r.height < 120 || r.top > box.top + 160) return;
            if (e.closest('[data-encore-id="card"], [role="row"], #rh-wheel')) return;
            const cs = getComputedStyle(e);
            const colored = cs.backgroundImage.includes("gradient") || (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent");
            if (colored) add(e, "rh-nobg");
        });
    }
    function shimMenus() {
        document.querySelectorAll('[role="menu"]').forEach((m) => {
            add(m, "main-contextMenu-menu");
            m.querySelectorAll('[role="menuitem"] > button, button[role="menuitem"]').forEach((b) => add(b, "main-contextMenu-menuItemButton"));
        });
    }
    let shimT = 0;
    let bandPath = null;
    let bandAt = 0;
    const scheduleShim = () => {
        if (shimT) return;
        shimT = setTimeout(() => {
            shimT = 0;
            const main = document.querySelector(".Root__top-container");
            if (main) shimClasses(main);
            shimMenus();
            const p = H.location?.pathname;
            if (p !== bandPath) {
                bandPath = p;
                bandAt = Date.now();
            }
            if (Date.now() - bandAt < 6000) stripHeaderBands();
        }, 80);
    };
    // React rewrites className on re-render (e.g. when an image finishes loading), dropping the added names.
    const SHIM_RE = /\b(main-(card|cardImage|image|shelf|trackList|playButton|gridContainer|contextMenu)-|x-entityImage-)/;
    new MutationObserver((muts) => {
        for (const m of muts) {
            if (m.type === "childList" || (m.oldValue && SHIM_RE.test(m.oldValue) && !SHIM_RE.test(m.target.className))) {
                scheduleShim();
                return;
            }
        }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    scheduleShim();

    const SEL = {
        main: '.Root__top-container > :is(.Root__main-view, [data-rh-area="main"])',
        left: '.Root__top-container > :is(.Root__nav-bar, [data-rh-area="left"])',
        right: '.Root__top-container > :is(.Root__right-sidebar, [data-rh-area="right"])',
        bar: '.Root__top-container > :is(.Root__now-playing-bar, [data-rh-area="bar"])',
        cinema: '.Root__top-container > :is(.Root__cinema-view, [data-rh-area="cinema"])',
    };
    const $ = (sel, root = document) => root.querySelector(sel);
    const el = (html) => {
        const t = document.createElement("template");
        t.innerHTML = html.trim();
        return t.content.firstElementChild;
    };
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const img = (u) => (u?.startsWith("spotify:image:") ? "https://i.scdn.co/image/" + u.slice(14) : u || "");
    const fmt = (ms) => {
        const s = Math.max(0, Math.floor((ms || 0) / 1000));
        return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    };
    const route = (uri) => {
        const [, type, id] = String(uri || "").split(":");
        return type && id ? `/${type}/${id}` : null;
    };
    const grade = (n) => {
        if (!n) return ["—", "g-none"];
        if (n >= 5e8) return ["SS", "g-ss"];
        if (n >= 1e8) return ["S", "g-s"];
        if (n >= 2e7) return ["A", "g-a"];
        if (n >= 5e6) return ["B", "g-b"];
        if (n >= 1e6) return ["C", "g-c"];
        return ["D", "g-d"];
    };
    const starsFor = (n) => Math.max(0, Math.log10(n) - 3);
    const short = (n) =>
        n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);
    const playCache = new Map();
    const plays = (uri) => {
        if (!uri?.startsWith("spotify:track:")) return Promise.resolve(null);
        // GraphQL is wired up lazily by Spicetify; until then, don't cache so the lookup is retried.
        if (typeof S.GraphQL?.Request !== "function" || !S.GraphQL?.Definitions?.getTrack) return Promise.resolve(null);
        if (!playCache.has(uri)) {
            let req;
            try {
                req = Promise.resolve(S.GraphQL.Request(S.GraphQL.Definitions.getTrack, { uri }));
            } catch {
                return Promise.resolve(null);
            }
            playCache.set(
                uri,
                req.then((r) => Number(r?.data?.trackUnion?.playcount) || null).catch(() => {
                    playCache.delete(uri);
                    return null;
                })
            );
        }
        return playCache.get(uri);
    };

    const sv = (p, fill = false) =>
        `<svg viewBox="0 0 24 24" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
    const I = {
        menu: sv('<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>'),
        back: sv('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>'),
        fwd: sv('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'),
        heart: sv('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'),
        gear: sv('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
        list: sv('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'),
        grid: sv('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'),
        search: sv('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
        eye: sv('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'),
        bookmark: sv('<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="15" y1="10" x2="9" y2="10"/>'),
        bookmarked: sv('<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/><path d="m9 10 2 2 4-4"/>'),
        cloud: sv('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'),
        star: sv('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', true),
        layers: sv('<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>'),
        clock: sv('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
        play: sv('<polygon points="6 3 20 12 6 21 6 3"/>', true),
        pause: sv('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>', true),
        prev: sv('<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>', true),
        next: sv('<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>', true),
        speaker: sv('<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M12 6h.01"/><circle cx="12" cy="14" r="4"/><path d="M12 14h.01"/>'),
        vol: sv('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'),
        mute: sv('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/>'),
        mini: sv('<path d="M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4"/><rect width="10" height="7" x="12" y="13" rx="2"/>'),
        full: sv('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'),
        note: sv('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
        shrink: sv('<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>'),
    };

    const topbar = el(`
<div id="rh-topbar">
  <div class="rh-user">
    <button class="rh-logo" data-act="lib" title="Your Library">${I.menu}<img class="rh-logo-img" id="rh-avatar" alt=""></button>
    <div class="rh-user-text">
      <div class="rh-user-name"><span id="rh-uname">Player</span><span class="rh-online"></span></div>
      <div class="rh-user-sub" id="rh-usub">Online</div>
    </div>
  </div>
  <div class="rh-spacer"></div>
  <div class="rh-icons">
    <button data-act="back" title="Back">${I.back}</button>
    <button data-act="fwd" title="Forward">${I.fwd}</button>
    <button data-act="liked" title="Liked Songs">${I.heart}</button>
    <button data-act="settings" title="Settings">${I.gear}</button>
    <button data-act="queue" title="Queue">${I.list}</button>
    <button data-act="market" title="Marketplace">${I.grid}</button>
  </div>
  <div class="rh-tabs">
    <button data-act="home" data-tab="home">Home</button>
    <button data-act="lib" data-tab="lib">Collections</button>
    <button data-act="liked" data-tab="liked">All Songs</button>
  </div>
  <form class="rh-search" id="rh-search"><input id="rh-q" type="text" placeholder="Search songs" autocomplete="off" spellcheck="false"></form>
</div>`);

    const MODS = [
        ["shuffle", "m-slate", "Shuffle", "S"],
        ["repeat", "m-green", "Repeat", "RP"],
        ["prev", "m-red", "Previous", I.prev],
        ["next", "m-pink", "Next", I.next],
        ["queue", "m-violet", "Queue", I.list],
        ["devices", "m-purple", "Devices", I.speaker],
        ["volume", "m-blue", "Volume (scroll to adjust)", I.vol],
        ["mini", "m-blue", "Miniplayer", I.mini],
        ["fullscreen", "m-gray", "Full screen", I.full],
    ];

    const panel = el(`
<div id="rh-panel">
  <div class="rh-head">
    <div class="rh-cover-wrap" data-act="album" title="Go to album">
      <img class="rh-ghost" id="rh-ghost" alt="">
      <img class="rh-cover" id="rh-cover" alt="">
    </div>
    <div class="rh-board">
      <div class="rh-board-list" id="rh-board"></div>
      <button class="rh-board-link" data-act="queue">Go to queue</button>
    </div>
  </div>
  <div class="rh-meta">
    <div class="rh-title" id="rh-title" data-act="album"></div>
    <div class="rh-album" id="rh-album"></div>
    <div class="rh-mapper" id="rh-mapper"></div>
  </div>
  <div class="rh-stats">
    <div>${I.cloud}<span id="rh-s-status"></span></div>
    <div>${I.star}<span id="rh-s-stars"></span></div>
    <div>${I.layers}<span id="rh-s-track"></span></div>
    <div>${I.clock}<span id="rh-s-dur"></span></div>
  </div>
  <div class="rh-seek">
    <button class="rh-seek-play" id="rh-mini-play" data-act="play">${I.pause}</button>
    <span class="rh-time" id="rh-pos">00:00</span>
    <div class="rh-seek-bar" id="rh-seekbar"><div class="rh-seek-fill"></div><div class="rh-seek-knob"></div></div>
    <span class="rh-time" id="rh-dur">00:00</span>
  </div>
  <div class="rh-actions">
    <button class="rh-sq" data-act="lyrics" title="Lyrics">${I.eye}</button>
    <button class="rh-play" data-act="play"><span class="rh-play-label" id="rh-play-label">PLAY</span><span class="rh-play-sub" id="rh-play-sub"></span></button>
    <button class="rh-sq" data-act="heart" id="rh-heart" title="Save to Liked Songs">${I.bookmark}</button>
  </div>
  <div class="rh-mods">
    ${MODS.map(([act, cls, title, inner]) => `<button class="rh-mod ${cls}" data-act="${act}" data-mod="${act}" title="${title}">${inner}</button>`).join("")}
    <div class="rh-vol-pop" id="rh-volpop">
      <button data-act="mute" id="rh-mute">${I.vol}</button>
      <input type="range" min="0" max="100" step="1" id="rh-vol">
      <span id="rh-vol-num">100</span>
    </div>
  </div>
</div>`);

    const bg = el(`<div id="rh-bg"><div class="rh-bg-img" id="rh-bg-img"></div></div>`);

    const vbar = el(`
<div id="rh-vbar">
  <div class="rh-vb-left">
    <img class="rh-vb-cover" id="rh-vcover" alt="">
    <div class="rh-vb-meta"><div class="rh-vb-title" id="rh-vtitle"></div><div class="rh-vb-artist" id="rh-vartist"></div></div>
    <button class="rh-vb-icon" data-act="heart" id="rh-vheart" title="Save to Liked Songs">${I.bookmark}</button>
  </div>
  <div class="rh-vb-center">
    <div class="rh-vb-buttons">
      <button class="rh-mod m-slate" data-act="shuffle" data-mod="shuffle" title="Shuffle">S</button>
      <button class="rh-mod m-red" data-act="prev" title="Previous">${I.prev}</button>
      <button class="rh-play rh-vb-play" data-act="play"><span class="rh-play-label" id="rh-vplay-label">PLAY</span><span class="rh-play-sub" id="rh-vplay-sub"></span></button>
      <button class="rh-mod m-pink" data-act="next" title="Next">${I.next}</button>
      <button class="rh-mod m-green" data-act="repeat" data-mod="repeat" title="Repeat">RP</button>
    </div>
    <div class="rh-seek rh-vb-seek">
      <span class="rh-time" id="rh-vpos">00:00</span>
      <div class="rh-seek-bar" id="rh-vseek"><div class="rh-seek-fill"></div><div class="rh-seek-knob"></div></div>
      <span class="rh-time" id="rh-vdur">00:00</span>
    </div>
  </div>
  <div class="rh-vb-right">
    <button class="rh-mod m-blue" data-act="mute" id="rh-vmute" title="Mute (scroll to adjust)">${I.vol}</button>
    <input type="range" min="0" max="100" step="1" class="rh-vb-vol" id="rh-vvol">
    <button class="rh-mod m-violet" data-act="vaudio" id="rh-vaudio" title="Switch to audio">${I.note}</button>
    <button class="rh-mod m-purple" data-act="vfull" id="rh-vfull" title="Full screen">${I.full}</button>
    <button class="rh-mod m-gray" data-act="vmin" title="Close video view">${I.shrink}</button>
  </div>
</div>`);
    const vq = (id) => vbar.querySelector("#" + id);

    const wheel = el(`
<div id="rh-wheel">
  <div class="rh-wheel-head">
    <span class="rh-wheel-name" id="rh-wname"></span>
    <span class="rh-wheel-count" id="rh-wcount"></span>
    <span class="rh-spacer"></span>
    <button data-wact="now" title="Jump to the playing song">Now playing</button>
    <button data-wact="random" title="Play a random song">Random</button>
    <button data-wact="list" title="Use Spotify's list view">List view</button>
  </div>
  <div class="rh-wheel-track" id="rh-wtrack">
    <div class="rh-wheel-empty" id="rh-wempty">Loading…</div>
  </div>
  <div class="rh-wheel-scroll"><div class="rh-wheel-thumb" id="rh-wthumb"></div></div>
</div>`);
    const wheelBack = el(`<button id="rh-wheel-back" title="Back to the song wheel">Wheel view</button>`);
    const q = (id) => panel.querySelector("#" + id) || topbar.querySelector("#" + id);

    function syncVars() {
        const nb = $(SEL.left);
        if (!nb) return;
        const cs = getComputedStyle(nb);
        const lw = parseFloat(cs.getPropertyValue("--left-sidebar-width")) || 72;
        const rw = parseFloat(cs.getPropertyValue("--right-sidebar-width")) || 420;
        document.documentElement.style.setProperty("--rh-libw", lw + "px");
        document.documentElement.style.setProperty("--rh-rightw", Math.max(rw, 320) + "px");
    }

    function mount() {
        const top = $(".Root__top-container");
        if (!top) return;
        tagAreas();
        adaptPrefix();
        scheduleShim();
        document.body.classList.add("rh");
        if (!top.contains(topbar)) top.appendChild(topbar);
        if (!top.contains(panel)) top.appendChild(panel);
        if (!top.contains(wheel)) top.appendChild(wheel);
        if (!top.contains(wheelBack)) top.appendChild(wheelBack);
        if (!top.contains(lyr)) top.appendChild(lyr);
        if (!top.contains(vbar)) top.appendChild(vbar);
        if (!document.body.contains(bg)) document.body.prepend(bg);
        initBackground();
        syncVars();
    }

    // Animates elements whose left edge moves when the grid changes, using transforms only (no per-frame layout).
    function flip(change) {
        const els = [panel, wheel, lyr, document.querySelector(SEL.main)].filter((e) => e && e.isConnected && e.getClientRects().length);
        const before = new Map(els.map((e) => [e, e.getBoundingClientRect().left]));
        change();
        els.forEach((e) => {
            if (!e.getClientRects().length) return;
            const dx = before.get(e) - e.getBoundingClientRect().left;
            if (Math.abs(dx) > 1) {
                e.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], { duration: 300, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
            }
        });
    }

    const sideTimers = {};
    const isOpen = (cls) => document.body.classList.contains(cls) && !document.body.classList.contains(cls + "-closing");
    function setSide(cls, open) {
        const cl = document.body.classList;
        clearTimeout(sideTimers[cls]);
        if (open) {
            if (cl.contains(cls + "-closing")) cl.remove(cls + "-closing");
            else if (!cl.contains(cls)) flip(() => cl.add(cls));
            return;
        }
        if (!cl.contains(cls)) return;
        cl.add(cls + "-closing");
        sideTimers[cls] = setTimeout(() => flip(() => cl.remove(cls, cls + "-closing")), 260);
    }

    // The devices ("Connect") button has no stable test id on newer builds; it sits right before the mute button.
    function devicesButton() {
        const named = $(`${SEL.bar} [data-testid="control-button-connect"]`);
        if (named) return named;
        const btns = [...document.querySelectorAll(`${SEL.bar} button`)];
        const mute = btns.findIndex((b) => b.dataset.testid === "volume-bar-toggle-mute-button");
        return mute > 0 ? btns[mute - 1] : $(`${SEL.bar} button[aria-label*="evice"]`);
    }

    let rightPanel = null;
    function toggleRight(kind, btn) {
        if (isOpen("rh-right") && rightPanel === kind) {
            setSide("rh-right", false);
            rightPanel = null;
            return;
        }
        const active = btn && (btn.getAttribute("aria-pressed") === "true" || btn.getAttribute("data-active") === "true");
        if (btn && !active) btn.click();
        rightPanel = kind;
        setSide("rh-right", true);
    }

    function currentMeta() {
        const it = nowItem();
        return it ? { it, m: it.metadata || {} } : null;
    }

    const ACTIONS = {
        back: () => H.goBack(),
        fwd: () => H.goForward(),
        home: () => H.push("/"),
        liked: () => H.push("/collection/tracks"),
        settings: () => H.push("/preferences"),
        market: () => H.push("/marketplace"),
        lib: () => {
            syncVars();
            setSide("rh-lib", !isOpen("rh-lib"));
            updRoute();
        },
        queue: () => toggleRight("queue", $('[data-testid="control-button-queue"]')),
        devices: () => toggleRight("devices", devicesButton()),
        lyrics: () => $('[data-testid="lyrics-button"]')?.click(),
        mini: () => $('[data-testid="pip-toggle-button"]')?.click(),
        fullscreen: () => $('[data-testid="fullscreen-mode-button"]')?.click(),
        play: () => P.togglePlay(),
        prev: () => P.back(),
        next: () => P.next(),
        shuffle: () => P.toggleShuffle(),
        repeat: () => P.toggleRepeat(),
        heart: () => {
            P.toggleHeart();
            setTimeout(updStates, 250);
        },
        volume: () => q("rh-volpop").classList.toggle("open"),
        mute: () => P.toggleMute(),
        vaudio: () => cinemaBtn(/^Switch to (audio|video)$/i)?.click(),
        vfull: () => (cinemaBtn(/^(Enter|Exit) full screen$/i) || $('[data-testid="fullscreen-mode-button"]'))?.click(),
        vmin: () => (cinemaBtn(/^Minimize Now Playing view$/i) || cinemaBtn(/^Exit full screen$/i) || $('[data-testid="fullscreen-mode-button"]'))?.click(),
        album: () => {
            const r = route(currentMeta()?.m.album_uri);
            if (r) H.push(r);
        },
    };

    function onClick(e) {
        const t = e.target.closest("[data-act]");
        if (!t) return;
        e.preventDefault();
        ACTIONS[t.dataset.act]?.();
        setTimeout(updStates, 150);
    }
    topbar.addEventListener("click", onClick);
    panel.addEventListener("click", onClick);
    vbar.addEventListener("click", onClick);
    document.addEventListener("pointerdown", (e) => {
        const pop = q("rh-volpop");
        if (pop.classList.contains("open") && !pop.contains(e.target) && !e.target.closest('[data-mod="volume"]')) pop.classList.remove("open");
    });

    const volBtn = panel.querySelector('[data-mod="volume"]');
    const onWheel = (e) => {
        e.preventDefault();
        const v = P.getVolume();
        P.setVolume(Math.min(1, Math.max(0, v + (e.deltaY < 0 ? 0.05 : -0.05))));
        setTimeout(updStates, 80);
    };
    volBtn.addEventListener("wheel", onWheel, { passive: false });
    q("rh-volpop").addEventListener("wheel", onWheel, { passive: false });
    vq("rh-vmute").addEventListener("wheel", onWheel, { passive: false });
    q("rh-vol").addEventListener("input", (e) => {
        P.setVolume(e.target.value / 100);
        q("rh-vol-num").textContent = e.target.value;
    });
    vq("rh-vvol").addEventListener("input", (e) => P.setVolume(e.target.value / 100));

    const cinemaBtn = (re) => {
        tagAreas();
        return [...document.querySelectorAll(`${SEL.cinema} button`)].find((b) => re.test(b.getAttribute("aria-label") || ""));
    };
    function updVideoButtons() {
        if (!document.querySelector(SEL.cinema)) return;
        const sw = cinemaBtn(/^Switch to (audio|video)$/i);
        vq("rh-vaudio").hidden = !sw;
        if (sw) vq("rh-vaudio").title = sw.getAttribute("aria-label");
        const fs = cinemaBtn(/^(Enter|Exit) full screen$/i);
        vq("rh-vfull").title = fs ? fs.getAttribute("aria-label") : "Full screen";
        vq("rh-vfull").innerHTML = /exit/i.test(fs?.getAttribute("aria-label") || "") ? I.shrink : I.full;
    }

    let searchTimer;
    const doSearch = () => {
        const v = q("rh-q").value.trim();
        if (v) H.push("/search/" + encodeURIComponent(v));
    };
    const wheelActive = () => document.body.classList.contains("rh-wheel-route") && !document.body.classList.contains("rh-native-list");
    q("rh-search").addEventListener("submit", (e) => {
        e.preventDefault();
        if (wheelActive() && W.list.length) playIndex(Math.round(W.pos));
        else doSearch();
    });
    q("rh-q").addEventListener("input", () => {
        clearTimeout(searchTimer);
        if (wheelActive()) {
            searchTimer = setTimeout(() => {
                W.filter = q("rh-q").value.trim();
                applyFilter(false);
            }, 120);
        } else {
            searchTimer = setTimeout(doSearch, 450);
        }
    });
    q("rh-q").addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            q("rh-q").value = "";
            q("rh-q").dispatchEvent(new Event("input"));
            q("rh-q").blur();
        }
    });

    const seekbar = q("rh-seekbar");
    const vseek = vq("rh-vseek");
    let dragging = false;
    function bindSeek(bar) {
        const frac = (e) => {
            const r = bar.getBoundingClientRect();
            return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        };
        bar.addEventListener("pointerdown", (e) => {
            dragging = true;
            bar.setPointerCapture(e.pointerId);
            const d = P.getDuration();
            setSeek(frac(e), frac(e) * d, d);
        });
        bar.addEventListener("pointermove", (e) => {
            if (!dragging) return;
            const d = P.getDuration();
            setSeek(frac(e), frac(e) * d, d);
        });
        bar.addEventListener("pointerup", (e) => {
            if (!dragging) return;
            dragging = false;
            P.seek(Math.round(frac(e) * P.getDuration()));
        });
    }
    bindSeek(seekbar);
    bindSeek(vseek);

    function setSeek(f, p, d) {
        const ff = Math.min(1, Math.max(0, f || 0));
        const left = d ? `-${fmt(d - p)} LEFT` : "";
        seekbar.style.setProperty("--f", ff);
        vseek.style.setProperty("--f", ff);
        q("rh-pos").textContent = vq("rh-vpos").textContent = fmt(p);
        q("rh-dur").textContent = vq("rh-vdur").textContent = fmt(d);
        q("rh-play-sub").textContent = vq("rh-vplay-sub").textContent = left;
    }

    function updProgress() {
        if (dragging) return;
        const d = P.getDuration() || 0;
        const p = P.getProgress() || 0;
        setSeek(d ? p / d : 0, p, d);
    }

    function updTrack() {
        const cur = currentMeta();
        if (!cur) return;
        const { it, m } = cur;
        const cover = img(m.image_xlarge_url || m.image_large_url || m.image_url);
        q("rh-cover").src = cover;
        q("rh-ghost").src = cover;
        $("#rh-bg-img").style.backgroundImage = cover ? `url("${cover}")` : "none";
        panel.classList.toggle("no-cover", !cover);

        const title = m.title || it.name || "Nothing playing";
        q("rh-title").textContent = m.artist_name ? `${m.artist_name} - ${title}` : title;
        q("rh-album").textContent = m.album_title ? `< ${m.album_title} >` : "";
        const feats = [1, 2, 3, 4].map((i) => m["artist_name:" + i]).filter(Boolean);
        const ctx = state().context?.metadata?.context_description;
        q("rh-mapper").textContent = ctx ? `Playing from ${ctx}` : feats.length ? `feat. ${feats.join(", ")}` : "";

        q("rh-s-stars").textContent = "Unrated";
        q("rh-s-track").textContent = m.is_local === "true" ? "Local file" : "— plays";
        plays(it.uri).then((n) => {
            if (!n || nowItem()?.uri !== it.uri) return;
            q("rh-s-track").textContent = `${n.toLocaleString("en-US")} plays`;
            q("rh-s-stars").textContent = `${starsFor(n).toFixed(2)} stars`;
        });
        q("rh-s-dur").textContent = fmt(Number(m.duration) || P.getDuration());
        vq("rh-vcover").src = img(m.image_url || m.image_large_url) || cover;
        vq("rh-vtitle").textContent = title;
        vq("rh-vartist").textContent = [m.artist_name, ...feats].filter(Boolean).join(", ");
        updStates();
        updProgress();
    }

    let lastQueueKey = "";
    function updQueue(force) {
        const upcoming = S.Queue?.nextTracks?.length
            ? S.Queue.nextTracks
            : (S.Platform.PlayerAPI?._state?.nextItems || []).map((it) => ({ contextTrack: { uri: it.uri, uid: it.uid, metadata: it.metadata || {} } }));
        const list = upcoming
            .filter((t) => t?.contextTrack?.uri && !t.contextTrack.uri.includes("delimiter"))
            .slice(0, 30);
        const key = S.Queue?.queueRevision + "|" + list.map((t) => t.contextTrack.uid || t.contextTrack.uri).join(",");
        if (!force && key === lastQueueKey) return;
        lastQueueKey = key;
        const board = q("rh-board");
        board.innerHTML = list.length
            ? list
                  .map((t, i) => {
                      const m = t.contextTrack.metadata || {};
                      const cov = img(m.image_url || m.image_small_url);
                      const name = m.title || "Unknown";
                      const sub = [m.artist_name, m.duration ? fmt(Number(m.duration)) : null].filter(Boolean).join(" • ");
                      return `<div class="rh-lb-row" title="${esc(name)}">
  <span class="rh-lb-rank r${i + 1}">#${i + 1}</span>
  ${cov ? `<img class="rh-lb-av" src="${esc(cov)}" alt="">` : `<span class="rh-lb-av rh-lb-av-empty">${esc(name[0] || "?")}</span>`}
  <div class="rh-lb-text"><div class="rh-lb-name">${esc(name)}</div><div class="rh-lb-sub">${esc(sub)}</div></div>
  <span class="rh-lb-grade g-none">—</span>
</div>`;
                  })
                  .join("")
            : `<div class="rh-lb-empty">Queue is empty</div>`;
        const rows = board.querySelectorAll(".rh-lb-row");
        list.forEach((t, i) => {
            plays(t.contextTrack.uri).then((n) => {
                if (!n || !rows[i].isConnected) return;
                const [g, gc] = grade(n);
                const gEl = rows[i].querySelector(".rh-lb-grade");
                gEl.textContent = g;
                gEl.className = "rh-lb-grade " + gc;
                const sub = rows[i].querySelector(".rh-lb-sub");
                sub.textContent = sub.textContent + " • " + short(n) + " plays";
            });
        });
    }

    function updPlay() {
        const playing = P.isPlaying();
        q("rh-play-label").textContent = vq("rh-vplay-label").textContent = playing ? "PAUSE" : "PLAY";
        q("rh-mini-play").innerHTML = playing ? I.pause : I.play;
        panel.classList.toggle("is-playing", playing);
    }

    function updStates() {
        const mod = (k) => panel.querySelector(`[data-mod="${k}"]`);
        const both = (k) => [mod(k), vbar.querySelector(`[data-mod="${k}"]`)].filter(Boolean);
        both("shuffle").forEach((b) => b.classList.toggle("on", !!P.getShuffle()));
        const rep = P.getRepeat();
        both("repeat").forEach((b) => {
            b.classList.toggle("on", rep > 0);
            b.textContent = rep === 2 ? "RP1" : "RP";
        });
        mod("queue").classList.toggle("on", rightPanel === "queue");
        mod("devices").classList.toggle("on", rightPanel === "devices");

        const liked = !!P.getHeart();
        [q("rh-heart"), vq("rh-vheart")].forEach((b) => {
            b.innerHTML = liked ? I.bookmarked : I.bookmark;
            b.classList.toggle("on", liked);
        });
        q("rh-s-status").textContent = liked ? "Saved" : "Not saved";

        const muted = P.getMute();
        const vol = Math.round((P.getVolume() || 0) * 100);
        const volIcon = muted || vol === 0 ? I.mute : I.vol;
        volBtn.innerHTML = q("rh-mute").innerHTML = vq("rh-vmute").innerHTML = volIcon;
        volBtn.title = `Volume ${vol}% (scroll to adjust)`;
        if (document.activeElement !== q("rh-vol")) q("rh-vol").value = vol;
        if (document.activeElement !== vq("rh-vvol")) vq("rh-vvol").value = vol;
        q("rh-vol-num").textContent = vol;
        updVideoButtons();
        updPlay();
    }

    function markCurrentRow() {
        const cur = currentMeta();
        const title = cur ? cur.m.title || cur.it.name : null;
        const artist = cur?.m.artist_name;
        document.querySelectorAll(".main-view-container [role='row']").forEach((r) => {
            const t = r.querySelector(".main-trackList-rowMainContentTitle")?.textContent;
            const isCur = !!title && t === title && (!artist || (r.textContent || "").includes(artist));
            if (isCur !== r.hasAttribute("data-rh-current")) r.toggleAttribute("data-rh-current", isCur);
        });
    }

    function numberQueue() {
        let n = 0;
        document.querySelectorAll(`${SEL.right} li[role='row']`).forEach((li) => {
            const playing = !!li.querySelector('[class*="-legacy-list-row-title"].encore-internal-color-text-bright-accent');
            const rank = playing ? "" : String(++n);
            if (li.dataset.rhRank !== rank) li.dataset.rhRank = rank;
        });
    }

    function updRoute() {
        const p = H.location?.pathname || "/";
        const lib = isOpen("rh-lib");
        document.body.classList.toggle("rh-lyrics-route", p.startsWith("/lyrics"));
        document.body.classList.toggle("rh-search-route", p.startsWith("/search"));
        topbar.querySelectorAll("[data-tab]").forEach((b) => {
            const t = b.dataset.tab;
            b.classList.toggle("active", t === "lib" ? lib : t === "home" ? p === "/" : p.startsWith("/collection/tracks"));
        });
    }

    // ================= Song wheel =================
    const PA = S.Platform.PlayerAPI;
    const W = {
        all: [], list: [], ctx: null, path: null, filter: "", loadId: 0,
        pos: 0, target: 0, pool: new Map(), raf: 0, last: 0,
        userMoved: false, lastInput: 0, settleT: 0, wheelT: 0, justDragged: false,
    };
    const wTrack = wheel.querySelector("#rh-wtrack");
    const wEmpty = wheel.querySelector("#rh-wempty");
    const wThumb = wheel.querySelector("#rh-wthumb");
    const nowUri = () => nowItem()?.uri;

    function metrics() {
        const cardH = Math.round(Math.min(160, Math.max(92, window.innerHeight * 0.145)));
        return { h: wTrack.clientHeight || 600, cardH, step: cardH + 16 };
    }

    function fillStars(node, t, n) {
        if (!n || !node.isConnected) return;
        const stars = starsFor(n);
        const count = Math.max(1, Math.min(8, Math.round(stars)));
        node.querySelector(".rh-card-stars").innerHTML = `${I.star.repeat(count)}<span>${stars.toFixed(2)} stars - ${fmt(t.dur)}</span>`;
        const [g, gc] = grade(n);
        const gEl = node.querySelector(".rh-card-grade");
        gEl.textContent = g;
        gEl.className = "rh-card-grade " + gc;
    }

    const playQueue = [];
    let playActive = 0;
    function pumpPlays() {
        while (playActive < 3 && playQueue.length) {
            const [t, node] = playQueue.shift();
            if (!node.isConnected) continue;
            playActive++;
            plays(t.uri)
                .then((n) => fillStars(node, t, n))
                .finally(() => {
                    playActive--;
                    pumpPlays();
                });
        }
    }
    function wantPlays(t, node) {
        if (playCache.has(t.uri)) playCache.get(t.uri).then((n) => fillStars(node, t, n));
        else {
            playQueue.push([t, node]);
            pumpPlays();
        }
    }

    function makeCard(t, i) {
        const node = el(`
<div class="rh-card" data-i="${i}">
  ${t.cover ? `<img class="rh-card-art" src="${esc(t.cover)}" alt="" draggable="false">` : `<div class="rh-card-art rh-card-art-empty">${esc(t.name[0] || "?")}</div>`}
  <div class="rh-card-grade"></div>
  <div class="rh-card-text">
    <div class="rh-card-title">${esc(t.artist ? `${t.artist} - ${t.name}` : t.name)}</div>
    <div class="rh-card-sub">${esc(t.album || t.artists)}</div>
    <div class="rh-card-stars"><span>${fmt(t.dur)}</span></div>
  </div>
</div>`);
        wantPlays(t, node);
        return node;
    }

    function render() {
        const { h, cardH, step } = metrics();
        wheel.style.setProperty("--rh-card-h", cardH + "px");
        const n = W.list.length;
        const span = Math.ceil(h / 2 / step) + 2;
        const lo = Math.max(0, Math.floor(W.pos) - span);
        const hi = Math.min(n - 1, Math.ceil(W.pos) + span);
        for (const [i, node] of W.pool) {
            if (i < lo || i > hi) {
                node.remove();
                W.pool.delete(i);
            }
        }
        const center = Math.round(W.pos);
        const now = nowUri();
        for (let i = lo; i <= hi; i++) {
            let node = W.pool.get(i);
            if (!node) {
                node = makeCard(W.list[i], i);
                W.pool.set(i, node);
                wTrack.appendChild(node);
            }
            const d = i - W.pos;
            const x = 110 * (1 - Math.exp(-Math.abs(d) * 0.85));
            const y = h / 2 + d * step - cardH / 2;
            node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
            node.classList.toggle("is-center", i === center);
            node.classList.toggle("is-now", W.list[i].uri === now);
        }
        const trackH = wThumb.parentElement.clientHeight;
        wThumb.style.transform = `translateY(${((n > 1 ? W.pos / (n - 1) : 0) * Math.max(0, trackH - 70)).toFixed(1)}px)`;
    }

    function tick(ts) {
        const dt = Math.min(64, ts - (W.last || ts - 16.67));
        W.last = ts;
        W.pos += (W.target - W.pos) * (1 - Math.pow(0.8, dt / 16.67));
        if (Math.abs(W.target - W.pos) < 0.002) W.pos = W.target;
        render();
        if (W.pos !== W.target) W.raf = requestAnimationFrame(tick);
        else {
            W.raf = 0;
            W.last = 0;
            onSettle();
        }
    }
    const kick = () => {
        if (!W.raf) W.raf = requestAnimationFrame(tick);
    };

    function setTarget(t, user) {
        const n = W.list.length;
        if (!n) return;
        W.target = Math.min(n - 1, Math.max(0, t));
        if (user) {
            W.userMoved = true;
            W.lastInput = Date.now();
            clearTimeout(W.settleT);
        }
        kick();
    }

    function onSettle() {
        if (!W.userMoved || !Number.isInteger(W.target)) return;
        clearTimeout(W.settleT);
        W.settleT = setTimeout(() => {
            W.userMoved = false;
            playIndex(Math.round(W.pos));
        }, 220);
    }

    function playIndex(i) {
        const t = W.list[i];
        if (!t || !W.ctx) return;
        if (nowUri() === t.uri) {
            if (!P.isPlaying()) P.play();
            return;
        }
        W.lastInput = Date.now();
        const skipTo = t.uid ? { uri: t.uri, uid: t.uid } : { uri: t.uri };
        Promise.resolve(PA.play({ uri: W.ctx }, { featureIdentifier: "your_library" }, { skipTo })).catch(() => P.playUri(t.uri));
    }

    function syncToNow(force) {
        if (!W.list.length) return;
        if (!force && (W.userMoved || Date.now() - W.lastInput < 2500)) return;
        const i = W.list.findIndex((t) => t.uri === nowUri());
        if (i < 0) return;
        W.userMoved = false;
        if (Math.abs(i - W.pos) < 60) setTarget(i, false);
        else {
            W.pos = W.target = i;
            render();
        }
    }

    function applyFilter(jumpToNow) {
        const qs = W.filter.toLowerCase();
        const keepUri = jumpToNow ? nowUri() : W.list[Math.round(W.pos)]?.uri;
        W.list = qs ? W.all.filter((t) => `${t.name} ${t.artists} ${t.album}`.toLowerCase().includes(qs)) : W.all;
        for (const node of W.pool.values()) node.remove();
        W.pool.clear();
        W.pos = W.target = Math.max(0, W.list.findIndex((t) => t.uri === keepUri));
        W.userMoved = false;
        wheel.querySelector("#rh-wcount").textContent = qs ? `${W.list.length} / ${W.all.length} songs` : `${W.all.length} songs`;
        wEmpty.textContent = W.list.length ? "" : qs ? "No songs match your search" : "No songs here";
        render();
    }

    const pickImg = (imgs) => img((imgs || []).find((i) => i.label === "standard")?.url || imgs?.[0]?.url);
    const norm = (t) => ({
        uri: t.uri,
        uid: t.uid,
        name: t.name || "Unknown",
        artist: t.artists?.[0]?.name || "",
        artists: (t.artists || []).map((a) => a.name).join(", "),
        album: t.album?.name || "",
        cover: pickImg(t.album?.images),
        dur: t.duration?.milliseconds || 0,
    });
    let username = null;

    async function loadWheel(path) {
        const id = ++W.loadId;
        const [, type, key] = path.split("/");
        W.all = [];
        W.ctx = null;
        applyFilter(false);
        wEmpty.textContent = "Loading…";
        wheel.querySelector("#rh-wname").textContent = "";
        let ctx, name, items;
        try {
            if (type === "collection") {
                username = username || (await S.Platform.UserAPI.getUser()).username;
                ctx = `spotify:user:${username}:collection`;
                name = "Liked Songs";
                items = (await S.Platform.LibraryAPI.getTracks({ limit: 10000, offset: 0 })).items.map(norm);
            } else if (type === "playlist") {
                ctx = `spotify:playlist:${key}`;
                const [meta, c] = await Promise.all([
                    S.Platform.PlaylistAPI.getMetadata(ctx).catch(() => null),
                    S.Platform.PlaylistAPI.getContents(ctx, { limit: 10000, offset: 0 }),
                ]);
                name = meta?.name || "Playlist";
                items = c.items.filter((t) => t.type === "track").map(norm);
            } else if (type === "album") {
                ctx = `spotify:album:${key}`;
                const G = S.GraphQL;
                const [a, tr] = await Promise.all([
                    G.Request(G.Definitions.getAlbum, { uri: ctx, locale: "", offset: 0, limit: 50 }),
                    G.Request(G.Definitions.queryAlbumTracks, { uri: ctx, offset: 0, limit: 500 }),
                ]);
                const u = a?.data?.albumUnion || {};
                name = u.name || "Album";
                const srcs = u.coverArt?.sources || [];
                const cover = (srcs.find((s) => s.width === 300) || srcs[0])?.url || "";
                items = (tr?.data?.albumUnion?.tracksV2?.items || []).map(({ track: t, uid }) => {
                    const n = Number(t.playcount) || null;
                    if (n) playCache.set(t.uri, Promise.resolve(n));
                    const artists = (t.artists?.items || []).map((x) => x.profile?.name).filter(Boolean);
                    return { uri: t.uri, uid, name: t.name, artist: artists[0] || "", artists: artists.join(", "), album: name, cover, dur: t.duration?.totalMilliseconds || 0 };
                });
            }
        } catch (e) {
            console.warn("[Rhythia] could not load song wheel", e);
        }
        if (id !== W.loadId) return;
        if (!items) {
            document.body.classList.add("rh-native-list");
            return;
        }
        W.ctx = ctx;
        W.all = items;
        wheel.querySelector("#rh-wname").textContent = name;
        applyFilter(true);
    }

    const isWheelRoute = (p) => /^\/(collection\/tracks|playlist\/[^/]+|album\/[^/]+)\/?$/.test(p);
    function updWheelRoute() {
        const p = H.location?.pathname || "/";
        const on = isWheelRoute(p);
        document.body.classList.toggle("rh-wheel-route", on);
        q("rh-q").placeholder = on && !document.body.classList.contains("rh-native-list") ? "Search map" : "Search songs";
        if (on && p !== W.path) {
            W.path = p;
            W.filter = "";
            q("rh-q").value = "";
            loadWheel(p);
        }
        if (!on) W.path = null;
    }

    wheel.addEventListener(
        "wheel",
        (e) => {
            if (!W.list.length) return;
            e.preventDefault();
            const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
            setTarget(W.target + dy / 100, true);
            clearTimeout(W.wheelT);
            W.wheelT = setTimeout(() => setTarget(Math.round(W.target), true), 110);
        },
        { passive: false }
    );

    let drag = null;
    wTrack.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || !W.list.length) return;
        drag = { y: e.clientY, t: W.target, moved: false, id: e.pointerId };
    });
    wTrack.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const dy = e.clientY - drag.y;
        if (!drag.moved && Math.abs(dy) > 6) {
            drag.moved = true;
            wTrack.setPointerCapture(drag.id);
            wTrack.classList.add("dragging");
        }
        if (drag.moved) setTarget(drag.t - dy / metrics().step, true);
    });
    const endDrag = () => {
        if (!drag) return;
        if (drag.moved) {
            W.justDragged = true;
            setTimeout(() => (W.justDragged = false), 50);
            setTarget(Math.round(W.target), true);
        }
        wTrack.classList.remove("dragging");
        drag = null;
    };
    wTrack.addEventListener("pointerup", endDrag);
    wTrack.addEventListener("pointercancel", endDrag);

    wTrack.addEventListener("click", (e) => {
        if (W.justDragged) return;
        const card = e.target.closest(".rh-card");
        if (!card) return;
        const i = Number(card.dataset.i);
        if (i === Math.round(W.pos) && W.pos === W.target) {
            if (nowUri() === W.list[i]?.uri) P.togglePlay();
            else playIndex(i);
        } else setTarget(i, true);
    });

    wheel.querySelector(".rh-wheel-head").addEventListener("click", (e) => {
        const act = e.target.closest("[data-wact]")?.dataset.wact;
        if (act === "random" && W.list.length) setTarget(Math.floor(Math.random() * W.list.length), true);
        if (act === "now") syncToNow(true);
        if (act === "list") {
            document.body.classList.add("rh-native-list");
            updWheelRoute();
        }
    });
    wheelBack.addEventListener("click", () => {
        document.body.classList.remove("rh-native-list");
        updWheelRoute();
        requestAnimationFrame(render);
    });

    document.addEventListener("keydown", (e) => {
        if (!wheelActive() || !W.list.length || e.ctrlKey || e.altKey || e.metaKey) return;
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
        const c = Math.round(W.target);
        const moves = { ArrowDown: c + 1, ArrowUp: c - 1, PageDown: c + 6, PageUp: c - 6, Home: 0, End: W.list.length - 1 };
        if (e.key in moves) {
            e.preventDefault();
            e.stopPropagation();
            setTarget(moves[e.key], true);
        } else if (e.key === "Enter") {
            e.preventDefault();
            playIndex(c);
        }
    }, true);

    new ResizeObserver(() => render()).observe(wTrack);
    onSong(() => {
        render();
        setTimeout(() => syncToNow(false), 50);
    });

    // ================= Topographic background shader =================
    const BG = {
        canvas: null, gl: null, uni: null, raf: 0, last: 0, frameGap: 0,
        time: Math.random() * 100, energy: 0.3, pulse: 0,
        analysis: null, uri: null, beat: 0, bar: 0,
        reduced: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    };

    const BG_VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

    const BG_FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uPulse;
uniform float uEnergy;
out vec4 o;

vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dot(hash(i), f), dot(hash(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
               mix(dot(hash(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0, a = 0.6;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 2; i++) { v += a * noise(p); p = m * p; a *= 0.38; }
    return v;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    uv *= 1.0 - uPulse * 0.008;
    vec2 q = uv * 2.7 + vec2(uTime * 0.012, uTime * 0.007);
    vec2 w = vec2(fbm(q + vec2(0.0, uTime * 0.03)), fbm(q + vec2(5.2, 1.3) - uTime * 0.025));
    float h = fbm(q + 0.75 * w);
    float f = h * 11.0 - uTime * 0.12 - uPulse * 0.12;
    float d = abs(fract(f + 0.5) - 0.5);
    float g = max(fwidth(f), 1e-4);
    float thick = 0.8 + uPulse * 0.25 + uEnergy * 0.1;
    float line = 1.0 - smoothstep(thick * 0.5 * g, (thick * 0.5 + 1.0) * g, d);
    vec3 gold = vec3(0.84, 0.65, 0.16);
    vec3 purple = vec3(0.71, 0.37, 0.77);
    vec3 col = mix(purple, gold, smoothstep(-0.7, 0.7, uv.x + 0.35 * sin(h * 6.0 + uTime * 0.05)));
    col = mix(col, vec3(0.62, 0.6, 0.68), 0.45);
    col = mix(col, vec3(1.0), uPulse * 0.12);
    float a = line * (0.055 + 0.03 * uEnergy + 0.045 * uPulse);
    o = vec4(col * a, a);
}`;

    function initBackground() {
        if (BG.canvas) return;
        const canvas = document.createElement("canvas");
        canvas.id = "rh-bg-canvas";
        const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
        if (!gl) return;
        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            return s;
        };
        try {
            const prog = gl.createProgram();
            gl.attachShader(prog, compile(gl.VERTEX_SHADER, BG_VERT));
            gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, BG_FRAG));
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
            gl.useProgram(prog);
            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            const loc = gl.getAttribLocation(prog, "p");
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
            BG.uni = {
                res: gl.getUniformLocation(prog, "uRes"),
                time: gl.getUniformLocation(prog, "uTime"),
                pulse: gl.getUniformLocation(prog, "uPulse"),
                energy: gl.getUniformLocation(prog, "uEnergy"),
            };
        } catch (e) {
            console.warn("[Rhythia] background shader disabled", e);
            return;
        }
        canvas.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            cancelAnimationFrame(BG.raf);
            BG.raf = 0;
            canvas.remove();
        });
        BG.canvas = canvas;
        BG.gl = gl;
        bg.appendChild(canvas);
        new ResizeObserver(sizeBackground).observe(document.documentElement);
        sizeBackground();
        loadAnalysis();
        kickBackground();
    }

    function sizeBackground() {
        if (!BG.canvas) return;
        const scale = 0.6 * Math.min(window.devicePixelRatio || 1, 1.5);
        BG.canvas.width = Math.max(1, Math.round(window.innerWidth * scale));
        BG.canvas.height = Math.max(1, Math.round(window.innerHeight * scale));
        BG.gl.viewport(0, 0, BG.canvas.width, BG.canvas.height);
        if (BG.reduced) drawBackground();
    }

    async function loadAnalysis() {
        const uri = nowItem()?.uri;
        if (uri === BG.uri) return;
        BG.uri = uri;
        BG.analysis = null;
        BG.beat = BG.bar = 0;
        if (!uri?.startsWith("spotify:track:") || typeof S.getAudioData !== "function") return;
        try {
            const d = await S.getAudioData(uri);
            if (BG.uri === uri && d?.beats?.length) BG.analysis = { beats: d.beats, bars: d.bars || [], segments: d.segments || [], seg: 0 };
        } catch {}
    }

    const seekIndex = (list, idx, t) => {
        if (!list.length) return -1;
        if (idx >= list.length || list[idx].start > t) idx = 0;
        while (idx + 1 < list.length && list[idx + 1].start <= t) idx++;
        return list[idx].start <= t ? idx : -1;
    };

    function musicState(t) {
        const a = BG.analysis;
        if (!a) return { kick: 0, loud: 0.45 };
        const bi = seekIndex(a.beats, BG.beat, t);
        BG.beat = Math.max(bi, 0);
        let kick = 0;
        if (bi >= 0) {
            const b = a.beats[bi];
            const ph = (t - b.start) / Math.max(0.05, b.duration);
            kick = Math.exp(-ph * 5) * (0.6 + 0.4 * (b.confidence || 0));
            const ri = seekIndex(a.bars, BG.bar, t);
            BG.bar = Math.max(ri, 0);
            if (ri >= 0 && Math.abs(a.bars[ri].start - b.start) < 0.05) kick *= 1.45;
        }
        let loud = 0.45;
        const si = seekIndex(a.segments, a.seg, t);
        a.seg = Math.max(si, 0);
        if (si >= 0) {
            const sg = a.segments[si];
            const peak = sg.start + (sg.loudness_max_time || 0);
            const db = t < peak
                ? sg.loudness_start + (sg.loudness_max - sg.loudness_start) * ((t - sg.start) / Math.max(0.01, peak - sg.start))
                : sg.loudness_max;
            loud = Math.min(1, Math.max(0, (db + 38) / 34));
        }
        return { kick: Math.min(1.4, kick), loud };
    }

    function drawBackground() {
        const gl = BG.gl;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(BG.uni.res, BG.canvas.width, BG.canvas.height);
        gl.uniform1f(BG.uni.time, BG.time);
        gl.uniform1f(BG.uni.pulse, BG.pulse);
        gl.uniform1f(BG.uni.energy, BG.energy);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function tickBackground(ts) {
        BG.raf = 0;
        if (!BG.gl) return;
        const playing = P.isPlaying();
        const dt = Math.min(0.1, (ts - (BG.last || ts)) / 1000);
        if (!playing && BG.last && ts - BG.last < 50) {
            BG.raf = requestAnimationFrame(tickBackground);
            return;
        }
        BG.last = ts;
        const { kick, loud } = playing ? musicState((P.getProgress() || 0) / 1000) : { kick: 0, loud: 0.15 };
        BG.energy += (loud - BG.energy) * Math.min(1, dt * 4);
        const target = kick * (0.45 + 0.55 * BG.energy);
        BG.pulse += (target - BG.pulse) * Math.min(1, dt * (target > BG.pulse ? 30 : 8));
        BG.time += dt * (playing ? 0.22 + 0.45 * BG.energy : 0.1);
        drawBackground();
        BG.raf = requestAnimationFrame(tickBackground);
    }

    function kickBackground() {
        if (!BG.gl || BG.raf) return;
        if (BG.reduced) {
            drawBackground();
            return;
        }
        BG.last = 0;
        BG.raf = requestAnimationFrame(tickBackground);
    }

    onSong(() => {
        loadAnalysis();
        kickBackground();
    });
    onPlayPause(kickBackground);

    // ================= Lyrics =================
    const lyr = el(`
<div id="rh-lyrics">
  <div class="rh-lyr-head">
    <div class="rh-lyr-modes" id="rh-lyr-modes">
      <button data-mode="text">Text</button>
      <button data-mode="line">Synced</button>
      <button data-mode="word">Word</button>
      <button data-mode="letter">Letter</button>
    </div>
    <span class="rh-spacer"></span>
    <span class="rh-lyr-src" id="rh-lyr-src"></span>
  </div>
  <div class="rh-lyr-body" id="rh-lyr-body"></div>
</div>`);
    const lyrBody = lyr.querySelector("#rh-lyr-body");
    const lyrSrc = lyr.querySelector("#rh-lyr-src");
    const MODES = ["text", "line", "word", "letter"];
    const readMode = () => {
        try {
            return localStorage.getItem("rh-lyrics-mode");
        } catch {
            return null;
        }
    };
    const L = { uri: null, data: null, mode: MODES.includes(readMode()) ? readMode() : "word", els: [], active: -2, raf: 0, userScroll: 0, loadId: 0, cache: new Map() };
    const lyricsVisible = () => document.body.classList.contains("rh-lyrics-route");

    function parseLrc(txt) {
        const out = [];
        const lead = /^\s*\[(\d+):(\d+(?:\.\d+)?)\]/;
        for (const raw of String(txt).split(/\r?\n/)) {
            let rest = raw;
            const times = [];
            let m;
            while ((m = lead.exec(rest))) {
                times.push((Number(m[1]) * 60 + Number(m[2])) * 1000);
                rest = rest.slice(m[0].length);
            }
            if (!times.length) continue;
            let words = null;
            if (/<\d+:\d+(?:\.\d+)?>/.test(rest)) {
                words = [];
                const re = /<(\d+):(\d+(?:\.\d+)?)>([^<]*)/g;
                let w;
                while ((w = re.exec(rest))) if (w[3]) words.push({ t: w[3], s: (Number(w[1]) * 60 + Number(w[2])) * 1000 });
                rest = rest.replace(/<\d+:\d+(?:\.\d+)?>/g, "");
            }
            for (const t of times) out.push({ start: t, text: rest.trim(), words: words && words.map((x) => ({ ...x })) });
        }
        out.sort((a, b) => a.start - b.start);
        return out.length ? out : null;
    }

    function finalizeLines(lines, durMs) {
        lines = lines.filter((l) => l && Number.isFinite(l.start));
        lines.forEach((l, i) => {
            const next = lines[i + 1]?.start;
            if (!l.end || l.end <= l.start) l.end = next ?? Math.min(l.start + 6000, durMs || l.start + 6000);
            l.text = (l.text || "").trim();
            if (l.words?.length) {
                l.real = true;
                l.words.forEach((w, j) => (w.e = l.words[j + 1]?.s ?? l.end));
            } else {
                l.real = false;
                const toks = l.text.match(/\S+\s*/g) || [];
                const chars = toks.reduce((a, t) => a + t.trim().length, 0) || 1;
                const span = Math.min(l.end - l.start, Math.max(900, chars * 90));
                let s = l.start;
                l.words = toks.map((t) => {
                    const d = (span * t.trim().length) / chars;
                    const w = { t, s, e: s + d };
                    s += d;
                    return w;
                });
            }
        });
        return lines;
    }

    async function fromSpotify(uri) {
        if (!S.CosmosAsync || !uri?.startsWith("spotify:track:")) return null;
        const id = uri.split(":")[2];
        const r = await S.CosmosAsync.get(
            `https://spclient.wg.spotify.com/color-lyrics/v2/track/${id}?format=json&vocalRemoval=false&market=from_token`,
            null,
            { "app-platform": "WebPlayer" }
        );
        const ly = r?.lyrics;
        if (!ly?.lines?.length) return null;
        if (ly.syncType === "UNSYNCED") return { plain: ly.lines.map((l) => l.words).join("\n"), provider: ly.provider };
        const lines = ly.lines.map((l) => {
            const line = { start: Number(l.startTimeMs), end: Number(l.endTimeMs) || 0, text: l.words === "♪" ? "" : l.words, words: null };
            const syl = l.syllables || [];
            if (ly.syncType === "SYLLABLE_SYNCED" && syl.length && syl.every((s) => s.numChars != null)) {
                let pos = 0;
                line.words = syl.map((s) => {
                    const t = l.words.slice(pos, pos + Number(s.numChars));
                    pos += Number(s.numChars);
                    return { t, s: Number(s.startTimeMs) };
                });
                if (pos < l.words.length) line.words[line.words.length - 1].t += l.words.slice(pos);
            }
            return line;
        });
        return { lines, provider: ly.provider };
    }

    const cleanTitle = (t) => String(t || "").replace(/\s*[([].*?(feat|ft\.|with|remaster|version|edit|mix|live).*?[)\]]/gi, "").replace(/\s+-\s+.*$/, "").trim();

    async function fromLrclib(m) {
        const dur = Math.round(Number(m.duration) / 1000);
        const base = "https://lrclib.net/api/";
        let j = null;
        try {
            const r = await fetch(base + "get?" + new URLSearchParams({ artist_name: m.artist_name || "", track_name: m.title || "", album_name: m.album_title || "", duration: dur }));
            if (r.ok) j = await r.json();
        } catch {}
        if (!j || (!j.syncedLyrics && !j.plainLyrics && !j.instrumental)) {
            try {
                const r = await fetch(base + "search?" + new URLSearchParams({ track_name: cleanTitle(m.title), artist_name: m.artist_name || "" }));
                if (r.ok) {
                    const list = (await r.json()).filter((x) => x.syncedLyrics || x.plainLyrics);
                    list.sort((a, b) => Math.abs(a.duration - dur) - Math.abs(b.duration - dur));
                    j = list[0] && Math.abs(list[0].duration - dur) <= 8 ? list[0] : null;
                }
            } catch {}
        }
        if (!j) return null;
        if (j.instrumental) return { instrumental: true };
        return { plain: j.plainLyrics || null, lines: j.syncedLyrics ? parseLrc(j.syncedLyrics) : null };
    }

    async function loadLyrics(force) {
        const cur = currentMeta();
        if (!cur) return;
        const uri = cur.it.uri;
        if (!force && L.uri === uri && L.data) return;
        const id = ++L.loadId;
        L.uri = uri;
        L.data = null;
        lyrBody.innerHTML = `<div class="rh-lyr-msg">Loading lyrics…</div>`;
        lyrSrc.textContent = "";
        let data = L.cache.get(uri);
        if (!data) {
            const [sp, lr] = await Promise.all([fromSpotify(uri).catch(() => null), fromLrclib(cur.m).catch(() => null)]);
            if (id !== L.loadId) return;
            const durMs = Number(cur.m.duration) || P.getDuration();
            const spReal = sp?.lines?.some((l) => l.words);
            const lrReal = lr?.lines?.some((l) => l.words);
            let lines = null;
            let lineSrc = null;
            if (sp?.lines && spReal) [lines, lineSrc] = [sp.lines, `Spotify · ${sp.provider || "lyrics"}`];
            else if (lr?.lines && lrReal) [lines, lineSrc] = [lr.lines, "LRCLIB"];
            else if (sp?.lines) [lines, lineSrc] = [sp.lines, `Spotify · ${sp.provider || "lyrics"}`];
            else if (lr?.lines) [lines, lineSrc] = [lr.lines, "LRCLIB"];
            lines = lines ? finalizeLines(lines.map((l) => ({ ...l, words: l.words && l.words.map((w) => ({ ...w })) })), durMs) : null;
            const plain = lr?.plain || sp?.plain || (lines ? lines.map((l) => l.text).join("\n") : null);
            data = {
                lines,
                plain,
                lineSrc,
                plainSrc: lr?.plain ? "LRCLIB" : sp?.plain ? "Spotify" : lineSrc,
                wordsReal: !!lines?.some((l) => l.real),
                instrumental: !!lr?.instrumental && !lines && !plain,
            };
            L.cache.set(uri, data);
        }
        if (id !== L.loadId) return;
        L.data = data;
        renderLyrics();
    }

    function effectiveMode() {
        if (!L.data?.lines) return "text";
        return L.mode;
    }

    function renderLyrics() {
        const d = L.data;
        const mode = effectiveMode();
        lyr.querySelectorAll("[data-mode]").forEach((b) => {
            b.classList.toggle("active", b.dataset.mode === mode);
            b.disabled = b.dataset.mode !== "text" ? !d?.lines : !(d?.plain || d?.lines);
        });
        lyrBody.className = "rh-lyr-body rh-mode-" + mode;
        L.els = [];
        L.active = -2;
        if (!d || (!d.lines && !d.plain)) {
            lyrBody.innerHTML = `<div class="rh-lyr-msg">${d?.instrumental ? "♪ Instrumental" : "No lyrics found for this song"}</div>`;
            lyrSrc.textContent = "";
            return;
        }
        const est = (mode === "word" && !d.wordsReal) || mode === "letter";
        lyrSrc.innerHTML = `${esc(mode === "text" ? d.plainSrc : d.lineSrc)}${
            est ? ` · <span class="rh-est">${mode === "letter" ? (d.wordsReal ? "letters estimated from word timing" : "estimated timing") : "estimated word timing"}</span>` : ""
        }`;
        if (mode === "text") {
            lyrBody.innerHTML = String(d.plain)
                .split(/\r?\n/)
                .map((t) => `<div class="rh-ll">${esc(t) || "&nbsp;"}</div>`)
                .join("");
            lyrBody.scrollTop = 0;
            return;
        }
        const frag = document.createDocumentFragment();
        d.lines.forEach((l, i) => {
            const div = document.createElement("div");
            div.className = "rh-ll";
            div.dataset.i = i;
            if (!l.text) {
                div.classList.add("rh-gap");
                div.textContent = "♪";
            } else if (mode === "line") {
                div.textContent = l.text;
            } else {
                l.words.forEach((w) => {
                    const span = document.createElement("span");
                    span.className = "rh-w";
                    if (mode === "letter") {
                        const chars = [...w.t];
                        const visible = chars.filter((c) => c.trim()).length || 1;
                        let k = 0;
                        chars.forEach((c) => {
                            if (!c.trim()) {
                                span.appendChild(document.createTextNode(c));
                                return;
                            }
                            const cs = document.createElement("span");
                            cs.className = "rh-c";
                            cs.textContent = c;
                            cs.dataset.t = String(w.s + ((w.e - w.s) * k) / visible);
                            k++;
                            span.appendChild(cs);
                        });
                    } else span.textContent = w.t;
                    div.appendChild(span);
                });
            }
            frag.appendChild(div);
            L.els.push(div);
        });
        lyrBody.innerHTML = "";
        lyrBody.appendChild(frag);
        lyrBody.scrollTop = 0;
        kickLyrics();
    }

    function centerLine(elm, smooth) {
        if (!elm || Date.now() - L.userScroll < 3500) return;
        const top = elm.offsetTop - lyrBody.clientHeight * 0.42 + elm.offsetHeight / 2;
        lyrBody.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
    }

    function tickLyrics() {
        L.raf = 0;
        if (!lyricsVisible() || !L.data?.lines || effectiveMode() === "text") return;
        const lines = L.data.lines;
        const t = P.getProgress() || 0;
        let a = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].start <= t) a = i;
            else break;
        }
        if (a !== L.active) {
            const jump = Math.abs(a - L.active) > 3;
            L.els.forEach((e, i) => {
                const dd = i - a;
                e.classList.toggle("past", dd < 0);
                e.classList.toggle("active", dd === 0);
                e.dataset.d = dd > 0 ? String(Math.min(dd, 4)) : "";
                if (dd < 0 && L.mode !== "line") e.classList.add("done");
                else e.classList.remove("done");
            });
            L.active = a;
            centerLine(L.els[Math.max(a, 0)], !jump);
        }
        const mode = effectiveMode();
        const el = L.els[a];
        if (el && a >= 0 && mode === "word") {
            const ws = el.children;
            lines[a].words.forEach((w, j) => {
                const p = Math.min(1, Math.max(0, (t - w.s) / Math.max(1, w.e - w.s)));
                if (ws[j]) {
                    ws[j].style.setProperty("--p", p.toFixed(3));
                    ws[j].classList.toggle("on", p > 0 && p < 1);
                }
            });
        } else if (el && a >= 0 && mode === "letter") {
            el.querySelectorAll(".rh-c").forEach((c) => c.classList.toggle("lit", t >= Number(c.dataset.t)));
        }
        if (P.isPlaying() || a !== L.active) L.raf = requestAnimationFrame(tickLyrics);
    }
    const kickLyrics = () => {
        if (!L.raf) L.raf = requestAnimationFrame(tickLyrics);
    };

    lyr.querySelector("#rh-lyr-modes").addEventListener("click", (e) => {
        const b = e.target.closest("[data-mode]");
        if (!b || b.disabled) return;
        L.mode = b.dataset.mode;
        try {
            localStorage.setItem("rh-lyrics-mode", L.mode);
        } catch {}
        L.userScroll = 0;
        renderLyrics();
    });
    lyrBody.addEventListener("wheel", () => (L.userScroll = Date.now()), { passive: true });
    lyrBody.addEventListener("pointerdown", (e) => {
        if (!e.target.closest(".rh-ll")) L.userScroll = Date.now();
    });
    lyrBody.addEventListener("click", (e) => {
        const line = e.target.closest(".rh-ll[data-i]");
        if (!line || effectiveMode() === "text") return;
        const l = L.data?.lines?.[Number(line.dataset.i)];
        if (!l) return;
        L.userScroll = 0;
        P.seek(Math.max(0, Math.round(l.start)));
        L.active = -2;
        kickLyrics();
    });

    function updLyricsRoute() {
        if (!lyricsVisible()) return;
        loadLyrics(false);
        L.active = -2;
        kickLyrics();
    }

    onSong(() => {
        L.uri = null;
        if (lyricsVisible()) loadLyrics(true);
    });
    onPlayPause(kickLyrics);

    S.Platform.UserAPI?.getUser?.().then((u) => {
        if (u?.displayName) q("rh-uname").textContent = u.displayName;
        const pic = [...(u?.images || [])].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url;
        if (!pic) return;
        const av = q("rh-avatar");
        av.onload = () => topbar.querySelector(".rh-logo").classList.add("has-avatar");
        av.src = pic;
    });

    // Search results drop into place one by one, first to last, whenever a new batch renders.
    function dropInResults() {
        if (!document.body.classList.contains("rh-search-route")) return;
        const fresh = [
            ...document.querySelectorAll(".main-view-container [role='grid'] > [role='row'], .main-view-container .main-card-cardContainer"),
        ].filter((e) => !e.dataset.rhIn && !e.querySelector('[class*="-legacy-chip"]'));
        fresh.forEach((e, i) => {
            e.style.setProperty("--rh-i", String(Math.min(i, 22)));
            e.dataset.rhIn = "1";
        });
        const top = document.querySelector(".main-view-container [role='grid'] > [role='row']:has(> [class*='-legacy-list-row '])");
        document.querySelectorAll(".main-view-container [data-rh-top]").forEach((e) => e !== top && e.removeAttribute("data-rh-top"));
        if (top && !top.hasAttribute("data-rh-top")) top.setAttribute("data-rh-top", "");
    }

    new MutationObserver(() => {
        clearTimeout(markCurrentRow.t);
        markCurrentRow.t = setTimeout(markCurrentRow, 60);
        clearTimeout(dropInResults.t);
        dropInResults.t = setTimeout(dropInResults, 40);
    }).observe(document.querySelector(SEL.main) || document.body, { childList: true, subtree: true });

    const rightSidebar = document.querySelector(SEL.right);
    if (rightSidebar) {
        new MutationObserver(() => {
            clearTimeout(numberQueue.t);
            numberQueue.t = setTimeout(numberQueue, 60);
        }).observe(rightSidebar, { childList: true, subtree: true });
    }

    onSong(() => {
        markCurrentRow();
        updTrack();
        updQueue(true);
        setTimeout(() => updQueue(true), 900);
    });
    onPlayPause(updPlay);
    H.listen(() => {
        updRoute();
        updWheelRoute();
        updLyricsRoute();
    });

    const safe = (fn) => {
        try {
            fn();
        } catch (e) {
            console.warn("[Rhythia]", e);
        }
    };
    let graphqlReady = false;
    [mount, updTrack, () => updQueue(true), updRoute, updWheelRoute, updLyricsRoute].forEach(safe);

    let lastUri = nowItem()?.uri;
    let lastPaused = !!state().isPaused;
    setInterval(() => {
        const uri = nowItem()?.uri;
        const paused = !!state().isPaused;
        if (uri !== lastUri) {
            lastUri = uri;
            songFns.forEach(safe);
        }
        if (paused !== lastPaused) {
            lastPaused = paused;
            playFns.forEach(safe);
        }
        safe(updProgress);
        if (lyricsVisible()) safe(kickLyrics);
    }, 250);
    setInterval(() => {
        safe(mount);
        safe(updStates);
        safe(() => updQueue(false));
        safe(updProgress);
        if (!graphqlReady && typeof S.GraphQL?.Request === "function") {
            graphqlReady = true;
            safe(updTrack);
            safe(() => updQueue(true));
        }
    }, 1000);
})();
