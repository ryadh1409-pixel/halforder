"use strict";

const { strict: assert } = require("assert");
const { test } = require("node:test");
const {
  trimMetadata,
  paymentIntentIdFromSession,
} = require("../lib/stripeWebhookLogic.js");
const {
  buildOrderPaidStatePatch,
  needsPaidStatusRepair,
  resolvePostPaymentOrderStatus,
  shouldBlockStripePaymentOverwrite,
} = require("../lib/orderPaidState.js");
const { isWebhookOrderWriteBlocked } = require("../lib/webhookOrderWriteGuard.js");

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

test("needsPaidStatusRepair detects split paid/status", () => {
  assert.equal(
    needsPaidStatusRepair({ paymentStatus: "paid", status: "awaiting_payment" }),
    true,
  );
  assert.equal(
    needsPaidStatusRepair({ paymentStatus: "paid", status: "payment_confirmed" }),
    false,
  );
  assert.equal(
    needsPaidStatusRepair({ paymentStatus: "unpaid", status: "awaiting_payment" }),
    false,
  );
});

test("buildOrderPaidStatePatch advances status on payment success", () => {
  const patch = buildOrderPaidStatePatch(
    { status: "awaiting_payment", paymentStatus: "unpaid" },
    { paymentIntentId: "pi_abc", stripeWebhookLastEventType: "payment_intent.succeeded" },
  );
  assert.equal(patch.paymentStatus, "paid");
  assert.equal(patch.status, "payment_confirmed");
  assert.equal(patch.deliveryStatus, "pending");
  assert.equal(patch.paymentIntentId, "pi_abc");
});

test("buildOrderPaidStatePatch repairOnly preserves drivers", () => {
  const patch = buildOrderPaidStatePatch(
    {
      status: "awaiting_payment",
      paymentStatus: "paid",
      driverId: "drv1",
    },
    { repairOnly: true },
  );
  assert.equal(patch.status, "payment_confirmed");
  assert.equal("driverId" in patch, false);
});

test("buildOrderPaidStatePatch skips fulfillment when driver_assigned", () => {
  const patch = buildOrderPaidStatePatch(
    {
      paymentStatus: "unpaid",
      status: "payment_confirmed",
      deliveryStatus: "driver_assigned",
      driverId: "drv1",
    },
    { paymentIntentId: "pi_test" },
  );
  assert.equal(patch.paymentStatus, "paid");
  assert.equal(patch.status, undefined);
  assert.equal(patch.deliveryStatus, undefined);
  assert.equal("driverId" in patch, false);
});

test("buildOrderPaidStatePatch skips fulfillment when delivered", () => {
  const patch = buildOrderPaidStatePatch(
    {
      paymentStatus: "unpaid",
      status: "payment_confirmed",
      deliveryStatus: "delivered",
    },
    { paymentIntentId: "pi_test" },
  );
  assert.equal(patch.paymentStatus, "paid");
  assert.equal(patch.status, undefined);
  assert.equal(patch.deliveryStatus, undefined);
});

test("isWebhookOrderWriteBlocked logs [STRIPE BLOCKED] and blocks fulfilled rows", () => {
  const spy = console.log;
  let blockedLog = null;
  console.log = (...args) => {
    if (args[0] === "[STRIPE BLOCKED]") blockedLog = args;
  };
  try {
    assert.equal(
      isWebhookOrderWriteBlocked("o1", {
        status: "completed",
        deliveryStatus: "delivered",
      }),
      true,
    );
    assert.deepEqual(blockedLog, ["[STRIPE BLOCKED]", "o1", "completed", "delivered"]);
  } finally {
    console.log = spy;
  }
});

test("isWebhookOrderWriteBlocked blocks completed and driver_assigned", () => {
  assert.equal(
    isWebhookOrderWriteBlocked("o1", {
      status: "completed",
      deliveryStatus: "delivered",
    }),
    true,
  );
  assert.equal(
    isWebhookOrderWriteBlocked("o2", {
      status: "payment_confirmed",
      deliveryStatus: "driver_assigned",
    }),
    true,
  );
  assert.equal(
    isWebhookOrderWriteBlocked("o3", {
      status: "awaiting_payment",
      deliveryStatus: "pending",
    }),
    false,
  );
});

test("shouldBlockStripePaymentOverwrite blocks completed and driver_assigned", () => {
  assert.equal(
    shouldBlockStripePaymentOverwrite({
      status: "completed",
      deliveryStatus: "delivered",
      earningsRecorded: true,
    }),
    true,
  );
  assert.equal(
    shouldBlockStripePaymentOverwrite({
      status: "payment_confirmed",
      deliveryStatus: "driver_assigned",
    }),
    true,
  );
  assert.equal(
    shouldBlockStripePaymentOverwrite({
      status: "awaiting_payment",
      deliveryStatus: "pending",
    }),
    false,
  );
});

test("resolvePostPaymentOrderStatus keeps active fulfillment", () => {
  assert.equal(resolvePostPaymentOrderStatus({ status: "preparing" }), "preparing");
  assert.equal(
    resolvePostPaymentOrderStatus({ status: "awaiting_payment" }),
    "payment_confirmed",
  );
});
