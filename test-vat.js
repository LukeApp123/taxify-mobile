// TaxMate — VAT engine unit tests. Run: node test-vat.js
const T = require("./tax.js");

let pass = 0, fail = 0;
function eq(label, got, want, tol) {
  tol = tol == null ? 0.01 : tol;
  const ok = typeof want === "number" ? Math.abs(got - want) <= tol : got === want;
  if (ok) { pass++; console.log("  PASS  " + label); }
  else { fail++; console.log("  FAIL  " + label + "\n        got " + JSON.stringify(got) + " want " + JSON.stringify(want)); }
}

console.log("\nVAT rates & thresholds (gov.uk)");
eq("standard rate 20%", T.VAT.standardRate, 0.2);
eq("reduced rate 5%", T.VAT.reducedRate, 0.05);
eq("registration threshold £90,000", T.VAT.registerThreshold, 90000);
eq("deregistration threshold £88,000", T.VAT.deregisterThreshold, 88000);
eq("FRS join limit £150,000", T.VAT.frsJoinLimit, 150000);
eq("FRS leave limit £230,000", T.VAT.frsLeaveLimit, 230000);
eq("limited cost rate 16.5%", T.VAT.frsLimitedCostRate, 0.165);
eq("cash accounting limit £1.35m", T.VAT.cashAccountingLimit, 1350000);

console.log("\nVAT extraction — gov.uk worked examples");
// gov.uk/reclaim-vat: £180 inc 20% VAT -> net £150, VAT £30
eq("£180 inc 20% -> net £150", T.vatFromGross(180, 0.2).net, 150);
eq("£180 inc 20% -> VAT £30", T.vatFromGross(180, 0.2).vat, 30);
// gov.uk: £483 inc 5% VAT -> net £460, VAT £23
eq("£483 inc 5% -> net £460", T.vatFromGross(483, 0.05).net, 460);
eq("£483 inc 5% -> VAT £23", T.vatFromGross(483, 0.05).vat, 23);
eq("zero rate extracts nothing", T.vatFromGross(500, 0).vat, 0);
eq("£1,000 net + 20% -> gross £1,200", T.vatFromNet(1000, 0.2).gross, 1200);
eq("£1,000 net + 20% -> VAT £200", T.vatFromNet(1000, 0.2).vat, 200);

console.log("\nThreshold status");
let s = T.vatThresholdStatus(60000, false);
eq("£60k not over threshold", s.overThreshold, false);
eq("£60k must not register", s.mustRegister, false);
eq("£60k remaining £30,000", s.remaining, 30000);
eq("£60k is 66.7% of threshold", s.pct, 66.67, 0.02);
eq("£60k FRS eligible", s.frsEligible, true);

s = T.vatThresholdStatus(95000, false);
eq("£95k over threshold", s.overThreshold, true);
eq("£95k must register", s.mustRegister, true);
eq("£95k pct capped at 100", s.pct, 100);

s = T.vatThresholdStatus(95000, true);
eq("£95k already registered -> no must-register", s.mustRegister, false);

s = T.vatThresholdStatus(80000, false);
eq("£80k approaching (>=85%)", s.approaching, true);

s = T.vatThresholdStatus(70000, false);
eq("£70k not yet approaching", s.approaching, false);

s = T.vatThresholdStatus(80000, true);
eq("registered at £80k can deregister (<£88k)", s.canDeregister, true);
s = T.vatThresholdStatus(89000, true);
eq("registered at £89k cannot deregister", s.canDeregister, false);
s = T.vatThresholdStatus(240000, true);
eq("£240k must leave FRS (>£230k)", s.frsMustLeave, true);
s = T.vatThresholdStatus(1400000, true);
eq("£1.4m not cash-accounting eligible", s.cashEligible, false);

console.log("\nStandard scheme");
// £50,000 net sales @20% = £10,000 output VAT.
// £12,000 gross purchases @20% = £2,000 input VAT. Net due £8,000.
let r = T.standardSchemeVat({ sales: 50000, salesAreGross: false, salesRate: 0.2, purchasesGross: 12000 });
eq("output VAT £10,000", r.outputVat, 10000);
eq("input VAT £2,000", r.inputVat, 2000);
eq("net VAT due £8,000", r.netVatDue, 8000);
eq("not a repayment", r.isRepayment, false);
eq("sales gross £60,000", r.salesGross, 60000);

// Gross sales entry: £60,000 inc VAT -> £10,000 output VAT (same answer)
r = T.standardSchemeVat({ sales: 60000, salesAreGross: true, salesRate: 0.2, purchasesGross: 12000 });
eq("gross entry gives same output VAT", r.outputVat, 10000);
eq("gross entry net sales £50,000", r.salesNet, 50000);

