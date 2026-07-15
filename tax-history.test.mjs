import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeFilings,
  taxPaidForFiling,
  withTaxPaid,
} from "./tax-history.mjs";

test("uses the recorded payment amount when tax_due is available", () => {
  assert.deepEqual(
    taxPaidForFiling({ status: "paid", revenue: 1000, tax_due: 61.23 }),
    { taxPaid: 61.23, source: "recorded" }
  );
});

test("derives the net 5.7% remittance for older paid rows", () => {
  assert.deepEqual(
    taxPaidForFiling({ status: "paid", revenue: 11720.81, tax_due: null }),
    { taxPaid: 668.09, source: "derived" }
  );
});

test("does not present revenue as a payment for unpaid rows", () => {
  assert.deepEqual(
    taxPaidForFiling({ status: "skipped", revenue: 3716.85, tax_due: 0 }),
    { taxPaid: null, source: "unavailable" }
  );
});

test("adds payment metadata without replacing filing fields", () => {
  assert.deepEqual(
    withTaxPaid({ id: 92, status: "paid", revenue: 100, tax_due: null }),
    {
      id: 92,
      status: "paid",
      revenue: 100,
      tax_due: null,
      tax_paid: 5.7,
      tax_paid_source: "derived",
    }
  );
});

test("summarizes paid tax instead of gross revenue", () => {
  assert.deepEqual(
    summarizeFilings([
      { status: "paid", revenue: 1000, tax_due: 57 },
      { status: "paid", revenue: 500, tax_due: null },
      { status: "skipped", revenue: 900, tax_due: 0 },
    ]),
    {
      paidCount: 2,
      totalCount: 3,
      taxPaid: 85.5,
      hasDerivedAmounts: true,
    }
  );
});
