"use strict";

const {strict: assert} = require("assert");
const {test} = require("node:test");
const {
  buildFoodShareDispatchOrderPayload,
  resolveFoodSharePricing,
  resolvePickupDropoffUserIds,
} = require("../lib/foodShareDispatchOrder.js");
const {
  buildFoodShareMatchLifecyclePatch,
  lifecycleFromFoodShareOrder,
} = require("../lib/foodShareOrderLifecycleMirror.js");

test("buildFoodShareDispatchOrderPayload matches driver pool requirements", () => {
  const match = {
    foodName: "Burger Duo",
    restaurantName: "Test Kitchen",
    adminFoodShareId: "share_7",
    costBreakdown: {sharedPrice: 12, deliveryShare: 4},
    userA: {uid: "user_a", firstName: "Alex"},
    userB: {uid: "user_b", firstName: "Blake"},
  };
  const users = ["user_a", "user_b"];
  const pricing = resolveFoodSharePricing(match);
  const context = {
    share: {
      foodName: "Burger Duo",
      image: "https://example.com/burger.jpg",
      restaurantName: "Test Kitchen",
      pickupAddress: "123 Main St",
      venueLocation: "123 Main St",
      sharedPrice: 12,
      deliveryShare: 4,
    },
    usersById: {
      user_a: {
        deliveryLocation: {
          address: "10 Oak Ave",
          lat: 45.1,
          lng: -75.1,
        },
        phone: "+1 555 111 1111",
      },
      user_b: {
        homeLocation: {
          formattedAddress: "20 Pine Rd",
          latitude: 45.2,
          longitude: -75.2,
        },
        phone: "+1 555 222 2222",
      },
    },
    pickupUserId: "user_a",
    dropoffUserId: "user_b",
  };
  const payload = buildFoodShareDispatchOrderPayload(
    "match_abc",
    match,
    users,
    pricing,
    context,
  );

  assert.equal(payload.orderId, "match_abc");
  assert.equal(payload.matchId, "match_abc");
  assert.equal(payload.userId, "user_b");
  assert.equal(payload.customerId, "user_b");
  assert.equal(payload.restaurantId, "share_7");
  assert.equal(payload.deliveryType, "delivery");
  assert.equal(payload.paymentStatus, "paid");
  assert.equal(payload.status, "payment_confirmed");
  assert.equal(payload.deliveryStatus, "pending");
  assert.equal(payload.totalPrice, 16);
  assert.equal(payload.restaurantAddress, "123 Main St");
  assert.equal(payload.pickupUserId, "user_a");
  assert.equal(payload.pickupName, "Alex");
  assert.equal(payload.pickupPhone, "+1 555 111 1111");
  assert.equal(payload.pickupAddress, "123 Main St");
  assert.equal(payload.pickupLat, 45.1);
  assert.equal(payload.pickupLng, -75.1);
  assert.equal(payload.dropoffUserId, "user_b");
  assert.equal(payload.dropoffName, "Blake");
  assert.equal(payload.dropoffPhone, "+1 555 222 2222");
  assert.equal(payload.dropoffAddress, "20 Pine Rd");
  assert.equal(payload.dropoffLat, 45.2);
  assert.equal(payload.dropoffLng, -75.2);
  assert.equal(payload.deliveryAddress, "20 Pine Rd");
  assert.equal(payload.address, "20 Pine Rd");
  assert.equal(payload.lat, 45.2);
  assert.equal(payload.lng, -75.2);
  assert.equal(payload.customerPhone, "+1 555 222 2222");
  assert.deepEqual(payload.items, [
    {
      name: "Burger Duo",
      title: "Burger Duo",
      quantity: 2,
      qty: 2,
      image: "https://example.com/burger.jpg",
      price: 12,
    },
  ]);
});

