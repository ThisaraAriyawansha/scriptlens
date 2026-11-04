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

  function $(id) { return document.getElementById(id); }
  var openBtn = $("openBtn"), openBtn2 = $("openBtn2");
  var fileInput = $("fileInput"), fileName = $("fileName"), engineStatus = $("engineStatus");
  var welcome = $("welcome"), dropzone = $("dropzone"), viewer = $("viewer");
  var tableList = $("tableList"), tableCount = $("tableCount"), tableSearch = $("tableSearch"), hideEmpty = $("hideEmpty");
  var tableTitle = $("tableTitle"), rowCount = $("rowCount"), search = $("search"), exportBtn = $("exportBtn");
  var tabData = $("tabData"), tabStructure = $("tabStructure");
  var gridWrap = $("gridWrap"), rangeInfo = $("rangeInfo");
  var pager = $("pager"), prevBtn = $("prevBtn"), nextBtn = $("nextBtn"), pageInfo = $("pageInfo");
  var scrim = $("scrim"), drawer = $("drawer"), drawerTitle = $("drawerTitle"), drawerBody = $("drawerBody");
  var dropOverlay = $("dropOverlay"), toast = $("toast");

  var TABLE_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></svg>';
  var VIEW_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EMPTY_ICONS = {
    search: '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    table: '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></svg>',
    error: '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17v.5"/></svg>'
  };

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

  function showMessage(title, text, kind, action) {
    gridWrap.innerHTML = "";
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
    gridWrap.appendChild(div);
  }

  // ---- Engine & opening files ----
  initSqlJs({
    locateFile: function (f) {
      return "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/" + f;
    }
  }).then(function (lib) {
    SQL = lib;
    engineStatus.textContent = "Ready — your file never leaves this computer.";
  }).catch(function () {
    engineStatus.textContent = "Couldn't load the SQLite engine. Check your internet connection and reload the page.";
    engineStatus.style.color = "var(--red)";
  });

  function pick() { fileInput.click(); }
  openBtn.addEventListener("click", pick);
  openBtn2.addEventListener("click", pick);

  fileInput.addEventListener("change", function () {
    if (fileInput.files[0]) openFile(fileInput.files[0]);
    fileInput.value = "";
  });

  function openFile(file) {
    if (!SQL) {
      showToast("The SQLite engine is still loading. Try again in a moment.");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var next = new SQL.Database(new Uint8Array(reader.result));
        next.exec("SELECT name FROM sqlite_master LIMIT 1");   // throws if not a database
        next.run("PRAGMA query_only = ON;");
        if (db) db.close();
        db = next;
        fileName.textContent = file.name + " — " + formatSize(file.size);
        welcome.hidden = true;
        viewer.hidden = false;
        loadTables();
      } catch (e) {
        showToast("“" + file.name + "” isn't a SQLite database.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

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
  function setView(v) {
    view = v;
    tabData.setAttribute("aria-selected", v === "data");
    tabStructure.setAttribute("aria-selected", v === "structure");
    search.hidden = v !== "data";
    exportBtn.hidden = v !== "data";
    render();
  }
  tabData.addEventListener("click", function () { setView("data"); });
  tabStructure.addEventListener("click", function () { setView("structure"); });

  function render() {
    if (!currentTable) return;
    var t = tables.filter(function (x) { return x.name === currentTable; })[0];
    tableTitle.textContent = currentTable;
    tableTitle.title = currentTable;
    rowCount.textContent = fmt(t ? t.count : 0) + (t && t.count === 1 ? " row" : " rows");
    if (view === "structure") renderStructure(); else renderData();
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

  exportBtn.addEventListener("click", function () {
    try {
      var w = whereClause();
      var res = db.exec("SELECT * FROM " + quoteIdent(currentTable) + w.sql + orderClause(), w.params);
      if (!res.length) return;
      var lines = [res[0].columns.map(csvCell).join(",")];
      res[0].values.forEach(function (r) { lines.push(r.map(csvCell).join(",")); });
      var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = currentTable + (search.value.trim() ? "-filtered" : "") + ".csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      showToast("Exported " + fmt(res[0].values.length) + " rows");
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
