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
        // The game covers Spotify's UI, so don't scan it (and force layouts) mid-level. Closing the game catches up.
        if (shimT || document.body.classList.contains("rh-game-on")) return;
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
        game: sv('<line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>'),
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
    <button class="rh-sq rh-sq-game" data-act="game" title="Play this song as a level">${I.game}</button>
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
    <button data-wact="game" class="rh-wheel-game" title="Play the middle song as a level">Play level</button>
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
        game: () => openGame(),
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
            applyBest(rows[i], t.contextTrack.uri);
            plays(t.contextTrack.uri).then((n) => {
                if (!n || !rows[i].isConnected) return;
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
        applyBest(node, t.uri);
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
        if (act === "game") {
            const c = Math.round(W.target);
            if (W.list[c] && W.list[c].uri !== nowUri()) playIndex(c);
            openGame();
        }
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

    // Spicetify's getAudioData rejects every song on page loads where its URI helper hasn't been linked up yet,
    // so fall back to the endpoint it wraps.
    async function audioAnalysis(uri) {
        try {
            const d = await S.getAudioData(uri);
            if (d?.beats) return d;
        } catch {}
        const id = String(uri).split(":")[2];
        return S.CosmosAsync.get(`https://spclient.wg.spotify.com/audio-attributes/v1/audio-analysis/${id}?format=json`);
    }

    async function loadAnalysis() {
        const uri = nowItem()?.uri;
        if (uri === BG.uri) return;
        BG.uri = uri;
        BG.analysis = null;
        BG.beat = BG.bar = 0;
        if (!uri?.startsWith("spotify:track:")) return;
        try {
            const d = await audioAnalysis(uri);
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
        // The game covers the whole window, so don't spend GPU time on a background nobody can see.
        if (!BG.gl || G.phase) return;
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

    // ================= Rhythm game =================
    // Any song becomes a level: notes fly toward a 3x3 frame and you aim at them with the mouse. Notes are generated
    // from Spotify's beat, loudness and pitch analysis, and the game clock follows Spotify's playback position.
    // The audio itself is never touched.
    const NOTE_COLORS = ["#f2c744", "#c77dff"];
    const NOTE_SIZE = 0.58; // Share of a grid cell, so you have to aim instead of just being in the right area.
    const SCORE_KEY = "rh-scores";
    // Notes only ever sit on sounds in the song: share is how many of those sounds get a note, gapBeats the closest
    // two notes can be, and aheadBeats how long a note is visible before it arrives, so speed follows the tempo.
    const DIFFS = {
        easy: { label: "Easy", share: 0.3, gapBeats: 1, aheadBeats: 4, move: 3 },
        normal: { label: "Normal", share: 0.55, gapBeats: 0.5, aheadBeats: 3, move: 5 },
        hard: { label: "Hard", share: 0.8, gapBeats: 0.375, aheadBeats: 2.5, move: 8 },
        expert: { label: "Expert", share: 1, gapBeats: 0.2, aheadBeats: 2, move: 12 },
    };
    const APPROACH_MIN = 700;
    const APPROACH_MAX = 1800;
    const GAME_MODS = {
        hidden: { label: "Hidden", short: "HD", desc: "Notes fade out before they reach you", cls: "m-violet" },
        sudden: { label: "Sudden Death", short: "SD", desc: "One miss ends the run", cls: "m-red" },
        flash: { label: "Flashlight", short: "FL", desc: "You only see around your cursor", cls: "m-blue" },
    };
    // Health and scoring also follow Sound Space Plus: 5 health, a miss costs 1 and a hit gives back 0.5. Each hit
    // scores 50 x the combo level, which rises every 10 hits up to 8 and drops by 1 on a miss.
    const MAX_HEALTH = 5;
    const HIT_HEAL = 0.5;
    const MAX_LEVEL = 8;
    const LEVEL_HITS = 10;
    const HIT_POINTS = 50;
    // Same rules as Sound Space Plus: a note can be hit from when it arrives until 55 ms later, anywhere in a
    // square that reaches 0.57 of a cell from its centre.
    const HIT_LATE = 55;
    const HIT_REACH = 0.57;
    const GRADE_ORDER = ["F", "D", "C", "B", "A", "S", "SS"];
    const gradeClass = (g) => "g-" + g.toLowerCase();
    const gradeFor = (acc) => (acc >= 1 ? "SS" : acc >= 0.98 ? "S" : acc >= 0.95 ? "A" : acc >= 0.9 ? "B" : acc >= 0.85 ? "C" : acc >= 0.8 ? "D" : "F");
    const clamp01 = (v) => Math.min(1, Math.max(0, v));

    const gameRead = (key, fallback) => {
        try {
            const v = localStorage.getItem(key);
            return v == null ? fallback : JSON.parse(v) ?? fallback;
        } catch {
            return fallback;
        }
    };
    const gameWrite = (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {}
    };

    const savedGame = gameRead("rh-game-settings", {});
    const gameSet = {
        diff: DIFFS[savedGame.diff] ? savedGame.diff : "normal",
        mods: Object.fromEntries(Object.keys(GAME_MODS).map((k) => [k, !!savedGame.mods?.[k]])),
        offset: Number.isFinite(savedGame.offset) ? Math.max(-400, Math.min(400, savedGame.offset)) : 0,
        sens: Number.isFinite(savedGame.sens) ? Math.max(0.2, Math.min(6, savedGame.sens)) : 2,
        sound: Number.isFinite(savedGame.sound) ? clamp01(savedGame.sound) : 0.7,
    };
    const saveGameSet = () => gameWrite("rh-game-settings", gameSet);

    // Note sounds are generated here, so the theme ships no audio files. They play next to Spotify's audio and
    // never touch it. A sound failing must never affect a run, so nothing in here is allowed to throw.
    const SFX = { ctx: null, out: null, hit: null, miss: null, failed: false, lastPreview: 0 };
    // Squared because a straight line sounds far too loud across most of the slider.
    const sfxGain = () => gameSet.sound * gameSet.sound;

    function sfxBuffer(ctx, secs, wave) {
        const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * secs), ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            const t = i / ctx.sampleRate;
            // Fades to exactly zero, so the end of the sound can't click.
            data[i] = wave(t) * (1 - t / secs);
        }
        return buf;
    }

    function sfxOpen() {
        if (SFX.ctx || SFX.failed) return;
        try {
            const ctx = new AudioContext({ latencyHint: "interactive" });
            SFX.out = ctx.createGain();
            SFX.out.gain.value = sfxGain();
            SFX.out.connect(ctx.destination);
            const tau = Math.PI * 2;
            // A creamy pop, like a soft keyboard switch: a round low body that drops in pitch from 520 to 230 Hz, a
            // muted woody knock on top, and a dulled attack instead of a bright click.
            let dull = 0;
            const dullBy = 1 - Math.exp((-tau * 1200) / ctx.sampleRate);
            SFX.hit = sfxBuffer(ctx, 0.11, (t) => {
                dull += dullBy * (Math.random() * 2 - 1 - dull);
                const phase = tau * (230 * t + 290 * 0.012 * (1 - Math.exp(-t / 0.012)));
                const wave =
                    0.72 * Math.sin(phase) * Math.exp(-t / 0.032) +
                    0.2 * Math.sin(tau * 860 * t) * Math.exp(-t / 0.012) +
                    0.55 * dull * Math.exp(-t / 0.005);
                // A very short fade in takes the sharp edge off the start.
                return wave * Math.min(1, t / 0.0012);
            });
            // A soft low thud that falls in pitch. Phase is the integral of a 190 to 90 Hz sweep.
            SFX.miss = sfxBuffer(ctx, 0.14, (t) => {
                const phase = tau * (90 * t + (100 * 0.05) * (1 - Math.exp(-t / 0.05)));
                return (0.6 * Math.sin(phase) + 0.2 * Math.sin(phase * 2)) * Math.exp(-t / 0.05);
            });
            SFX.ctx = ctx;
        } catch (e) {
            SFX.failed = true;
            console.warn("[Rhythia] note sounds unavailable", e);
        }
    }

    function playSfx(name, rate = 1) {
        if (gameSet.sound <= 0) return;
        sfxOpen();
        if (!SFX.ctx) return;
        try {
            if (SFX.ctx.state === "suspended") SFX.ctx.resume().catch(() => {});
            const src = SFX.ctx.createBufferSource();
            src.buffer = SFX[name];
            src.playbackRate.value = rate;
            src.connect(SFX.out);
            src.start();
        } catch {}
    }

    function sfxClose() {
        SFX.ctx?.close().catch(() => {});
        SFX.ctx = null;
    }

    function setSound(value) {
        gameSet.sound = Math.round(clamp01(value) * 100) / 100;
        if (SFX.out) SFX.out.gain.value = sfxGain();
        // Lets you hear the new level without a burst of ticks while dragging.
        const now = performance.now();
        if (now - SFX.lastPreview > 90) {
            SFX.lastPreview = now;
            playSfx("hit");
        }
    }
    const gameScores = gameRead(SCORE_KEY, {});
    // Scores saved before the grade thresholds changed still show the right letter.
    Object.values(gameScores).forEach((byDiff) => Object.values(byDiff).forEach((s) => (s.grade = gradeFor(s.acc))));

    function bestFor(uri) {
        const byDiff = gameScores[uri];
        if (!byDiff) return null;
        const keys = Object.keys(DIFFS);
        let best = null;
        for (const k of keys) {
            const s = byDiff[k];
            if (!s) continue;
            const rank = GRADE_ORDER.indexOf(s.grade) * 10 + keys.indexOf(k);
            if (!best || rank > best.rank) best = { ...s, diff: k, rank };
        }
        return best;
    }

    function applyBest(node, uri) {
        const gEl = node?.querySelector(".rh-card-grade, .rh-lb-grade");
        if (!gEl) return;
        const best = bestFor(uri);
        const base = gEl.classList.contains("rh-card-grade") ? "rh-card-grade" : "rh-lb-grade";
        gEl.textContent = best ? best.grade : base === "rh-lb-grade" ? "—" : "";
        gEl.className = base + (best ? " is-earned " + gradeClass(best.grade) : base === "rh-lb-grade" ? " g-none" : "");
        gEl.title = best ? `Your best: ${(best.acc * 100).toFixed(2)}% on ${DIFFS[best.diff].label}` : "";
    }

    const seeded = (str) => {
        let h = 1779033703;
        for (let i = 0; i < str.length; i++) {
            h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
            h = (h << 13) | (h >>> 19);
        }
        return () => {
            h = Math.imul(h ^ (h >>> 16), 2246822507);
            h = Math.imul(h ^ (h >>> 13), 3266489909);
            h ^= h >>> 16;
            return (h >>> 0) / 4294967296;
        };
    };
    const lastAt = (list, t) => {
        let lo = 0, hi = list.length - 1, found = -1;
        while (lo <= hi) {
            const m = (lo + hi) >> 1;
            if (list[m].start <= t) {
                found = m;
                lo = m + 1;
            } else hi = m - 1;
        }
        return found;
    };
    const nearest = (list, t, max) => {
        const i = lastAt(list, t);
        const a = list[i], b = list[i + 1];
        const best = !a ? b : !b ? a : t - a.start <= b.start - t ? a : b;
        return best && Math.abs(best.start - t) <= max ? best : null;
    };
    const topPitch = (pitches) => {
        let at = 0;
        (pitches || []).forEach((v, i) => {
            if (v > pitches[at]) at = i;
        });
        return at;
    };

    // Same song + same difficulty always gives the same level, so scores stay comparable.
    function buildChart(data, diffKey, uri) {
        const diff = DIFFS[diffKey];
        const rand = seeded(uri + ":" + diffKey);
        const segs = data.segments;
        const tail = segs[segs.length - 1];
        const dur = data.track?.duration || tail.start + tail.duration;
        const loud = segs.map((s) => s.loudness_max).sort((a, b) => a - b);
        const floor = loud[Math.floor(loud.length * 0.95)] - 24;
        const beats = data.beats;
        const bars = data.bars || [];

        // Every note sits exactly on a sound Spotify heard start. Piano and other free-tempo music doesn't follow a
        // beat grid, so notes placed on one land where nothing is being played.
        const rises = segs.map((s) => s.loudness_max - s.loudness_start).sort((a, b) => a - b);
        const riseTop = Math.max(1, rises[Math.floor(rises.length * 0.9)]);
        // Below this it's more likely a note ringing out than a new one being played.
        const riseMin = Math.max(3.5, rises[Math.floor(rises.length * 0.3)]);
        const heard = [];
        for (const s of segs) {
            const rise = s.loudness_max - s.loudness_start;
            if (rise < riseMin || s.loudness_max < floor) continue;
            heard.push({ t: s.start, strength: clamp01(rise / riseTop) * (0.4 + 0.6 * (s.confidence || 0)), pc: topPitch(s.pitches), bright: s.timbre?.[1] ?? 0 });
        }

        // Measure the tempo from the beats themselves. Analysis sometimes locks onto half or double time, so fold
        // it into a playable range.
        const lengths = beats.map((b) => b.duration).filter((d) => d > 0).sort((a, b) => a - b);
        let bpm = 60 / (lengths[lengths.length >> 1] || 0.5);
        while (bpm > 170) bpm /= 2;
        while (bpm < 70) bpm *= 2;
        // A tempo counts as steady if Spotify is confident in it, or if its beats really are evenly spaced. Free-tempo
        // music like solo piano usually gets read at double speed, so take the slower reading for it.
        const spread = (lengths[Math.floor(lengths.length * 0.9)] - lengths[Math.floor(lengths.length * 0.1)]) / (lengths[lengths.length >> 1] || 0.5);
        const steady = (data.track?.tempo_confidence ?? 1) >= 0.3 || spread < 0.04;
        if (!steady) while (bpm > 110) bpm /= 2;
        const beat = 60 / bpm;
        const approach = Math.max(APPROACH_MIN, Math.min(APPROACH_MAX, diff.aheadBeats * beat * 1000));
        const gapSecs = Math.max(0.09, diff.gapBeats * beat * 0.9);
        const lead = approach / 1000 + 0.25;
        const pool = heard.filter((c) => c.t >= lead && c.t <= dur - 1);

        // Choose within short stretches of the song, so its quiet parts keep their notes instead of the loud parts
        // taking them all. Strongest sounds go first.
        const span = beat * 8;
        const picks = [];
        let at = 0;
        for (let from = lead; at < pool.length; from += span) {
            const items = [];
            while (at < pool.length && pool[at].t < from + span) items.push(pool[at++]);
            if (!items.length) continue;
            const budget = Math.max(1, Math.round(items.length * diff.share));
            const recent = picks.slice(-8);
            let used = 0;
            for (const c of [...items].sort((a, b) => b.strength - a.strength)) {
                if (used >= budget) break;
                if (recent.some((p) => Math.abs(p.t - c.t) < gapSecs)) continue;
                recent.push(c);
                picks.push(c);
                used++;
            }
        }
        picks.sort((a, b) => a.t - b.t);

        // Pitch picks the column and brightness picks the row, each split by this song's own spread so all
        // nine cells get used. Then limit each jump to what can be reached in the time available.
        const pcCount = new Array(12).fill(0);
        picks.forEach((c) => pcCount[c.pc]++);
        let seen = 0;
        const pcCol = pcCount.map((count) => {
            const col = Math.min(2, Math.floor(((seen + count / 2) / Math.max(1, picks.length)) * 3));
            seen += count;
            return col;
        });
        const brights = picks.map((c) => c.bright).sort((a, b) => a - b);
        const lowCut = brights[Math.floor(brights.length / 3)];
        const highCut = brights[Math.floor((brights.length * 2) / 3)];
        const rowOf = (b) => (b >= highCut ? 0 : b >= lowCut ? 1 : 2);
        const towards = (from, to, step) => from + Math.max(-step, Math.min(step, to - from));

        const notes = [];
        let prev = null, run = 0;
        for (const c of picks) {
            let x = pcCol[c.pc], y = rowOf(c.bright);
            if (prev) {
                const gap = c.t - prev.t;
                const step = Math.max(1, Math.min(2, Math.floor(gap * diff.move)));
                x = towards(prev.x, x, step);
                y = towards(prev.y, y, step);
                if (x === prev.x && y === prev.y && run >= 2 && gap >= 0.3) {
                    // Don't park the cursor on one cell for long stretches.
                    const dx = prev.x === 0 ? 1 : prev.x === 2 ? -1 : rand() < 0.5 ? -1 : 1;
                    if (rand() < 0.5) x += dx;
                    else y += prev.y === 0 ? 1 : prev.y === 2 ? -1 : dx;
                }
            }
            run = prev && x === prev.x && y === prev.y ? run + 1 : 0;
            // The colour flips every bar, so you can see the song's phrases coming.
            const phrase = bars.length >= 4 ? Math.max(0, lastAt(bars, c.t)) : Math.floor(c.t / 2);
            notes.push({ t: Math.round(c.t * 1000), x, y, color: phrase % 2, done: 0 });
            prev = { t: c.t, x, y };
        }
        // Beat rings only help if the beats are real. Without a steady tempo they follow the notes instead.
        const lines = steady ? beats.map((b) => ({ t: b.start * 1000, bar: !!nearest(bars, b.start, 0.05) })) : notes.map((n) => ({ t: n.t, bar: false }));
        return { notes, nps: notes.length / dur, lines, approach: Math.round(approach), bpm: Math.round(bpm) };
    }

    const G = {
        phase: null, uri: null, charts: null, problem: null, notice: "", loadId: 0, token: 0,
        run: null, result: null, clock: 0, lastTs: 0, raf: 0, countEnd: 0, w: 0, h: 0, toast: null,
        cur: { x: 1.5, y: 1.5 }, cx: 0, cy: 0, size: 0, u: 0, ox: 0, oy: 0, pausedAt: 0,
        reduced: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    };

    const gameEl = el(`
<div id="rh-game" role="dialog" aria-modal="true" aria-label="Rhythm game">
  <div class="rh-g-bg" id="rh-g-bg"></div>
  <canvas class="rh-g-canvas" id="rh-g-canvas"></canvas>
  <div class="rh-g-progress"><i id="rh-g-prog"></i></div>
  <div class="rh-g-hud">
    <div class="rh-g-song"><img id="rh-g-cover" alt=""><div><b id="rh-g-title"></b><span id="rh-g-sub"></span></div></div>
    <div class="rh-g-mid"><div class="rh-g-health" title="Health"><i id="rh-g-hp"></i></div><span id="rh-g-time"></span></div>
    <div></div>
  </div>
  <div class="rh-g-col rh-g-col-l">
    <div class="is-gold"><span>Combo level</span><b id="rh-g-level"></b></div>
    <div><span>Accuracy</span><b id="rh-g-acc"></b></div>
    <div><span>Pauses</span><b id="rh-g-pauses"></b></div>
  </div>
  <div class="rh-g-col rh-g-col-r">
    <div class="is-purple"><span>Score</span><b id="rh-g-score"></b></div>
    <div><span>Misses</span><b id="rh-g-misses"></b></div>
    <div><span>Notes</span><b id="rh-g-notes"></b></div>
  </div>
  <div class="rh-g-screen" id="rh-g-screen"></div>
</div>`);
    const gq = (id) => gameEl.querySelector("#" + id);
    const gScreen = gq("rh-g-screen");
    const gCanvas = gq("rh-g-canvas");
    // Opaque, since there's nothing behind it to blend during play.
    const gCtx = gCanvas.getContext("2d", { alpha: false });
    const hudCache = {};
    const setHud = (id, value, apply) => {
        if (hudCache[id] === value) return;
        hudCache[id] = value;
        apply(gq(id), value);
    };

    const rawPos = () => {
        const s = state();
        const base = s.positionAsOfTimestamp || 0;
        // While buffering, Spotify reports "not paused" but the audio isn't moving yet.
        return s.isPaused || s.isBuffering ? base : base + (Date.now() - (s.timestamp || Date.now())) * (s.speed || 1);
    };
    const waitFor = async (test, ms) => {
        const end = performance.now() + ms;
        while (performance.now() < end) {
            if (test()) return true;
            await new Promise((r) => setTimeout(r, 40));
        }
        return test();
    };
    const setPhase = (phase) => {
        G.phase = phase;
        gameEl.dataset.phase = phase || "";
    };
    const activeMods = (mods) => Object.keys(GAME_MODS).filter((k) => mods[k]);

    // Mouse lock keeps the pointer from hitting the screen edge. If it's refused, relative movement still works.
    function lockMouse() {
        if (document.pointerLockElement === gameEl) return;
        try {
            gameEl.requestPointerLock?.()?.catch?.(() => {});
        } catch {}
    }
    function unlockMouse() {
        if (document.pointerLockElement === gameEl) document.exitPointerLock();
    }
    // Pressing Esc makes the browser drop the lock itself, which should pause the run.
    document.addEventListener("pointerlockchange", () => {
        if (document.pointerLockElement !== gameEl) pauseRun();
    });

    function sizeGame() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        G.w = window.innerWidth;
        G.h = window.innerHeight;
        gCanvas.width = Math.round(G.w * dpr);
        gCanvas.height = Math.round(G.h * dpr);
        gCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Leaves room for the camera lean, so the frame stays on screen with the cursor in any corner.
        G.size = Math.min(G.w * 0.6, G.h * 0.62);
        G.u = G.size / 3;
        G.cx = G.w / 2;
        G.cy = G.h * 0.54;
        G.ox = G.cx - G.size / 2;
        G.oy = G.cy - G.size / 2;
        if (G.run && G.phase === "pause") drawGame(G.clock - gameSet.offset);
    }
    window.addEventListener("resize", () => G.phase && sizeGame());

    function songInfo() {
        const cur = currentMeta();
        return {
            title: cur?.m.title || cur?.it.name || "Unknown",
            artist: cur?.m.artist_name || "",
            cover: img(cur?.m.image_xlarge_url || cur?.m.image_large_url || cur?.m.image_url),
        };
    }

    async function loadLevel() {
        const id = ++G.loadId;
        const uri = nowUri();
        G.uri = uri;
        G.charts = null;
        G.problem = null;
        renderSetup();
        if (!uri?.startsWith("spotify:track:")) {
            G.problem = "Play a song first. Levels are made from songs, not podcasts or ads.";
        } else {
            let data = null;
            try {
                data = await audioAnalysis(uri);
            } catch {}
            if (id !== G.loadId || G.phase !== "setup") return;
            if (data?.beats?.length >= 16 && data?.segments?.length >= 16) {
                const charts = {};
                for (const k of Object.keys(DIFFS)) charts[k] = buildChart(data, k, uri);
                if (charts.expert.notes.length >= 20) G.charts = charts;
            }
            if (!G.charts) G.problem = "Couldn't get beat data for this song from Spotify, so it can't become a level. Try another one.";
        }
        if (id === G.loadId && G.phase === "setup") renderSetup();
    }

    // Where the notes fall across the song, so you can see the busy parts before you play.
    function previewBars(chart) {
        const BINS = 56;
        const span = state().duration || chart.notes[chart.notes.length - 1].t + 1;
        const bins = new Array(BINS).fill(0);
        chart.notes.forEach((n) => bins[Math.min(BINS - 1, Math.floor((n.t / span) * BINS))]++);
        const top = Math.max(...bins, 1);
        return bins.map((v) => `<i style="height:${v ? Math.round(12 + (v / top) * 88) : 4}%"></i>`).join("");
    }

    function renderSetup() {
        const info = songInfo();
        const scores = gameScores[G.uri] || {};
        const ready = !!G.charts;
        const anyChart = G.charts?.normal;
        gq("rh-g-bg").style.backgroundImage = info.cover ? `url("${info.cover}")` : "";
        gScreen.innerHTML = `
<div class="rh-g-setup">
  <div class="rh-g-top">
    <button class="rh-g-ghost" data-g="close">‹ Back</button>
    ${G.problem ? `<button class="rh-g-ghost" data-g="next">Next song</button>` : ""}
  </div>
  <div class="rh-g-side">
    <div class="rh-g-art">${info.cover ? `<img class="rh-g-art-ghost" src="${esc(info.cover)}" alt=""><img class="rh-g-art-img" src="${esc(info.cover)}" alt="">` : ""}</div>
    <h1 class="rh-g-name">${esc(info.title)}</h1>
    <div class="rh-g-artist">${esc(info.artist)}</div>
    <div class="rh-g-facts"><span>${fmt(state().duration)}</span>${anyChart ? `<span>${anyChart.bpm} BPM</span>` : ""}</div>
    <div class="rh-g-preview" id="rh-g-preview" aria-hidden="true"></div>
    <div class="rh-g-best" id="rh-g-best"></div>
  </div>
  <div class="rh-g-opts">
    ${G.notice ? `<div class="rh-g-notice">${esc(G.notice)}</div>` : ""}
    ${G.problem ? `<div class="rh-g-notice">${esc(G.problem)}</div>` : ""}
    <div class="rh-g-label">Difficulty</div>
    <div class="rh-g-diffs">
      ${Object.entries(DIFFS).map(([k, d], i) => {
          const chart = G.charts?.[k];
          const best = scores[k];
          return `<button class="rh-g-diff" data-g="diff" data-v="${k}" ${ready ? "" : "disabled"}>
  <kbd>${i + 1}</kbd>
  <b>${d.label}</b>
  <span class="rh-g-meter"><i style="width:${chart ? Math.min(100, (chart.nps / 5) * 100) : 0}%"></i></span>
  <span class="rh-g-count">${chart ? `${chart.notes.length} notes • ${chart.nps.toFixed(1)}/s` : "…"}</span>
  <em class="${best ? gradeClass(best.grade) : "g-none"}">${best ? best.grade : "—"}</em>
</button>`;
      }).join("")}
    </div>
    <div class="rh-g-label">Mods</div>
    <div class="rh-g-mods">
      ${Object.entries(GAME_MODS).map(([k, m]) => `<button class="rh-g-mod rh-mod ${m.cls}" data-g="mod" data-v="${k}"><b>${m.short}</b><span><strong>${m.label}</strong><small>${m.desc}</small></span></button>`).join("")}
    </div>
    <div class="rh-g-label">Settings</div>
    <div class="rh-g-tune">
      <div class="rh-g-knob">
        <label for="rh-g-sound">Note sounds</label>
        <div class="rh-g-knob-row"><input type="range" id="rh-g-sound" min="0" max="100" step="5"><output id="rh-g-out-sound"></output></div>
        <small>9 and 0 in a level</small>
      </div>
      <div class="rh-g-knob">
        <span>Mouse sensitivity</span>
        <div class="rh-g-knob-row">
          <button data-g="sens" data-v="-0.1" aria-label="Lower mouse sensitivity">−</button>
          <output id="rh-g-out-sens"></output>
          <button data-g="sens" data-v="0.1" aria-label="Raise mouse sensitivity">+</button>
        </div>
        <small>- and = in a level</small>
      </div>
      <div class="rh-g-knob">
        <span>Audio sync</span>
        <div class="rh-g-knob-row">
          <button data-g="offset" data-v="-5" aria-label="Move notes 5 ms earlier">−</button>
          <output id="rh-g-out-offset"></output>
          <button data-g="offset" data-v="5" aria-label="Move notes 5 ms later">+</button>
        </div>
        <small>[ and ] in a level. Raise it if notes come early</small>
      </div>
    </div>
    <div class="rh-g-go">
      <div class="rh-g-warn">Aim with your mouse and be on each note as it reaches the frame. Starting restarts this song.</div>
      <button class="rh-g-start" data-g="start" ${ready ? "" : "disabled"}>${ready ? "START" : G.problem ? "NO LEVEL" : "BUILDING LEVEL…"}</button>
    </div>
  </div>
</div>`;
        syncSetup();
        gScreen.querySelector(".rh-g-start:not([disabled])")?.focus();
    }

    // Updates the menu in place, so changing a setting doesn't rebuild it, reload the art or interrupt a slider drag.
    function syncSetup() {
        const mark = (b, on) => {
            b.classList.toggle("on", on);
            b.setAttribute("aria-pressed", on);
        };
        gScreen.querySelectorAll('[data-g="diff"]').forEach((b) => mark(b, b.dataset.v === gameSet.diff));
        gScreen.querySelectorAll('[data-g="mod"]').forEach((b) => mark(b, !!gameSet.mods[b.dataset.v]));
        const percent = Math.round(gameSet.sound * 100);
        const slider = gq("rh-g-sound");
        slider.value = percent;
        slider.style.setProperty("--fill", percent + "%");
        gq("rh-g-out-sound").textContent = percent ? percent + "%" : "Off";
        gq("rh-g-out-sens").textContent = gameSet.sens.toFixed(1) + "x";
        gq("rh-g-out-offset").textContent = `${gameSet.offset > 0 ? "+" : ""}${gameSet.offset} ms`;
        const chart = G.charts?.[gameSet.diff];
        gq("rh-g-preview").innerHTML = chart ? previewBars(chart) : "";
        const label = DIFFS[gameSet.diff].label;
        const best = gameScores[G.uri]?.[gameSet.diff];
        gq("rh-g-best").innerHTML = best
            ? `<b class="${gradeClass(best.grade)}">${best.grade}</b><div><strong>Your best on ${label}</strong><span>${(best.acc * 100).toFixed(2)}% • ${best.combo} combo${best.v ? ` • ${best.score.toLocaleString("en-US")}` : ""}</span></div>`
            : `<b class="g-none">—</b><div><strong>Your best on ${label}</strong><span>Not cleared yet</span></div>`;
    }

    function newRun() {
        const chart = G.charts[gameSet.diff];
        const notes = chart.notes.map((n) => ({ ...n, done: 0 }));
        const mods = { ...gameSet.mods };
        const info = songInfo();
        const maxHealth = mods.sudden ? 1 : MAX_HEALTH;
        return {
            notes, lines: chart.lines, diff: gameSet.diff, approach: chart.approach, mods, info, maxHealth,
            duration: state().duration || 0,
            endAt: notes[notes.length - 1].t + 1200, first: 0, combo: 0, maxCombo: 0, health: maxHealth, hits: 0, misses: 0,
            score: 0, level: 1, levelHits: 0, pauses: 0, fx: [], missAt: 0, hitAt: 0, hitColor: NOTE_COLORS[0],
        };
    }

    async function beginCountdown(rewind) {
        const token = ++G.token;
        cancelAnimationFrame(G.raf);
        G.raf = 0;
        setPhase("count");
        gScreen.innerHTML = "";
        try {
            await PA.pause();
        } catch {}
        if (rewind) {
            try {
                await PA.seekTo(0);
            } catch {
                if (token === G.token) cancelRun("Spotify wouldn't restart this song, so the level can't begin.");
                return;
            }
        }
        // pause() returns before Spotify has stopped, so wait for its state to settle before trusting the position.
        await waitFor(() => state().isPaused && (!rewind || rawPos() < 1500), 2000);
        if (token !== G.token) return;
        G.clock = rawPos();
        G.countEnd = performance.now() + 3000;
        G.lastTs = 0;
        G.raf = requestAnimationFrame(gameTick);
        await waitFor(() => token !== G.token || performance.now() >= G.countEnd, 3200);
        if (token !== G.token) return;
        // A hidden window draws nothing, so don't start the music for a game nobody can see.
        if (document.hidden) {
            pauseRun();
            return;
        }
        try {
            await PA.resume();
        } catch {}
        const started = await waitFor(() => token !== G.token || (!state().isPaused && !state().isBuffering), 5000);
        if (token !== G.token) return;
        if (!started) {
            cancelRun("Spotify didn't start playing, so the run was cancelled.");
            return;
        }
        G.clock = rawPos();
        G.lastTs = performance.now();
        setPhase("play");
    }

    function pauseRun() {
        if (G.phase !== "play" && G.phase !== "count") return;
        ++G.token;
        cancelAnimationFrame(G.raf);
        G.raf = 0;
        setPhase("pause");
        G.run.pauses++;
        G.pausedAt = performance.now();
        unlockMouse();
        PA.pause().catch?.(() => {});
        drawGame(G.clock - gameSet.offset);
        gScreen.innerHTML = `
<div class="rh-g-pause">
  <h2>Paused</h2>
  <button class="rh-g-start" data-g="resume">RESUME</button>
  <button class="rh-g-ghost" data-g="retry">Retry from the start</button>
  <button class="rh-g-ghost" data-g="quit">Quit level</button>
</div>`;
        gScreen.querySelector(".rh-g-start").focus();
    }

    function cancelRun(message) {
        ++G.token;
        cancelAnimationFrame(G.raf);
        G.raf = 0;
        G.run = null;
        G.notice = message;
        setPhase("setup");
        unlockMouse();
        gCtx.clearRect(0, 0, G.w, G.h);
        loadLevel();
    }

    function finishRun(failed) {
        const r = G.run;
        ++G.token;
        cancelAnimationFrame(G.raf);
        G.raf = 0;
        const judged = r.hits + r.misses;
        const acc = judged ? r.hits / judged : 0;
        const score = r.score;
        const grade = gradeFor(acc);
        let isBest = false;
        if (!failed) {
            const byDiff = gameScores[G.uri] || (gameScores[G.uri] = {});
            const old = byDiff[r.diff];
            // Older scores were set on differently built levels, so their points don't compare. Accuracy still does.
            if (!old || (old.v === 3 ? score > old.score : acc >= old.acc)) {
                byDiff[r.diff] = { v: 3, score, acc, grade, combo: r.maxCombo, mods: activeMods(r.mods), at: Date.now() };
                gameWrite(SCORE_KEY, gameScores);
                isBest = true;
            }
            W.pool.forEach((node, i) => applyBest(node, W.list[i]?.uri));
            updQueue(true);
        }
        G.result = { failed, acc, score, grade, isBest, combo: r.maxCombo, hits: r.hits, misses: r.misses, info: r.info, diff: r.diff, mods: activeMods(r.mods) };
        setPhase("result");
        unlockMouse();
        renderResult();
    }

    function renderResult() {
        const x = G.result;
        gScreen.innerHTML = `
<div class="rh-g-result${x.failed ? " is-failed" : ""}">
  <div class="rh-g-rank ${x.failed ? "g-d" : gradeClass(x.grade)}">${x.failed ? "F" : x.grade}</div>
  <div class="rh-g-result-main">
    <div class="rh-g-result-tag">${x.failed ? "Level failed" : x.isBest ? "New best" : "Level clear"}</div>
    <h2>${esc(x.info.title)}</h2>
    <div class="rh-g-artist">${esc(x.info.artist)} • ${DIFFS[x.diff].label}${x.mods.length ? " • " + x.mods.map((m) => GAME_MODS[m].short).join(" ") : ""}</div>
    <div class="rh-g-total">${x.score.toLocaleString("en-US")}</div>
    <div class="rh-g-stats">
      <div><b>${(x.acc * 100).toFixed(2)}%</b><span>Accuracy</span></div>
      <div><b>${x.combo}</b><span>Max combo</span></div>
      <div><b style="color:#6fd38a">${x.hits}</b><span>Hits</span></div>
      <div><b style="color:#e0607a">${x.misses}</b><span>Misses</span></div>
    </div>
    <div class="rh-g-actions">
      <button class="rh-g-ghost" data-g="close">Back to the wheel</button>
      <button class="rh-g-ghost" data-g="nextplay">Next song</button>
      <button class="rh-g-start" data-g="retry">RETRY</button>
    </div>
  </div>
</div>`;
        gScreen.querySelector(".rh-g-start").focus();
    }

    function hitNote(n) {
        const r = G.run;
        n.done = 1;
        r.hits++;
        r.combo++;
        r.maxCombo = Math.max(r.maxCombo, r.combo);
        r.score += HIT_POINTS * r.level;
        if (r.level < MAX_LEVEL && ++r.levelHits === LEVEL_HITS) {
            r.levelHits = 0;
            r.level++;
        }
        r.health = Math.min(r.maxHealth, r.health + HIT_HEAL);
        // Each colour has its own pitch, so the sound changes with the song's bars like the notes do.
        playSfx("hit", n.color ? 0.84 : 1);
        const now = performance.now();
        r.hitAt = now;
        r.hitColor = NOTE_COLORS[n.color];
        // The note shatters where it was. More pieces at higher combo levels, so a good run looks like one.
        const shards = [];
        const count = G.reduced ? 0 : 6 + r.level;
        for (let i = 0; i < count; i++) {
            shards.push({
                angle: ((i + Math.random() * 0.7) / count) * Math.PI * 2,
                reach: 0.45 + Math.random() * 0.55,
                size: 0.05 + Math.random() * 0.07,
                spin: (Math.random() - 0.5) * 7,
            });
        }
        r.fx.push({ kind: "hit", x: n.x, y: n.y, color: r.hitColor, at: now, life: 420, shards });
    }

    function missNote(n) {
        const r = G.run;
        n.done = 2;
        r.misses++;
        r.combo = 0;
        r.levelHits = 0;
        r.level = Math.max(1, r.level - 1);
        r.health = Math.max(0, r.health - 1);
        r.missAt = performance.now();
        playSfx("miss");
        r.fx.push({ kind: "miss", x: n.x, y: n.y, color: "#e0607a", at: r.missAt, life: 360 });
        if (r.health === 0) finishRun(true);
    }

    // A note counts when the cursor is on it as it reaches the frame.
    function checkHits(t) {
        const r = G.run;
        for (let i = r.first; i < r.notes.length; i++) {
            const n = r.notes[i];
            if (n.t > t) return;
            if (n.done) continue;
            if (Math.abs(G.cur.x - (n.x + 0.5)) <= HIT_REACH && Math.abs(G.cur.y - (n.y + 0.5)) <= HIT_REACH) hitNote(n);
        }
    }

    const cursorRadius = () => Math.max(10, G.u * 0.1);

    window.addEventListener("pointermove", (e) => {
        if ((G.phase !== "play" && G.phase !== "count") || !G.u) return;
        // Keep the whole cursor inside the frame, including its outline.
        const edge = (cursorRadius() + 3) / G.u;
        let x, y;
        if (document.pointerLockElement === gameEl) {
            const step = gameSet.sens / G.u;
            x = G.cur.x + e.movementX * step;
            y = G.cur.y + e.movementY * step;
        } else {
            // Without mouse lock, relative movement would drift until the pointer hits the screen edge and some
            // notes became unreachable. Scaling the pointer's position around the frame can't drift. Below 1x the
            // screen wouldn't be big enough to reach the frame's edges, so that's the floor here.
            const step = Math.max(1, gameSet.sens) / G.u;
            x = 1.5 + (e.clientX - G.cx) * step;
            y = 1.5 + (e.clientY - G.cy) * step;
        }
        G.cur.x = Math.max(edge, Math.min(3 - edge, x));
        G.cur.y = Math.max(edge, Math.min(3 - edge, y));
        // Check between frames too, so a fast flick across a note isn't lost.
        if (G.phase === "play") checkHits(G.clock + (performance.now() - G.lastTs) - gameSet.offset);
    }, true);

    function gameTick(ts) {
        G.raf = 0;
        if (G.phase !== "count" && G.phase !== "play") return;
        if (nowUri() !== G.uri) {
            cancelRun("The song changed, so the run was cancelled.");
            return;
        }
        const dt = G.lastTs ? Math.max(0, ts - G.lastTs) : 16;
        G.lastTs = ts;
        const r = G.run;
        if (G.phase === "play") {
            if (state().isPaused) {
                pauseRun();
                return;
            }
            // A long gap means the window was frozen. Pause instead of charging for notes nobody could see.
            if (dt > 500) {
                pauseRun();
                return;
            }
            // Nothing moves while Spotify is buffering.
            if (!state().isBuffering) G.clock += dt;
            const err = rawPos() - G.clock;
            if (Math.abs(err) > 3000) {
                cancelRun("Playback jumped to another part of the song, so the run was cancelled.");
                return;
            }
            G.clock += Math.abs(err) > 300 ? err : err * Math.min(1, dt * 0.003);
            const t = G.clock - gameSet.offset;
            checkHits(t);
            while (r.first < r.notes.length) {
                const n = r.notes[r.first];
                if (n.done) {
                    r.first++;
                    continue;
                }
                if (t - n.t <= HIT_LATE) break;
                missNote(n);
                if (G.phase !== "play") return;
                r.first++;
            }
            if (t >= r.endAt) {
                finishRun(false);
                return;
            }
        }
        drawGame(G.clock - gameSet.offset);
        G.raf = requestAnimationFrame(gameTick);
    }

    // Strong perspective: notes start tiny and rush in at the end.
    const GAME_K = 11;
    const CAM_SWAY = 0.16;

    function drawGame(t) {
        const r = G.run;
        if (!r || !G.w) return;
        const c = gCtx, { w, h, cx, cy, size, u } = G;
        const now = performance.now();
        const scaleAt = (z) => 1 / (1 + GAME_K * z);
        c.fillStyle = "#0b0a10";
        c.fillRect(0, 0, w, h);

        // The view leans away from the cursor, with no smoothing so the cursor never trails the mouse. Near things
        // shift more than far ones, which gives the depth.
        const camX = G.reduced ? 0 : -(G.cur.x - 1.5) * CAM_SWAY * u, camY = G.reduced ? 0 : -(G.cur.y - 1.5) * CAM_SWAY * u;
        const ox = G.ox + camX, oy = G.oy + camY;

        // Beat rings rush past the frame, so the rhythm is visible before the notes arrive.
        let kick = 0;
        for (const line of r.lines) {
            const dz = (line.t - t) / r.approach;
            if (dz > 1) break;
            if (dz < 0) {
                if (dz > -0.3) kick = Math.max(kick, (line.bar ? 1 : 0.6) * (1 + dz / 0.3));
                continue;
            }
            const s = scaleAt(dz);
            c.strokeStyle = line.bar ? `rgba(242,199,68,${0.6 * (1 - dz)})` : `rgba(199,125,255,${0.34 * (1 - dz)})`;
            c.lineWidth = (line.bar ? 5 : 2.5) * s + 0.5;
            c.beginPath();
            c.arc(cx + camX * s, cy + camY * s, size * 0.74 * s, 0, Math.PI * 2);
            c.stroke();
        }
        if (G.reduced) kick = 0;

        // The frame notes arrive at
        const missing = now - r.missAt < 220 ? 1 - (now - r.missAt) / 220 : 0;
        // The frame also answers each hit, in that note's colour.
        const struck = !G.reduced && now - r.hitAt < 140 ? 1 - (now - r.hitAt) / 140 : 0;
        c.strokeStyle = missing ? `rgba(224,96,122,${0.6 + 0.4 * missing})` : struck > 0.4 ? r.hitColor : `rgba(242,199,68,${0.7 + 0.3 * kick})`;
        c.lineWidth = 2.5 + kick * 2 + missing * 2 + struck * 2.5;
        c.beginPath();
        c.roundRect(ox, oy, size, size, 10);
        c.stroke();

        // Beginners get a hint of where the next note lands.
        const next = r.diff === "easy" && !r.mods.hidden ? r.notes.slice(r.first, r.first + 3).find((n) => !n.done) : null;
        if (next) {
            const z = (next.t - t) / r.approach;
            if (z < 1 && z > 0) {
                const side = u * NOTE_SIZE;
                c.strokeStyle = NOTE_COLORS[next.color];
                c.globalAlpha = 0.35 * (1 - z);
                c.lineWidth = 2;
                c.beginPath();
                c.roundRect(ox + (next.x + 0.5) * u - side / 2, oy + (next.y + 0.5) * u - side / 2, side, side, side * 0.16);
                c.stroke();
                c.globalAlpha = 1;
            }
        }

        // Notes, drawn far to near
        let last = r.first;
        while (last < r.notes.length && (r.notes[last].t - t) / r.approach <= 1) last++;
        for (let i = last - 1; i >= r.first; i--) {
            const n = r.notes[i];
            if (n.done) continue;
            // A note keeps coming toward you through its hit window, up to about 2.5x its size on the frame.
            const z = Math.max(-0.055, (n.t - t) / r.approach);
            if (z > 1) continue;
            const s = scaleAt(z);
            const side = u * s * NOTE_SIZE;
            const x = cx + ((n.x - 1) * u + camX) * s - side / 2;
            const y = cy + ((n.y - 1) * u + camY) * s - side / 2;
            let alpha = clamp01((1 - z) / 0.5);
            if (r.mods.hidden) alpha *= clamp01((z - 0.12) / 0.24);
            if (alpha <= 0) continue;
            const color = NOTE_COLORS[n.color];
            c.globalAlpha = alpha;
            c.fillStyle = color + "22";
            c.strokeStyle = color;
            c.lineWidth = Math.max(2, side * 0.1);
            c.beginPath();
            c.roundRect(x, y, side, side, side * 0.16);
            c.fill();
            c.stroke();
            c.globalAlpha = 1;
        }

        // Hit and miss effects
        r.fx = r.fx.filter((f) => now - f.at < f.life);
        for (const f of r.fx) {
            const age = now - f.at;
            const p = age / f.life;
            const out = 1 - (1 - p) * (1 - p) * (1 - p); // Bursts out fast, then settles.
            const fx = ox + (f.x + 0.5) * u, fy = oy + (f.y + 0.5) * u;
            c.fillStyle = c.strokeStyle = f.color;
            if (f.kind === "miss") {
                // A red X where the note should have been hit.
                const arm = u * NOTE_SIZE * (0.3 + 0.14 * out);
                c.globalAlpha = 1 - p;
                c.lineWidth = Math.max(3, u * 0.045);
                c.lineCap = "round";
                c.beginPath();
                c.moveTo(fx - arm, fy - arm);
                c.lineTo(fx + arm, fy + arm);
                c.moveTo(fx + arm, fy - arm);
                c.lineTo(fx - arm, fy + arm);
                c.stroke();
                c.lineCap = "butt";
                c.globalAlpha = 1;
                continue;
            }
            // Bright colours add up where the pieces overlap, so the middle of the burst glows.
            c.globalCompositeOperation = "lighter";
            // A solid flash of the note's own shape.
            if (age < 130) {
                const flash = age / 130;
                const side = u * NOTE_SIZE * (1 + 0.16 * flash);
                c.globalAlpha = 0.85 * (1 - flash);
                c.beginPath();
                c.roundRect(fx - side / 2, fy - side / 2, side, side, side * 0.16);
                c.fill();
            }
            // One quick shockwave.
            const wave = u * (NOTE_SIZE + 0.62 * out);
            c.globalAlpha = 0.8 * (1 - p) * (1 - p);
            c.lineWidth = Math.max(1, u * 0.035 * (1 - p));
            c.beginPath();
            c.roundRect(fx - wave / 2, fy - wave / 2, wave, wave, wave * 0.14);
            c.stroke();
            // The pieces of the note.
            c.globalAlpha = 1 - p * p;
            for (const s of f.shards) {
                const dist = s.reach * u * out;
                const side = s.size * u * (1 - p * 0.6);
                c.save();
                c.translate(fx + Math.cos(s.angle) * dist, fy + Math.sin(s.angle) * dist);
                c.rotate(s.spin * p);
                c.fillRect(-side / 2, -side / 2, side, side);
                c.restore();
            }
            c.globalCompositeOperation = "source-over";
            c.globalAlpha = 1;
        }

        const curX = ox + G.cur.x * u, curY = oy + G.cur.y * u;
        if (r.mods.flash) {
            const dark = c.createRadialGradient(curX, curY, u * 0.75, curX, curY, u * 1.25);
            dark.addColorStop(0, "rgba(9,8,14,0)");
            dark.addColorStop(1, "rgba(9,8,14,0.985)");
            c.fillStyle = dark;
            c.fillRect(0, 0, w, h);
        }

        // Cursor, with a small kick on each hit.
        c.fillStyle = "#f2c744";
        c.beginPath();
        c.arc(curX, curY, cursorRadius() * (1 + 0.2 * struck), 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "#fff";
        c.lineWidth = 2.5;
        c.stroke();

        c.textAlign = "center";
        c.textBaseline = "middle";
        if (r.combo >= 3) {
            c.fillStyle = "rgba(255,255,255,0.92)";
            c.font = `700 ${Math.round(Math.max(22, u * 0.24) * (1 + 0.22 * struck))}px Fredoka, "Segoe UI", sans-serif`;
            c.fillText("x" + r.combo, cx + camX, oy - Math.max(22, u * 0.18));
        }
        if (G.toast && now - G.toast.at < 1200) {
            c.fillStyle = "rgba(255,255,255,0.85)";
            c.font = `600 15px Fredoka, "Segoe UI", sans-serif`;
            c.fillText(G.toast.text, cx, oy + size + 22);
        }
        if (G.phase === "count") {
            const left = Math.max(1, Math.ceil((G.countEnd - now) / 1000));
            c.fillStyle = "#fff";
            c.font = `700 ${Math.round(u * 0.9)}px Fredoka, "Segoe UI", sans-serif`;
            c.fillText(String(left), cx, cy);
        }

        const judged = r.hits + r.misses;
        const setText = (e, v) => (e.textContent = v);
        setHud("rh-g-score", r.score.toLocaleString("en-US"), setText);
        setHud("rh-g-acc", ((judged ? r.hits / judged : 1) * 100).toFixed(2) + "%", setText);
        setHud("rh-g-level", "x" + r.level, setText);
        setHud("rh-g-misses", String(r.misses), setText);
        setHud("rh-g-notes", `${judged}/${r.notes.length}`, setText);
        setHud("rh-g-pauses", String(r.pauses), setText);
        setHud("rh-g-time", `${fmt(Math.max(0, t))} / ${fmt(r.duration)}`, setText);
        setHud("rh-g-hp", r.health / r.maxHealth, (e, v) => {
            e.style.transform = `scaleX(${v})`;
            e.parentElement.classList.toggle("is-low", v <= 0.25);
        });
        setHud("rh-g-prog", (clamp01(t / r.endAt) * 100).toFixed(1), (e, v) => (e.style.transform = `scaleX(${v / 100})`));
    }

    function showRunHud() {
        const r = G.run;
        Object.keys(hudCache).forEach((k) => delete hudCache[k]);
        gq("rh-g-cover").src = r.info.cover || "";
        gq("rh-g-title").textContent = r.info.title;
        const mods = activeMods(r.mods).map((m) => GAME_MODS[m].short).join(" ");
        gq("rh-g-sub").textContent = [DIFFS[r.diff].label, mods, "Esc pauses", "- = sensitivity", "[ ] audio sync", "9 0 sounds"].filter(Boolean).join(" • ");
        G.cur = { x: 1.5, y: 1.5 };
    }

    function startLevel() {
        if (!G.charts || nowUri() !== G.uri) return;
        G.notice = "";
        G.run = newRun();
        showRunHud();
        beginCountdown(true);
    }

    function closeGame() {
        ++G.token;
        ++G.loadId;
        cancelAnimationFrame(G.raf);
        G.raf = 0;
        G.run = null;
        G.notice = "";
        setPhase(null);
        unlockMouse();
        sfxClose();
        gScreen.innerHTML = "";
        gameEl.remove();
        document.body.classList.remove("rh-game-on");
        kickBackground();
        scheduleShim();
    }

    function openGame() {
        if (G.phase) return;
        document.body.appendChild(gameEl);
        document.body.classList.add("rh-game-on");
        try {
            sizeGame();
            setPhase("setup");
            loadLevel();
        } catch (e) {
            // Never leave a full-screen overlay that can't be closed.
            console.warn("[Rhythia] game failed to open", e);
            closeGame();
        }
    }

    const shiftSync = (delta) => {
        gameSet.offset = Math.max(-400, Math.min(400, gameSet.offset + delta));
        saveGameSet();
    };
    const shiftSens = (delta) => {
        gameSet.sens = Math.max(0.2, Math.min(6, Math.round((gameSet.sens + delta) * 10) / 10));
        saveGameSet();
    };
    // Browsers only grant mouse lock from a real click, so a click also recovers it if it was refused earlier.
    gameEl.addEventListener("pointerdown", () => {
        if (G.phase === "play" || G.phase === "count") lockMouse();
    });

    gScreen.addEventListener("input", (e) => {
        if (e.target.id !== "rh-g-sound") return;
        setSound(Number(e.target.value) / 100);
        syncSetup();
    });
    gScreen.addEventListener("change", (e) => {
        if (e.target.id === "rh-g-sound") saveGameSet();
    });

    gScreen.addEventListener("click", (e) => {
        const b = e.target.closest("[data-g]");
        if (!b || b.disabled) return;
        const v = b.dataset.v;
        // Audio has to be opened from a click, so do it here and the first note isn't silent.
        if (b.dataset.g === "start" || b.dataset.g === "resume" || b.dataset.g === "retry") sfxOpen();
        switch (b.dataset.g) {
            case "diff":
            case "mod":
                if (b.dataset.g === "diff") gameSet.diff = v;
                else gameSet.mods[v] = !gameSet.mods[v];
                saveGameSet();
                syncSetup();
                // After a mouse click Enter should start the level, not press this button again. Keyboard users
                // (detail 0) keep their place.
                if (e.detail) gScreen.querySelector(".rh-g-start:not([disabled])")?.focus();
                break;
            case "offset":
                shiftSync(Number(v));
                syncSetup();
                break;
            case "sens":
                shiftSens(Number(v));
                syncSetup();
                break;
            case "start":
                lockMouse();
                startLevel();
                break;
            case "resume":
                lockMouse();
                beginCountdown(false);
                break;
            case "retry":
                lockMouse();
                if (nowUri() !== G.uri) {
                    G.run = null;
                    G.notice = "Spotify moved on to the next song, so this is the level for what's playing now.";
                    setPhase("setup");
                    loadLevel();
                    break;
                }
                G.run = newRun();
                showRunHud();
                beginCountdown(true);
                break;
            case "quit":
            case "close":
                closeGame();
                break;
            case "next":
                P.next();
                break;
            case "nextplay":
                G.run = null;
                setPhase("setup");
                P.next();
                loadLevel();
                break;
        }
    });

    window.addEventListener("keydown", (e) => {
        if (!G.phase || e.ctrlKey || e.metaKey || e.altKey) return;
        // Stop Spotify's own shortcuts from firing behind the game.
        e.stopImmediatePropagation();
        if (e.code === "Escape") {
            e.preventDefault();
            if (G.phase === "play" || G.phase === "count") pauseRun();
            // The same Esc press can drop the mouse lock and arrive here, so don't let it pause and resume at once.
            else if (G.phase === "pause") performance.now() - G.pausedAt > 300 && beginCountdown(false);
            else closeGame();
            return;
        }
        if (G.phase === "setup" && /^Digit[1-4]$/.test(e.code) && G.charts) {
            gameSet.diff = Object.keys(DIFFS)[Number(e.code.slice(5)) - 1];
            saveGameSet();
            syncSetup();
            return;
        }
        // Enter starts from anywhere in the menu except a button, which Enter already presses.
        if (G.phase === "setup" && e.code === "Enter" && !e.repeat && !e.target.closest?.("button")) {
            gScreen.querySelector(".rh-g-start:not([disabled])")?.click();
            return;
        }
        if (G.phase !== "play" && G.phase !== "count") return;
        e.preventDefault();
        if (!e.repeat && (e.code === "Digit9" || e.code === "Digit0")) {
            setSound(gameSet.sound + (e.code === "Digit9" ? -0.1 : 0.1));
            saveGameSet();
            G.toast = { text: gameSet.sound ? `Note sounds ${Math.round(gameSet.sound * 100)}%` : "Note sounds off", at: performance.now() };
        }
        if (!e.repeat && (e.code === "BracketLeft" || e.code === "BracketRight")) {
            shiftSync(e.code === "BracketLeft" ? -5 : 5);
            G.toast = { text: `Audio sync ${gameSet.offset > 0 ? "+" : ""}${gameSet.offset} ms`, at: performance.now() };
        }
        if (e.code === "Minus" || e.code === "Equal") {
            shiftSens(e.code === "Minus" ? -0.1 : 0.1);
            G.toast = { text: `Sensitivity ${gameSet.sens.toFixed(1)}x`, at: performance.now() };
        }
    }, true);
    window.addEventListener("keyup", (e) => {
        if (G.phase) e.stopImmediatePropagation();
    }, true);
    window.addEventListener("blur", pauseRun);
    document.addEventListener("visibilitychange", () => document.hidden && pauseRun());

    onSong(() => {
        if (G.phase === "setup") loadLevel();
        else if (G.phase === "pause") cancelRun("The song changed, so the run was cancelled.");
    });

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
        if (G.phase) return;
        safe(updProgress);
        if (lyricsVisible()) safe(kickLyrics);
    }, 250);
    setInterval(() => {
        // Everything here updates UI the game is covering.
        if (G.phase) return;
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