test("resolvePickupDropoffUserIds prefers earlier matchRequest", () => {
  const ids = resolvePickupDropoffUserIds(["user_a", "user_b"], {
    user_a: {createdAt: {_seconds: 200}},
    user_b: {createdAt: {_seconds: 100}},
  });
  assert.equal(ids.pickupUserId, "user_b");
  assert.equal(ids.dropoffUserId, "user_a");
});

test("resolveFoodSharePricing prefers adminFoodShares fields", () => {
  const pricing = resolveFoodSharePricing(
    {},
    {sharedPrice: 9.5, deliveryShare: 2.5},
  );
  assert.equal(pricing.sharedPrice, 9.5);
  assert.equal(pricing.deliveryShare, 2.5);
});

test("lifecycleFromFoodShareOrder maps driver fulfillment statuses", () => {
  assert.equal(
    lifecycleFromFoodShareOrder({status: "driver_assigned"}),
    "DRIVER_ASSIGNED",
  );
  assert.equal(
    lifecycleFromFoodShareOrder({deliveryStatus: "driver_assigned"}),
    "DRIVER_ASSIGNED",
  );
  assert.equal(
    lifecycleFromFoodShareOrder({deliveryStatus: "picked_up"}),
    "PICKED_UP",
  );
  assert.equal(
    lifecycleFromFoodShareOrder({deliveryStatus: "delivered"}),
    "DELIVERED",
  );
  assert.equal(
    lifecycleFromFoodShareOrder({status: "delivered"}),
    "DELIVERED",
  );
  assert.equal(
    lifecycleFromFoodShareOrder({status: "cancelled"}),
    "CANCELLED",
  );
  assert.equal(
    lifecycleFromFoodShareOrder({deliveryStatus: "cancelled"}),
    "CANCELLED",
  );
  assert.equal(
    lifecycleFromFoodShareOrder({status: "completed"}),
    "COMPLETED",
  );
});

test("buildFoodShareMatchLifecyclePatch mirrors order fields without downgrades", () => {
  const assignedPatch = buildFoodShareMatchLifecyclePatch(
    {
      matchId: "match_abc",
      status: "driver_assigned",
      deliveryStatus: "driver_assigned",
      driverId: "drv1",
      assignedDriverId: "drv1",
    },
    {lifecycle: "ORDER_PLACED", deliveryStatus: "pending"},
  );
  assert.equal(assignedPatch.lifecycle, "DRIVER_ASSIGNED");
  assert.equal(assignedPatch.driverId, "drv1");
  assert.equal(assignedPatch.assignedDriverId, "drv1");
  assert.equal(assignedPatch.orderStatus, "driver_assigned");
  assert.equal(assignedPatch.deliveryStatus, "driver_assigned");

  const noDowngradePatch = buildFoodShareMatchLifecyclePatch(
    {status: "driver_assigned", deliveryStatus: "driver_assigned"},
    {lifecycle: "COMPLETED"},
  );
  assert.equal(noDowngradePatch, null);

  const deliveredPatch = buildFoodShareMatchLifecyclePatch(
    {deliveryStatus: "delivered"},
    {lifecycle: "PICKED_UP"},
  );
  assert.equal(deliveredPatch.lifecycle, "DELIVERED");
  assert.equal(deliveredPatch.deliveryStatus, "delivered");

  const completedPatch = buildFoodShareMatchLifecyclePatch(
    {status: "completed", deliveryStatus: "delivered"},
    {lifecycle: "DELIVERED"},
  );
  assert.equal(completedPatch.lifecycle, "COMPLETED");
  assert.equal(completedPatch.deliveryStatus, "delivered");
  assert.ok(completedPatch.completedAt);

  const cancelledPatch = buildFoodShareMatchLifecyclePatch(
    {status: "cancelled", deliveryStatus: "cancelled"},
    {lifecycle: "DRIVER_ASSIGNED"},
  );
  assert.equal(cancelledPatch.lifecycle, "CANCELLED");
  assert.equal(cancelledPatch.deliveryStatus, "cancelled");
  assert.ok(cancelledPatch.cancelledAt);
});
