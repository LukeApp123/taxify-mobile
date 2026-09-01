// TaxMate — UK tax calculation engine (2026/27, England/Wales/NI)
// Pure functions. No DOM, no I/O. Safe to require() in Node or load in a browser.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TaxEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- 2026/27 rates (sourced from GOV.UK / Finance Act 2026) ----
  const RATES = {
    taxYear: "2026/27",
    region: "England / Wales / Northern Ireland",

    personalAllowance: 12570,
    paTaperThreshold: 100000, // £1 of PA lost per £2 over this
    basicBandWidth: 37700, // taxable income taxed at basic rate
    higherBandWidth: 74870, // taxable income taxed at higher rate (50270..125140)
    basicRate: 0.2,
    higherRate: 0.4,
    additionalRate: 0.45,

    tradingAllowance: 1000, // £1,000 — replaces (not adds to) expense deduction

    // Class 4 National Insurance (self-employed)
    class4LowerLimit: 12570,
    class4UpperLimit: 50270,
    class4MainRate: 0.06,
    class4UpperRate: 0.02,
    class2VoluntaryWeekly: 3.65, // voluntary only — not added to mandatory total

    // Corporation Tax (FY2026, from 1 April 2026)
    ctLowerLimit: 50000,
    ctUpperLimit: 250000,
    ctSmallRate: 0.19,
    ctMainRate: 0.25,
    ctMarginalFraction: 3 / 200, // 3/200ths
  };

  const round2 = (n) => Math.round(n * 100) / 100;
  const formatGBP = (n) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(n || 0);

  // ---- Personal Allowance (with £100k taper) ----
  function personalAllowanceFor(profit, paOverride) {
    const base = (typeof paOverride === "number" && !isNaN(paOverride)) ? paOverride : RATES.personalAllowance;
    if (profit <= RATES.paTaperThreshold) return base;
    const tapered = base - 0.5 * (profit - RATES.paTaperThreshold);
    return Math.max(0, tapered);
  }

  // ---- Income Tax (sole trader profits) ----
  function calculateIncomeTax(profit, paOverride) {
    const pa = personalAllowanceFor(profit, paOverride);
    const fullPa = (typeof paOverride === "number" && !isNaN(paOverride)) ? paOverride : RATES.personalAllowance;
    const taxable = Math.max(0, profit - pa);
    const basic = Math.min(taxable, RATES.basicBandWidth) * RATES.basicRate;
    const higher = Math.min(Math.max(0, taxable - RATES.basicBandWidth), RATES.higherBandWidth) * RATES.higherRate;
    const additional = Math.max(0, taxable - RATES.basicBandWidth - RATES.higherBandWidth) * RATES.additionalRate;
    return {
      personalAllowanceUsed: Math.min(pa, profit),
      personalAllowanceLost: fullPa - pa,
      taxableIncome: taxable,
      bands: [
        { name: "Basic rate", amount: Math.min(taxable, RATES.basicBandWidth), rate: RATES.basicRate, tax: round2(basic) },
        { name: "Higher rate", amount: Math.min(Math.max(0, taxable - RATES.basicBandWidth), RATES.higherBandWidth), rate: RATES.higherRate, tax: round2(higher) },
        { name: "Additional rate", amount: Math.max(0, taxable - RATES.basicBandWidth - RATES.higherBandWidth), rate: RATES.additionalRate, tax: round2(additional) },
      ],
      total: round2(basic + higher + additional),
    };
  }

  // ---- Class 4 National Insurance ----
  function calculateClass4(profit) {
    if (profit <= RATES.class4LowerLimit) return { total: 0, bands: [] };
    const inMainBand = Math.min(profit, RATES.class4UpperLimit) - RATES.class4LowerLimit;
    const aboveUpper = Math.max(0, profit - RATES.class4UpperLimit);
    const main = inMainBand * RATES.class4MainRate;
    const upper = aboveUpper * RATES.class4UpperRate;
    return {
      bands: [
        { name: "Class 4 — main", amount: inMainBand, rate: RATES.class4MainRate, tax: round2(main) },
        { name: "Class 4 — upper", amount: aboveUpper, rate: RATES.class4UpperRate, tax: round2(upper) },
      ],
      total: round2(main + upper),
    };
  }

  // ---- Trading allowance vs expenses: pick the better deduction ----
  function recommendTradingAllowance(income, expenses) {
    if (income <= 0) return false;
    if (income < RATES.tradingAllowance) return true; // allowance clears all income
    return expenses < RATES.tradingAllowance; // allowance better only when expenses are small
  }

  function soleTraderProfit(income, expenses, useTradingAllowance) {
    const safeIncome = Math.max(0, income);
    if (useTradingAllowance) {
      return Math.max(0, safeIncome - Math.min(RATES.tradingAllowance, safeIncome));
    }
    return Math.max(0, safeIncome - Math.max(0, expenses));
  }

  // ---- Sole trader calculation ----
  function calculateSoleTraderTax(input) {
    const income = Number(input.income) || 0;
    const expenses = Number(input.expenses) || 0;
    const taxAlreadyPaid = Number(input.taxAlreadyPaid) || 0;
    const useTradingAllowance = !!input.useTradingAllowance;

    const profit = soleTraderProfit(income, expenses, useTradingAllowance);
    const paOverride = (input.personalAllowance !== undefined && input.personalAllowance !== null) ? Number(input.personalAllowance) : undefined;
    const incomeTax = calculateIncomeTax(profit, paOverride);
    const class4 = calculateClass4(profit);
    const totalTaxDue = round2(incomeTax.total + class4.total);
    const outstandingBalance = round2(Math.max(0, totalTaxDue - taxAlreadyPaid));
    const effectiveRate = profit > 0 ? totalTaxDue / profit : 0;

    return {
      type: "sole-trader",
      inputs: { income, expenses, useTradingAllowance, taxAlreadyPaid },
      allowances: {
        tradingAllowanceApplied: useTradingAllowance,
        tradingAllowanceAmount: useTradingAllowance ? Math.min(RATES.tradingAllowance, income) : 0,
        expensesDeducted: useTradingAllowance ? 0 : Math.max(0, expenses),
        personalAllowance: incomeTax.personalAllowanceUsed,
        personalAllowanceLostToTaper: incomeTax.personalAllowanceLost,
      },
      profit,
      breakdown: [
        { label: "Income Tax", amount: incomeTax.total, detail: incomeTax.bands },
        { label: "Class 4 National Insurance", amount: class4.total, detail: class4.bands },
      ],
      totalTaxDue,
      taxAlreadyPaid,
      outstandingBalance,
      effectiveRate,
    };
  }

  // ---- Corporation Tax (limited company) ----
  function calculateCorporationTax(profit) {
    if (profit <= 0) return { tax: 0, effectiveRate: 0, band: "None" };
    if (profit <= RATES.ctLowerLimit) {
      return { tax: round2(profit * RATES.ctSmallRate), effectiveRate: RATES.ctSmallRate, band: "Small profits rate (19%)" };
    }
    if (profit >= RATES.ctUpperLimit) {
      return { tax: round2(profit * RATES.ctMainRate), effectiveRate: RATES.ctMainRate, band: "Main rate (25%)" };
    }
    // Marginal relief band
    const mainCharge = profit * RATES.ctMainRate;
    const marginalRelief = (RATES.ctUpperLimit - profit) * RATES.ctMarginalFraction;
    const tax = Math.max(0, mainCharge - marginalRelief);
    return { tax: round2(tax), effectiveRate: tax / profit, band: "Marginal relief band" };
  }

  function calculateLimitedCompanyTax(input) {
    const revenue = Number(input.revenue) || 0;
    const expenses = Number(input.expenses) || 0;
    const taxAlreadyPaid = Number(input.taxAlreadyPaid) || 0;

    const profit = Math.max(0, revenue - Math.max(0, expenses));
    const ct = calculateCorporationTax(profit);
    const outstandingBalance = round2(Math.max(0, ct.tax - taxAlreadyPaid));

    return {
      type: "limited-company",
      inputs: { revenue, expenses, taxAlreadyPaid },
      allowances: {
        expensesDeducted: Math.max(0, expenses),
        regime: ct.band,
      },
      profit,
      breakdown: [
        { label: "Corporation Tax", amount: ct.tax, detail: [] },
      ],
      totalTaxDue: ct.tax,
      taxAlreadyPaid,
      outstandingBalance,
      effectiveRate: ct.effectiveRate,
      band: ct.band,
    };
  }

  // ---- Capital Gains Tax (2026/27) ----
  // Rates aligned across all assets (incl. crypto) since 30 Oct 2024.
  const CGT = {
    annualExemptAmount: 3000,
    basicRateBand: 37700, // basic-rate band width (taxable income)
    basicRate: 0.18,
    higherRate: 0.24,
  };

  // Gains sit on top of other income; the unused basic-rate band is taxed at 18%.
  function calculateCGT(input) {
    const gains = Math.max(0, Number(input.gains) || 0);
    const losses = Math.max(0, Number(input.losses) || 0);
    const otherIncome = Math.max(0, Number(input.otherIncome) || 0);
    const taxAlreadyPaid = Math.max(0, Number(input.taxAlreadyPaid) || 0);

    const netGain = Math.max(0, gains - losses);
    const aea = Math.min(CGT.annualExemptAmount, netGain);
    const taxableGain = Math.max(0, netGain - aea);

    const paOverride = (input.personalAllowance !== undefined && input.personalAllowance !== null) ? Number(input.personalAllowance) : undefined;
    const otherPA = personalAllowanceFor(otherIncome, paOverride);
    const otherTaxable = Math.max(0, otherIncome - otherPA);
    const basicBandRemaining = Math.max(0, CGT.basicRateBand - otherTaxable);
    const atBasic = Math.min(taxableGain, basicBandRemaining);
    const atHigher = Math.max(0, taxableGain - atBasic);
    const basicTax = atBasic * CGT.basicRate;
    const higherTax = atHigher * CGT.higherRate;
    const tax = round2(basicTax + higherTax);
    const outstandingBalance = round2(Math.max(0, tax - taxAlreadyPaid));

    return {
      type: "investments",
      inputs: { gains, losses, otherIncome, taxAlreadyPaid },
      allowances: {
        annualExemptAmount: aea,
        lossesOffset: Math.min(losses, gains),
        basicBandUsed: Math.min(taxableGain, basicBandRemaining),
      },
      profit: netGain,
      taxableGain,
      breakdown: [
        {
          label: "Capital Gains Tax",
          amount: tax,
          detail: [
            { name: "Basic-rate band", amount: atBasic, rate: CGT.basicRate, tax: round2(basicTax) },
            { name: "Higher-rate band", amount: atHigher, rate: CGT.higherRate, tax: round2(higherTax) },
          ],
        },
      ],
      totalTaxDue: tax,
      taxAlreadyPaid,
      outstandingBalance,
      effectiveRate: netGain > 0 ? tax / netGain : 0,
    };
  }

  // ---- Pension optimisation (the £100k–£125,140 "60% trap") ----
  function pensionOptimisation(profit) {
    if (profit <= 100000) return { show: false };
    if (profit < 125140) {
      const contribution = round2(profit - 100000);
      const taxSaved = round2(contribution * 0.6);
      return {
        show: true,
        trap: true,
        contribution,
        taxSaved,
        netCost: round2(contribution - taxSaved),
        headline: `Make a ${formatGBP(contribution)} gross pension contribution`,
        detail: `Brings adjusted net income down to £100,000 and restores your full Personal Allowance. This slice attracts 60% income tax relief (it cuts Income Tax, not National Insurance) — saving ${formatGBP(taxSaved)} in income tax, so the net cost is ${formatGBP(contribution - taxSaved)} for ${formatGBP(contribution)} in your pension.`,
      };
    }
    return {
      show: true,
      trap: false,
      headline: "Personal Allowance fully used",
      detail: "Income above £125,140 is taxed at 45% and your Personal Allowance is gone. Pension contributions still get 45% income tax relief (not NIC) and cut your adjusted net income; bringing income back below £125,140 starts to restore the Allowance at a 60% effective rate.",
    };
  }


  // ---- VAT (2026/27) ----
  // Sources: gov.uk/how-vat-works/vat-thresholds, gov.uk/vat-rates,
  // gov.uk/vat-flat-rate-scheme/how-much-you-pay, gov.uk/vat-cash-accounting-scheme
  const VAT = {
    standardRate: 0.20,
    reducedRate: 0.05,
    zeroRate: 0,
    registerThreshold: 90000,   // rolling 12-month taxable turnover
    deregisterThreshold: 88000,
    frsJoinLimit: 150000,       // VAT turnover excl. VAT to join Flat Rate Scheme
    frsLeaveLimit: 230000,      // must leave above this
    frsLimitedCostRate: 0.165,  // limited cost business rate
    frsFirstYearDiscount: 0.01, // 1% off in first year of VAT registration
    frsCapitalAssetFloor: 2000, // can still reclaim on capital assets over this
    cashAccountingLimit: 1350000,
    approachingFraction: 0.85   // UI warning band
  };

  // Extract the VAT contained in a VAT-inclusive (gross) amount.
  function vatFromGross(gross, rate) {
    const g = Math.max(0, Number(gross) || 0);
    const r = Number(rate) || 0;
    const net = r === 0 ? g : g / (1 + r);
    return { gross: g, net: round2(net), vat: round2(g - net) };
  }

  // Add VAT to a VAT-exclusive (net) amount.
  function vatFromNet(net, rate) {
    const n = Math.max(0, Number(net) || 0);
    const r = Number(rate) || 0;
    const vat = n * r;
    return { net: n, vat: round2(vat), gross: round2(n + vat) };
  }

  // Rolling 12-month turnover vs the registration / deregistration thresholds.
  function vatThresholdStatus(turnover12m, registered) {
    const t = Math.max(0, Number(turnover12m) || 0);
    const pct = Math.min(100, (t / VAT.registerThreshold) * 100);
    const over = t > VAT.registerThreshold;
    return {
      turnover: t,
      pct: pct,
      remaining: Math.max(0, VAT.registerThreshold - t),
      overThreshold: over,
      mustRegister: over && !registered,
      approaching: !over && t >= VAT.registerThreshold * VAT.approachingFraction,
      canDeregister: !!registered && t < VAT.deregisterThreshold,
      frsEligible: t <= VAT.frsJoinLimit,
      frsMustLeave: t > VAT.frsLeaveLimit,
      cashEligible: t <= VAT.cashAccountingLimit
    };
  }

  // Standard / cash accounting: output VAT on sales less reclaimable input VAT.
  function standardSchemeVat(input) {
    const salesRate = input.salesRate == null ? VAT.standardRate : Number(input.salesRate);
    const out = input.salesAreGross
      ? vatFromGross(input.sales, salesRate)
      : vatFromNet(input.sales, salesRate);
    const inRate = input.purchaseRate == null ? VAT.standardRate : Number(input.purchaseRate);
    const inp = vatFromGross(input.purchasesGross, inRate);
    const net = round2(out.vat - inp.vat);
    return {
      scheme: input.scheme === "cash" ? "cash" : "standard",
      salesNet: out.net,
      salesGross: out.gross,
      outputVat: out.vat,
      inputVat: inp.vat,
      purchasesNet: inp.net,
      netVatDue: net > 0 ? net : 0,
      refundDue: net < 0 ? round2(-net) : 0,
      isRepayment: net < 0
    };
  }

  // Flat Rate Scheme: a fixed percentage of VAT-INCLUSIVE turnover.
  function flatRateVat(input) {
    const sector = Number(input.sectorRate) || 0;                 // e.g. 0.145
    const base = input.limitedCost ? VAT.frsLimitedCostRate : sector;
    const effective = Math.max(0, base - (input.firstYear ? VAT.frsFirstYearDiscount : 0));
    // Turnover here is VAT-inclusive (flat rate turnover).
    const grossTurnover = input.turnoverIsGross === false
      ? vatFromNet(input.turnover, VAT.standardRate).gross
      : Math.max(0, Number(input.turnover) || 0);
    const vatDue = round2(grossTurnover * effective);
    // What the same figures would cost under the standard scheme, for comparison.
    const comparison = standardSchemeVat({
      sales: grossTurnover, salesAreGross: true, salesRate: VAT.standardRate,
      purchasesGross: input.purchasesGross
    });
    return {
      scheme: "flat",
      baseRate: base,
      effectiveRate: effective,
      limitedCost: !!input.limitedCost,
      firstYear: !!input.firstYear,
      grossTurnover: round2(grossTurnover),
      netVatDue: vatDue,
      standardNetVatDue: comparison.netVatDue,
      saving: round2(comparison.netVatDue - vatDue),
      flatIsBetter: vatDue <= comparison.netVatDue
    };
  }

  // Limited cost business test: goods spend under 2% of turnover, or under
  // £1,000 a year where it exceeds 2%.
  function isLimitedCostBusiness(flatRateTurnover, goodsSpend, months) {
    const t = Math.max(0, Number(flatRateTurnover) || 0);
    const g = Math.max(0, Number(goodsSpend) || 0);
    const m = Number(months) || 12;
    const twoPct = t * 0.02;
    const cashFloor = 1000 * (m / 12);
    if (g < twoPct) return true;
    return g < cashFloor;
  }

  function calculateVat(input) {
    if (input.scheme === "flat") return flatRateVat(input);
    return standardSchemeVat(input);
  }

  function calculate(input) {
    if (input.type === "limited-company") return calculateLimitedCompanyTax(input);
    if (input.type === "investments") return calculateCGT(input);
    return calculateSoleTraderTax(input);
  }

  return {
    RATES,
    personalAllowanceFor,
    calculateIncomeTax,
    calculateClass4,
    calculateCorporationTax,
    recommendTradingAllowance,
    soleTraderProfit,
    calculateSoleTraderTax,
    calculateLimitedCompanyTax,
    calculateCGT,
    pensionOptimisation,
    calculate,
    VAT,
    vatFromGross,
    vatFromNet,
    vatThresholdStatus,
    standardSchemeVat,
    flatRateVat,
    isLimitedCostBusiness,
    calculateVat,
    formatGBP,
  };
});
