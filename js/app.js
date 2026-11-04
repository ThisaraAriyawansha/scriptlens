(function () {
  var PAGE_SIZE = 100;
  var SQL = null;
  var db = null;
  var tables = [];          // [{ name, type, count }]
  var currentTable = null;
  var currentColumns = [];  // PRAGMA table_info rows
  var currentPage = 0;
  var filteredRows = 0;
  var pageData = null;      // { columns, values } of the visible page
  var sortCol = null;
  var sortDir = "ASC";
  var view = "data";
  var searchTimer = null;
  var openRow = null;
  var QUERY_LIMIT = 1000;   // rows drawn for a query result (export gets all)
  var queryText = "";
  var queryIsDefault = true;
  var queryState = null;    // { result, ms } or { error }
  var queryOut = null;
  var RECENT_MAX = 8;
  var RECENT_MAX_BYTES = 50 * 1048576;
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  function $(id) { return document.getElementById(id); }
  var openBtn = $("openBtn"), openBtn2 = $("openBtn2"), closeBtn = $("closeBtn");
  var openScriptBtn = $("openScriptBtn"), sampleBtn = $("sampleBtn"), scriptInput = $("scriptInput");
  var recentList = $("recentList"), clearRecentBtn = $("clearRecentBtn");
  var fileInput = $("fileInput"), fileName = $("fileName"), engineStatus = $("engineStatus");
  var welcome = $("welcome"), dropzone = $("dropzone"), viewer = $("viewer");
  var tableList = $("tableList"), tableCount = $("tableCount"), tableSearch = $("tableSearch"), hideEmpty = $("hideEmpty");
  var tableTitle = $("tableTitle"), rowCount = $("rowCount"), search = $("search"), exportBtn = $("exportBtn");
  var tabData = $("tabData"), tabStructure = $("tabStructure"), tabQuery = $("tabQuery");
  var gridWrap = $("gridWrap"), rangeInfo = $("rangeInfo");
  var pager = $("pager"), prevBtn = $("prevBtn"), nextBtn = $("nextBtn"), pageInfo = $("pageInfo");
  var scrim = $("scrim"), drawer = $("drawer"), drawerTitle = $("drawerTitle"), drawerBody = $("drawerBody");
  var dropOverlay = $("dropOverlay"), toast = $("toast");
  var themeBtn = $("themeBtn"), themeMenu = $("themeMenu");
  var themeItems = themeMenu.querySelectorAll(".menu-item");

  var TABLE_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></svg>';
  var VIEW_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EMPTY_ICONS = {
    search: '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    table: '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></svg>',
    error: '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17v.5"/></svg>',
    query: '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2.5"/><path d="M6 9l3 3-3 3M11 15h6"/></svg>'
  };
  var CLOCK_ICON = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var REMOVE_ICON = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';

  // Show the platform's modifier key in shortcut hints.
  Array.prototype.forEach.call(document.querySelectorAll("kbd.mod"), function (k) {
    k.textContent = IS_MAC ? "⌘" : "Ctrl";
  });

  function quoteIdent(name) {
    return '"' + String(name).replace(/"/g, '""') + '"';
  }
  function fmt(n) { return Number(n).toLocaleString(); }
  function escapeLike(s) { return s.replace(/[\\%_]/g, "\\$&"); }

  function showToast(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(showToast.t);
    showToast.t = setTimeout(function () { toast.hidden = true; }, 2200);
  }

  // Theme: "light" (default) / "dark" set data-theme; "system" follows the OS.
  var THEME_KEY = "scriptlens-theme";
  var THEME_LABELS = { system: "System", light: "Light", dark: "Dark" };
  var THEME_ICONS = {
    system: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    light: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
  };

  function getTheme() {
    var t = null;
    try { t = localStorage.getItem(THEME_KEY); } catch (e) {}
    return THEME_LABELS[t] ? t : "light";
  }
  function applyTheme(theme) {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    var label = "Appearance: " + THEME_LABELS[theme];
    themeBtn.innerHTML = THEME_ICONS[theme];
    themeBtn.title = label;
    themeBtn.setAttribute("aria-label", label);
    for (var i = 0; i < themeItems.length; i++) {
      themeItems[i].setAttribute("aria-checked", themeItems[i].dataset.themeValue === theme ? "true" : "false");
    }
  }
  function openThemeMenu() {
    themeMenu.hidden = false;
    themeBtn.setAttribute("aria-expanded", "true");
    themeMenu.querySelector('[aria-checked="true"]').focus();
  }
  function closeThemeMenu(refocus) {
    if (themeMenu.hidden) return;
    themeMenu.hidden = true;
    themeBtn.setAttribute("aria-expanded", "false");
    if (refocus) themeBtn.focus();
  }
  applyTheme(getTheme());
  themeBtn.addEventListener("click", function () {
    if (themeMenu.hidden) openThemeMenu(); else closeThemeMenu(false);
  });
  themeMenu.addEventListener("click", function (e) {
    var item = e.target.closest(".menu-item");
    if (!item) return;
    var theme = item.dataset.themeValue;
    try { localStorage.setItem(THEME_KEY, theme); } catch (e2) {}
    applyTheme(theme);
    closeThemeMenu(true);
  });
  themeMenu.addEventListener("mousemove", function (e) {
    var item = e.target.closest(".menu-item");
    if (item && document.activeElement !== item) item.focus();
  });
  themeMenu.addEventListener("keydown", function (e) {
    var items = Array.prototype.slice.call(themeItems);
    var i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeThemeMenu(true); }
    else if (e.key === "Tab") closeThemeMenu(false);
  });
  document.addEventListener("mousedown", function (e) {
    if (!themeMenu.hidden && !e.target.closest(".menu-wrap")) closeThemeMenu(false);
  });

  // Highlight every case-insensitive match of q inside el's text.
  function setHighlighted(el, text, q) {
    el.textContent = "";
    if (!q) { el.textContent = text; return; }
    var lower = text.toLowerCase(), ql = q.toLowerCase(), i = 0, j;
    while ((j = lower.indexOf(ql, i)) !== -1) {
      el.appendChild(document.createTextNode(text.slice(i, j)));
      var m = document.createElement("mark");
      m.textContent = text.slice(j, j + q.length);
      el.appendChild(m);
      i = j + q.length;
    }
    el.appendChild(document.createTextNode(text.slice(i)));
  }

  function showMessage(title, text, kind, action, target) {
    target = target || gridWrap;
    target.innerHTML = "";
    var div = document.createElement("div");
    div.className = "empty" + (kind === "error" ? " error" : "");
    div.innerHTML = '<div class="icon">' + (EMPTY_ICONS[kind] || EMPTY_ICONS.table) + "</div><h3></h3><p></p>";
    div.querySelector("h3").textContent = title;
    div.querySelector("p").textContent = text;
    if (action) {
      var b = document.createElement("button");
      b.className = "btn";
      b.type = "button";
      b.textContent = action.label;
      b.addEventListener("click", action.run);
      div.appendChild(b);
    }
    target.appendChild(div);
  }

  // ---- Engine & opening files ----
  initSqlJs({
    locateFile: function (f) {
      return "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/" + f;
    }
  }).then(function (lib) {
    SQL = lib;
    engineStatus.textContent = "Ready — your files never leave this computer.";
    engineStatus.className = "engine ready";
  }).catch(function () {
    engineStatus.textContent = "Couldn't load the SQLite engine. Check your internet connection and reload the page.";
    engineStatus.className = "engine error";
  });

  function pick() { fileInput.click(); }
  openBtn.addEventListener("click", pick);
  openBtn2.addEventListener("click", pick);
  openScriptBtn.addEventListener("click", function () { scriptInput.click(); });
  sampleBtn.addEventListener("click", openSample);
  closeBtn.addEventListener("click", closeDatabase);

  [fileInput, scriptInput].forEach(function (input) {
    input.addEventListener("change", function () {
      if (input.files[0]) openFile(input.files[0]);
      input.value = "";
    });
  });

  function engineReady() {
    if (!SQL) showToast("The SQLite engine is still loading. Try again in a moment.");
    return !!SQL;
  }

  function openFile(file) {
    if (!engineReady()) return;
    var reader = new FileReader();
    reader.onload = function () {
      if (loadBytes(new Uint8Array(reader.result), file.name, file.size)) {
        saveRecent(file.name, file.size, reader.result);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // A SQLite file starts with "SQLite format 3\0"; anything else is treated as a SQL script.
  function isSqliteFile(bytes) {
    var sig = "SQLite format 3";
    if (bytes.length < 16) return false;
    for (var i = 0; i < sig.length; i++) if (bytes[i] !== sig.charCodeAt(i)) return false;
    return bytes[15] === 0;
  }

  function loadBytes(bytes, name, size) {
    var next = null;
    try {
      if (isSqliteFile(bytes)) {
        next = new SQL.Database(bytes);
        next.exec("SELECT name FROM sqlite_master LIMIT 1");   // throws if the file is damaged
        showDatabase(next, name + " — " + formatSize(size));
      } else {
        next = new SQL.Database();
        next.exec(new TextDecoder().decode(bytes));
        showDatabase(next, name + " — SQL script, " + formatSize(size));
      }
      return true;
    } catch (e) {
      if (next) next.close();
      if (/\.sql$/i.test(name)) showToast("Couldn't run “" + name + "”: " + e.message);
      else showToast("“" + name + "” isn't a SQLite database or SQL script.");
      return false;
    }
  }

  function showDatabase(next, label) {
    next.run("PRAGMA query_only = ON;");
    if (db) db.close();
    db = next;
    fileName.textContent = label;
    welcome.hidden = true;
    viewer.hidden = false;
    closeBtn.hidden = false;
    queryText = "";
    queryIsDefault = true;
    queryState = null;
    if (view !== "data") setView("data", true);
    loadTables();
  }

  function closeDatabase() {
    if (!db) return;
    if (!drawer.hidden) closeDetails();
    db.close();
    db = null;
    tables = [];
    currentTable = null;
    gridWrap.innerHTML = "";
    fileName.textContent = "No database open";
    viewer.hidden = true;
    closeBtn.hidden = true;
    welcome.hidden = false;
    renderRecent();
    openBtn2.focus();
  }

  // ---- Sample database ----
  function openSample() {
    if (!engineReady()) return;
    try {
      showDatabase(buildSample(), "Sample Store.db — sample data");
    } catch (e) {
      showToast("Couldn't build the sample: " + e.message);
    }
  }

  function buildSample() {
    var d = new SQL.Database();
    var seed = 7;
    function rand(n) { seed = (seed * 16807) % 2147483647; return seed % n; }
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    d.exec(
      "CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, city TEXT, joined DATE);" +
      "CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT, price REAL NOT NULL, stock INTEGER DEFAULT 0);" +
      "CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), ordered_at DATETIME, status TEXT DEFAULT 'pending');" +
      "CREATE TABLE order_items (order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL, PRIMARY KEY (order_id, product_id));" +
      "CREATE TABLE returns (id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id), reason TEXT);" +
      "CREATE VIEW order_totals AS SELECT o.id AS order_id, c.name AS customer, o.status, ROUND(SUM(i.quantity * p.price), 2) AS total " +
      "FROM orders o JOIN customers c ON c.id = o.customer_id JOIN order_items i ON i.order_id = o.id JOIN products p ON p.id = i.product_id GROUP BY o.id;"
    );
    var first = ["Ava", "Liam", "Maya", "Noah", "Zara", "Ethan", "Isla", "Kai", "Nina", "Omar", "Priya", "Leo", "Sofia", "Ravi", "Emma", "Hugo"];
    var last = ["Perera", "Silva", "Chen", "Garcia", "Khan", "Fischer", "Rossi", "Tanaka", "Okafor", "Novak"];
    var cities = ["Colombo", "London", "Tokyo", "Berlin", "Toronto", "Sydney", "Lisbon", "Nairobi"];
    var products = [
      ["Aluminium Laptop Stand", "Accessories", 49.99], ["Mechanical Keyboard", "Accessories", 129], ["Wireless Mouse", "Accessories", 39.5],
      ["27\" 5K Display", "Displays", 1299], ["USB-C Hub", "Accessories", 59.99], ["Noise-Cancelling Headphones", "Audio", 249],
      ["Studio Speakers", "Audio", 199], ["Desk Lamp", "Office", 45], ["Ergonomic Chair", "Office", 489],
      ["Standing Desk", "Office", 699], ["Webcam 4K", "Video", 149], ["Ring Light", "Video", 35.25],
      ["Portable SSD 1TB", "Storage", 119], ["Notebook Pack", "Office", 12.99]
    ];
    var statuses = ["delivered", "delivered", "delivered", "shipped", "pending", "cancelled"];
    var i, st;
    d.exec("BEGIN");
    st = d.prepare("INSERT INTO customers VALUES (?, ?, ?, ?, ?)");
    for (i = 1; i <= 48; i++) {
      var f = first[rand(first.length)], l = last[rand(last.length)];
      st.run([i, f + " " + l, (f + "." + l).toLowerCase() + i + "@example.com",
        rand(9) ? cities[rand(cities.length)] : null, "2024-" + pad(1 + rand(12)) + "-" + pad(1 + rand(28))]);
    }
    st.free();
    st = d.prepare("INSERT INTO products VALUES (?, ?, ?, ?, ?)");
    products.forEach(function (p, pi) { st.run([pi + 1, p[0], p[1], p[2], rand(120)]); });
    st.free();
    var ord = d.prepare("INSERT INTO orders VALUES (?, ?, ?, ?)");
    var item = d.prepare("INSERT INTO order_items VALUES (?, ?, ?)");
    for (i = 1; i <= 160; i++) {
      ord.run([i, 1 + rand(48), "2025-" + pad(1 + rand(12)) + "-" + pad(1 + rand(28)) + " " + pad(8 + rand(12)) + ":" + pad(rand(60)),
        statuses[rand(statuses.length)]]);
      var start = rand(products.length), n = 1 + rand(3);
      for (var k = 0; k < n; k++) item.run([i, (start + k) % products.length + 1, 1 + rand(4)]);
    }
    ord.free();
    item.free();
    d.exec("COMMIT");
    return d;
  }

  // ---- Recent files (kept in this browser's IndexedDB only) ----
  var idbPromise = null;
  function openIdb() {
    if (!idbPromise) {
      idbPromise = new Promise(function (resolve, reject) {
        if (!window.indexedDB) { reject(new Error("IndexedDB unavailable")); return; }
        var req = indexedDB.open("scriptlens", 1);
        req.onupgradeneeded = function () {
          req.result.createObjectStore("meta", { keyPath: "name" });
          req.result.createObjectStore("files");
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    return idbPromise;
  }
  function idbTx(mode, fn) {
    return openIdb().then(function (idb) {
      return new Promise(function (resolve, reject) {
        var tx = idb.transaction(["meta", "files"], mode);
        var req = fn(tx.objectStore("meta"), tx.objectStore("files"));
        tx.oncomplete = function () { resolve(req && req.result); };
        tx.onerror = tx.onabort = function () { reject(tx.error); };
      });
    });
  }
  function getRecent() {
    return idbTx("readonly", function (meta) { return meta.getAll(); }).then(function (list) {
      return (list || []).sort(function (a, b) { return b.opened - a.opened; });
    });
  }
  function saveRecent(name, size, buffer) {
    if (size > RECENT_MAX_BYTES) return;
    idbTx("readwrite", function (meta, files) {
      meta.put({ name: name, size: size, opened: Date.now() });
      files.put(buffer, name);
    }).then(getRecent).then(function (list) {
      var extra = list.slice(RECENT_MAX);
      if (extra.length) {
        return idbTx("readwrite", function (meta, files) {
          extra.forEach(function (r) { meta.delete(r.name); files.delete(r.name); });
        });
      }
    }).then(renderRecent).catch(function () {});
  }
  function removeRecent(name) {
    return idbTx("readwrite", function (meta, files) { meta.delete(name); files.delete(name); });
  }
  function openRecent(r) {
    if (!engineReady()) return;
    idbTx("readonly", function (meta, files) { return files.get(r.name); }).then(function (buffer) {
      if (!buffer) {
        showToast("“" + r.name + "” is no longer available. Open it again from your computer.");
        removeRecent(r.name).then(renderRecent);
        return;
      }
      if (loadBytes(new Uint8Array(buffer), r.name, r.size)) saveRecent(r.name, r.size, buffer);
    }, function () { showToast("Couldn't open “" + r.name + "”."); });
  }

  function formatWhen(ts) {
    var d = new Date(ts), now = new Date();
    var days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);
    var time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (days === 0) return "Today, " + time;
    if (days === 1) return "Yesterday, " + time;
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
  }

  function renderRecent() {
    getRecent().then(function (list) { drawRecent(list, null); },
      function () { drawRecent([], "Recent files aren't available in this browser."); });
  }
  function drawRecent(list, note) {
    recentList.innerHTML = "";
    clearRecentBtn.hidden = !list.length;
    if (!list.length) {
      var d = document.createElement("div");
      d.className = "recent-empty";
      d.innerHTML = CLOCK_ICON + "<strong></strong><span></span>";
      d.querySelector("strong").textContent = note ? "Unavailable" : "No Recent Files";
      d.querySelector("span").textContent = note || "Databases and scripts you open will appear here.";
      recentList.appendChild(d);
      return;
    }
    list.forEach(function (r) {
      var isSql = /\.sql$/i.test(r.name);
      var row = document.createElement("div");
      row.className = "recent-item";
      row.innerHTML = '<button type="button" class="recent-open"><span class="file-badge' + (isSql ? " sql" : "") + '">' +
        (isSql ? "SQL" : "DB") + '</span><span class="recent-text"><span class="recent-name"></span><span class="recent-sub"></span></span></button>' +
        '<button type="button" class="recent-remove">' + REMOVE_ICON + "</button>";
      var openEl = row.querySelector(".recent-open"), removeEl = row.querySelector(".recent-remove");
      row.querySelector(".recent-name").textContent = r.name;
      row.querySelector(".recent-sub").textContent = formatSize(r.size) + " · " + formatWhen(r.opened);
      openEl.title = "Open " + r.name;
      removeEl.title = "Remove from Recent";
      removeEl.setAttribute("aria-label", "Remove " + r.name + " from Recent");
      openEl.addEventListener("click", function () { openRecent(r); });
      removeEl.addEventListener("click", function () { removeRecent(r.name).then(renderRecent); });
      recentList.appendChild(row);
    });
  }
  clearRecentBtn.addEventListener("click", function () {
    idbTx("readwrite", function (meta, files) { meta.clear(); files.clear(); }).then(renderRecent);
  });
  renderRecent();

  function formatSize(b) {
    if (b < 1024) return b + " bytes";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  }

  // Drag & drop anywhere on the page
  var dragDepth = 0;
  document.addEventListener("dragenter", function (e) {
    if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types, "Files") === -1) return;
    dragDepth++;
    dropOverlay.hidden = false;
    dropzone.classList.add("drag");
  });
  document.addEventListener("dragleave", function () {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) { dropOverlay.hidden = true; dropzone.classList.remove("drag"); }
  });
  document.addEventListener("dragover", function (e) { e.preventDefault(); });
  document.addEventListener("drop", function (e) {
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.hidden = true;
    dropzone.classList.remove("drag");
    var f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) openFile(f);
  });

  // ---- Table list ----
  function loadTables() {
    var res = db.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name COLLATE NOCASE");
    tables = (res.length ? res[0].values : []).map(function (r) {
      var count = 0;
      try { count = db.exec("SELECT COUNT(*) FROM " + quoteIdent(r[0]))[0].values[0][0]; } catch (e) {}
      return { name: r[0], type: r[1], count: count };
    });
    tableCount.textContent = tables.length;
    tableSearch.value = "";
    currentTable = null;
    if (!tables.length) {
      renderTableList();
      tableTitle.textContent = "";
      rowCount.textContent = "";
      pager.hidden = true;
      rangeInfo.textContent = "";
      showMessage("No Tables", "This database doesn't contain any tables.", "table");
      return;
    }
    var first = tables.filter(function (t) { return t.count > 0; })[0] || tables[0];
    selectTable(first.name);
  }

  function renderTableList() {
    var q = tableSearch.value.trim();
    var ql = q.toLowerCase();
    tableList.innerHTML = "";
    var shown = 0;
    tables.forEach(function (t) {
      if (hideEmpty.checked && t.count === 0 && t.name !== currentTable) return;
      if (ql && t.name.toLowerCase().indexOf(ql) === -1) return;
      shown++;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "table-item" + (t.name === currentTable ? " active" : "") + (t.count === 0 ? " empty-table" : "");
      btn.title = t.name + (t.type === "view" ? " (view)" : "");
      btn.innerHTML = (t.type === "view" ? VIEW_ICON : TABLE_ICON) + "<span class='name'></span><span class='count'></span>";
      setHighlighted(btn.querySelector(".name"), t.name, q);
      btn.querySelector(".count").textContent = fmt(t.count);
      btn.addEventListener("click", function () { selectTable(t.name); });
      tableList.appendChild(btn);
    });
    if (!shown) {
      var d = document.createElement("div");
      d.className = "side-empty";
      d.textContent = q ? "No tables match “" + q + "”" : "No tables to show";
      tableList.appendChild(d);
    }
  }

  tableSearch.addEventListener("input", renderTableList);
  hideEmpty.addEventListener("change", renderTableList);
  tableSearch.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      var first = tableList.querySelector(".table-item");
      if (first) first.click();
    }
  });

  function selectTable(name) {
    currentTable = name;
    currentPage = 0;
    sortCol = null;
    sortDir = "ASC";
    search.value = "";
    try { currentColumns = db.exec("PRAGMA table_info(" + quoteIdent(name) + ")")[0].values; } catch (e) { currentColumns = []; }
    renderTableList();
    var active = tableList.querySelector(".table-item.active");
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
    render();
  }

  // ---- Data / Structure ----
  function setView(v, silent) {
    view = v;
    tabData.setAttribute("aria-selected", v === "data");
    tabStructure.setAttribute("aria-selected", v === "structure");
    tabQuery.setAttribute("aria-selected", v === "query");
    search.hidden = v !== "data";
    exportBtn.hidden = v === "structure";
    if (!silent) render();
  }
  tabData.addEventListener("click", function () { setView("data"); });
  tabStructure.addEventListener("click", function () { setView("structure"); });
  tabQuery.addEventListener("click", function () {
    setView("query");
    var ta = gridWrap.querySelector("textarea");
    if (ta) ta.focus();
  });

  function render() {
    if (!currentTable) return;
    var t = tables.filter(function (x) { return x.name === currentTable; })[0];
    tableTitle.textContent = currentTable;
    tableTitle.title = currentTable;
    rowCount.textContent = fmt(t ? t.count : 0) + (t && t.count === 1 ? " row" : " rows");
    if (view === "structure") renderStructure();
    else if (view === "query") renderQuery();
    else renderData();
  }

  // Fill a table cell with a value from SQLite, highlighting q.
  function fillCell(td, cell, q) {
    if (cell === null) {
      td.textContent = "NULL";
      td.className = "null";
    } else if (cell instanceof Uint8Array) {
      td.textContent = "BLOB — " + formatSize(cell.length);
      td.className = "null";
    } else {
      var text = String(cell);
      setHighlighted(td, text.length > 400 ? text.slice(0, 400) + "…" : text, q);
      if (typeof cell === "number") td.className = "num";
    }
  }

  function whereClause() {
    var q = search.value.trim();
    if (!q || !currentColumns.length) return { sql: "", params: [] };
    var like = "%" + escapeLike(q) + "%";
    var parts = currentColumns.map(function (c) {
      return "CAST(" + quoteIdent(c[1]) + " AS TEXT) LIKE ? ESCAPE '\\'";
    });
    return { sql: " WHERE " + parts.join(" OR "), params: currentColumns.map(function () { return like; }) };
  }

  function orderClause() {
    return sortCol ? " ORDER BY " + quoteIdent(sortCol) + " " + sortDir : "";
  }

  function renderData() {
    try {
      var w = whereClause();
      var from = " FROM " + quoteIdent(currentTable);
      filteredRows = db.exec("SELECT COUNT(*)" + from + w.sql, w.params)[0].values[0][0];
      var lastPage = Math.max(0, Math.ceil(filteredRows / PAGE_SIZE) - 1);
      if (currentPage > lastPage) currentPage = lastPage;
      var offset = currentPage * PAGE_SIZE;
      var res = db.exec("SELECT *" + from + w.sql + orderClause() + " LIMIT ? OFFSET ?", w.params.concat([PAGE_SIZE, offset]));
      var q = search.value.trim();

      pager.hidden = filteredRows <= PAGE_SIZE;
      pageInfo.textContent = (currentPage + 1) + " of " + (lastPage + 1);
      prevBtn.disabled = currentPage === 0;
      nextBtn.disabled = currentPage >= lastPage;
      exportBtn.disabled = filteredRows === 0;

      if (!res.length) {
        pageData = null;
        rangeInfo.textContent = "";
        if (q) {
          showMessage("No Results", "Nothing in “" + currentTable + "” contains “" + q + "”.", "search",
            { label: "Clear Search", run: function () { search.value = ""; currentPage = 0; renderData(); search.focus(); } });
        } else {
          showMessage("No Rows", "This table is empty.", "table");
        }
        return;
      }

      pageData = res[0];
      rangeInfo.textContent = fmt(offset + 1) + "–" + fmt(offset + pageData.values.length) +
        " of " + fmt(filteredRows) + (q ? " matches" : "");

      var types = {};
      currentColumns.forEach(function (c) { types[c[1]] = c[2]; });

      var tbl = document.createElement("table");
      var head = document.createElement("thead");
      var hr = document.createElement("tr");
      var corner = document.createElement("th");
      corner.className = "plain rownum";
      corner.textContent = "#";
      hr.appendChild(corner);
      pageData.columns.forEach(function (c) {
        var th = document.createElement("th");
        var b = document.createElement("button");
        b.type = "button";
        b.title = "Sort by " + c;
        var label = document.createElement("span");
        label.textContent = c;
        b.appendChild(label);
        if (types[c]) {
          var s = document.createElement("span");
          s.className = "type";
          s.textContent = types[c];
          b.appendChild(s);
        }
        if (sortCol === c) {
          var a = document.createElement("span");
          a.className = "arrow";
          a.textContent = sortDir === "ASC" ? "▲" : "▼";
          b.appendChild(a);
          th.setAttribute("aria-sort", sortDir === "ASC" ? "ascending" : "descending");
        }
        b.addEventListener("click", function () {
          if (sortCol !== c) { sortCol = c; sortDir = "ASC"; }
          else if (sortDir === "ASC") sortDir = "DESC";
          else sortCol = null;
          currentPage = 0;
          renderData();
        });
        th.appendChild(b);
        hr.appendChild(th);
      });
      head.appendChild(hr);
      tbl.appendChild(head);

      var body = document.createElement("tbody");
      pageData.values.forEach(function (row, ri) {
        var tr = document.createElement("tr");
        tr.tabIndex = 0;
        tr.dataset.i = ri;
        var n = document.createElement("td");
        n.className = "rownum";
        n.textContent = fmt(offset + ri + 1);
        tr.appendChild(n);
        row.forEach(function (cell) {
          var td = document.createElement("td");
          fillCell(td, cell, q);
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      tbl.appendChild(body);
      gridWrap.innerHTML = "";
      gridWrap.appendChild(tbl);
    } catch (e) {
      pageData = null;
      rangeInfo.textContent = "";
      pager.hidden = true;
      showMessage("Can't Read This Table", e.message, "error");
    }
  }

  function renderStructure() {
    pager.hidden = true;
    rangeInfo.textContent = currentColumns.length + (currentColumns.length === 1 ? " column" : " columns");
    gridWrap.innerHTML = "";
    if (!currentColumns.length) {
      showMessage("No Column Information", "SQLite didn't report any columns for this table.", "table");
      return;
    }
    var tbl = document.createElement("table");
    tbl.innerHTML = "<thead><tr><th class='plain'>Column</th><th class='plain'>Type</th><th class='plain'>Key</th><th class='plain'>Required</th><th class='plain'>Default</th></tr></thead>";
    var body = document.createElement("tbody");
    currentColumns.forEach(function (c) {
      var tr = document.createElement("tr");
      var cells = [c[1], c[2] || "—", "", "", c[4] === null ? "—" : String(c[4])];
      cells.forEach(function (v, i) {
        var td = document.createElement("td");
        if (i === 2 && c[5]) td.innerHTML = "<span class='tag'>Primary key</span>";
        else if (i === 3 && c[3]) td.innerHTML = "<span class='tag green'>Not null</span>";
        else td.textContent = v;
        if (i === 0) td.style.fontWeight = "600";
        if ((i === 1 || i === 4) && v === "—") td.className = "null";
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    tbl.appendChild(body);
    gridWrap.appendChild(tbl);

    var sqlRes = db.exec("SELECT sql FROM sqlite_master WHERE name = ?", [currentTable]);
    var sql = sqlRes.length ? sqlRes[0].values[0][0] : null;
    if (sql) {
      var label = document.createElement("div");
      label.className = "section-label";
      label.textContent = "Create Statement";
      var pre = document.createElement("pre");
      pre.className = "sql-block";
      pre.textContent = sql;
      gridWrap.appendChild(label);
      gridWrap.appendChild(pre);
    }
  }

  // ---- Query console ----
  function renderQuery() {
    pager.hidden = true;
    if (queryIsDefault) queryText = "SELECT * FROM " + quoteIdent(currentTable) + " LIMIT 100;";
    gridWrap.innerHTML = "";
    var pane = document.createElement("div");
    pane.className = "query-pane";
    pane.innerHTML = '<div class="query-editor"><textarea spellcheck="false" autocomplete="off" aria-label="SQL query"></textarea>' +
      '<div class="query-bar"><span>Read-only — statements that change data are blocked.</span><span class="spacer"></span>' +
      '<span class="keys"><kbd>' + (IS_MAC ? "⌘" : "Ctrl") + '</kbd><kbd>↵</kbd></span>' +
      '<button class="btn primary" type="button">Run</button></div></div><div class="query-result"></div>';
    var ta = pane.querySelector("textarea");
    ta.value = queryText;
    ta.addEventListener("input", function () { queryText = ta.value; queryIsDefault = false; });
    ta.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runQuery(); }
    });
    pane.querySelector(".btn").addEventListener("click", runQuery);
    queryOut = pane.querySelector(".query-result");
    gridWrap.appendChild(pane);
    showQueryResult();
  }

  function runQuery() {
    var sql = queryText.trim();
    if (!sql) return;
    var t0 = performance.now();
    try {
      var res = db.exec(sql);
      queryState = { result: res.length ? res[res.length - 1] : null, ms: performance.now() - t0 };
    } catch (e) {
      queryState = { error: e.message };
    }
    db.run("PRAGMA query_only = ON;");   // a query can't switch read-only off
    showQueryResult();
  }

  function showQueryResult() {
    if (!queryOut) return;
    exportBtn.disabled = !(queryState && queryState.result);
    if (!queryState) {
      rangeInfo.textContent = "";
      showMessage("Run a Query", "Write a SELECT statement above, then click Run.", "query", null, queryOut);
      return;
    }
    if (queryState.error) {
      rangeInfo.textContent = "";
      showMessage("Query Failed", queryState.error, "error", null, queryOut);
      return;
    }
    var took = " · " + (queryState.ms < 1 ? "<1" : Math.round(queryState.ms)) + " ms";
    var r = queryState.result;
    if (!r) {
      rangeInfo.textContent = "Done" + took;
      showMessage("No Rows Returned", "The statement ran but didn't return any rows.", "table", null, queryOut);
      return;
    }
    var total = r.values.length;
    rangeInfo.textContent = fmt(total) + (total === 1 ? " row" : " rows") +
      (total > QUERY_LIMIT ? " (showing first " + fmt(QUERY_LIMIT) + ")" : "") + took;
    var tbl = document.createElement("table");
    var hr = document.createElement("tr");
    ["#"].concat(r.columns).forEach(function (c, i) {
      var th = document.createElement("th");
      th.className = "plain" + (i ? "" : " rownum");
      th.textContent = c;
      hr.appendChild(th);
    });
    var head = document.createElement("thead");
    head.appendChild(hr);
    tbl.appendChild(head);
    var body = document.createElement("tbody");
    r.values.slice(0, QUERY_LIMIT).forEach(function (row, ri) {
      var tr = document.createElement("tr");
      var n = document.createElement("td");
      n.className = "rownum";
      n.textContent = fmt(ri + 1);
      tr.appendChild(n);
      row.forEach(function (cell) {
        var td = document.createElement("td");
        fillCell(td, cell, "");
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    tbl.appendChild(body);
    queryOut.innerHTML = "";
    queryOut.appendChild(tbl);
  }

  // ---- Search, paging, export ----
  search.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { currentPage = 0; renderData(); }, 200);
  });
  prevBtn.addEventListener("click", function () {
    if (currentPage > 0) { currentPage--; renderData(); gridWrap.scrollTop = 0; }
  });
  nextBtn.addEventListener("click", function () {
    currentPage++; renderData(); gridWrap.scrollTop = 0;
  });

  function csvCell(v) {
    if (v === null) return "";
    if (v instanceof Uint8Array) return "[BLOB " + v.length + " bytes]";
    var s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function downloadCsv(result, name) {
    var lines = [result.columns.map(csvCell).join(",")];
    result.values.forEach(function (r) { lines.push(r.map(csvCell).join(",")); });
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    showToast("Exported " + fmt(result.values.length) + " rows");
  }

  exportBtn.addEventListener("click", function () {
    try {
      if (view === "query") {
        if (queryState && queryState.result) downloadCsv(queryState.result, "query-results.csv");
        return;
      }
      var w = whereClause();
      var res = db.exec("SELECT * FROM " + quoteIdent(currentTable) + w.sql + orderClause(), w.params);
      if (!res.length) return;
      downloadCsv(res[0], currentTable + (search.value.trim() ? "-filtered" : "") + ".csv");
    } catch (e) {
      showToast("Export failed: " + e.message);
    }
  });

  // ---- Row inspector ----
  function openDetails(i) {
    if (!pageData || !pageData.values[i]) return;
    openRow = i;
    var row = pageData.values[i];
    var q = search.value.trim();
    drawerTitle.textContent = currentTable + " — Row " + fmt(currentPage * PAGE_SIZE + i + 1);
    drawerBody.innerHTML = "";
    pageData.columns.forEach(function (c, ci) {
      var d = document.createElement("div");
      d.className = "group-row detail";
      var k = document.createElement("div");
      k.className = "k";
      k.textContent = c;
      var v = document.createElement("div");
      v.className = "v";
      var cell = row[ci];
      if (cell === null) { v.textContent = "NULL"; v.className = "v null"; }
      else if (cell instanceof Uint8Array) { v.textContent = "BLOB — " + formatSize(cell.length); v.className = "v null"; }
      else setHighlighted(v, String(cell), q);
      d.appendChild(k);
      d.appendChild(v);
      drawerBody.appendChild(d);
    });
    scrim.hidden = false;
    drawer.hidden = false;
    $("drawerDone").focus();
  }
  function closeDetails() {
    scrim.hidden = true;
    drawer.hidden = true;
    var tr = gridWrap.querySelector('tbody tr[data-i="' + openRow + '"]');
    if (tr) tr.focus();
  }
  gridWrap.addEventListener("click", function (e) {
    var tr = e.target.closest("tbody tr[data-i]");
    if (tr) openDetails(+tr.dataset.i);
  });
  gridWrap.addEventListener("keydown", function (e) {
    var tr = e.target.closest("tbody tr[data-i]");
    if (!tr) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetails(+tr.dataset.i); }
    else if (e.key === "ArrowDown" && tr.nextElementSibling) { e.preventDefault(); tr.nextElementSibling.focus(); }
    else if (e.key === "ArrowUp" && tr.previousElementSibling) { e.preventDefault(); tr.previousElementSibling.focus(); }
  });
  scrim.addEventListener("click", closeDetails);
  $("drawerClose").addEventListener("click", closeDetails);
  $("drawerDone").addEventListener("click", closeDetails);
  $("copyJsonBtn").addEventListener("click", function () {
    var obj = {};
    pageData.columns.forEach(function (c, ci) {
      var v = pageData.values[openRow][ci];
      obj[c] = v instanceof Uint8Array ? "[BLOB " + v.length + " bytes]" : v;
    });
    var text = JSON.stringify(obj, null, 2);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { showToast("Copied"); },
        function () { showToast("Couldn't copy to clipboard"); });
    }
  });

  // ---- Keyboard shortcuts ----
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "o") {
      e.preventDefault();
      pick();
      return;
    }
    if (e.key === "Escape") {
      if (!drawer.hidden) { closeDetails(); return; }
      if (document.activeElement === search && search.value) { search.value = ""; currentPage = 0; renderData(); return; }
      if (document.activeElement === tableSearch && tableSearch.value) { tableSearch.value = ""; renderTableList(); }
      return;
    }
    if (e.key === "/" && !viewer.hidden && drawer.hidden) {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      if (view === "data") search.focus(); else tableSearch.focus();
    }
  });
})();
