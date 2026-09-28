import test from "node:test";
import assert from "node:assert/strict";
import { formatSkrBaseUnits, parsePositiveIntegerSkr, SKR_DECIMALS, SKR_MINT } from "../packages/core/payment.mjs";

test("uses the canonical SKR Mint", () => {
  assert.equal(SKR_MINT, "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3");
});

test("converts whole SKR with integer arithmetic", () => {
  assert.equal(parsePositiveIntegerSkr("10"), 10n * 10n ** BigInt(SKR_DECIMALS));
  assert.equal(formatSkrBaseUnits(parsePositiveIntegerSkr(100)), "100");
});

test("rejects fractional, zero, negative, and unsafe price input", () => {
  for (const value of ["9.5", "0", "-1", "1e3", " 10", NaN]) {
    assert.throws(() => parsePositiveIntegerSkr(value));
  }
});

test("does not format fractional base units as whole SKR", () => {
  assert.throws(() => formatSkrBaseUnits(1n));
});

