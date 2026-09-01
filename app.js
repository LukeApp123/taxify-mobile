// TaxMate — UI logic
(function () {
  "use strict";
  const T = window.TaxEngine;
  const $ = (id) => document.getElementById(id);
  const I = window.I18N;
  const t = (k, v) => (I && I.t) ? I.t(k, v) : k;
  const BD_LABEL = { "Income Tax":"bdIncomeTax", "Class 4 National Insurance":"bdClass4", "Corporation Tax":"bdCorpTax", "Capital Gains Tax":"bandCgt" };
  const BAND_NAME = { "Basic rate":"bandBasic", "Higher rate":"bandHigher", "Additional rate":"bandAdditional", "Class 4 — main":"bandClass4Main", "Class 4 — upper":"bandClass4Upper", "Basic-rate band":"cgtBasicBand", "Higher-rate band":"cgtHigherBand" };
  const LTD_BAND = { "None":"none", "Small profits rate (19%)":"ctSmall", "Main rate (25%)":"ctMain", "Marginal relief band":"ctMarginal" };
  const TYPE_LABEL = { "sole-trader":"tabSole", "limited-company":"tabLtd", "investments":"tabInv" };
  const DL_KEY = ["deadline1","deadline2","deadline3"];

  let mode = "sole"; // sole | ltd
  let lastResult = null;

  // ---- Theme ----
  const root = document.documentElement;
  function setTheme(dark) {
    root.setAttribute("data-theme", dark ? "dark" : "light");
    $("themeIcon").innerHTML = dark
      ? '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>'
      : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    $("themeIcon").setAttribute("fill", dark ? "none" : "none");
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(prefersDark);
  $("themeBtn").addEventListener("click", () => setTheme(root.getAttribute("data-theme") !== "dark"));

  // ---- Tabs ----
  const tabs = { sole: "tab-sole", ltd: "tab-ltd", inv: "tab-inv" };
  function switchTab(next) {
    if (next === mode) return;
    mode = next;
    Object.keys(tabs).forEach((t) => {
      const btn = $(tabs[t]);
      btn.classList.toggle("active", t === next);
      btn.setAttribute("aria-selected", t === next);
    });
    $("fields-sole").style.display = next === "sole" ? "block" : "none";
    $("fields-ltd").style.display = next === "ltd" ? "block" : "none";
    $("fields-inv").style.display = next === "inv" ? "block" : "none";
    if (typeof updateFxLabel === "function") updateFxLabel();
    render();
  }
  $("tab-sole").addEventListener("click", () => switchTab("sole"));
  $("tab-ltd").addEventListener("click", () => switchTab("ltd"));
  $("tab-inv").addEventListener("click", () => switchTab("inv"));

  // ---- Inputs ----
  const num = (id) => {
    const v = parseFloat(($(id).value || "").replace(/[^0-9.]/g, ""));
    return isNaN(v) ? 0 : v;
  };

  ["income-sole", "paid-sole", "revenue-ltd", "paid-ltd", "gains-inv", "losses-inv", "other-inc-inv", "paid-inv"].forEach((id) => {
    $(id).addEventListener("input", render);
  });

  $("use-ta").addEventListener("change", render);

  // Trading-allowance recommendation hint
  function updateTaHint() {
    const income = num("income-sole");
    const expenses = expenseTotal("sole");
    const hint = $("ta-hint");
    if (income <= 0) { hint.classList.remove("show"); return; }
    const rec = T.recommendTradingAllowance(income, expenses);
    if ($("use-ta").checked) {
      hint.textContent = t('taApplied');
    } else {
      hint.textContent = rec
        ? t('taTipUnder')
        : t('taOver');
    }
    hint.classList.add("show");
  }

  // ---- Calculation ----
  function compute() {
    if (mode === "sole") {
      return T.calculateSoleTraderTax({
        income: num("income-sole"),
        expenses: expenseTotal("sole"),
        useTradingAllowance: $("use-ta").checked,
        taxAlreadyPaid: num("paid-sole"),
        personalAllowance: profilePA(),
      });
    }
    if (mode === "inv") {
      return T.calculateCGT({
        gains: num("gains-inv"),
        losses: num("losses-inv"),
        otherIncome: num("other-inc-inv"),
        taxAlreadyPaid: num("paid-inv"),
        personalAllowance: profilePA(),
      });
    }
    return T.calculateLimitedCompanyTax({
      revenue: num("revenue-ltd"),
      expenses: expenseTotal("ltd"),
      taxAlreadyPaid: num("paid-ltd"),
    });
  }

  // ---- Donut ----
  function donutSvg(taxPct) {
    const r = 38, c = 2 * Math.PI * r;
    const off = c * (1 - taxPct);
    return `<svg class="donut" viewBox="0 0 92 92">
      <circle cx="46" cy="46" r="${r}" fill="none" stroke="var(--border)" stroke-width="9"/>
      <circle cx="46" cy="46" r="${r}" fill="none" stroke="var(--accent)" stroke-width="9"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
        stroke-linecap="round" transform="rotate(-90 46 46)"/>
      <text class="center" x="46" y="50" text-anchor="middle">${Math.round(taxPct * 100)}%</text>
    </svg>`;
  }

  // ---- Render ----
  function render() {
    updateTaHint();
    const res = compute();
    lastResult = res;
    const out = $("results");
    const g = T.formatGBP;
    const hasInput = mode === "sole"
      ? num("income-sole") > 0
      : mode === "inv"
      ? num("gains-inv") > 0
      : num("revenue-ltd") > 0;

    if (!hasInput) {
      out.innerHTML = '<div class="empty-state">' + t('emptyState') + '</div>';
      return;
    }

    const profit = res.profit;
    const takeHome = Math.max(0, profit - res.totalTaxDue);
    const taxPct = profit > 0 ? res.totalTaxDue / profit : 0;
    const takePct = profit > 0 ? takeHome / profit : 0;

    // Breakdown rows
    let bdRows = res.breakdown.map((b) => {
      const sub = (b.detail && b.detail.length) ? b.detail
        .filter((d) => d.amount > 0)
        .map((d) => `<div class="row sub"><span class="lab">${t(BAND_NAME[d.name]||d.name)} (${Math.round(d.rate * 100)}% · ${g(d.amount)})</span><span class="val">${g(d.tax)}</span></div>`).join("") : "";
      return `<div class="row"><span class="lab">${t(BD_LABEL[b.label]||b.label)}</span><span class="val">${g(b.amount)}</span></div>${sub}`;
    }).join("");

    // Allowances chips
    let chips = "";
    if (res.type === "sole-trader") {
      chips += `<span class="chip">${t('paChipLabel')} £${res.allowances.personalAllowance.toLocaleString("en-GB")}</span>`;
      if (res.allowances.tradingAllowanceApplied) chips += `<span class="chip">${t('tradingAllowanceChip')} £1,000</span>`;
      else if (res.allowances.expensesDeducted > 0) chips += `<span class="chip">${t('expensesDeductedChip')} ${g(res.allowances.expensesDeducted)}</span>`;
      if (res.allowances.personalAllowanceLostToTaper > 0) chips += `<span class="chip">${t('paTaperedChip')} ${g(res.allowances.personalAllowanceLostToTaper)}</span>`;
    } else if (res.type === "investments") {
      chips += `<span class="chip">${t('aeaChip')} ${g(res.allowances.annualExemptAmount)}</span>`;
      if (res.allowances.lossesOffset > 0) chips += `<span class="chip">${t('lossesOffsetChip')} ${g(res.allowances.lossesOffset)}</span>`;
    } else {
      chips += `<span class="chip">${t(LTD_BAND[res.band]||res.band)}</span>`;
      if (res.allowances.expensesDeducted > 0) chips += `<span class="chip">${t('expensesDeductedChip')} ${g(res.allowances.expensesDeducted)}</span>`;
    }

    const isSole = res.type === "sole-trader";
    const isInv = res.type === "investments";
    const stat1Label = isInv ? t('taxableGain') : t('taxableProfit');
    const stat1Value = isInv ? res.taxableGain : profit;
    const hmrcUrl = (isSole || isInv) ? "https://www.gov.uk/pay-self-assessment-tax-bill" : "https://www.gov.uk/pay-corporation-tax";
    const hmrcLabel = isInv ? t('payInv') : (isSole ? t('paySole') : t('payLtd'));
    const utr = (($("utr-input").value || "").replace(/\D/g, ""));

    out.innerHTML = `
      <div class="outstanding">
        <div class="glow"></div>
        <div class="label">${t('outstandingLabel')}</div>
        <div class="amount ${res.outstandingBalance === 0 ? "zero" : ""}">${g(res.outstandingBalance)}</div>
        <div class="meta">${t('totalDue')} ${g(res.totalTaxDue)} · ${t('alreadyPaid')} ${g(res.taxAlreadyPaid)}</div>
      </div>

      <div class="summary-row">
        <div class="stat"><div class="k">${stat1Label}</div><div class="v">${g(stat1Value)}</div></div>
        <div class="stat"><div class="k">${t('effectiveRate')}</div><div class="v">${(res.effectiveRate * 100).toFixed(1)}%</div></div>
      </div>

      <div class="chart-row">
        ${donutSvg(taxPct)}
        <div class="legend">
          <div class="li"><span class="dot" style="background:var(--accent)"></span><span class="lab">${t('tax')}</span><span class="val">${g(res.totalTaxDue)}</span></div>
          <div class="li"><span class="dot" style="background:var(--border)"></span><span class="lab">${t('takeHome')}</span><span class="val">${g(takeHome)}</span></div>
        </div>
      </div>

      <div class="bd">
        ${bdRows}
        <div class="row total"><span class="lab">${t('totalTaxDue')}</span><span class="val">${g(res.totalTaxDue)}</span></div>
        <div class="row"><span class="lab">${t('lessPaid')}</span><span class="val">− ${g(res.taxAlreadyPaid)}</span></div>
        <div class="row total"><span class="lab">${t('outstandingBalance')}</span><span class="val">${g(res.outstandingBalance)}</span></div>
      </div>

      <div class="allowances">
        <div class="title">${t('allowancesTitle')}</div>
        ${chips || '<span style="font-size:12.5px;color:var(--muted)">' + t('none') + '</span>'}
      </div>

      <div class="pay-actions">
        <a class="btn primary" href="${hmrcUrl}" target="_blank" rel="noopener">
          ${hmrcLabel}
          <svg class="ext" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7 17 17 7M7 7h10v10"/></svg>
        </a>
        <button class="btn" id="copySummary">${t('copySummary')}</button>
        ${(isSole || isInv) && utr ? `<div class="pay-ref"><span class="k">${t('payRefLabel')}</span><b>${escapeHtml(utr)}</b><span class="hint">— ${t('payRefHint')}</span></div>` : ""}
      </div>
    `;

    const cs = $("copySummary");
    if (cs) cs.addEventListener("click", () => copySummary(res));
    updateTips(res);
    renderPensionTotals();
  }

  // ---- Optimisation tips (live) ----
  function updateTips(res) {
    const pensionBody = $("tip-pension-body");
    if (res.type === "sole-trader") {
      const opt = T.pensionOptimisation(res.profit);
      if (opt.show) {
        pensionBody.innerHTML = (opt.trap
        ? '<b>' + t('optHeadline1', {c: T.formatGBP(opt.contribution)}) + '.</b> ' + t('optDetail1', {s: T.formatGBP(opt.taxSaved), n: T.formatGBP(opt.netCost), c: T.formatGBP(opt.contribution)})
        : '<b>' + t('optHeadline2') + '.</b> ' + t('optDetail2'));
        $("tip-pension").classList.add("active-tip");
      } else {
        pensionBody.textContent = t('tipPensionBody');
        $("tip-pension").classList.remove("active-tip");
      }
    } else if (res.type === "limited-company") {
      pensionBody.textContent = t('tipPensionLtd');
      $("tip-pension").classList.remove("active-tip");
    } else {
      pensionBody.textContent = t('tipPensionInv');
      $("tip-pension").classList.remove("active-tip");
    }
  }

  // ---- Copy tax summary (clipboard) ----
  function copySummary(res) {
    if (!res) return;
    const lines = [];
    lines.push(t('copyEstimate', { date: new Date().toLocaleDateString(I && I.get ? I.get() : 'en-GB') }));
    lines.push(t('copyType', { type: t(TYPE_LABEL[res.type]||res.type) }));
    if (res.profit !== undefined) lines.push(t('copyProfit', { amt: T.formatGBP(res.profit) }));
    if (res.outstandingBalance !== undefined) lines.push(t('copyOutstanding', { amt: T.formatGBP(res.outstandingBalance) }));
    if (res.effectiveRate !== undefined) lines.push(t('copyRate', { pct: (res.effectiveRate * 100).toFixed(1) }));
    lines.push("");
    lines.push(t('copyFooter'));
    const text = lines.join("\n");
    const status = $("saveStatus");
    const done = () => { if (status) { status.textContent = t('summaryCopied'); } };
    const fail = () => { if (status) { status.textContent = t('copyFailed'); } };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fail);
      } else {
        const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta); done();
      }
    } catch (e) { fail(); }
  }

  // ---- Tax deadline reminders (@capacitor/local-notifications) ----
  const DEADLINES = [
    { m: 1, d: 31, title: "Self Assessment deadline", body: "Online return, balancing payment and first payment on account due today." },
    { m: 7, d: 31, title: "Self Assessment — payment on account", body: "Second payment on account due today." },
    { m: 10, d: 31, title: "Paper Self Assessment return", body: "Paper tax return deadline for the last tax year." }
  ];
  function nextDate(m, d) {
    const now = new Date();
    let dt = new Date(now.getFullYear(), m - 1, d, 9, 0, 0);
    if (dt.getTime() < now.getTime()) dt = new Date(now.getFullYear() + 1, m - 1, d, 9, 0, 0);
    return dt;
  }
  async function scheduleReminder(deadline, at) {
    const status = $("saveStatus");
    const LocalNotifications = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
    if (!LocalNotifications) {
      if (status) status.textContent = t('remindersAvail');
      return;
    }
    try {
      await LocalNotifications.requestPermissions();
      const id = Math.floor(at.getTime() / 1000) % 100000;
      await LocalNotifications.schedule({
        notifications: [{ id: id, title: deadline.title, body: deadline.body, schedule: { at: at } }]
      });
      const when = at.toLocaleString(I && I.get ? I.get() : 'en-GB', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
      if (status) status.textContent = t('reminderSet') + ' ' + when + '.';
    } catch (e) {
      if (status) status.textContent = t('reminderFailed') + ' ' + (e.message || 'unknown error');
    }
  }
  function renderDeadlines() {
    const list = $("deadlineList");
    if (!list) return;
    const items = DEADLINES.map((dl, di) => ({ dl, di, at: nextDate(dl.m, dl.d) })).sort((a, b) => a.at - b.at).slice(0, 5);
    list.innerHTML = items.map((it) => {
      const when = it.at.toLocaleDateString(I && I.get ? I.get() : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const id = "rem-" + it.at.getTime();
      const k = DL_KEY[it.di] || 'deadline1';
      return `<li class="deadline"><div class="dl-info"><span class="dl-title">${t(k+'Title')}</span><span class="dl-when">${when}</span></div><button type="button" class="btn ghost sm" id="${id}">${t('remindMe')}</button></li>`;
    }).join("");
    items.forEach((it) => {
      const btn = $("rem-" + it.at.getTime());
      if (btn) btn.addEventListener("click", () => {
        const remindAt = new Date(it.at.getTime() - 7 * 24 * 60 * 60 * 1000);
        scheduleReminder(it.dl, remindAt);
      });
    });
  }

  // ---- On-device tax profile (account: name + UTR + tax code) ----
  const PROFILE_KEY = "taxmate.profile.v1";
  let profile = { name: "", utr: "", taxCode: "", vatNo: "" };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function taxCodeToAllowance(code) {
    if (!code) return { pa: null, note: "" };
    const c = String(code).trim().toUpperCase().replace(/\s+/g, "");
    if (!c) return { pa: null, note: "" };
    if (["BR", "D0", "D1", "D2", "0T"].indexOf(c) > -1) return { pa: 0, note: t('tcNoPa', {c: c}) };
    if (c === "NT") return { pa: null, note: t('tcNT') };
    if (c.charAt(0) === "K") return { pa: null, note: t('tcK') };
    let body = c, region = "";
    if (body.charAt(0) === "S") { region = "Scottish "; body = body.slice(1); }
    else if (body.charAt(0) === "C") { region = "Welsh "; body = body.slice(1); }
    const m = body.match(/^(\d+)/);
    if (m) {
      const pa = parseInt(m[1], 10) * 10;
      return region
        ? { pa: pa, note: t('tcRegional', { r: region, p: pa.toLocaleString("en-GB") }) }
        : { pa: pa, note: t('tcSet') + pa.toLocaleString("en-GB") + "." };
    }
    return { pa: null, note: t('tcUnknown') };
  }
  function profilePA() {
    const el = $("taxcode-input");
    if (!el) return null;
    const tc = (el.value || "").trim();
    if (!tc) return null;
    return taxCodeToAllowance(tc).pa;
  }
  function updateTaxCodeNote() {
    const el = $("taxcode-input");
    const note = $("profileNote");
    if (!el || !note) return;
    const tc = (el.value || "").trim();
    note.textContent = tc ? taxCodeToAllowance(tc).note : "";
  }
  function loadProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) profile = Object.assign({ name: "", utr: "", taxCode: "", vatNo: "" }, JSON.parse(raw));
    } catch (e) {}
    const n = $("name-input"), u = $("utr-input"), t = $("taxcode-input"), v = $("vatno-input");
    if (n) n.value = profile.name || "";
    if (u) u.value = profile.utr || "";
    if (t) t.value = profile.taxCode || "";
    if (v) v.value = profile.vatNo || "";
    if (profile.vatNo && $("vat-registered")) $("vat-registered").checked = true;
    updateTaxCodeNote();
  }
  function digitsOnly(v) { return String(v || "").replace(/\D/g, ""); }
  function utrDigits() { return digitsOnly(($("utr-input") || {}).value).slice(0, 10); }
  function vatRawValue() { return String((($("vatno-input") || {}).value) || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function vatDigitsOnly() { return digitsOnly(vatRawValue().replace(/^GB/, "")).slice(0, 9); }
  function utrIsValid() { const u = utrDigits(); return u.length === 0 || u.length === 10; }
  function vatIsValid() { const r = vatRawValue(); return r.length === 0 || vatDigitsOnly().length === 9; }
  function setFieldError(id, on) {
    const el = $(id);
    if (!el) return;
    el.classList.toggle("err", !!on);
    el.setAttribute("aria-invalid", on ? "true" : "false");
  }
  function setProfileStatus(msg, kind) {
    const status = $("profileStatus");
    if (!status) return;
    status.textContent = msg || "";
    status.classList.toggle("error", kind === "error");
    status.classList.toggle("ok", kind === "ok");
  }
  function validateProfile(showEmpty) {
    const utrBad = !utrIsValid();
    const vatBad = !vatIsValid();
    setFieldError("utr-input", utrBad);
    setFieldError("vatno-input", vatBad);
    if (utrBad) { setProfileStatus(t('utrError'), "error"); return false; }
    if (vatBad) { setProfileStatus(t('vatNoError'), "error"); return false; }
    if (showEmpty) setProfileStatus("", null);
    return true;
  }
  function saveProfile() {
    if (!validateProfile(true)) return;
    try {
      const utr = utrDigits();
      const vatRaw = vatRawValue();
      profile = {
        name: (($("name-input").value || "").trim()),
        utr: utr,
        taxCode: (($("taxcode-input").value || "").trim().toUpperCase()),
        vatNo: vatRaw
      };
      if ($("utr-input")) $("utr-input").value = utr;
      if ($("vatno-input")) $("vatno-input").value = vatRaw;
      if ($("taxcode-input")) $("taxcode-input").value = profile.taxCode;
      if (vatRaw && $("vat-registered")) { $("vat-registered").checked = true; renderVat(); }
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      setProfileStatus(t('profileSaved'), "ok");
      updateTaxCodeNote();
      render();
    } catch (e) { setProfileStatus(t('profileSaveFailed'), "error"); }
  }

  // ---- Saved figures (localStorage) ----
  const STORE_KEY = "taxmate.figures.v1";
  const FIG_FIELDS = ["income-sole", "paid-sole", "revenue-ltd", "paid-ltd", "gains-inv", "losses-inv", "other-inc-inv", "paid-inv", "use-ta",
    "vat-registered", "vat-turnover", "vat-scheme", "vat-sales", "vat-sales-basis", "vat-sales-rate",
    "vat-purchases", "vat-sector", "vat-flat-turnover", "vat-flat-basis", "vat-first-year", "vat-limited-cost"];
  function collectFigures() {
    const data = { fields: {}, expenses: expState, pensions: ppState };
    FIG_FIELDS.forEach((id) => {
      const el = $(id); if (el) data.fields[id] = el.type === "checkbox" ? el.checked : el.value;
    });
    return data;
  }
  function applyFigures(data) {
    if (!data || !data.fields) return false;
    FIG_FIELDS.forEach((id) => {
      const el = $(id); if (!el) return;
      if (el.type === "checkbox") el.checked = !!data.fields[id]; else el.value = data.fields[id] || "";
    });
    if (data.expenses && typeof data.expenses === "object") { expState.sole = data.expenses.sole || []; expState.ltd = data.expenses.ltd || []; }
    if (Array.isArray(data.pensions)) { ppState.length = 0; data.pensions.forEach((p) => ppState.push(p)); }
    renderExpenseTable("sole"); renderExpenseTable("ltd"); renderPension(); renderVat(); render();
    return true;
  }
  function saveFigures() {
    const status = $("saveStatus");
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(collectFigures()));
      if (status) status.textContent = t('figuresSaved');
    } catch (e) {
      if (status) status.textContent = t('saveFailed');
    }
  }
  function loadFigures() {
    const status = $("saveStatus");
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) { if (status) status.textContent = t('noSavedFigures'); return; }
      applyFigures(JSON.parse(raw));
      if (status) status.textContent = t('figuresLoaded');
    } catch (e) {
      if (status) status.textContent = t('loadFailed');
    }
  }

  // ---- Expense line-item tables (vs £1,000 trading allowance) ----
  const expState = { sole: [], ltd: [] };
  function expenseTotal(mode) {
    return expState[mode].reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  }
  function updateExpenseTotal(mode) {
    const total = expenseTotal(mode);
    $("exp-total-" + mode).textContent = T.formatGBP(total);
    if (mode !== "sole") return;
    const st = $("exp-status-sole");
    if (total <= 0) { st.className = "exp-status"; st.textContent = ""; return; }
    const fmt = total.toLocaleString("en-GB", { maximumFractionDigits: 2 });
    if (total < 1000) {
      st.className = "exp-status show under";
      st.textContent = t('expUnderMsg', { amt: fmt });
    } else {
      st.className = "exp-status show over";
      st.textContent = t('expOverMsg', { amt: fmt });
    }
  }
  function renderExpenseTable(mode) {
    const rowsEl = $("exp-rows-" + mode);
    rowsEl.innerHTML = "";
    if (expState[mode].length === 0) expState[mode].push({ desc: "", amount: "" });
    expState[mode].forEach((row, i) => {
      const div = document.createElement("div");
      div.className = "exp-row";
      const desc = document.createElement("input");
      desc.type = "text"; desc.className = "exp-desc"; desc.placeholder = t('expenseDescPh'); desc.value = row.desc;
      desc.addEventListener("input", () => { row.desc = desc.value; });
      const wrap = document.createElement("div"); wrap.className = "input-wrap";
      const pre = document.createElement("span"); pre.className = "pre"; pre.textContent = "£";
      const amt = document.createElement("input");
      amt.type = "number"; amt.className = "exp-amt"; amt.min = "0"; amt.step = "50"; amt.inputMode = "numeric"; amt.placeholder = "0"; amt.value = row.amount;
      amt.addEventListener("input", () => { row.amount = amt.value; updateExpenseTotal(mode); render(); });
      wrap.appendChild(pre); wrap.appendChild(amt);
      const del = document.createElement("button");
      del.type = "button"; del.className = "exp-del"; del.textContent = "×"; del.title = t('expRemoveTitle');
      del.addEventListener("click", () => { expState[mode].splice(i, 1); renderExpenseTable(mode); updateExpenseTotal(mode); render(); });
      div.appendChild(desc); div.appendChild(wrap); div.appendChild(del);
      rowsEl.appendChild(div);
    });
    updateExpenseTotal(mode);
  }
  $("exp-add-sole").addEventListener("click", () => { expState.sole.push({ desc: "", amount: "" }); renderExpenseTable("sole"); });
  $("exp-add-ltd").addEventListener("click", () => { expState.ltd.push({ desc: "", amount: "" }); renderExpenseTable("ltd"); });

  // ---- Currency converter (live ECB reference rates) → GBP ----
  const FX_CURRENCIES = ["USD", "EUR", "JPY", "AUD", "CAD", "CHF", "INR", "CNY", "NZD"];
  const FX_FALLBACK = { GBP: 1, USD: 1.36, EUR: 1.17, JPY: 190, AUD: 1.92, CAD: 1.82, CHF: 1.12, INR: 107, CNY: 9.5, NZD: 2.12 };
  let fxRates = null, fxDate = null;
  function fxGbp() {
    const amt = parseFloat($("fx-amount").value) || 0;
    const from = $("fx-from").value || "USD";
    const rFrom = (fxRates && fxRates[from]) || FX_FALLBACK[from] || 1;
    const gbp = from === "GBP" ? amt : amt / rFrom;
    $("fx-result").textContent = gbp.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const one = from === "GBP" ? 1 : 1 / rFrom;
    const src = fxRates ? t('fxSrcEcb') : t('fxSrcFallback');
    $("fx-meta").textContent = t('fxRateLine', { from: from, rate: one.toFixed(4), src: src, date: fxDate ? ", " + fxDate : "" });
    return gbp;
  }
  const FX_TARGET = { sole: "income-sole", ltd: "revenue-ltd", inv: "gains-inv" };
  const FX_LABEL_KEY = { sole: 'fxUseSole', ltd: 'fxUseLtd', inv: 'fxUseInv' };
  function updateFxLabel() { $("fx-use").textContent = t(FX_LABEL_KEY[mode] || 'fxUseSole'); }
  function initFx() {
    const fromSel = $("fx-from");
    FX_CURRENCIES.forEach((c) => fromSel.add(new Option(c, c)));
    fromSel.value = "USD";
    ["fx-amount", "fx-from"].forEach((id) => $(id).addEventListener("input", fxGbp));
    fxGbp();
    fetch("https://open.er-api.com/v6/latest/GBP")
      .then((r) => r.json())
      .then((d) => {
        if (d && d.rates) {
          fxRates = Object.assign({ GBP: 1 }, d.rates);
          fxDate = d.time_last_update_utc ? new Date(d.time_last_update_utc).toLocaleDateString("en-GB") : null;
          fxGbp();
        }
      })
      .catch(() => { fxRates = FX_FALLBACK; fxGbp(); });
    $("fx-use").addEventListener("click", () => {
      const gbp = fxGbp();
      const id = FX_TARGET[mode] || "income-sole";
      const el = $(id);
      el.value = Math.round(gbp);
      el.dispatchEvent(new Event("input"));
      el.focus();
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    updateFxLabel();
  }

  // ---- Pension plans widget ----
  const PENSION_AA = 60000;
  const ppState = [];
  function marginalRate(res) {
    const p = res.profit;
    if (p >= 125140) return 0.45;
    if (p > 100000) return 0.6;
    if (p > 50270) return 0.4;
    if (p > 12570) return 0.2;
    return 0.2;
  }
  function renderPensionTotals() {
    const totalCon = ppState.reduce((s, r) => s + (parseFloat(r.contribution) || 0), 0);
    const pct = Math.min(100, (totalCon / PENSION_AA) * 100);
    const over = totalCon > PENSION_AA;
    const remaining = Math.max(0, PENSION_AA - totalCon);
    const marginal = lastResult && lastResult.type === "sole-trader" ? marginalRate(lastResult) : null;
    const relief = marginal ? totalCon * marginal : 0;
    $("pp-totals").innerHTML = `
      <div class="pp-stat"><span class="k">${t('ppContributions')}</span><span class="v">${T.formatGBP(totalCon)}</span></div>
      <div class="pp-stat"><span class="k">${t('ppAllowanceUsed')}</span><span class="v">${pct.toFixed(0)}% · ${T.formatGBP(totalCon)} / £60,000</span></div>
      <div class="allowance-bar ${over ? "over" : ""}"><span style="width:${pct}%"></span></div>
      ${over
        ? `<div class="exp-status show over">${t('ppOverAllowance')}</div>`
        : `<div class="exp-status show under">£${remaining.toLocaleString("en-GB", { maximumFractionDigits: 0 })} ${t('ppRemaining')}</div>`}
      ${marginal ? `<div class="pp-stat" style="margin-top:10px"><span class="k">${t('ppRelief')} ${(marginal * 100).toFixed(0)}% ${t('ppReliefSuffix')}</span><span class="v">${T.formatGBP(relief)}</span></div>` : ""}
    `;
  }
  function renderPension() {
    const rowsEl = $("pp-rows");
    rowsEl.innerHTML = "";
    const head = document.createElement("div");
    head.className = "pp-head";
    head.innerHTML = `<span data-i18n="ppHeadProvider">${t('ppHeadProvider')}</span><span data-i18n="ppHeadContribution">${t('ppHeadContribution')}</span><span></span>`;
    rowsEl.appendChild(head);
    if (ppState.length === 0) ppState.push({ name: "", contribution: "" });
    ppState.forEach((row, i) => {
      const div = document.createElement("div"); div.className = "pp-row";
      const name = document.createElement("input"); name.type = "text"; name.className = "pp-name"; name.placeholder = t('providerPh'); name.value = row.name;
      name.addEventListener("input", () => { row.name = name.value; });
      const cwrap = document.createElement("div"); cwrap.className = "input-wrap";
      const cpre = document.createElement("span"); cpre.className = "pre"; cpre.textContent = "£";
      const con = document.createElement("input"); con.type = "number"; con.className = "pp-con"; con.min = "0"; con.step = "100"; con.inputMode = "numeric"; con.placeholder = "0"; con.value = row.contribution;
      con.addEventListener("input", () => { row.contribution = con.value; renderPensionTotals(); });
      cwrap.appendChild(cpre); cwrap.appendChild(con);
      const del = document.createElement("button"); del.type = "button"; del.className = "exp-del"; del.textContent = "×"; del.title = t('expRemoveTitle');
      del.addEventListener("click", () => { ppState.splice(i, 1); renderPension(); });
      div.appendChild(name); div.appendChild(cwrap); div.appendChild(del);
      rowsEl.appendChild(div);
    });
    renderPensionTotals();
  }
  $("pp-add").addEventListener("click", () => { ppState.push({ name: "", contribution: "" }); renderPension(); });


  // ---- VAT & reclaims ----
  // HMRC trade sectors and flat rate percentages (gov.uk/vat-flat-rate-scheme/how-much-you-pay).
  // Sector names are HMRC's own categories and are kept in English on purpose.
  const VAT_SECTORS = [
    ["Accountancy or book-keeping", 14.5],
    ["Advertising", 11],
    ["Agricultural services", 11],
    ["Any other activity not listed elsewhere", 12],
    ["Architect, civil and structural engineer or surveyor", 14.5],
    ["Boarding or care of animals", 12],
    ["Business services not listed elsewhere", 12],
    ["Catering services including restaurants and takeaways", 12.5],
    ["Computer and IT consultancy or data processing", 14.5],
    ["Computer repair services", 10.5],
    ["Entertainment or journalism", 12.5],
    ["Estate agency or property management services", 12],
    ["Farming or agriculture not listed elsewhere", 6.5],
    ["Film, radio, television or video production", 13],
    ["Financial services", 13.5],
    ["Forestry or fishing", 10.5],
    ["General building or construction services", 9.5],
    ["Hairdressing or other beauty treatment services", 13],
    ["Hiring or renting goods", 9.5],
    ["Hotel or accommodation", 10.5],
    ["Investigation or security", 12],
    ["Labour-only building or construction services", 14.5],
    ["Laundry or dry-cleaning services", 12],
    ["Lawyer or legal services", 14.5],
    ["Library, archive, museum or other cultural activity", 9.5],
    ["Management consultancy", 14],
    ["Manufacturing fabricated metal products", 10.5],
    ["Manufacturing food", 9],
    ["Manufacturing not listed elsewhere", 9.5],
    ["Manufacturing yarn, textiles or clothing", 9],
    ["Membership organisation", 8],
    ["Mining or quarrying", 10],
    ["Packaging", 9],
    ["Photography", 11],
    ["Post offices", 5],
    ["Printing", 8.5],
    ["Publishing", 11],
    ["Pubs", 6.5],
    ["Real estate activity not listed elsewhere", 14],
    ["Repairing personal or household goods", 10],
    ["Repairing vehicles", 8.5],
    ["Retailing food, confectionery, tobacco, newspapers or children's clothing", 4],
    ["Retailing pharmaceuticals, medical goods, cosmetics or toiletries", 8],
    ["Retailing not listed elsewhere", 7.5],
    ["Retailing vehicles or fuel", 6.5],
    ["Secretarial services", 13],
    ["Social work", 11],
    ["Sport or recreation", 8.5],
    ["Transport or storage, including couriers, freight, removals and taxis", 10],
    ["Travel agency", 10.5],
    ["Veterinary medicine", 11],
    ["Wholesaling agricultural products", 8],
    ["Wholesaling food", 7.5],
    ["Wholesaling not listed elsewhere", 8.5]
  ];

  function populateVatSectors() {
    const sel = $("vat-sector");
    if (!sel || sel.options.length) return;
    VAT_SECTORS.forEach(function (row) {
      const o = document.createElement("option");
      o.value = String(row[1]);
      o.textContent = row[0] + " — " + row[1] + "%";
      sel.appendChild(o);
    });
    sel.value = "12"; // "Any other activity not listed elsewhere"
  }

  function vatIsRegistered() {
    const el = $("vat-registered");
    return !!(el && el.checked);
  }

  function renderVatThreshold() {
    const out = $("vat-threshold-out");
    if (!out) return;
    const turnover = num("vat-turnover");
    const registered = vatIsRegistered();
    const st = T.vatThresholdStatus(turnover, registered);
    const bar = Math.min(100, st.pct);
    let status = "";
    if (st.mustRegister) {
      status = '<div class="exp-status show over">' + t('vatMustRegister') + '</div>';
    } else if (registered && st.canDeregister) {
      status = '<div class="exp-status show under">' + t('vatCanDeregister') + '</div>';
    } else if (st.approaching) {
      status = '<div class="exp-status show over">' + t('vatApproaching', { amt: T.formatGBP(st.remaining) }) + '</div>';
    } else if (registered) {
      status = '<div class="exp-status show under">' + t('vatRegisteredOk') + '</div>';
    } else {
      status = '<div class="exp-status show under">' + t('vatUnderThreshold', { amt: T.formatGBP(st.remaining) }) + '</div>';
    }
    out.innerHTML =
      '<div class="pp-stat"><span class="k">' + t('vatThresholdUsed') + '</span><span class="v">' +
        st.pct.toFixed(0) + '% \u00b7 ' + T.formatGBP(turnover) + ' / \u00a390,000</span></div>' +
      '<div class="allowance-bar ' + (st.overThreshold ? 'over' : '') + '"><span style="width:' + bar + '%"></span></div>' +
      status +
      '<div class="pp-note">' + (st.mustRegister ? t('vatRegDeadline') : t('vatThresholdNote')) + '</div>';
  }

  function renderVatCalc() {
    const out = $("vat-calc-out");
    if (!out) return;
    const scheme = ($("vat-scheme") || {}).value || "standard";
    const stdFields = $("vat-standard-fields");
    const flatFields = $("vat-flat-fields");
    if (stdFields) stdFields.style.display = scheme === "flat" ? "none" : "";
    if (flatFields) flatFields.style.display = scheme === "flat" ? "" : "none";

    let html = "";
    if (scheme === "flat") {
      const sectorPct = parseFloat(($("vat-sector") || {}).value || "12") || 12;
      const basisGross = (($("vat-flat-basis") || {}).value || "gross") === "gross";
      const r = T.flatRateVat({
        turnover: num("vat-flat-turnover"),
        turnoverIsGross: basisGross,
        sectorRate: sectorPct / 100,
        limitedCost: !!($("vat-limited-cost") || {}).checked,
        firstYear: !!($("vat-first-year") || {}).checked,
        purchasesGross: num("vat-purchases")
      });
      const ratePct = (r.effectiveRate * 100).toFixed(1).replace(/\.0$/, "");
      html =
        '<div class="pp-stat"><span class="k">' + t('vatFlatRateApplied') + '</span><span class="v">' + ratePct + '%</span></div>' +
        '<div class="pp-stat"><span class="k">' + t('vatFlatTurnoverIncl') + '</span><span class="v">' + T.formatGBP(r.grossTurnover) + '</span></div>' +
        '<div class="pp-stat total"><span class="k">' + t('vatDueToHmrc') + '</span><span class="v">' + T.formatGBP(r.netVatDue) + '</span></div>' +
        (r.limitedCost ? '<div class="exp-status show over">' + t('vatLimitedCostApplied') + '</div>' : '') +
        '<div class="pp-stat" style="margin-top:10px"><span class="k">' + t('vatStandardWouldBe') + '</span><span class="v">' + T.formatGBP(r.standardNetVatDue) + '</span></div>' +
        '<div class="exp-status show ' + (r.flatIsBetter ? 'under' : 'over') + '">' +
          (r.flatIsBetter
            ? t('vatFlatBetter', { amt: T.formatGBP(Math.abs(r.saving)) })
            : t('vatStandardBetter', { amt: T.formatGBP(Math.abs(r.saving)) })) +
        '</div>' +
        '<div class="pp-note">' + t('vatFlatNoReclaim') + '</div>';
    } else {
      const rate = parseFloat(($("vat-sales-rate") || {}).value || "0.2");
      const basisGross = (($("vat-sales-basis") || {}).value || "net") === "gross";
      const r = T.standardSchemeVat({
        scheme: scheme,
        sales: num("vat-sales"),
        salesAreGross: basisGross,
        salesRate: rate,
        purchasesGross: num("vat-purchases")
      });
      html =
        '<div class="pp-stat"><span class="k">' + t('vatSalesExVat') + '</span><span class="v">' + T.formatGBP(r.salesNet) + '</span></div>' +
        '<div class="pp-stat"><span class="k">' + t('vatOutputVat') + '</span><span class="v">' + T.formatGBP(r.outputVat) + '</span></div>' +
        '<div class="pp-stat"><span class="k">' + t('vatInputVat') + '</span><span class="v">\u2212' + T.formatGBP(r.inputVat) + '</span></div>' +
        '<div class="pp-stat total"><span class="k">' + (r.isRepayment ? t('vatRefundDue') : t('vatDueToHmrc')) + '</span><span class="v">' +
          T.formatGBP(r.isRepayment ? r.refundDue : r.netVatDue) + '</span></div>' +
        (r.isRepayment ? '<div class="exp-status show under">' + t('vatRepaymentNote') + '</div>' : '') +
        (scheme === "cash" ? '<div class="pp-note">' + t('vatCashNote') + '</div>' : '');
    }

    if (!vatIsRegistered()) {
      html = '<div class="exp-status show over">' + t('vatNotRegisteredWarn') + '</div>' + html;
    }
    out.innerHTML = html;
  }

  function renderVat() { renderVatThreshold(); renderVatCalc(); }

  function initVat() {
    populateVatSectors();
    const ids = ["vat-registered", "vat-turnover", "vat-scheme", "vat-sales", "vat-sales-basis",
                 "vat-sales-rate", "vat-purchases", "vat-sector", "vat-flat-turnover",
                 "vat-flat-basis", "vat-first-year", "vat-limited-cost"];
    ids.forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", renderVat);
      el.addEventListener("change", renderVat);
    });
    const useInc = $("vat-use-income");
    if (useInc) useInc.addEventListener("click", function () {
      const src = num("income-sole") || num("revenue-ltd");
      const el = $("vat-turnover");
      if (el) { el.value = src ? String(src) : ""; renderVat(); }
    });
    renderVat();
  }

  // initial render
  renderExpenseTable("sole");
  renderExpenseTable("ltd");
  initVat();
  initFx();
  renderPension();
  renderDeadlines();
  const saveBtn = $("saveFigures");
  if (saveBtn) saveBtn.addEventListener("click", saveFigures);
  const loadBtn = $("loadFigures");
  if (loadBtn) loadBtn.addEventListener("click", loadFigures);
  loadProfile();
  ["name-input", "utr-input", "taxcode-input", "vatno-input"].forEach(function (id) {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", function () {
      if (id === "utr-input") {
        const clean = digitsOnly(el.value).slice(0, 10);
        if (el.value !== clean) el.value = clean;
        if (el.classList.contains("err") && utrIsValid()) { setFieldError("utr-input", false); setProfileStatus("", null); }
      }
      if (id === "vatno-input" && el.classList.contains("err") && vatIsValid()) {
        setFieldError("vatno-input", false); setProfileStatus("", null);
      }
      if (id === "taxcode-input") updateTaxCodeNote();
      if (id === "taxcode-input" || id === "utr-input") render();
    });
    if (id === "utr-input" || id === "vatno-input") {
      el.addEventListener("blur", function () { validateProfile(false); });
    }
  });
  const sp = $("saveProfile");
  if (sp) sp.addEventListener("click", saveProfile);

  // ---- Language selector + re-render dynamic content on change ----
  const langSel = $("langSelect");
  if (langSel && I && I.LANGS) {
    I.LANGS.forEach(function (l) { langSel.add(new Option(l.name, l.code)); });
    langSel.value = I.get();
    langSel.addEventListener("change", function () { I.apply(langSel.value); });
  }
  function onLangChange() {
    if (langSel && I) langSel.value = I.get();
    renderExpenseTable("sole");
    renderExpenseTable("ltd");
    renderPension();
    renderVat();
    renderDeadlines();
    updateFxLabel();
    fxGbp();
    updateTaxCodeNote();
    render();
  }
  document.addEventListener("taxmate:lang", onLangChange);
  render();
})();
