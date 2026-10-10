/* ==========================================================================
   BlogSphere AI — app.js
   Router · views · rich-text editor · AI assistant · settings · events
   Depends on window.BS (core.js)
   ========================================================================== */
(function () {
  "use strict";
  var BS = window.BS;
  var esc = BS.esc, icon = BS.icon;

  /* ------------------------------ Tiny DOM ------------------------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  /* ------------------------------ UI state ------------------------------- */
  var UI = {
    q: "", cat: "", tag: "", sort: "new", page: 1,
    dashTab: "all", settingsTab: "profile",
    recover: { stage: 1, uid: null, question: "" }
  };
  var ED = { id: null, dirty: false, timer: null, status: "draft", cleanups: [] };

  /* ------------------------------- Theme --------------------------------- */
  function applyTheme() {
    var t = BS.state.theme;
    if (t) document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }
  function currentIsDark() {
    if (BS.state.theme) return BS.state.theme === "dark";
    return matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function toggleTheme() {
    BS.state.theme = currentIsDark() ? "light" : "dark";
    BS.save(); applyTheme();
  }

  /* ------------------------------ Toasts --------------------------------- */
  function toast(msg, type) {
    var el = document.createElement("div");
    el.className = "toast" + (type ? " toast--" + type : "");
    var ic = type === "error" ? "alert" : type === "success" ? "checkCircle" : type === "info" ? "info" : "check";
    el.innerHTML = icon(ic) + "<span>" + esc(msg) + "</span>";
    $("#toasts").appendChild(el);
    setTimeout(function () { el.style.opacity = "0"; el.style.transform = "translateY(8px)"; }, 3000);
    setTimeout(function () { el.remove(); }, 3300);
  }

  /* ------------------------------ Dialog --------------------------------- */
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var dlg = $("#dlg");
      $("#dm-title").textContent = opts.title || "Are you sure?";
      $("#dm-text").innerHTML = opts.message || "";
      var y = $("#dy"), n = $("#dn");
      y.textContent = opts.confirmText || "Confirm";
      y.className = "btn " + (opts.danger ? "btn--danger" : "btn--primary");
      dlg.showModal();
      function cleanup() { y.onclick = n.onclick = dlg.onclose = null; }
      y.onclick = function () { dlg.close(); cleanup(); resolve(true); };
      n.onclick = function () { dlg.close(); cleanup(); resolve(false); };
      dlg.onclose = function () { cleanup(); resolve(false); };
    });
  }

  /* ------------------------------ Helpers -------------------------------- */
  function avatar(u, cls) {
    u = u || {};
    var c = "avatar" + (cls ? " " + cls : "");
    if (u.avatar) return '<img class="' + c + '" src="' + esc(u.avatar) + '" alt="">';
    return '<span class="' + c + '">' + BS.initials(u.name) + "</span>";
  }
  function coverStyle(p) {
    if (p.cover) return 'background-image:url("' + p.cover.replace(/["\\]/g, "") + '");background-size:cover;background-position:center';
    return "background:" + BS.gradient(p.id);
  }
  function statusBadge(s) {
    var map = { published: "badge--published", draft: "badge--draft", archived: "badge--archived" };
    return '<span class="badge ' + (map[s] || "") + '">' + s + "</span>";
  }
  function emptyState(title, msg, actions) {
    return '<div class="empty">' + icon("feather") + "<h3>" + esc(title) + "</h3><p>" + msg + "</p>" +
      (actions ? '<div class="row">' + actions + "</div>" : "") + "</div>";
  }
  function catChips(active, action) {
    return '<button class="chip' + (!active ? " is-active" : "") + '" data-act="' + action + '" data-val="">All</button>' +
      BS.CATS.map(function (c) {
        return '<button class="chip' + (active === c ? " is-active" : "") + '" data-act="' + action + '" data-val="' + esc(c) + '">' + esc(c) + "</button>";
      }).join("");
  }

  function card(p) {
    var a = BS.Auth.user(p.author);
    var liked = BS.Data.isLiked(p.id);
    var saved = BS.Data.isMarked(p.id);
    return '<article class="card">' +
      '<a class="card__cover" href="#/post/' + p.id + '" style="' + coverStyle(p) + '" aria-label="' + esc(p.title) + '">' +
      (p.status !== "published" ? '<span class="badge badge--' + p.status + '">' + p.status + "</span>" : "") + "</a>" +
      '<div class="card__body">' +
      '<span class="badge badge--plain">' + esc(p.cat) + "</span>" +
      '<h3 class="card__title"><a href="#/post/' + p.id + '">' + esc(p.title) + "</a></h3>" +
      '<p class="card__excerpt">' + esc(p.excerpt) + "</p>" +
      '<div class="meta">' + avatar(a) + "<span>" + esc(a.name) + "</span><span class='dot'></span>" +
      "<span>" + BS.fmtDate(p.publishedAt || p.created) + "</span><span class='dot'></span>" +
      "<span>" + BS.readingTime(p.body) + " min read</span></div>" +
      '<div class="card__foot">' +
      '<div class="card__actions">' +
      '<button class="iconbtn' + (liked ? " is-on" : "") + '" data-act="like" data-id="' + p.id + '" data-tooltip="Like" aria-label="Like">' + icon("heart") + " " + BS.Data.likesCount(p.id) + "</button>" +
      '<button class="iconbtn' + (saved ? " is-on" : "") + '" data-act="mark" data-id="' + p.id + '" data-tooltip="Bookmark" aria-label="Bookmark">' + icon("bookmark") + "</button>" +
      "</div>" +
      '<a class="iconbtn" href="#/post/' + p.id + '" data-tooltip="Read" aria-label="Read">' + icon("arrowRight") + "</a>" +
      "</div></div></article>";
  }

  /* ------------------------------- Navbar -------------------------------- */
  function navbar() {
    var h = location.hash, me = BS.Auth.me();
    function link(path, label, ic) {
      var on = h === "#/" + path || h.indexOf("#/" + path + "/") === 0;
      return '<a class="navlink' + (on ? " is-active" : "") + '" href="#/' + path + '">' + (ic ? icon(ic) : "") + label + "</a>";
    }
    var nav = link("explore", "Explore", "compass");
    if (me) nav += link("dashboard", "Dashboard", "layers") + link("saved", "Saved", "bookmark");
    var actions = me
      ? '<a class="btn btn--primary btn--sm" href="#/write">' + icon("pen") + " Write</a>" +
        '<div class="menu-wrap" id="pm">' +
        '<button class="btn btn--soft btn--icon btn--sm" data-act="profile-menu" aria-label="Account menu" aria-haspopup="true">' + avatar(me) + "</button>" +
        '<div class="dropdown" id="pm-menu" hidden>' +
        '<div class="dropdown__head"><b>' + esc(me.name) + "</b><span>@" + esc(me.username) + "</span></div>" +
        '<a class="dropdown__item" href="#/profile/' + me.id + '">' + icon("user") + " View profile</a>" +
        '<a class="dropdown__item" href="#/settings">' + icon("settings") + " Settings</a>" +
        '<div class="dropdown__sep"></div>' +
        '<button class="dropdown__item is-danger" data-act="logout">' + icon("logout") + " Log out</button>" +
        "</div></div>"
      : '<a class="navlink" href="#/login">Log in</a><a class="btn btn--primary btn--sm" href="#/register">Start writing</a>';
    return '<div class="topbar"><div class="wrap topbar__inner">' +
      '<a class="brand" href="#/"><span class="brand__mark">' + icon("feather") + '</span><span>BlogSphere<small>AI</small></span></a>' +
      '<button class="btn btn--ghost btn--icon btn--sm hamburger" data-act="menu" aria-label="Toggle navigation" aria-expanded="false">' + icon("menu") + "</button>" +
      '<nav class="navlinks" id="navlinks" aria-label="Main">' + nav + '<div class="nav-actions" style="margin-left:auto">' + actions +
      '<button class="btn btn--ghost btn--icon btn--sm" data-act="theme" data-tooltip="Toggle theme" aria-label="Toggle theme">' + icon(currentIsDark() ? "sun" : "moon") + "</button>" +
      "</div></nav></div></div>";
  }

  /* -------------------------------- Home --------------------------------- */
  function viewHome() {
    var P = BS.Data.published();
    var featured = P.slice().sort(function (a, b) { return BS.Data.likesCount(b.id) - BS.Data.likesCount(a.id) || (b.publishedAt || b.created) - (a.publishedAt || a.created); }).slice(0, 3);
    var authorCount = {};
    P.forEach(function (p) { authorCount[p.author] = (authorCount[p.author] || 0) + 1; });
    var authors = Object.keys(authorCount).sort(function (a, b) { return authorCount[b] - authorCount[a]; }).slice(0, 4);
    var me = BS.Auth.me();

    return '<section class="hero">' +
      '<div><span class="eyebrow">' + icon("sparkles") + " AI-powered writing</span>" +
      "<h1>Your ideas deserve to be read.</h1>" +
      "<p>A calm, focused place to write, publish and discover long-form articles — with an AI assistant, SEO tools and writing analytics built in.</p>" +
      '<div class="row"><a class="btn btn--grad btn--lg" href="#/' + (me ? "write" : "register") + '">' + icon("pen") + " Start writing</a>" +
      '<a class="btn btn--lg" href="#/explore">' + icon("compass") + " Explore blogs</a></div></div>" +
      '<div class="hero-art" role="img" aria-label="Illustration of an article layout"></div></section>' +

      '<section class="section"><div class="section-head"><div><div class="eyebrow-line">Discover</div><h2>Featured articles</h2></div>' +
      '<a href="#/explore">See all ' + icon("arrowRight") + "</a></div>" +
      (featured.length ? '<div class="grid">' + featured.map(card).join("") + "</div>"
        : emptyState("No articles yet", "Be the first to publish, or load a few clearly labelled sample posts to look around.",
          '<a class="btn btn--primary" href="#/' + (me ? "write" : "register") + '">Write the first one</a><button class="btn" data-act="sample">Load sample articles</button>')) +
      "</section>" +

      '<section class="section"><div class="section-head"><div><div class="eyebrow-line">Browse</div><h2>Trending categories</h2></div></div>' +
      '<div class="chips">' + BS.CATS.map(function (c) {
        return '<a class="chip" href="#/explore/' + encodeURIComponent(c) + '">' + esc(c) + ' <span class="pill-count">' + P.filter(function (p) { return p.cat === c; }).length + "</span></a>";
      }).join("") + "</div></section>" +

      '<section class="section"><h2>Popular authors</h2>' +
      (authors.length ? '<div class="chips">' + authors.map(function (id) {
        var u = BS.Auth.user(id);
        return '<a class="chip" href="#/profile/' + id + '">' + avatar(u) + " " + esc(u.name) + ' <span class="pill-count">' + authorCount[id] + "</span></a>";
      }).join("") + "</div>" : '<p class="muted">Authors appear here once articles are published.</p>') +
      "</section>";
  }

  /* ------------------------------ Explore -------------------------------- */
  function viewExplore(catParam) {
    if (catParam && BS.CATS.indexOf(decodeURIComponent(catParam)) >= 0) { UI.cat = decodeURIComponent(catParam); UI.page = 1; }
    var tags = BS.Data.allTags().slice(0, 10);
    return '<section class="section"><div class="section-head"><div><div class="eyebrow-line">Discover</div><h1 style="font-size:2.4rem;margin:0">Explore</h1></div></div>' +
      '<div class="row" style="margin-bottom:14px">' +
      '<div style="position:relative;flex:1;min-width:220px"><input id="q" class="input" type="search" placeholder="Search title, content, author or tag" aria-label="Search articles" value="' + esc(UI.q) + '" style="padding-left:40px">' +
      '<span style="position:absolute;left:12px;top:11px;color:var(--faint)">' + icon("search") + "</span></div>" +
      '<select id="so" class="select" aria-label="Sort" style="max-width:180px"><option value="new"' + (UI.sort === "new" ? " selected" : "") + ">Newest</option>" +
      '<option value="pop"' + (UI.sort === "pop" ? " selected" : "") + ">Most liked</option>" +
      '<option value="views"' + (UI.sort === "views" ? " selected" : "") + ">Most viewed</option>" +
      '<option value="title"' + (UI.sort === "title" ? " selected" : "") + ">A–Z</option></select></div>" +
      '<div class="chips" style="margin-bottom:10px">' + catChips(UI.cat, "set-cat") + "</div>" +
      (tags.length ? '<div class="chips" style="margin-bottom:18px">' + '<span class="muted small" style="align-self:center">Tags:</span>' +
        tags.map(function (t) { return '<button class="chip' + (UI.tag === t.tag ? " is-active" : "") + '" data-act="set-tag" data-val="' + esc(t.tag) + '">#' + esc(t.tag) + "</button>"; }).join("") + "</div>" : "") +
      '<div id="res">' + resultsHTML() + "</div></section>";
  }
  function resultsHTML() {
    var r = BS.Data.query({ q: UI.q, cat: UI.cat, tag: UI.tag, sort: UI.sort, status: "published", page: UI.page, per: 6 });
    UI.page = r.page;
    if (!r.total) return emptyState("No matching articles", "Try a different search, category or tag.", '<button class="btn" data-act="clear-filters">Clear filters</button>');
    return '<div class="grid">' + r.items.map(card).join("") + "</div>" +
      (r.pages > 1 ? '<div class="pager"><button class="btn btn--sm" data-act="page" data-val="-1"' + (r.page < 2 ? " disabled" : "") + ">" + icon("chevronLeft") + " Previous</button>" +
        '<span class="muted small">Page ' + r.page + " of " + r.pages + "</span>" +
        '<button class="btn btn--sm" data-act="page" data-val="1"' + (r.page >= r.pages ? " disabled" : "") + ">Next " + icon("chevronRight") + "</button></div>" : "");
  }

  /* -------------------------------- Post --------------------------------- */
  function viewPost(pid) {
    var p = BS.Data.post(pid) || BS.Data.postBySlug(pid);
    if (!p || (p.status !== "published" && p.author !== BS.Auth.meId())) {
      return '<div class="wrap wrap--narrow section">' + emptyState("Article not found", "It may be a draft or was removed.", '<a class="btn" href="#/explore">Back to explore</a>') + "</div>";
    }
    var meId = BS.Auth.meId();
    var owner = p.author === meId;
    if (!owner && p.status === "published") { BS.Data.bumpViews(p.id); }
    var a = BS.Auth.user(p.author);
    var liked = BS.Data.isLiked(p.id), saved = BS.Data.isMarked(p.id);
    var C = BS.Data.comments(p.id);
    var cover = p.cover ? '<div class="post-cover"><img src="' + esc(p.cover) + '" alt=""></div>'
      : '<div class="post-cover" style="' + coverStyle(p) + '"></div>';

    var ownerBar = owner ? (
      (p.status === "draft" ? '<span class="badge badge--draft">Draft preview</span>' : p.status === "archived" ? '<span class="badge badge--archived">Archived</span>' : "") +
      '<a class="btn btn--sm" href="#/write/' + p.id + '">' + icon("edit") + " Edit</a>" +
      (p.status === "published"
        ? '<button class="btn btn--sm" data-act="unpublish" data-id="' + p.id + '">' + icon("undo") + " Unpublish</button>"
        : '<button class="btn btn--sm" data-act="publish-now" data-id="' + p.id + '">' + icon("globe") + " Publish</button>") +
      (p.status === "archived"
        ? '<button class="btn btn--sm" data-act="restore" data-id="' + p.id + '">' + icon("restore") + " Restore</button>"
        : '<button class="btn btn--sm" data-act="archive" data-id="' + p.id + '">' + icon("archive") + " Archive</button>") +
      '<button class="btn btn--sm btn--danger" data-act="del-post" data-id="' + p.id + '">' + icon("trash") + " Delete</button>"
    ) : "";

    return '<div class="reading-progress" id="rprog"></div><article class="wrap wrap--read section">' +
      '<a class="btn btn--ghost btn--sm" href="#/explore">' + icon("arrowLeft") + " Back</a>" +
      '<div class="post-hero"><span class="badge badge--plain">' + esc(p.cat) + "</span>" +
      "<h1 style='margin-top:12px'>" + esc(p.title) + "</h1>" +
      '<p class="muted" style="font-size:1.12rem">' + esc(p.excerpt) + "</p>" +
      '<div class="meta" style="gap:10px;margin:14px 0">' + avatar(a) + "<span>" + esc(a.name) + "</span><span class='dot'></span>" +
      "<span>" + BS.fmtDate(p.publishedAt || p.created) + "</span><span class='dot'></span>" +
      "<span>" + icon("clock") + " " + BS.readingTime(p.body) + " min read</span><span class='dot'></span>" +
      "<span>" + icon("eye") + " " + (p.views || 0) + " views</span></div></div>" +
      cover +
      '<div class="prose" id="article-body">' + BS.sanitize(p.body) + "</div>" +
      (p.tags && p.tags.length ? '<div class="chips" style="margin:22px 0">' + p.tags.map(function (t) { return '<a class="chip" href="#/explore" data-act="set-tag" data-val="' + esc(t) + '">#' + esc(t) + "</a>"; }).join("") + "</div>" : "") +
      '<div class="post-actions">' +
      '<button class="btn' + (liked ? " btn--primary" : "") + '" data-act="like" data-id="' + p.id + '">' + icon("heart") + " " + BS.Data.likesCount(p.id) + "</button>" +
      '<button class="btn' + (saved ? " btn--primary" : "") + '" data-act="mark" data-id="' + p.id + '">' + icon("bookmark") + " " + (saved ? "Saved" : "Save") + "</button>" +
      '<button class="btn" data-act="copy">' + icon("link") + " Copy link</button>" +
      ownerBar + "</div>" +
      (p.status === "published" ? commentsSection(p, C) : "") +
      "</article>";
  }
  function commentsSection(p, C) {
    var me = BS.Auth.me();
    return '<section style="margin-top:36px"><h2>Comments <span class="pill-count">' + C.length + "</span></h2>" +
      (me ? '<form data-form="comment" data-id="' + p.id + '" class="panel" style="margin:16px 0"><textarea class="textarea" name="text" rows="3" maxlength="500" placeholder="Share your thoughts…"></textarea><p class="error-text" id="e-comment"></p><button class="btn btn--primary">Post comment</button></form>'
        : '<p class="muted"><a href="#/login">Log in</a> to join the conversation.</p>') +
      (C.map(function (c) {
        var cu = BS.Auth.user(c.u);
        return '<div class="comment"><div class="meta">' + avatar(cu) + "<b>" + esc(cu.name) + "</b><span class='faint'>" + BS.relTime(c.t) + "</span>" +
          (c.u === BS.Auth.meId() ? '<button class="iconbtn" data-act="del-comment" data-id="' + c.id + '">' + icon("trash") + " Delete</button>" : "") + "</div>" +
          '<p class="comment__text">' + esc(c.text) + "</p></div>";
      }).join("") || '<p class="muted">No comments yet. Start the discussion.</p>') + "</section>";
  }

  /* -------------------------------- Auth --------------------------------- */
  function field(id, label, type, opts) {
    opts = opts || {};
    return '<div class="field" id="f-' + id + '"><label class="label" for="' + id + '">' + label + (opts.req ? ' <span class="req">*</span>' : "") + "</label>" +
      (type === "textarea"
        ? '<textarea class="textarea" id="' + id + '" name="' + id + '" rows="3" ' + (opts.attrs || "") + "></textarea>"
        : '<input class="input" id="' + id + '" name="' + id + '" type="' + (type || "text") + '" ' + (opts.attrs || "") + ">") +
      '<p class="error-text" id="e-' + id + '"></p></div>';
  }
  function viewLogin() {
    return '<div class="wrap"><div class="panel panel--pad-lg auth-card"><div class="center" style="margin-bottom:8px">' +
      '<span class="brand__mark" style="margin:0 auto 12px;width:44px;height:44px">' + icon("feather") + "</span>" +
      "<h2 class='mt-0'>Welcome back</h2><p class='muted'>Log in to continue writing and publishing.</p></div>" +
      '<form data-form="login" novalidate>' + field("loginId", "Email or username", "text", { req: true }) +
      field("password", "Password", "password", { attrs: 'autocomplete="current-password"' }) +
      '<p class="error-text" id="e-login"></p>' +
      '<button class="btn btn--primary btn--block btn--lg">' + icon("lock") + " Log in</button></form>" +
      '<div class="row row--between" style="margin-top:14px"><a href="#/forgot" class="small">Forgot password?</a>' +
      '<span class="muted small">New here? <a href="#/register">Create an account</a></span></div></div></div>';
  }
  function viewRegister() {
    return '<div class="wrap"><div class="panel panel--pad-lg auth-card" style="max-width:540px"><h2 class="mt-0">Create your account</h2>' +
      '<p class="muted">Start publishing in under a minute.</p><form data-form="register" novalidate>' +
      '<div class="form-grid">' + field("name", "Full name", "text", { req: true, attrs: 'autocomplete="name"' }) + field("username", "Username", "text", { req: true, attrs: 'autocomplete="username"' }) + "</div>" +
      field("email", "Email", "email", { req: true, attrs: 'autocomplete="email"' }) +
      '<div class="form-grid">' + field("password", "Password", "password", { req: true, attrs: 'autocomplete="new-password"' }) + field("password2", "Confirm password", "password", { req: true }) + "</div>" +
      '<div class="divider"></div><p class="muted small" style="margin:0 0 6px">Account recovery (optional but recommended)</p>' +
      '<div class="form-grid"><div class="field"><label class="label" for="rq">Security question</label><select class="select" id="rq" name="rq">' +
      ["What was your first pet's name?", "What city were you born in?", "What is your mother's maiden name?"].map(function (q) { return "<option>" + q + "</option>"; }).join("") + "</select></div>" +
      field("ra", "Answer", "text") + "</div>" +
      '<p class="error-text" id="e-form"></p><button class="btn btn--primary btn--block btn--lg">' + icon("user") + " Create account</button></form>" +
      '<p class="muted small center" style="margin-top:14px">Already registered? <a href="#/login">Log in</a></p></div></div>';
  }
  function viewForgot() {
    if (UI.recover.stage === 2) {
      return '<div class="wrap"><div class="panel panel--pad-lg auth-card"><h2 class="mt-0">Reset password</h2>' +
        '<p class="muted">Answer your security question to set a new password.</p>' +
        '<p class="label">' + esc(UI.recover.question) + "</p>" +
        '<form data-form="reset" novalidate>' + field("answer", "Your answer", "text", { req: true }) + field("newPassword", "New password", "password", { req: true }) +
        '<p class="error-text" id="e-form"></p><button class="btn btn--primary btn--block">Set new password</button></form>' +
        '<p class="muted small center" style="margin-top:12px"><button class="btn btn--ghost btn--sm" data-act="recover-back">' + icon("arrowLeft") + " Back</button></p></div></div>";
    }
    return '<div class="wrap"><div class="panel panel--pad-lg auth-card"><h2 class="mt-0">Forgot password</h2>' +
      '<p class="muted">Enter your email or username to recover your account.</p>' +
      '<form data-form="recover" novalidate>' + field("identifier", "Email or username", "text", { req: true }) +
      '<p class="error-text" id="e-form"></p><button class="btn btn--primary btn--block">Continue</button></form>' +
      '<p class="muted small center" style="margin-top:12px"><a href="#/login">Back to log in</a></p></div></div>';
  }

  /* ------------------------------ Dashboard ------------------------------ */
  function viewDashboard() {
    var me = BS.Auth.me();
    var s = BS.Data.authorStats(me.id);
    var r = BS.Data.query({ author: me.id, status: UI.dashTab, sort: "new", page: 1, per: 1000 });
    var rows = r.items;
    function statCard(val, label, ic) { return '<div class="stat"><div class="row row--between"><b>' + val + "</b>" + icon(ic) + '</div><span>' + label + "</span></div>"; }
    return '<section class="section"><div class="section-head"><div><div class="eyebrow-line">Your workspace</div><h1 style="font-size:2.2rem;margin:0">Hello, ' + esc(me.name.split(" ")[0]) + '</h1><span class="muted small">@' + esc(me.username) + "</span></div>" +
      '<a class="btn btn--primary" href="#/write">' + icon("plus") + " New post</a></div>" +
      '<div class="stats" style="margin-bottom:22px">' + statCard(s.published, "Published", "globe") + statCard(s.drafts, "Drafts", "edit") + statCard(s.views, "Total views", "eye") + statCard(s.likes, "Likes", "heart") + statCard(s.comments, "Comments", "book") + "</div>" +
      '<div class="row row--between" style="margin-bottom:12px"><div class="tabs">' +
      [["all", "All"], ["published", "Published"], ["draft", "Drafts"], ["archived", "Archived"]].map(function (t) {
        return '<button class="tab' + (UI.dashTab === t[0] ? " is-active" : "") + '" data-act="dash-tab" data-val="' + t[0] + '">' + t[1] + "</button>";
      }).join("") + "</div></div>" +
      (rows.length ? '<div class="table-wrap"><table><thead><tr><th>Title</th><th>Status</th><th>Updated</th><th>Views</th><th>Likes</th><th style="text-align:right">Actions</th></tr></thead><tbody>' +
        rows.map(function (p) {
          return "<tr><td><a href='#/post/" + p.id + "'>" + esc(p.title) + "</a></td><td>" + statusBadge(p.status) + "</td><td>" + BS.relTime(p.updated) + "</td><td>" + (p.views || 0) + "</td><td>" + BS.Data.likesCount(p.id) + "</td>" +
            '<td><div class="row" style="justify-content:flex-end">' +
            '<a class="btn btn--sm" href="#/write/' + p.id + '">' + icon("edit") + " Edit</a>" +
            (p.status === "published"
              ? '<button class="btn btn--sm" data-act="unpublish" data-id="' + p.id + '">Unpublish</button>'
              : p.status === "archived"
                ? '<button class="btn btn--sm" data-act="restore" data-id="' + p.id + '">' + icon("restore") + " Restore</button>"
                : '<button class="btn btn--sm" data-act="publish-now" data-id="' + p.id + '">' + icon("globe") + " Publish</button>") +
            (p.status !== "archived" ? '<button class="btn btn--sm" data-act="archive" data-id="' + p.id + '" data-tooltip="Archive" aria-label="Archive">' + icon("archive") + "</button>" : "") +
            '<button class="btn btn--sm btn--danger" data-act="del-post" data-id="' + p.id + '" data-tooltip="Delete" aria-label="Delete">' + icon("trash") + "</button>" +
            "</div></td></tr>";
        }).join("") + "</tbody></table></div>"
        : emptyState("Nothing here yet", "Posts you create will appear in this list.", '<a class="btn btn--primary" href="#/write">' + icon("pen") + " Create your first post</a>")) +
      "</section>";
  }

  /* -------------------------------- Saved -------------------------------- */
  function viewSaved() {
    var L = BS.Data.saved();
    return '<section class="section"><div class="eyebrow-line">Your library</div><h1 style="font-size:2.2rem">Saved articles</h1>' +
      (L.length ? '<div class="grid">' + L.map(card).join("") + "</div>"
        : emptyState("No saved articles", "Tap the bookmark on any article to keep it here.", '<a class="btn" href="#/explore">Explore blogs</a>')) + "</section>";
  }

  /* ------------------------------- Profile ------------------------------- */
  function viewProfile(id) {
    var meId = BS.Auth.meId();
    var uidParam = id || meId;
    var u = BS.Auth.user(uidParam);
    var P = BS.Data.byAuthor(uidParam).filter(function (p) { return p.status === "published" || uidParam === meId; });
    var isMe = uidParam === meId;
    return '<section class="section">' +
      '<div class="panel panel--pad-lg" style="display:flex;gap:22px;align-items:center;flex-wrap:wrap">' +
      avatar(u, "avatar--xl") +
      '<div class="grow"><h1 style="margin:0 0 4px">' + esc(u.name) + '</h1><p class="muted" style="margin:0 0 8px">@' + esc(u.username) + "</p>" +
      '<p style="margin:0;max-width:60ch">' + (u.bio ? esc(u.bio) : '<span class="faint">No bio yet.</span>') + "</p>" +
      '<div class="meta" style="margin-top:10px"><span>' + icon("clock") + " Joined " + BS.fmtDate(u.createdAt) + "</span></div></div>" +
      (isMe ? '<a class="btn" href="#/settings">' + icon("settings") + " Edit profile</a>" : "") + "</div>" +
      '<div class="section-head" style="margin-top:28px"><h2 style="margin:0">' + (isMe ? "Your posts" : "Articles") + ' <span class="pill-count">' + P.length + "</span></h2></div>" +
      (P.length ? '<div class="grid">' + P.map(card).join("") + "</div>" : emptyState("No posts yet", isMe ? "Start writing your first article." : "This author hasn't published anything yet.", isMe ? '<a class="btn btn--primary" href="#/write">Write a post</a>' : "")) +
      "</section>";
  }

  /* ------------------------------ Settings ------------------------------- */
  function viewSettings() {
    var me = BS.Auth.me();
    var tab = UI.settingsTab;
    var nav = [["profile", "Profile", "user"], ["account", "Account & security", "lock"], ["appearance", "Appearance", "sun"], ["ai", "AI assistant", "sparkles"], ["data", "Data", "layers"]];
    return '<section class="section"><div class="eyebrow-line">Preferences</div><h1 style="font-size:2.2rem">Settings</h1>' +
      '<div class="settings-grid" style="margin-top:20px"><nav class="settings-nav">' +
      nav.map(function (n) { return '<button class="' + (tab === n[0] ? "is-active" : "") + '" data-act="settings-tab" data-val="' + n[0] + '">' + n[1] + "</button>"; }).join("") +
      "</nav><div>" + settingsPanel(tab, me) + "</div></div></section>";
  }
  function settingsPanel(tab, me) {
    var ai = BS.AI.settings();
    if (tab === "profile") {
      return '<div class="panel"><h2 class="mt-0">Profile</h2><div class="row" style="gap:18px;margin-bottom:16px">' + avatar(me, "avatar--lg") +
        '<div><div class="form-grid" style="grid-template-columns:1fr"><div class="field"><label class="label" for="avatar">Profile image URL</label><input class="input" id="avatar" value="' + esc(me.avatar || "") + '" placeholder="https://…"></div></div>' +
        '<label class="btn btn--sm btn--soft" style="cursor:pointer"><input type="file" id="avatarFile" accept="image/*" class="hide">' + icon("upload") + " Upload image</label></div></div>" +
        '<form data-form="profile">' + '<div class="form-grid">' + field2("name", "Full name", me.name) + field2("username-display", "Username", me.username, " disabled") + "</div>" +
        '<div class="field"><label class="label" for="bio">Biography</label><textarea class="textarea" id="bio" name="bio" maxlength="280" placeholder="Tell readers about yourself…">' + esc(me.bio || "") + '</textarea><p class="hint"><span id="bio-count">' + (me.bio || "").length + "</span>/280</p></div>" +
        '<button class="btn btn--primary">' + icon("check") + " Save profile</button></form></div>";
    }
    if (tab === "account") {
      return '<div class="panel"><h2 class="mt-0">Account & security</h2>' +
        '<p class="muted small">Email: <b>' + esc(me.email) + "</b></p><div class='divider'></div>" +
        '<h3>Change password</h3><form data-form="password">' +
        '<div class="form-grid">' + field("current", "Current password", "password") + field("next", "New password", "password") + "</div>" +
        field("confirm", "Confirm new password", "password") + '<p class="error-text" id="e-form"></p>' +
        '<button class="btn btn--primary">' + icon("lock") + " Update password</button></form></div>";
    }
    if (tab === "appearance") {
      return '<div class="panel"><h2 class="mt-0">Appearance</h2><p class="muted">Choose how BlogSphere AI looks on this device.</p>' +
        '<div class="toggle-row"><div><b>Dark mode</b><p class="muted small mb-0">Use the refined charcoal theme.</p></div>' +
        '<label class="switch"><input type="checkbox" id="themeToggle"' + (currentIsDark() ? " checked" : "") + "><span></span></label></div>" +
        '<div class="divider"></div><p class="muted small">Follows your system preference until you choose manually.</p>' +
        '<button class="btn btn--soft" data-act="theme-reset">' + icon("restore") + " Use system default</button></div>";
    }
    if (tab === "ai") {
      return '<div class="panel"><div class="row row--between"><h2 class="mt-0">AI assistant</h2><span class="ai-badge ' + (BS.AI.hasKey() ? "ai-badge--live" : "") + '">' + (BS.AI.hasKey() ? "Live API" : "Offline mode") + "</span></div>" +
        '<p class="muted small">Connect any OpenAI-compatible chat completions endpoint for AI writing tools. Without a key, BlogSphere AI uses its built-in offline assistant. Keys are stored only in this browser.</p>' +
        '<form data-form="ai"><div class="field"><label class="label" for="baseUrl">API base URL</label><input class="input" id="baseUrl" name="baseUrl" value="' + esc(ai.baseUrl) + '" placeholder="https://api.openai.com/v1"><p class="hint">The endpoint is <code>BASE_URL/chat/completions</code>.</p></div>' +
        '<div class="field"><label class="label" for="key">API key</label><input class="input" id="key" name="key" type="password" value="' + esc(ai.key) + '" placeholder="sk-…" autocomplete="off"></div>' +
        '<div class="form-grid">' + field2("model", "Model", ai.model) +
        '<div class="field"><label class="label" for="temperature">Temperature (' + ai.temperature + ')</label><input class="input" id="temperature" name="temperature" type="range" min="0" max="1" step="0.1" value="' + ai.temperature + '"></div></div>' +
        '<div class="row"><button class="btn btn--primary">' + icon("save") + ' Save</button><button type="button" class="btn" data-act="ai-test">' + icon("sparkles") + " Test connection</button></div></form><div id='ai-test-out'></div></div>";
    }
    // data
    return '<div class="panel"><h2 class="mt-0">Data</h2><p class="muted small">Everything is stored locally in your browser. Export a backup or restore from a file.</p>' +
      '<div class="row" style="margin-bottom:18px"><button class="btn" data-act="export">' + icon("upload") + ' Export JSON</button>' +
      '<label class="btn btn--soft" style="cursor:pointer"><input type="file" id="importFile" accept="application/json" class="hide">' + icon("save") + " Import JSON</label></div>" +
      '<div class="divider"></div><h3 style="color:var(--danger)">Danger zone</h3><p class="muted small">Permanently delete all local data (accounts, posts, comments).</p>' +
      '<button class="btn btn--danger" data-act="reset-all">' + icon("trash") + " Erase all data</button></div>";
  }
  function field2(id, label, val, extra) {
    return '<div class="field"><label class="label" for="' + id + '">' + label + '</label><input class="input" id="' + id + '" name="' + id + '" value="' + esc(val || "") + '"' + (extra || "") + "></div>";
  }

  /* =========================== EDITOR VIEW =============================== */
  function viewEditor(id) {
    var p = id ? BS.Data.post(id) : null;
    if (id && (!p || p.author !== BS.Auth.meId())) {
      return '<div class="wrap wrap--narrow section">' + emptyState("Cannot edit this article", "Only its author can edit it.", '<a class="btn" href="#/dashboard">Back to dashboard</a>') + "</div>";
    }
    ED.id = p ? p.id : null;
    ED.dirty = false;
    ED.status = p ? p.status : "draft";
    ED.tags = p && p.tags ? p.tags.slice() : [];
    var toolbar = [
      ["bold", "bold", "Bold", "Ctrl+B"], ["italic", "italic", "Italic", "Ctrl+I"],
      ["sep"], ["formatBlock:H2", "h2", "Heading 2", ""], ["formatBlock:H3", "h3", "Heading 3", ""],
      ["sep"], ["insertUnorderedList", "list", "Bullet list", ""], ["insertOrderedList", "listOrdered", "Numbered list", ""],
      ["formatBlock:BLOCKQUOTE", "quote", "Blockquote", ""], ["sep"],
      ["createLink", "link", "Insert link", "Ctrl+K"], ["insertImage", "image", "Insert image", ""],
      ["sep"], ["undo", "undo", "Undo", "Ctrl+Z"], ["redo", "redo", "Redo", "Ctrl+Y"]
    ];
    var tagsHTML = ED.tags.map(function (t) { return '<span class="tag-pill">' + esc(t) + '<button type="button" data-act="rm-tag" data-val="' + esc(t) + '" aria-label="Remove">' + icon("x") + "</button></span>"; }).join("");

    return '<div class="editor-shell"><div class="wrap">' +
      '<div class="editor-head">' +
      '<div class="row"><a class="btn btn--ghost btn--sm" href="#/dashboard">' + icon("arrowLeft") + " Back</a>" +
      '<span class="editor-status"><span class="dot-live"></span><span id="ed-status">' + (p ? p.status.charAt(0).toUpperCase() + p.status.slice(1) : "New draft") + '</span><span class="faint" id="ed-saved">' + (p ? "Saved " + BS.relTime(p.updated) : "") + "</span></span></div>" +
      '<div class="row">' +
      '<button class="btn btn--sm btn--ghost" data-act="focus" data-tooltip="Distraction-free" aria-label="Distraction-free mode">' + icon("maximize") + '<span class="hide-sm"> Focus</span></button>' +
      '<button class="btn btn--sm" data-act="preview">' + icon("eye") + " Preview</button>" +
      '<button class="btn btn--sm" data-act="save-draft">' + icon("save") + " Save draft</button>" +
      '<button class="btn btn--sm btn--primary" data-act="publish">' + icon("globe") + " Publish</button>" +
      "</div></div>" +

      '<div class="editor-grid"><div class="editor-main">' +
      '<input class="title-input" id="ed-title" placeholder="Article title" maxlength="120" value="' + esc(p ? p.title : "") + '" aria-label="Article title">' +
      '<div class="row row--between"><span class="hint" id="ed-title-hint">0/120</span></div>' +
      '<div class="field" style="margin-top:8px"><label class="label" for="ed-excerpt">Short excerpt</label>' +
      '<textarea class="textarea" id="ed-excerpt" maxlength="200" rows="2" placeholder="A one- or two-sentence summary shown in feeds and search.">' + esc(p ? p.excerpt : "") + '</textarea>' +
      '<div class="meter" id="ed-excerpt-meter"><span></span></div><span class="hint" id="ed-excerpt-hint">Recommended 120–160 characters</span></div>' +

      '<div class="toolbar" role="toolbar" aria-label="Formatting">' +
      toolbar.map(function (t) {
        if (t[0] === "sep") return '<span class="tool-sep"></span>';
        return '<button type="button" class="tool-btn" data-cmd="' + t[0] + '" data-tooltip="' + t[2] + (t[3] ? " · " + t[3] : "") + '" aria-label="' + t[2] + '">' + icon(t[1]) + "</button>";
      }).join("") +
      '<span class="tool-spacer"></span>' +
      '<button type="button" class="tool-btn" data-act="clear-format" data-tooltip="Clear formatting">' + icon("x") + "</button>" +
      "</div>" +
      '<div class="editor-content prose" id="ed-body" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Article content" data-placeholder="Start writing your story…"></div>' +
      '<input type="file" id="ed-img-file" accept="image/*" class="hide">' +

      '<div class="action-bar"><div class="stats-inline">' +
      '<span>' + icon("book") + ' <b id="st-words">0</b> words</span>' +
      '<span><b id="st-chars">0</b> characters</span>' +
      '<span>' + icon("clock") + ' <b id="st-read">1</b> min read</span>' +
      "</div>" +
      '<div class="row"><span class="progress-ring" id="ed-progress" style="--p:0"><span>0%</span></span>' +
      '<button class="btn btn--sm" data-act="save-draft">' + icon("save") + " Save draft</button>" +
      '<button class="btn btn--sm btn--primary" data-act="publish">' + icon("globe") + " Publish</button></div></div>" +
      "</div>" + // editor-main

      '<aside class="editor-side">' +
      // Publishing widget
      '<div class="widget"><div class="widget__head"><h3>Publishing</h3><span class="badge badge--' + ED.status + '">' + ED.status + "</span></div><div class='widget__body'>" +
      '<div class="field"><label class="label" for="ed-cat">Category</label><select class="select" id="ed-cat">' +
      BS.CATS.map(function (c) { return '<option' + (p && p.cat === c ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label class="label">Tags</label><div class="tag-input" id="tag-input">' + tagsHTML +
      '<input id="tag-field" placeholder="Add a tag…" maxlength="24" list="tag-suggestions"><datalist id="tag-suggestions"></datalist></div><span class="hint">Press Enter to add, up to 8.</span></div>' +
      '<div class="field"><label class="label" for="ed-cover">Featured image URL</label><input class="input" id="ed-cover" value="' + esc(p ? p.cover : "") + '" placeholder="https://…"></div>' +
      '<label class="btn btn--sm btn--soft btn--block" style="cursor:pointer"><input type="file" id="ed-cover-file" accept="image/*" class="hide">' + icon("image") + " Upload cover</label>" +
      '<div id="ed-cover-preview" style="margin-top:10px;border-radius:10px;height:110px;border:1px solid var(--border);background:' + (p && p.cover ? 'url(' + esc(p.cover) + ') center/cover' : "var(--surface-2)") + '"></div>' +
      "</div></div>" +
      // SEO widget
      '<div class="widget"><div class="widget__head"><h3>SEO</h3><span class="ai-badge">Score</span></div><div class="widget__body">' +
      '<div class="seo-score"><span class="seo-score__ring" id="seo-ring" style="--p:0"><b id="seo-num">0</b></span><div><b id="seo-label">Needs work</b><p class="muted small mb-0">Based on title, meta, length, media &amp; structure.</p></div></div>' +
      '<div class="field" style="margin-top:12px"><label class="label" for="ed-seotitle">SEO title</label><input class="input" id="ed-seotitle" maxlength="70" value="' + esc(p ? p.seoTitle : "") + '"><div class="meter" id="seo-title-meter"><span></span></div></div>' +
      '<div class="field"><label class="label" for="ed-seodesc">Meta description</label><textarea class="textarea" id="ed-seodesc" rows="2" maxlength="180">' + esc(p ? p.seoDesc : "") + '</textarea><div class="meter" id="seo-desc-meter"><span></span></div></div>' +
      '<button class="btn btn--sm btn--soft btn--block" data-tool="seo">' + icon("sparkles") + " Generate with AI</button>" +
      '<div id="seo-checks" class="seo-checks"></div></div></div>' +
      // AI widget
      '<div class="widget"><div class="widget__head"><h3>AI assistant</h3><span class="ai-badge ' + (BS.AI.hasKey() ? "ai-badge--live" : "") + '">' + (BS.AI.hasKey() ? "Live" : "Offline") + "</span></div><div class='widget__body'>" +
      '<div class="ai-list">' +
      aiTool("titles", "sparkles", "Suggest titles") + aiTool("excerpt", "edit", "Write excerpt") +
      aiTool("tldr", "book", "Summarize (TL;DR)") + aiTool("tags", "tag", "Suggest tags") +
      aiTool("outline", "list", "Generate outline") + aiTool("improve", "wand", "Improve writing") +
      aiTool("seo", "chart", "SEO recommendations") + aiTool("grammar", "checkCircle", "Proofread") + "</div>" +
      '<div class="ai-out" id="ai-out"></div></div></div>' +
      "</aside></div></div></div>";
  }
  function aiTool(kind, ic, label) {
    return '<button class="ai-tool" data-tool="' + kind + '">' + icon(ic) + " " + label + "</button>";
  }

  /* --------------------------- Editor behaviour -------------------------- */
  function initEditor() {
    var body = $("#ed-body"), title = $("#ed-title"), excerpt = $("#ed-excerpt");
    if (!body) return;
    var p = ED.id ? BS.Data.post(ED.id) : null;
    if (p) {
      body.innerHTML = BS.sanitize(p.body);
      var coverPreview = $("#ed-cover-preview");
      if (p.cover && coverPreview) coverPreview.style.background = "url(" + p.cover + ") center/cover";
    }
    populateTagOptions();
    syncEditorStats();

    body.addEventListener("input", onEditorInput);
    title.addEventListener("input", onEditorInput);
    excerpt.addEventListener("input", onEditorInput);
    ["#ed-seotitle", "#ed-seodesc", "#ed-cover"].forEach(function (sel) {
      var el = $(sel); if (el) el.addEventListener("input", onEditorInput);
    });
    body.addEventListener("keyup", updateToolbarState);
    body.addEventListener("mouseup", updateToolbarState);
    $("#ed-cover").addEventListener("input", function () {
      var v = $(this).value.trim(), pv = $("#ed-cover-preview");
      pv.style.background = v ? "url(" + v + ") center/cover" : "var(--surface-2)";
    });

    // tag field
    var tagField = $("#tag-field");
    tagField.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addTag(tagField.value); tagField.value = "";
      } else if (e.key === "Backspace" && !tagField.value && ED.tags.length) {
        ED.tags.pop(); renderTags(); onEditorInput();
      }
    });
    $("#ed-cover-file").addEventListener("change", function () { readImageFile(this, function (url) { $("#ed-cover").value = url; $("#ed-cover-preview").style.background = "url(" + url + ") center/cover"; onEditorInput(); }); });
    $("#ed-img-file").addEventListener("change", function () { var self = this; readImageFile(self, function (url) { insertImage(url); }); });

    setTimeout(function () { title.focus(); title.setSelectionRange(title.value.length, title.value.length); }, 50);
  }

  function onEditorInput() { ED.dirty = true; syncEditorStats(); scheduleAutosave(); }
  function populateTagOptions() {
    var dl = $("#tag-suggestions"); if (!dl) return;
    dl.innerHTML = BS.Data.allTags().map(function (t) { return "<option value='" + esc(t.tag) + "'>"; }).join("");
  }
  function addTag(v) {
    v = String(v || "").trim().replace(/^#/, "");
    if (!v || ED.tags.length >= 8) return;
    if (!ED.tags.some(function (t) { return t.toLowerCase() === v.toLowerCase(); })) { ED.tags.push(v); renderTags(); onEditorInput(); }
  }
  function renderTags() {
    var wrap = $("#tag-input"); if (!wrap) return;
    var field = $("#tag-field");
    $$(".tag-pill", wrap).forEach(function (n) { n.remove(); });
    ED.tags.forEach(function (t, i) {
      var pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.innerHTML = esc(t) + '<button type="button" aria-label="Remove">' + icon("x") + "</button>";
      pill.querySelector("button").onclick = function () { ED.tags.splice(i, 1); renderTags(); onEditorInput(); };
      wrap.insertBefore(pill, field);
    });
  }
  function readImageFile(input, cb) {
    var f = input.files && input.files[0]; if (!f) return;
    if (f.size > 1024 * 1024) { toast("Image is larger than 1 MB — consider using a URL to save space.", "error"); }
    var r = new FileReader();
    r.onload = function () { cb(r.result); input.value = ""; };
    r.readAsDataURL(f);
  }
  function insertImage(url) { document.execCommand("insertImage", false, url); onEditorInput(); }

  function updateToolbarState() {
    $$(".tool-btn[data-cmd]").forEach(function (b) {
      var cmd = b.getAttribute("data-cmd");
      if (cmd.indexOf("formatBlock") === 0) {
        var tag = cmd.split(":")[1];
        var on = false;
        try { on = document.queryCommandValue("formatBlock").toUpperCase() === tag; } catch (e) {}
        b.classList.toggle("is-active", on);
      } else if (["bold", "italic", "insertUnorderedList", "insertOrderedList"].indexOf(cmd) >= 0) {
        var st = false;
        try { st = document.queryCommandState(cmd); } catch (e) {}
        b.classList.toggle("is-active", st);
      }
    });
  }

  function collectEditor() {
    var c = $("#ed-cover");
    return {
      id: ED.id,
      title: $("#ed-title").value.trim(),
      excerpt: $("#ed-excerpt").value.trim(),
      body: $("#ed-body").innerHTML,
      cover: c ? c.value.trim() : "",
      cat: $("#ed-cat").value,
      tags: ED.tags.slice(),
      seoTitle: $("#ed-seotitle").value.trim(),
      seoDesc: $("#ed-seodesc").value.trim()
    };
  }

  function completion(ctx) {
    var checks = [
      ctx.title.length >= 10,
      ctx.excerpt.length >= 40,
      BS.words(ctx.body) >= 300,
      !!ctx.cover,
      ctx.tags.length >= 2,
      !!ctx.cat
    ];
    var ok = checks.filter(Boolean).length;
    return Math.round((ok / checks.length) * 100);
  }

  function syncEditorStats() {
    var ctx = collectEditor();
    var w = BS.words(ctx.body), ch = BS.textOf(ctx.body).length;
    setText("#st-words", w); setText("#st-chars", ch); setText("#st-read", BS.readingTime(ctx.body));
    setText("#ed-title-hint", ctx.title.length + "/120");
    var ep = $("#ed-excerpt-meter"), eh = $("#ed-excerpt-hint");
    if (ep) {
      var len = ctx.excerpt.length, pct = Math.min(100, Math.round((len / 160) * 100));
      ep.querySelector("span").style.width = pct + "%";
      ep.classList.toggle("is-good", len >= 120 && len <= 160);
      ep.classList.toggle("is-over", len > 160);
      if (eh) eh.textContent = len === 0 ? "Recommended 120–160 characters" : len + " characters" + (len < 120 ? " — a little more detail helps" : len > 160 ? " — a little long" : " — looking good");
    }
    var prog = completion(ctx);
    var ring = $("#ed-progress");
    if (ring) { ring.style.setProperty("--p", prog); ring.querySelector("span").textContent = prog + "%"; }
    // SEO live
    updateSeo();
  }
  function setText(sel, v) { var el = $(sel); if (el) el.textContent = v; }

  function updateSeo() {
    var ctx = collectEditor();
    var res = BS.AI.seoAnalyze(ctx);
    var ring = $("#seo-ring");
    if (ring) {
      ring.style.setProperty("--p", res.score);
      var col = res.score >= 75 ? "var(--success)" : res.score >= 50 ? "var(--warning)" : "var(--danger)";
      ring.style.setProperty("--sc", col);
      setText("#seo-num", res.score);
      setText("#seo-label", res.score >= 75 ? "Great" : res.score >= 50 ? "Good" : "Needs work");
    }
    var checks = $("#seo-checks");
    if (checks) checks.innerHTML = res.checks.map(function (c) {
      return '<li>' + icon(c.pass ? "checkCircle" : "alert", "") + '<span class="' + (c.pass ? "ok" : "warn") + '">' + esc(c.label) + (c.pass ? "" : " — " + esc(c.tip)) + "</span></li>";
    }).join("");
    // meters
    var st = $("#ed-seotitle"), sd = $("#ed-seodesc");
    meter("#seo-title-meter", (st ? st.value.length : 0), 30, 60);
    meter("#seo-desc-meter", (sd ? sd.value.length : 0), 120, 160);
  }
  function meter(sel, len, min, max) {
    var m = $(sel); if (!m) return;
    var pct = Math.min(100, Math.round((len / max) * 100));
    m.querySelector("span").style.width = pct + "%";
    m.classList.toggle("is-good", len >= min && len <= max);
    m.classList.toggle("is-over", len > max);
  }

  var scheduleAutosave = BS.debounce(function () { if (ED.dirty) persistEditor(ED.status, true); }, 1600);

  function persistEditor(mode, auto) {
    var ctx = collectEditor();
    if (!ctx.title) {
      if (!auto) { toast("Add a title before saving.", "error"); $("#ed-title").focus(); }
      return false;
    }
    if (mode === "published" && !BS.words(ctx.body)) {
      if (!auto) toast("Write some content before publishing.", "error");
      return false;
    }
    var res = BS.Data.savePost(ctx, mode);
    if (!res.ok) { toast(res.error || "Could not save.", "error"); return false; }
    ED.id = res.post.id;
    ED.status = res.post.status;
    ED.dirty = false;
    setText("#ed-status", ED.status.charAt(0).toUpperCase() + ED.status.slice(1));
    setText("#ed-saved", (auto ? "Autosaved " : "Saved ") + BS.relTime(Date.now()));
    var badge = $(".widget .badge");
    if (badge) { badge.className = "badge badge--" + ED.status; badge.textContent = ED.status; }
    if (!auto) {
      toast(mode === "published" ? "Article published." : "Draft saved.", "success");
      if (history.replaceState) history.replaceState(null, "", "#/write/" + ED.id);
    }
    return true;
  }

  function runEditorCommand(cmd) {
    var body = $("#ed-body");
    body.focus();
    if (cmd === "createLink") {
      var url = prompt("Link URL (https://…)");
      if (!url) return;
      if (!/^(https?:|mailto:)/i.test(url)) { toast("Links must start with http, https or mailto.", "error"); return; }
      document.execCommand("createLink", false, url);
    } else if (cmd === "insertImage") {
      var iurl = prompt("Image URL (leave blank to upload from your device)");
      if (iurl) { if (!/^(https?:|data:image)/i.test(iurl)) { toast("Enter a valid image URL.", "error"); return; } insertImage(iurl); return; }
      $("#ed-img-file").click(); return;
    } else if (cmd.indexOf("formatBlock") === 0) {
      document.execCommand("formatBlock", false, cmd.split(":")[1]);
    } else {
      document.execCommand(cmd, false, null);
    }
    ED.dirty = true; syncEditorStats(); updateToolbarState();
  }

  /* -------------------------------- AI run ------------------------------- */
  var AI_BUSY = false;
  function runAI(kind) {
    if (AI_BUSY) return;
    var out = $("#ai-out"); if (!out) return;
    var ctx = collectEditor();
    var text = BS.textOf(ctx.body);
    if (!text && kind !== "outline" && kind !== "titles") { out.innerHTML = '<span class="muted">Write some content first.</span>'; return; }

    function render(result) {
      if (kind === "titles") {
        out.innerHTML = "<b>Title ideas</b><br>" + result.text.map(function (t, i) { return '<button class="sugg" data-act="use-title" data-val="' + esc(t) + '">' + (i + 1) + ". " + esc(t) + "</button>"; }).join("");
      } else if (kind === "tags") {
        out.innerHTML = "<b>Suggested tags</b><div class='chips' style='margin-top:8px'>" + result.text.map(function (t) { return '<button class="chip" data-act="use-tag" data-val="' + esc(t) + '">+#' + esc(t) + "</button>"; }).join("") + "</div>";
      } else if (kind === "grammar") {
        out.innerHTML = "<b>Proofreading</b><ul style='margin:8px 0 0;padding-left:18px'>" + result.text.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>";
      } else if (kind === "excerpt") {
        out.innerHTML = "<b>Excerpt</b><p style='margin:6px 0 8px'>" + esc(result.text) + "</p><button class='btn btn--sm btn--soft' data-act='apply-excerpt' data-val='" + esc(result.text) + "'>Use this</button>";
      } else if (kind === "seo") {
        out.innerHTML = "<b>Recommendations</b><p style='margin:6px 0'>" + esc(result.text).replace(/\n/g, "<br>") + "</p>";
      } else {
        out.innerHTML = "<b>" + kindLabel(kind) + "</b><p style='margin:6px 0'>" + esc(result.text).replace(/\n/g, "<br>") + "</p>";
      }
      var badge = out.closest(".widget").querySelector(".ai-badge");
    }
    function kindLabel(k) { return { tldr: "Summary", outline: "Outline", improve: "Suggestions", grammar: "Proofreading", seo: "SEO" }[k] || "Result"; }

    function offline() {
      var r;
      if (kind === "titles") r = BS.AI.suggestTitles(ctx);
      else if (kind === "excerpt") r = BS.AI.generateExcerpt(ctx);
      else if (kind === "tldr") r = BS.AI.tldr(ctx);
      else if (kind === "tags") r = BS.AI.suggestTags(ctx);
      else if (kind === "outline") r = BS.AI.outline(ctx);
      else if (kind === "grammar") r = BS.AI.grammar(ctx);
      else if (kind === "seo") { var s = BS.AI.seoAnalyze(ctx); r = { text: s.checks.map(function (c) { return (c.pass ? "✔ " : "• ") + c.label + (c.pass ? "" : " — " + c.tip); }).join("\n") }; }
      else r = { text: improveOffline(text) };
      render(r);
      markSource(out, "offline");
    }

    if (!BS.AI.hasKey()) { offline(); return; }
    AI_BUSY = true;
    out.innerHTML = '<span class="muted">' + icon("sparkles") + " Thinking…</span>";
    var prompts = {
      titles: "Suggest 6 compelling, SEO-friendly blog titles for this article. Return ONLY the titles, one per line, no numbering.",
      excerpt: "Write a concise 150-character excerpt (meta description) for this article. Return only the text.",
      tldr: "Summarize this article in 3 short bullet points. Return only the bullets.",
      tags: "Suggest up to 6 short single-word topic tags for this article. Return ONLY a comma-separated list.",
      outline: "Produce a clean outline for an article on this topic using H2 section headings. Return only the outline.",
      improve: "Review this draft and give 4-6 specific, actionable suggestions to improve clarity, flow and engagement. Return a short bullet list.",
      seo: "Give 4-6 concise SEO recommendations for this article. Return a short bullet list.",
      grammar: "Proofread this text. List any grammar, spelling or style issues as short bullets. If clean, say so."
    };
    BS.AI.chat([
      { role: "system", content: "You are an expert writing assistant for a blogging platform. Be concise and practical." },
      { role: "user", content: prompts[kind] + "\n\nTITLE: " + ctx.title + "\n\nCONTENT:\n" + text.slice(0, 6000) }
    ]).then(function (res) {
      AI_BUSY = false;
      if (!res.ok) { toast(res.error || "AI request failed.", "error"); offline(); return; }
      var t = res.text.replace(/^[-*\d.\s]+/gm, "").trim();
      if (kind === "titles") render({ text: t.split("\n").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 6) });
      else if (kind === "tags") render({ text: t.split(",").map(function (s) { return s.trim().replace(/^#/, ""); }).filter(Boolean).slice(0, 6) });
      else if (kind === "grammar") render({ text: t.split("\n").filter(Boolean) });
      else render({ text: t });
      markSource(out, "live");
    });
  }
  function markSource(out, src) {
    var badge = out.closest(".widget").querySelector(".ai-badge");
    if (badge) { badge.textContent = src === "live" ? "Live" : "Offline"; badge.className = "ai-badge " + (src === "live" ? "ai-badge--live" : ""); }
  }
  function improveOffline(text) {
    var r = BS.AI.readability({ body: text });
    var tips = [
      "Readability: " + r.label + " (" + r.score + "/100).",
      "Vary sentence length — mix short punchy lines with longer ones.",
      "Lead each section with the most important idea.",
      "Use concrete examples and active voice.",
      "End with a clear takeaway or call to action."
    ];
    return tips.join("\n");
  }

  /* ------------------------------ Preview -------------------------------- */
  function openPreview() {
    var ctx = collectEditor();
    if (!ctx.title) { toast("Add a title to preview.", "error"); return; }
    var pane = document.createElement("div");
    pane.className = "preview-pane";
    pane.innerHTML = '<div class="preview-pane__backdrop" data-act="close-preview"></div>' +
      '<div class="preview-pane__box"><div class="preview-pane__head"><b>Live preview</b>' +
      '<button class="btn btn--ghost btn--icon btn--sm" data-act="close-preview" aria-label="Close">' + icon("x") + "</button></div>" +
      '<div class="preview-pane__body wrap wrap--read">' +
      '<span class="badge badge--plain">' + esc(ctx.cat) + "</span>" +
      "<h1 style='margin:12px 0'>" + esc(ctx.title || "Untitled") + "</h1>" +
      '<p class="muted">' + esc(ctx.excerpt || BS.excerptFrom(ctx.body, 160)) + "</p>" +
      '<div class="meta" style="margin:14px 0">' + BS.readingTime(ctx.body) + " min read &middot; " + BS.words(ctx.body) + " words</div>" +
      (ctx.cover ? '<div class="post-cover" style="background:url(' + esc(ctx.cover) + ') center/cover"></div>' : "") +
      '<div class="prose">' + BS.sanitize(ctx.body) + "</div></div></div>";
    document.body.appendChild(pane);
    document.body.style.overflow = "hidden";
    ED.cleanups.push(function () { pane.remove(); document.body.style.overflow = ""; });
  }
  function closePreview() {
    var pane = $(".preview-pane"); if (pane) pane.remove();
    document.body.style.overflow = "";
  }

  /* ------------------------------- Router -------------------------------- */
  var VIEWS = {
    "": { fn: viewHome }, "explore": { fn: viewExplore }, "post": { fn: viewPost },
    "login": { fn: viewLogin, guest: true }, "register": { fn: viewRegister, guest: true }, "forgot": { fn: viewForgot, guest: true },
    "dashboard": { fn: viewDashboard, auth: true }, "saved": { fn: viewSaved, auth: true },
    "write": { fn: viewEditor, auth: true }, "profile": { fn: viewProfile },
    "settings": { fn: viewSettings, auth: true }
  };

  function renderNav() { var el = $("#header"); if (el) el.innerHTML = navbar(); }

  function route() {
    // cleanup previous view
    ED.cleanups.forEach(function (fn) { try { fn(); } catch (e) {} }); ED.cleanups = [];
    document.body.classList.remove("is-focus");
    var parts = location.hash.slice(2).split("/");
    var name = parts[0] || "";
    var param = parts[1] ? decodeURIComponent(parts[1]) : "";
    var view = VIEWS[name] || VIEWS[""];

    if (view.auth && !BS.Auth.isAuthed()) { toast("Please log in to continue.", "info"); location.hash = "#/login"; return; }
    if (view.guest && BS.Auth.isAuthed()) { location.hash = "#/dashboard"; return; }

    renderNav();
    var nav = $("#navlinks"); if (nav) nav.classList.remove("is-open");
    var app = $("#app");
    app.innerHTML = view.fn(param);
    window.scrollTo(0, 0);
    var me = BS.Auth.me();
    document.title = (name ? name.charAt(0).toUpperCase() + name.slice(1) + " · " : "") + "BlogSphere AI";

    if (name === "write") initEditor();
    if (name === "post") initReadingProgress();
    if (name === "settings") initSettings();
  }
  function rerender() { var y = window.scrollY; route(); window.scrollTo(0, y); }

  function initReadingProgress() {
    var bar = $("#rprog"), article = $("#article-body");
    if (!bar || !article) return;
    function onScroll() {
      var rect = article.getBoundingClientRect();
      var total = rect.height - window.innerHeight * 0.4;
      var passed = -rect.top + window.innerHeight * 0.2;
      var pct = Math.max(0, Math.min(100, (passed / Math.max(1, total)) * 100));
      bar.style.width = pct + "%";
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    ED.cleanups.push(function () { window.removeEventListener("scroll", onScroll); });
  }

  function initSettings() {
    var bio = $("#bio"), cnt = $("#bio-count");
    if (bio && cnt) bio.addEventListener("input", function () { cnt.textContent = bio.value.length; });
    var tt = $("#themeToggle");
    if (tt) tt.addEventListener("change", function () { BS.state.theme = tt.checked ? "dark" : "light"; BS.save(); applyTheme(); renderNav(); });
    var af = $("#avatarFile");
    if (af) af.addEventListener("change", function () {
      readImageFile(af, function (url) { $("#avatar").value = url; BS.Auth.update({ avatar: url }); toast("Profile image updated.", "success"); });
    });
    var imp = $("#importFile");
    if (imp) imp.addEventListener("change", function () {
      var f = imp.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try { var obj = JSON.parse(r.result); localStorage.setItem("blogsphere.ai.v2", JSON.stringify(obj)); location.reload(); }
        catch (e) { toast("Invalid backup file.", "error"); }
      };
      r.readAsText(f);
    });
  }

  /* ------------------------------- Events -------------------------------- */
  function onDocumentClick(e) {
    var menuBtn = e.target.closest('[data-act="profile-menu"]');
    var pm = $("#pm-menu");
    if (menuBtn) { pm.hidden = !pm.hidden; e.stopPropagation(); return; }
    if (pm && !pm.hidden && !e.target.closest("#pm")) pm.hidden = true;

    var aiBtn = e.target.closest("[data-tool]");
    if (aiBtn) { runAI(aiBtn.getAttribute("data-tool")); return; }

    var cmdBtn = e.target.closest("[data-cmd]");
    if (cmdBtn) { runEditorCommand(cmdBtn.getAttribute("data-cmd")); return; }

    var b = e.target.closest("[data-act]");
    if (!b) return;
    var act = b.getAttribute("data-act");
    var val = b.getAttribute("data-val");
    var id = b.getAttribute("data-id");

    switch (act) {
      case "menu": var n = $("#navlinks"); var open = n.classList.toggle("is-open"); b.setAttribute("aria-expanded", open); break;
      case "theme": toggleTheme(); renderNav(); break;
      case "theme-reset": BS.state.theme = null; BS.save(); applyTheme(); renderNav(); rerender(); break;
      case "logout": BS.Auth.logout(); toast("Logged out."); location.hash = "#/"; renderNav(); break;

      case "like": case "mark": {
        if (!BS.Auth.isAuthed()) { toast("Log in to do that.", "info"); location.hash = "#/login"; return; }
        var wasLiked = act === "like" ? BS.Data.toggleLike(id) : BS.Data.toggleMark(id);
        if (act === "mark") toast(wasLiked ? "Saved to your library." : "Removed from saved.", "success");
        rerender(); break;
      }
      case "copy": copyLink(); break;

      case "set-cat": UI.cat = val; UI.page = 1; rerender(); break;
      case "set-tag": UI.tag = UI.tag === val ? "" : val; UI.page = 1; rerender(); break;
      case "clear-filters": UI.cat = ""; UI.tag = ""; UI.q = ""; UI.page = 1; rerender(); break;
      case "page": UI.page += Number(val); $("#res").innerHTML = resultsHTML(); break;
      case "dash-tab": UI.dashTab = val; rerender(); break;
      case "settings-tab": UI.settingsTab = val; rerender(); break;

      case "publish-now": if (BS.Data.setStatus(id, "published")) { toast("Published.", "success"); rerender(); } break;
      case "unpublish": if (BS.Data.setStatus(id, "draft")) { toast("Moved to drafts."); rerender(); } break;
      case "archive": if (BS.Data.setStatus(id, "archived")) { toast("Archived."); rerender(); } break;
      case "restore": if (BS.Data.setStatus(id, "draft")) { toast("Restored to drafts."); rerender(); } break;
      case "del-post": deletePost(id); break;
      case "del-comment": deleteComment(id); break;

      case "save-draft": if (persistEditor("draft", false)) { renderNav(); initEditorRefresh(); } break;
      case "publish": if (persistEditor("published", false)) { location.hash = "#/dashboard"; } break;
      case "preview": openPreview(); break;
      case "close-preview": closePreview(); break;
      case "focus": document.body.classList.toggle("is-focus"); break;
      case "clear-format": $("#ed-body").focus(); document.execCommand("removeFormat"); break;

      case "use-title": $("#ed-title").value = val; $("#ed-title").focus(); onEditorInput(); toast("Title applied."); break;
      case "use-tag": addTag(val); break;
      case "apply-excerpt": $("#ed-excerpt").value = val; onEditorInput(); toast("Excerpt applied."); break;
      case "rm-tag": ED.tags = ED.tags.filter(function (t) { return t !== val; }); renderTags(); onEditorInput(); break;

      case "ai-test": testAI(); break;
      case "export": exportData(); break;
      case "sample": loadSamples(); break;
      case "reset-all": resetAll(); break;
      case "recover-back": UI.recover = { stage: 1, uid: null, question: "" }; rerender(); break;
    }
  }

  function copyLink() {
    var url = location.href;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast("Link copied.", "success"); }, function () { toast("Copy failed — copy the address bar instead.", "error"); });
    else toast(url, "info");
  }
  function deletePost(id) {
    var p = BS.Data.post(id);
    if (!p) return;
    confirmDialog({ title: "Delete this article?", message: '“' + esc(p.title) + '” will be permanently removed along with its comments, likes and bookmarks. This cannot be undone.', confirmText: "Delete", danger: true }).then(function (ok) {
      if (ok && BS.Data.deletePost(id)) { toast("Article deleted."); if (location.hash === "#/post/" + id) location.hash = "#/dashboard"; else rerender(); }
    });
  }
  function deleteComment(id) {
    confirmDialog({ title: "Delete comment?", message: "This comment will be removed.", confirmText: "Delete", danger: true }).then(function (ok) {
      if (ok && BS.Data.deleteComment(id)) { toast("Comment deleted."); rerender(); }
    });
  }
  function testAI() {
    var out = $("#ai-test-out"); if (!out) return;
    if (!BS.AI.hasKey()) { out.innerHTML = '<p class="error-text">Add a base URL and API key and save first.</p>'; return; }
    out.innerHTML = '<p class="muted small">Testing…</p>';
    BS.AI.chat([{ role: "user", content: "Reply with the single word: OK" }]).then(function (r) {
      out.innerHTML = r.ok ? '<p class="hint" style="color:var(--success)">' + icon("checkCircle") + " Connection OK — response: " + esc(r.text.slice(0, 60)) + "</p>"
        : '<p class="error-text">' + esc(r.error) + "</p>";
    });
  }
  function exportData() {
    var blob = new Blob([JSON.stringify(BS.state, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "blogsphere-ai-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click(); URL.revokeObjectURL(a.href);
    toast("Backup downloaded.", "success");
  }
  function resetAll() {
    confirmDialog({ title: "Erase all data?", message: "Every account, post, comment and setting stored in this browser will be deleted.", confirmText: "Erase everything", danger: true }).then(function (ok) {
      if (ok) { BS.reset(); applyTheme(); toast("All data erased."); location.hash = "#/"; }
    });
  }
  function loadSamples() {
    var sid = "sample-author";
    if (!BS.state.users.some(function (u) { return u.id === sid; })) {
      BS.state.users.push({ id: sid, name: "BlogSphere Team", username: "sample", email: "sample@example.invalid", bio: "Demo articles to help you explore BlogSphere AI.", avatar: "", createdAt: Date.now(), hash: null, legacyHash: null, recovery: null, prefs: {} });
    }
    var samples = [
      ["Writing a first draft without judging it", "Writing", "Get the words down first. Edit later.", "Get the words down first. Edit later. This sample article exists so you can explore BlogSphere AI. Edit or delete it any time from your own account.", ["writing", "creativity"]],
      ["Why whitespace makes interfaces feel calm", "Design", "Space is a layout tool, not leftover room.", "Space is a layout tool, not leftover room. Good interfaces breathe. This sample article exists so you can explore BlogSphere AI.", ["design", "ux"]],
      ["Learning in public, one post at a time", "Career", "Sharing what you learn builds skill and trust.", "Sharing what you learn builds skill and trust. This sample article exists so you can explore BlogSphere AI.", ["career", "growth"]]
    ];
    samples.forEach(function (s, i) {
      var ts = Date.now() - (i + 1) * 86400000;
      BS.state.posts.push({
        id: BS.uid(), author: sid, title: s[0], slug: BS.slugify(s[0]), excerpt: s[2],
        body: "<p>" + s[3] + "</p><h2>A short idea</h2><p>Keep it simple and publish often. The best way to improve is to ship, then iterate.</p>",
        cover: "", cat: s[1], tags: s[4], seoTitle: s[0], seoDesc: s[2],
        status: "published", created: ts, updated: ts, publishedAt: ts, views: Math.floor(Math.random() * 120)
      });
    });
    BS.save(); toast("Sample articles loaded.", "success"); rerender();
  }
  function initEditorRefresh() { /* keep tag options fresh after save */ populateTagOptions(); }

  /* ------------------------------- Forms --------------------------------- */
  function fieldError(form, name, msg) {
    var el = form.querySelector("#e-" + name);
    if (el) el.textContent = msg || "";
    var f = form.querySelector("#f-" + name);
    if (f) f.classList.toggle("is-invalid", !!msg);
    return !msg;
  }
  async function onDocumentSubmit(e) {
    var form = e.target.closest("[data-form]");
    if (!form) return;
    e.preventDefault();
    var kind = form.getAttribute("data-form");
    var btn = form.querySelector(".btn--primary, .btn");
    function val(n) { var el = form.elements[n]; return el ? String(el.value || "").trim() : ""; }

    if (kind === "login") {
      fieldError(form, "loginId", ""); fieldError(form, "password", "");
      if (!val("loginId")) return fieldError(form, "loginId", "Enter your email or username.");
      if (!val("password")) return fieldError(form, "password", "Enter your password.");
      btn.classList.add("is-loading"); btn.disabled = true;
      var r = await BS.Auth.authenticate(val("loginId"), val("password"));
      btn.classList.remove("is-loading"); btn.disabled = false;
      if (!r.ok) { $("#e-login").textContent = r.error; return; }
      toast("Welcome back" + (r.upgraded ? " — your account security was upgraded." : "."), "success");
      location.hash = "#/dashboard";
      return;
    }
    if (kind === "register") {
      var errs = {};
      var data = { name: val("name"), email: val("email"), username: val("username"), password: val("password"), password2: val("password2"), recovery: { question: val("rq"), answer: val("ra") } };
      btn.classList.add("is-loading"); btn.disabled = true;
      var rr = await BS.Auth.register(data);
      btn.classList.remove("is-loading"); btn.disabled = false;
      if (!rr.ok) { Object.keys(rr.errors).forEach(function (k) { fieldError(form, k, rr.errors[k]); }); return; }
      toast("Welcome to BlogSphere AI.", "success");
      location.hash = "#/dashboard";
      return;
    }
    if (kind === "recover") {
      var rec = BS.Auth.recoveryFor(val("identifier"));
      if (!rec.ok) { $("#e-form").textContent = rec.error; return; }
      UI.recover = { stage: 2, uid: rec.uid, question: rec.question };
      rerender();
      return;
    }
    if (kind === "reset") {
      var rez = await BS.Auth.resetPassword(UI.recover.uid, val("answer"), val("newPassword"));
      if (!rez.ok) { $("#e-form").textContent = rez.error; return; }
      UI.recover = { stage: 1, uid: null, question: "" };
      toast("Password updated. Please log in.", "success");
      location.hash = "#/login";
      return;
    }
    if (kind === "comment") {
      var t = val("text");
      if (t.length < 2) { $("#e-comment").textContent = "Write at least 2 characters."; return; }
      BS.Data.addComment(form.getAttribute("data-id"), t);
      toast("Comment posted.", "success"); rerender();
      return;
    }
    if (kind === "profile") {
      BS.Auth.update({ name: val("name"), bio: val("bio"), avatar: $("#avatar") ? $("#avatar").value.trim() : undefined });
      toast("Profile saved.", "success"); renderNav(); rerender();
      return;
    }
    if (kind === "password") {
      if (val("next") !== val("confirm")) { $("#e-form").textContent = "New passwords do not match."; return; }
      var pr = await BS.Auth.changePassword(val("current"), val("next"));
      if (!pr.ok) { $("#e-form").textContent = pr.error; return; }
      $("#e-form").textContent = ""; form.reset(); toast("Password updated.", "success");
      return;
    }
    if (kind === "ai") {
      BS.AI.saveSettings({ baseUrl: val("baseUrl"), key: val("key"), model: val("model") || "gpt-4o-mini", temperature: parseFloat(val("temperature")) });
      toast("AI settings saved.", "success"); rerender();
      return;
    }
  }

  function onDocumentInput(e) {
    var t = e.target;
    if (t.id === "q") { UI.q = t.value; UI.page = 1; var res = $("#res"); if (res) res.innerHTML = resultsHTML(); }
    if (t.id === "temperature") { var lbl = t.previousElementSibling; if (lbl) lbl.textContent = "Temperature (" + t.value + ")"; }
  }
  function onDocumentChange(e) {
    if (e.target.id === "so") { UI.sort = e.target.value; UI.page = 1; var res = $("#res"); if (res) res.innerHTML = resultsHTML(); }
  }

  /* ------------------------------- Boot ---------------------------------- */
  function boot() {
    BS.load();
    applyTheme();
    renderNav();
    addEventListener("hashchange", route);
    document.addEventListener("click", onDocumentClick);
    document.addEventListener("submit", onDocumentSubmit);
    document.addEventListener("input", onDocumentInput);
    document.addEventListener("change", onDocumentChange);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        document.body.classList.remove("is-focus");
        if ($(".preview-pane")) closePreview();
        var pm = $("#pm-menu"); if (pm) pm.hidden = true;
      }
      var inEditor = location.hash.indexOf("#/write") === 0;
      if (inEditor && (e.ctrlKey || e.metaKey)) {
        var k = e.key.toLowerCase();
        if (k === "b") { e.preventDefault(); runEditorCommand("bold"); }
        else if (k === "i") { e.preventDefault(); runEditorCommand("italic"); }
        else if (k === "k") { e.preventDefault(); runEditorCommand("createLink"); }
        else if (k === "s") { e.preventDefault(); if (persistEditor(ED.status, false)) renderNav(); }
      }
    });
    addEventListener("beforeunload", function (e) {
      if (ED.dirty && location.hash.indexOf("#/write") === 0) { e.preventDefault(); e.returnValue = ""; }
    });
    route();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