// Repayment case: input VAT exceeds output VAT
r = T.standardSchemeVat({ sales: 1000, salesAreGross: false, salesRate: 0.2, purchasesGross: 12000 });
eq("repayment flagged", r.isRepayment, true);
eq("refund due £1,800", r.refundDue, 1800);
eq("net due clamped to 0", r.netVatDue, 0);

// Zero-rated sales still allow input VAT reclaim (repayment position)
r = T.standardSchemeVat({ sales: 50000, salesAreGross: false, salesRate: 0, purchasesGross: 6000 });
eq("zero-rated sales -> no output VAT", r.outputVat, 0);
eq("zero-rated sales still reclaim £1,000", r.inputVat, 1000);
eq("zero-rated -> repayment", r.isRepayment, true);

console.log("\nFlat Rate Scheme");
// IT consultancy 14.5% on £60,000 VAT-inclusive turnover = £8,700
r = T.flatRateVat({ turnover: 60000, turnoverIsGross: true, sectorRate: 0.145, purchasesGross: 12000 });
eq("effective rate 14.5%", r.effectiveRate, 0.145);
eq("flat rate VAT due £8,700", r.netVatDue, 8700);
eq("standard comparison £8,000", r.standardNetVatDue, 8000);
eq("standard is better here", r.flatIsBetter, false);
eq("saving is negative £700", r.saving, -700);

// First-year 1% discount -> 13.5%
r = T.flatRateVat({ turnover: 60000, turnoverIsGross: true, sectorRate: 0.145, firstYear: true, purchasesGross: 12000 });
eq("first year effective 13.5%", r.effectiveRate, 0.135);
eq("first year VAT due £8,100", r.netVatDue, 8100);

// Limited cost business -> 16.5% regardless of sector
r = T.flatRateVat({ turnover: 60000, turnoverIsGross: true, sectorRate: 0.04, limitedCost: true, purchasesGross: 0 });
eq("limited cost overrides sector -> 16.5%", r.effectiveRate, 0.165);
eq("limited cost VAT due £9,900", r.netVatDue, 9900);

// Limited cost + first year -> 15.5%
r = T.flatRateVat({ turnover: 60000, turnoverIsGross: true, sectorRate: 0.04, limitedCost: true, firstYear: true });
eq("limited cost + first year -> 15.5%", r.effectiveRate, 0.155);

// Low-cost sector where flat rate wins: retailing food 4% on £60,000 = £2,400
r = T.flatRateVat({ turnover: 60000, turnoverIsGross: true, sectorRate: 0.04, purchasesGross: 12000 });
eq("retail food 4% -> £2,400", r.netVatDue, 2400);
eq("flat rate is better here", r.flatIsBetter, true);
eq("saving £5,600", r.saving, 5600);

// Net turnover entry is grossed up at 20% first
r = T.flatRateVat({ turnover: 50000, turnoverIsGross: false, sectorRate: 0.145 });
eq("net £50k grossed to £60k", r.grossTurnover, 60000);
eq("net entry -> £8,700 due", r.netVatDue, 8700);

console.log("\nLimited cost business test");
// Goods £500 on £60,000 turnover = 0.83% (< 2%) -> limited cost
eq("goods under 2% -> limited cost", T.isLimitedCostBusiness(60000, 500, 12), true);
// Goods £2,000 on £60,000 = 3.3% (>2%) and over £1,000 -> not limited cost
eq("goods over 2% and over £1,000 -> not limited cost", T.isLimitedCostBusiness(60000, 2000, 12), false);
// Goods £900 on £20,000 = 4.5% (>2%) but under £1,000 -> limited cost
eq("over 2% but under £1,000 -> limited cost", T.isLimitedCostBusiness(20000, 900, 12), true);
// Quarterly: £1,000 floor prorates to £250
eq("quarterly floor prorates", T.isLimitedCostBusiness(5000, 200, 3), true);

console.log("\ncalculateVat router");
eq("router -> flat", T.calculateVat({ scheme: "flat", turnover: 60000, turnoverIsGross: true, sectorRate: 0.145 }).scheme, "flat");
eq("router -> standard", T.calculateVat({ scheme: "standard", sales: 1000, salesRate: 0.2 }).scheme, "standard");
eq("router -> cash", T.calculateVat({ scheme: "cash", sales: 1000, salesRate: 0.2 }).scheme, "cash");

console.log("\nEdge cases");
eq("negative sales clamped", T.standardSchemeVat({ sales: -500, salesRate: 0.2, purchasesGross: 0 }).outputVat, 0);
eq("blank input safe", T.standardSchemeVat({}).netVatDue, 0);
eq("blank flat rate safe", T.flatRateVat({}).netVatDue, 0);
eq("zero turnover threshold safe", T.vatThresholdStatus(0, false).pct, 0);

console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
