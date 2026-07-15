export const CLACKAMAS_NET_TAX_RATE = 0.057;

const roundCurrency = (value) => Math.round(value * 100) / 100;

export function taxPaidForFiling(filing) {
  if (filing.status !== "paid") {
    return { taxPaid: null, source: "unavailable" };
  }

  if (filing.tax_due !== null && filing.tax_due !== undefined) {
    const recorded = Number(filing.tax_due);
    if (Number.isFinite(recorded)) {
      return { taxPaid: roundCurrency(recorded), source: "recorded" };
    }
  }

  const revenue = Number(filing.revenue);
  if (!Number.isFinite(revenue)) {
    return { taxPaid: null, source: "unavailable" };
  }

  return {
    taxPaid: roundCurrency(revenue * CLACKAMAS_NET_TAX_RATE),
    source: "derived",
  };
}

export function withTaxPaid(filing) {
  const { taxPaid, source } = taxPaidForFiling(filing);
  return {
    ...filing,
    tax_paid: taxPaid,
    tax_paid_source: source,
  };
}

export function summarizeFilings(filings) {
  const paid = filings.map(withTaxPaid).filter((filing) => filing.status === "paid");
  return {
    paidCount: paid.length,
    totalCount: filings.length,
    taxPaid: roundCurrency(
      paid.reduce((total, filing) => total + (filing.tax_paid ?? 0), 0)
    ),
    hasDerivedAmounts: paid.some(
      (filing) => filing.tax_paid_source === "derived"
    ),
  };
}
