/* ==========================================================================
   BlogSphere AI — core.js
   Data store · schema + migrations · PBKDF2 auth · CRUD · AI engine
   Exposed as window.BS
   ========================================================================== */
(function () {
  "use strict";

  var VERSION = 2;
  var KEY = "blogsphere.ai.v2";
  var LEGACY_KEY = "bsai";
  var PBKDF2_ITER = 150000;
  var SESSION_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days

  var CATS = ["Technology", "Design", "Writing", "Career", "Life"];

  var STOPWORDS = ("a an and are as at be but by for from has have he her his how i if in into is it its of on or our she that the their them then there these they this to was we were what when where which who will with you your it's don't can't").split(" ");

  /* ------------------------------- Utilities ----------------------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function slugify(s) {
    return String(s || "")
      .toLowerCase().trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "untitled";
  }
  function debounce(fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }
  function textOf(html) {
    var d = new DOMParser().parseFromString(String(html || ""), "text/html");
    return (d.body.textContent || "").replace(/\s+/g, " ").trim();
  }
  function words(html) {
    var t = textOf(html);
    return t ? t.split(/\s+/).length : 0;
  }
  function readingTime(html) {
    return Math.max(1, Math.ceil(words(html) / 200));
  }
  function excerptFrom(html, n) {
    n = n || 160;
    var t = textOf(html);
    if (t.length <= n) return t;
    var cut = t.slice(0, n);
    var sp = cut.lastIndexOf(" ");
    return (sp > 40 ? cut.slice(0, sp) : cut).replace(/[.,;:]$/, "") + "…";
  }
  function fmtDate(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  function fmtDateTime(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function relTime(ts) {
    if (!ts) return "";
    var s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    var m = Math.round(s / 60);
    if (m < 60) return m + "m ago";
    var h = Math.round(m / 60);
    if (h < 24) return h + "h ago";
    var d = Math.round(h / 24);
    if (d < 30) return d + "d ago";
    return fmtDate(ts);
  }
  function initials(name) {
    return esc((name || "?").trim().split(/\s+/).map(function (x) { return x[0]; }).slice(0, 2).join("").toUpperCase());
  }
  function hue(s) {
    return Array.prototype.reduce.call(String(s || ""), function (a, c) { return a + c.charCodeAt(0); }, 0) % 360;
  }
  function gradient(id) {
    var h = hue(id);
    return "linear-gradient(135deg,hsl(" + h + " 72% 62%),hsl(" + ((h + 70) % 360) + " 68% 46%))";
  }

  /* -------------------- Sanitizer (allow-list) --------------------------- */
  var OK = new Set("P,H2,H3,H4,B,STRONG,I,EM,U,UL,OL,LI,BLOCKQUOTE,A,BR,DIV,IMG,CODE,PRE,SPAN,HR".split(","));
  function sanitize(html) {
    var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) return;
        if (c.nodeType !== 1) { c.remove(); return; }
        walk(c);
        if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT"].indexOf(c.tagName) >= 0) { c.remove(); return; }
        if (!OK.has(c.tagName)) { c.replaceWith.apply(c, c.childNodes); return; }
        Array.prototype.slice.call(c.attributes).forEach(function (a) {
          var n = a.name.toLowerCase();
          var keep = false;
          if (c.tagName === "A" && n === "href" && /^(https?:|mailto:)/i.test(a.value)) keep = true;
          if (c.tagName === "IMG" && n === "src" && /^(https?:|data:image\/)/i.test(a.value)) keep = true;
          if (c.tagName === "IMG" && (n === "alt" || n === "title")) keep = true;
          if (n === "title") keep = true;
          if (!keep) c.removeAttribute(a.name);
        });
        if (c.tagName === "A") { c.setAttribute("target", "_blank"); c.setAttribute("rel", "noopener noreferrer"); }
        if (c.tagName === "IMG") { c.setAttribute("loading", "lazy"); }
      });
    })(doc.body);
    return doc.body.innerHTML;
  }

  /* --------------------------- Icons (inline SVG) ------------------------ */
  var P = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    pen: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    feather: '<path d="M20.2 3.8c-2-2-6.5-1.5-9.4 1.4L5 11v5h5l5.8-5.8c2.9-2.9 3.4-7.4 1.4-9.4zM5 16l-2 4 4-2"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
    bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    filter: '<path d="M3 5h18M6 12h12M10 19h4"/>',
    trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4.6 15H4.5a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 4.6V4.5a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.2.8z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
    logout: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
    chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
    chevronRight: '<path d="M9 18l6-6-6-6"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    bold: '<path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z"/>',
    italic: '<path d="M19 4h-9M14 20H5M15 4L9 20"/>',
    h2: '<path d="M4 6v12M4 12h8M12 6v12M17 9a2 2 0 1 1 3 1.8L17 18h4"/>',
    h3: '<path d="M4 6v12M4 12h8M12 6v12M16 9a2 2 0 1 1 3 1.7 2 2 0 1 1-3 1.9"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    listOrdered: '<path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 14H4l2 2.5V18H4"/>',
    quote: '<path d="M6 17h3l2-4V7H5v6h3zM15 17h3l2-4V7h-6v6h3z"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
    sparkles: '<path d="M12 3l1.8 4.8L18.6 9l-4.8 1.8L12 15.6l-1.8-4.8L5.4 9l4.8-1.2z"/><path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 14l3-3 3 2 4-5"/>',
    tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0l-7-7A2 2 0 0 1 3 12.2V5a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9l-8 13.9A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.2l-8-13.9a2 2 0 0 0-3.4 0z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 9l5-5 5 5M12 4v12"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>',
    lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 13h4"/>',
    restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 0 2 2h13"/>',
    star: '<path d="M12 3l2.9 5.9 6.1.9-4.5 4.3 1.1 6.1L12 17.8 6.4 20.2l1.1-6.1L3 9.8l6.1-.9z"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    wand: '<path d="M15 4V2M15 10V8M11.5 6.5H9.5M20.5 6.5h-2M18 9.5l-1.4-1.4M18 3.5l-1.4 1.4M12 3.5l1.4 1.4M12 9.5l1.4-1.4M3 21l9-9"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    external: '<path d="M15 3h6v6M10 14L21 3M21 14v7H3V3h7"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M16 21v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>'
  };
  function icon(name, cls) {
    var d = P[name] || "";
    return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  }

  /* ------------------------------- Store --------------------------------- */
  function blank() {
    return { version: VERSION, users: [], posts: [], comments: [], likes: [], marks: [], me: null, session: null, theme: null, settings: { ai: { baseUrl: "", key: "", model: "gpt-4o-mini", temperature: 0.7 } } };
  }
  var D = blank();

  function migrate(old) {
    if (!old || typeof old !== "object") return blank();
    var d = blank();
    d.theme = old.theme || null;
    d.me = old.me || null;
    d.comments = old.comments || [];
    d.likes = old.likes || [];
    d.marks = old.marks || [];
    d.users = (old.users || []).map(function (u) {
      return {
        id: u.id, name: u.name || u.username || "User", email: u.email || "",
        username: u.username || ("user" + (u.id || "")), bio: u.bio || "", avatar: u.avatar || "",
        createdAt: u.createdAt || Date.now(),
        hash: (u.hash && typeof u.hash === "object") ? u.hash : null,
        legacyHash: typeof u.hash === "string" ? u.hash : (u.legacyHash || null),
        recovery: u.recovery || null, prefs: u.prefs || {}
      };
    });
    d.posts = (old.posts || []).map(function (p) {
      return {
        id: p.id, author: p.author, title: p.title || "Untitled", slug: p.slug || slugify(p.title),
        excerpt: p.excerpt || "", body: p.body || "", cover: p.cover || "", cat: p.cat || CATS[0],
        tags: Array.isArray(p.tags) ? p.tags : [], seoTitle: p.seoTitle || "", seoDesc: p.seoDesc || "",
        status: p.status === "published" ? "published" : "draft",
        created: p.created || Date.now(), updated: p.updated || p.created || Date.now(),
        publishedAt: p.publishedAt || (p.status === "published" ? (p.created || Date.now()) : null),
        views: p.views || 0
      };
    });
    return d;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (raw) {
      try { D = Object.assign(blank(), JSON.parse(raw)); } catch (e) { D = blank(); }
    } else {
      var legacy = null;
      try { legacy = localStorage.getItem(LEGACY_KEY); } catch (e) {}
      if (legacy) {
        try { D = migrate(JSON.parse(legacy)); save(); } catch (e) { D = blank(); }
      }
    }
    D.version = VERSION;
    if (!D.settings || !D.settings.ai) D.settings = blank().settings;
    // session validity
    if (D.session && D.session.exp && D.session.exp < Date.now()) { D.session = null; D.me = null; }
    if (D.me && !D.users.some(function (u) { return u.id === D.me; })) { D.me = null; D.session = null; }
    if (window.BS) window.BS.state = D;
    return D;
  }
  var save = function () {
    try { localStorage.setItem(KEY, JSON.stringify(D)); return true; }
    catch (e) { return false; }
  };

  /* ------------------------------- Crypto -------------------------------- */
  function bytesToHex(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
    return s;
  }
  function hexToBytes(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  function randHex(n) {
    var b = new Uint8Array(n);
    crypto.getRandomValues(b);
    return bytesToHex(b);
  }
  async function pbkdf2(password, saltHex, iter) {
    var enc = new TextEncoder();
    var keyMat = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    var bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: hexToBytes(saltHex), iterations: iter, hash: "SHA-256" }, keyMat, 256);
    return bytesToHex(new Uint8Array(bits));
  }
  async function makeHash(pw) {
    var salt = randHex(16);
    var hash = await pbkdf2(pw, salt, PBKDF2_ITER);
    return { algo: "PBKDF2-SHA256", salt: salt, iter: PBKDF2_ITER, hash: hash, created: Date.now() };
  }
  async function verifyHash(pw, h) {
    if (!h || !h.salt || !h.hash) return false;
    try { return (await pbkdf2(pw, h.salt, h.iter || PBKDF2_ITER)) === h.hash; } catch (e) { return false; }
  }
  async function legacyVerify(pw, u) {
    if (!u.legacyHash) return false;
    var enc = new TextEncoder();
    var d = await crypto.subtle.digest("SHA-256", enc.encode(u.username.toLowerCase() + pw));
    return bytesToHex(new Uint8Array(d)) === u.legacyHash;
  }

  /* ------------------------------- Auth ---------------------------------- */
  var Auth = {
    me: function () { return D.users.find(function (u) { return u.id === D.me; }) || null; },
    meId: function () { return D.me; },
    isAuthed: function () { return !!D.me; },
    user: function (id) { return D.users.find(function (u) { return u.id === id; }) || { name: "Former author", username: "-", id: id, avatar: "" }; },
    findByLogin: function (id) {
      id = String(id || "").toLowerCase();
      return D.users.find(function (u) { return u.email === id || u.username.toLowerCase() === id; }) || null;
    },
    register: async function (data) {
      var name = (data.name || "").trim();
      var email = (data.email || "").trim().toLowerCase();
      var username = (data.username || "").trim();
      var errors = {};
      if (name.length < 2) errors.name = "Enter your full name.";
      if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = "Enter a valid email address.";
      if (!/^[a-z0-9_]{3,20}$/i.test(username)) errors.username = "3–20 letters, numbers or underscores.";
      if ((data.password || "").length < 8) errors.password = "Use at least 8 characters.";
      if (data.password !== data.password2) errors.password2 = "Passwords do not match.";
      if (D.users.some(function (u) { return u.email === email; })) errors.email = "That email is already registered.";
      if (D.users.some(function (u) { return u.username.toLowerCase() === username.toLowerCase(); })) errors.username = "That username is taken.";
      if (Object.keys(errors).length) return { ok: false, errors: errors };
      var user = {
        id: uid(), name: name, email: email, username: username, bio: "", avatar: "",
        createdAt: Date.now(), hash: await makeHash(data.password), legacyHash: null,
        recovery: data.recovery && data.recovery.answer
          ? { question: data.recovery.question || "Recovery", hash: await makeHash(String(data.recovery.answer).toLowerCase()) }
          : null,
        prefs: {}
      };
      D.users.push(user);
      Auth.login(user.id);
      return { ok: true, user: user };
    },
    login: function (userId) {
      var token = randHex(24);
      D.me = userId;
      D.session = { u: userId, token: token, exp: Date.now() + SESSION_TTL };
      save();
    },
    authenticate: async function (loginId, pw) {
      var u = Auth.findByLogin(loginId);
      if (!u) return { ok: false, error: "Incorrect email, username or password." };
      if (u.hash) {
        if (await verifyHash(pw, u.hash)) { Auth.login(u.id); return { ok: true, user: u }; }
      } else if (u.legacyHash) {
        if (await legacyVerify(pw, u)) {
          u.hash = await makeHash(pw); u.legacyHash = null; // upgrade
          Auth.login(u.id); save();
          return { ok: true, user: u, upgraded: true };
        }
      }
      return { ok: false, error: "Incorrect email, username or password." };
    },
    logout: function () { D.me = null; D.session = null; save(); },
    update: function (patch) {
      var u = Auth.me(); if (!u) return { ok: false };
      ["name", "bio", "avatar"].forEach(function (k) { if (k in patch) u[k] = patch[k]; });
      if ("prefs" in patch) u.prefs = Object.assign(u.prefs || {}, patch.prefs);
      save(); return { ok: true, user: u };
    },
    changePassword: async function (current, next) {
      var u = Auth.me(); if (!u) return { ok: false, error: "Not signed in." };
      var okCurrent = u.hash ? await verifyHash(current, u.hash) : await legacyVerify(current, u);
      if (!okCurrent) return { ok: false, error: "Current password is incorrect." };
      if ((next || "").length < 8) return { ok: false, error: "New password must be at least 8 characters." };
      u.hash = await makeHash(next); u.legacyHash = null; save();
      return { ok: true };
    },
    recoveryFor: function (loginId) {
      var u = Auth.findByLogin(loginId);
      if (!u) return { ok: false, error: "No account found for that email or username." };
      if (!u.recovery) return { ok: false, error: "This account has no recovery method configured." };
      return { ok: true, question: u.recovery.question, uid: u.id };
    },
    resetPassword: async function (userId, answer, next) {
      var u = Auth.user(userId);
      if (!u || !u.recovery) return { ok: false, error: "Recovery is not available." };
      if (!(await verifyHash(String(answer).toLowerCase(), u.recovery.hash))) return { ok: false, error: "That answer is incorrect." };
      if ((next || "").length < 8) return { ok: false, error: "New password must be at least 8 characters." };
      u.hash = await makeHash(next); u.legacyHash = null; save();
      return { ok: true };
    }
  };

  /* ------------------------------- Data ---------------------------------- */
  function uniqueSlug(title, exceptId) {
    var base = slugify(title), s = base, i = 2;
    while (D.posts.some(function (p) { return p.slug === s && p.id !== exceptId; })) s = base + "-" + (i++);
    return s;
  }
  var Data = {
    posts: function () { return D.posts; },
    published: function () { return D.posts.filter(function (p) { return p.status === "published"; }); },
    post: function (id) { return D.posts.find(function (p) { return p.id === id; }); },
    postBySlug: function (slug) { return D.posts.find(function (p) { return p.slug === slug; }); },
    byAuthor: function (id) { return D.posts.filter(function (p) { return p.author === id; }); },
    comments: function (postId) { return D.comments.filter(function (c) { return c.p === postId; }).sort(function (a, b) { return b.t - a.t; }); },
    commentsCount: function (postId) { return D.comments.filter(function (c) { return c.p === postId; }).length; },
    likesCount: function (postId) { return D.likes.filter(function (l) { return l.p === postId; }).length; },
    isLiked: function (postId) { return !!D.me && D.likes.some(function (l) { return l.p === postId && l.u === D.me; }); },
    isMarked: function (postId) { return !!D.me && D.marks.some(function (m) { return m.p === postId && m.u === D.me; }); },
    toggleLike: function (postId) {
      if (!D.me) return false;
      var i = D.likes.findIndex(function (l) { return l.p === postId && l.u === D.me; });
      if (i < 0) D.likes.push({ p: postId, u: D.me }); else D.likes.splice(i, 1);
      save(); return i < 0;
    },
    toggleMark: function (postId) {
      if (!D.me) return false;
      var i = D.marks.findIndex(function (m) { return m.p === postId && m.u === D.me; });
      if (i < 0) D.marks.push({ p: postId, u: D.me }); else D.marks.splice(i, 1);
      save(); return i < 0;
    },
    saved: function () {
      var self = this;
      return D.marks.filter(function (m) { return m.u === D.me; })
        .map(function (m) { return self.post(m.p); })
        .filter(function (p) { return p && p.status === "published"; });
    },
    addComment: function (postId, text) {
      if (!D.me) return null;
      var c = { id: uid(), p: postId, u: D.me, text: String(text).slice(0, 500), t: Date.now() };
      D.comments.push(c); save(); return c;
    },
    deleteComment: function (id) {
      var c = D.comments.find(function (x) { return x.id === id; });
      if (!c || c.u !== D.me) return false;
      D.comments = D.comments.filter(function (x) { return x.id !== id; }); save(); return true;
    },
    bumpViews: function (postId) {
      var p = Data.post(postId);
      if (p) { p.views = (p.views || 0) + 1; save(); }
    },
    savePost: function (input, mode) {
      var now = Date.now();
      var p = input.id ? Data.post(input.id) : null;
      var isNew = false;
      if (!p) { p = { id: uid(), author: D.me, created: now, views: 0, status: "draft", tags: [], cover: "", seoTitle: "", seoDesc: "" }; D.posts.push(p); isNew = true; }
      if (p.author !== D.me) return { ok: false, error: "You can only edit your own posts." };
      p.title = (input.title || "").trim() || "Untitled";
      p.slug = uniqueSlug(p.title, p.id);
      p.excerpt = (input.excerpt || "").trim() || excerptFrom(input.body, 160);
      p.body = sanitize(input.body);
      p.cover = (input.cover || "").trim();
      p.cat = input.cat || CATS[0];
      p.tags = (input.tags || []).map(function (t) { return String(t).trim(); }).filter(Boolean).slice(0, 8);
      p.seoTitle = (input.seoTitle || "").trim();
      p.seoDesc = (input.seoDesc || "").trim();
      p.updated = now;
      if (mode === "published" && p.status !== "published") p.publishedAt = now;
      p.status = mode || p.status || "draft";
      save();
      return { ok: true, post: p, isNew: isNew };
    },
    setStatus: function (id, status) {
      var p = Data.post(id);
      if (!p || p.author !== D.me) return false;
      if (status === "published" && p.status !== "published") p.publishedAt = Date.now();
      p.status = status; p.updated = Date.now(); save(); return true;
    },
    deletePost: function (id) {
      var p = Data.post(id);
      if (!p || p.author !== D.me) return false;
      D.posts = D.posts.filter(function (x) { return x.id !== id; });
      D.comments = D.comments.filter(function (c) { return c.p !== id; });
      D.likes = D.likes.filter(function (l) { return l.p !== id; });
      D.marks = D.marks.filter(function (m) { return m.p !== id; });
      save(); return true;
    },
    allTags: function () {
      var set = {};
      D.posts.forEach(function (p) { (p.tags || []).forEach(function (t) { set[t] = (set[t] || 0) + 1; }); });
      return Object.keys(set).sort(function (a, b) { return set[b] - set[a]; }).map(function (t) { return { tag: t, count: set[t] }; });
    },
    query: function (opts) {
      opts = opts || {};
      var q = (opts.q || "").toLowerCase().trim();
      var list = D.posts.filter(function (p) {
        var vis = p.status === "published" || (D.me && p.author === D.me);
        if (!vis) return false;
        var statusOk = !opts.status || opts.status === "all" ? true : (opts.status === "draft" ? p.status === "draft" : opts.status === "archived" ? p.status === "archived" : p.status === "published");
        if (!statusOk) return false;
        if (opts.cat && p.cat !== opts.cat) return false;
        if (opts.tag && (p.tags || []).indexOf(opts.tag) < 0) return false;
        if (opts.author && p.author !== opts.author) return false;
        if (q) {
          var hay = [p.title, p.excerpt, p.cat, (p.tags || []).join(" "), textOf(p.body), Auth.user(p.author).name, Auth.user(p.author).username].join(" ").toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      });
      var sort = opts.sort || "new";
      list.sort(function (a, b) {
        if (sort === "old") return a.created - b.created;
        if (sort === "pop") return Data.likesCount(b.id) - Data.likesCount(a.id) || b.views - a.views;
        if (sort === "views") return b.views - a.views;
        if (sort === "title") return a.title.localeCompare(b.title);
        return (b.publishedAt || b.updated) - (a.publishedAt || a.updated);
      });
      var total = list.length;
      var per = opts.per || 6;
      var pages = Math.max(1, Math.ceil(total / per));
      var page = Math.min(Math.max(1, opts.page || 1), pages);
      return { items: list.slice((page - 1) * per, page * per), total: total, page: page, pages: pages, per: per };
    },
    authorStats: function (authorId) {
      var P = Data.byAuthor(authorId);
      var published = P.filter(function (p) { return p.status === "published"; });
      return {
        total: P.length, published: published.length,
        drafts: P.filter(function (p) { return p.status === "draft"; }).length,
        archived: P.filter(function (p) { return p.status === "archived"; }).length,
        views: P.reduce(function (s, p) { return s + (p.views || 0); }, 0),
        likes: P.reduce(function (s, p) { return s + Data.likesCount(p.id); }, 0),
        comments: P.reduce(function (s, p) { return s + Data.commentsCount(p.id); }, 0)
      };
    }
  };

  /* -------------------------------- AI ----------------------------------- */
  function keywords(text, n) {
    var freq = {};
    String(text || "").toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).forEach(function (w) {
      if (w.length < 4 || STOPWORDS.indexOf(w) >= 0) return;
      freq[w] = (freq[w] || 0) + 1;
    });
    return Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; }).slice(0, n || 8);
  }
  function sentences(text) {
    return String(text || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 20; });
  }
  function syllableCount(w) {
    w = w.toLowerCase().replace(/[^a-z]/g, "");
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
    var m = w.match(/[aeiouy]{1,2}/g);
    return m ? m.length : 1;
  }

  var AI = {
    settings: function () { return D.settings.ai; },
    saveSettings: function (s) { D.settings.ai = Object.assign(D.settings.ai || {}, s); save(); return D.settings.ai; },
    hasKey: function () { var s = D.settings.ai; return !!(s && s.key && s.baseUrl); },

    chat: async function (messages, opts) {
      opts = opts || {};
      var s = D.settings.ai;
      if (!AI.hasKey()) return { ok: false, offline: true, error: "No AI API key configured." };
      var url = s.baseUrl.replace(/\/+$/, "") + "/chat/completions";
      try {
        var res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + s.key },
          body: JSON.stringify({
            model: s.model || "gpt-4o-mini",
            temperature: typeof s.temperature === "number" ? s.temperature : 0.7,
            messages: messages
          })
        });
        if (!res.ok) {
          var t = await res.text();
          return { ok: false, error: "API error " + res.status + ": " + t.slice(0, 160) };
        }
        var data = await res.json();
        var text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
        return { ok: true, text: text.trim(), source: "live" };
      } catch (e) {
        return { ok: false, error: "Network/CORS error: " + e.message + " (the API may not allow browser requests)." };
      }
    },

    // Offline heuristic tool outputs, each returns { text, source }
    suggestTitles: function (ctx) {
      var kws = keywords(ctx.title + " " + ctx.body, 5);
      var base = (ctx.title || textOf(ctx.body).slice(0, 40) || "Untitled idea").replace(/[.!?]+$/, "");
      var k = kws[0] || base.toLowerCase();
      var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
      var ideas = [
        base + ": A Practical Guide",
        "How to " + (kws[0] ? cap(kws[0]) : "Get Started") + " (Without the Overwhelm)",
        cap(k) + " Explained Simply",
        "What Nobody Tells You About " + cap(k || base),
        "A Beginner's Guide to " + cap(k || base),
        "5 Lessons I Learned About " + cap(k || base)
      ];
      return { text: ideas.slice(0, 6), source: "offline" };
    },
    generateExcerpt: function (ctx) {
      return { text: excerptFrom(ctx.body, 160), source: "offline" };
    },
    tldr: function (ctx) {
      var ss = sentences(textOf(ctx.body));
      if (!ss.length) return { text: "Add some content and I'll summarize it.", source: "offline" };
      var scored = ss.map(function (s) { return { s: s, score: keywords(s, 20).length + (s.length < 160 ? 2 : 0) }; });
      scored.sort(function (a, b) { return b.score - a.score; });
      var top = scored.slice(0, Math.min(3, scored.length)).map(function (x) { return "• " + x.s; });
      return { text: top.join("\n"), source: "offline" };
    },
    suggestTags: function (ctx) {
      var kws = keywords(textOf(ctx.body) + " " + ctx.title, 6);
      var known = Data.allTags().map(function (t) { return t.tag; });
      var picks = [];
      kws.forEach(function (k) {
        var match = known.find(function (t) { return t.toLowerCase() === k; });
        picks.push(match || (k.charAt(0).toUpperCase() + k.slice(1)));
      });
      return { text: Array.from(new Set(picks)).slice(0, 6), source: "offline" };
    },
    outline: function (ctx) {
      var kws = keywords(textOf(ctx.body) + " " + (ctx.title || ""), 4);
      var points = kws.length ? kws : ["introduction", "key ideas", "examples", "conclusion"];
      var lines = [
        "1. Introduction — hook the reader",
        "2. Why it matters"
      ].concat(points.map(function (k, i) { return (i + 3) + ". " + (k.charAt(0).toUpperCase() + k.slice(1)); }));
      lines.push((points.length + 3) + ". Conclusion & call to action");
      return { text: lines.join("\n"), source: "offline" };
    },
    readability: function (ctx) {
      var text = textOf(ctx.body), w = text ? text.split(/\s+/) : [];
      if (!w.length) return { score: 0, grade: "—", label: "Add content" };
      var ss = sentences(text);
      var syllables = w.reduce(function (a, x) { return a + syllableCount(x); }, 0);
      var asl = w.length / Math.max(1, ss.length);
      var asw = syllables / w.length;
      var flesch = Math.round(206.835 - 1.015 * asl - 84.6 * asw);
      flesch = Math.max(0, Math.min(100, flesch));
      var label = flesch >= 70 ? "Easy to read" : flesch >= 50 ? "Fairly readable" : "Hard to read";
      return { score: flesch, label: label, grade: "Grade " + Math.max(1, Math.round(0.39 * asl + 11.8 * asw - 15.59)), words: w.length };
    },
    grammar: function (ctx) {
      var text = textOf(ctx.body);
      var notes = [];
      if (/\s{2,}/.test(text)) notes.push("Double spaces detected.");
      var repeat = text.match(/\b(\w+)\s+\1\b/gi);
      if (repeat) notes.push("Repeated word: " + repeat[0]);
      var sents = text.split(/[.!?]/).map(function (s) { return s.trim(); }).filter(Boolean);
      var long = sents.filter(function (s) { return s.split(/\s+/).length > 40; }).length;
      if (long) notes.push(long + " very long sentence(s) — consider splitting.");
      var filler = ["really", "very", "actually", "basically", "just", "quite"];
      var found = filler.filter(function (f) { return new RegExp("\\b" + f + "\\b", "i").test(text); });
      if (found.length) notes.push("Filler words: " + found.join(", "));
      if (!notes.length) notes.push("No obvious issues found. Nice work!");
      return { text: notes, source: "offline" };
    },
    seoAnalyze: function (ctx) {
      var t = ctx.title || "", ex = ctx.excerpt || "", body = textOf(ctx.body), cover = ctx.cover, tags = ctx.tags || [];
      var checks = [], score = 0, weight = 0;
      function add(label, pass, tip, w) { weight += w; if (pass) score += w; checks.push({ label: label, pass: pass, tip: tip, level: pass ? "ok" : "warn" }); }
      var tlen = t.length;
      add("Title length 30–60 chars (" + tlen + ")", tlen >= 30 && tlen <= 60, tlen < 30 ? "Title is a bit short." : "Title may be too long for search results.", 15);
      add("Meta description set", !!ex, "Add an excerpt/meta description of 120–160 chars.", 15);
      var elen = ex.length;
      add("Meta 120–160 chars (" + elen + ")", elen >= 120 && elen <= 160, "Aim for 120–160 characters.", 10);
      add("At least 300 words (" + words(ctx.body) + ")", words(ctx.body) >= 300, "Longer, in-depth posts rank better.", 15);
      add("Has a featured image", !!cover, "Add a featured image for social sharing.", 10);
      add("Has 2+ tags", tags.length >= 2, "Add a couple of relevant tags.", 10);
      var hasH2 = /<h2/i.test(ctx.body || "");
      add("Uses section headings", hasH2, "Break content with H2 headings.", 10);
      var first100 = (body.slice(0, 100) || "").toLowerCase();
      var kw = keywords(t + " " + body, 1)[0];
      add("Keyword in opening", kw ? first100.indexOf(kw) >= 0 : false, "Use your main keyword early.", 5);
      var scorePct = Math.round((score / weight) * 100);
      return { score: scorePct, checks: checks, keyword: kw || "" };
    }
  };

  /* ------------------------------ Export -------------------------------- */
  window.BS = {
    VERSION: VERSION, CATS: CATS,
    state: D, load: load, save: save, reset: function () { D = blank(); window.BS.state = D; save(); },
    esc: esc, uid: uid, slugify: slugify, uniqueSlug: uniqueSlug, debounce: debounce,
    textOf: textOf, words: words, readingTime: readingTime, excerptFrom: excerptFrom,
    fmtDate: fmtDate, fmtDateTime: fmtDateTime, relTime: relTime,
    initials: initials, hue: hue, gradient: gradient, sanitize: sanitize, icon: icon,
    keywords: keywords,
    Auth: Auth, Data: Data, AI: AI
  };
})();
