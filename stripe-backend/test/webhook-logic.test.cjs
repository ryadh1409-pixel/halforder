"use strict";

const { strict: assert } = require("assert");
const { test } = require("node:test");
const {
  trimMetadata,
  paymentIntentIdFromSession,
} = require("../lib/stripeWebhookLogic.js");

test("trimMetadata trims and rejects empty", () => {
  assert.equal(trimMetadata("  abc  "), "abc");
  assert.equal(trimMetadata(""), null);
  assert.equal(trimMetadata(null), null);
});

test("paymentIntentIdFromSession resolves expanded object or string", () => {
  assert.equal(paymentIntentIdFromSession({ payment_intent: "pi_123" }), "pi_123");
  assert.equal(paymentIntentIdFromSession({ payment_intent: { id: "pi_obj" } }), "pi_obj");
  assert.equal(paymentIntentIdFromSession({}), null);
});
