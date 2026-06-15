/**
 * End-to-end verify + repair food-share dispatch for Driver Hub.
 * Usage: npx tsx stripe-backend/scripts/verifyAndRepairFoodShareDispatch.ts <matchId>
 */
import * as admin from "firebase-admin";
import { UserRefreshClient } from "google-auth-library";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  backfillFoodShareDispatchOrderIfNeeded,
  buildFoodShareDispatchOrderPayload,
  resolveFoodSharePricing,
  resolvePickupDropoffUserIds,
} from "../src/foodShareDispatchOrder.js";

const MATCH_ID =
  process.argv[2]?.trim() ||
  "1_Gjj6x4OU40Qmsnplollo9PLLpxt2_mIV6OpL6OHPeBN9EXLyamuEBTGA3";
const PROJECT_ID = "halforfer";

const FIREBASE_CLIENT_ID =
  "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e.apps.googleusercontent.com";

type StepEvidence = Record<string, unknown>;

function loadRefreshToken(): string {
  const configPath = path.join(
    process.env.HOME ?? "",
    ".config/configstore/firebase-tools.json",
  );
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
    tokens?: { refresh_token?: string };
  };
  const token = raw.tokens?.refresh_token?.trim();
  if (!token) throw new Error("No firebase-tools refresh_token — run: firebase login");
  return token;
}

async function initAdmin(): Promise<void> {
  if (admin.apps.length) return;
  const refreshToken = loadRefreshToken();
  const auth = new UserRefreshClient(
    FIREBASE_CLIENT_ID,
    FIREBASE_CLIENT_SECRET,
    refreshToken,
  );
  const access = await auth.getAccessToken();
  if (!access.token) throw new Error("Could not obtain Google access token");
  admin.initializeApp({
    projectId: PROJECT_ID,
    credential: admin.credential.cert({
      projectId: PROJECT_ID,
      clientEmail: `firebase-adminsdk-verifier@${PROJECT_ID}.iam.gserviceaccount.com`,
      privateKey: "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA000000000000000000000000000000000000000000000000\n-----END RSA PRIVATE KEY-----\n",
    } as admin.ServiceAccount),
  });
}

async function initAdminViaApplicationDefault(): Promise<boolean> {
  try {
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: PROJECT_ID });
    }
    await admin.firestore().doc("matches/ping").get();
    return true;
  } catch {
    return false;
  }
}

async function ensureAdmin(): Promise<void> {
  if (await initAdminViaApplicationDefault()) return;
  const refreshToken = loadRefreshToken();
  process.env.GOOGLE_OAUTH_ACCESS_TOKEN = (
    await new UserRefreshClient(
      FIREBASE_CLIENT_ID,
      FIREBASE_CLIENT_SECRET,
      refreshToken,
    ).getAccessToken()
  ).token ?? "";
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: PROJECT_ID,
      credential: admin.credential.applicationDefault(),
    });
  }
}

function isPaid(value: unknown): boolean {
  return String(value ?? "").trim().toUpperCase() === "PAID";
}

function norm(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hasDriver(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function poolPublishEligible(data: Record<string, unknown>): {
  eligible: boolean;
  rejectReason: string | null;
} {
  if (data.deliveryType !== "delivery") return {eligible: false, rejectReason: "not_delivery"};
  const ps = norm(data.paymentStatus);
  if (ps !== "paid" && ps !== "succeeded" && ps !== "complete") {
    return {eligible: false, rejectReason: `not_paid:${data.paymentStatus}`};
  }
  if (hasDriver(data.driverId) || hasDriver(data.assignedDriverId)) {
    return {eligible: false, rejectReason: "driver_assigned"};
  }
  if (data.marketplaceArchived === true || data.expired === true) {
    return {eligible: false, rejectReason: "archived_or_expired"};
  }
  const ds = norm(data.deliveryStatus);
  const allowed = new Set([
    "pending",
    "accepted",
    "preparing",
    "ready_for_pickup",
    "waiting_driver",
    "ready",
    "accepted_for_delivery",
    "pending_driver",
  ]);
  if (!allowed.has(ds) && !["", "pending"].includes(ds)) {
    return {eligible: false, rejectReason: `courier_not_visible:${ds}`};
  }
  const kitchen = norm(data.status);
  if (["cancelled", "rejected", "delivered", "completed"].includes(kitchen)) {
    return {eligible: false, rejectReason: `kitchen_terminal:${kitchen}`};
  }
  return {eligible: true, rejectReason: null};
}

function driverHubEligible(
  raw: Record<string, unknown>,
  orderId: string,
  extra?: { stale?: boolean; terminal?: boolean },
): { visible: boolean; reason: string | null } {
  if (hasDriver(raw.driverId)) return {visible: false, reason: "driver_id_set"};
  if (hasDriver(raw.assignedDriverId)) {
    return {visible: false, reason: "assigned_driver_id_set"};
  }
  const status = norm(raw.status);
  const deliveryStatus = norm(raw.deliveryStatus);
  if (status === "driver_assigned" || deliveryStatus === "driver_assigned") {
    return {visible: false, reason: "driver_assigned_status"};
  }
  if (status === "picked_up" || deliveryStatus === "picked_up") {
    return {visible: false, reason: "picked_up_status"};
  }
  if (status === "delivered" || deliveryStatus === "delivered") {
    return {visible: false, reason: "delivered_status"};
  }
  if (extra?.stale) return {visible: false, reason: "pool_row_stale"};
  if (extra?.terminal) return {visible: false, reason: "terminal_marketplace_order"};
  return {visible: true, reason: null};
}

function isPoolStale(createdAt: unknown): boolean {
  if (!createdAt) return false;
  let ms: number | null = null;
  if (createdAt instanceof Date) ms = createdAt.getTime();
  else if (
    typeof createdAt === "object" &&
    createdAt !== null &&
    "toDate" in createdAt &&
    typeof (createdAt as { toDate: () => Date }).toDate === "function"
  ) {
    ms = (createdAt as { toDate: () => Date }).toDate().getTime();
  } else if (
    typeof createdAt === "object" &&
    createdAt !== null &&
    "_seconds" in createdAt
  ) {
    ms = Number((createdAt as { _seconds: number })._seconds) * 1000;
  }
  if (ms == null) return false;
  return Date.now() - ms > 24 * 60 * 60 * 1000;
}

function isTerminal(raw: Record<string, unknown>): boolean {
  const kitchen = norm(raw.status);
  if (["cancelled", "rejected", "expired"].includes(kitchen)) return true;
  const ds = norm(raw.deliveryStatus);
  if (["delivered", "cancelled", "completed"].includes(ds)) return true;
  if (raw.expired === true || raw.marketplaceArchived === true) return true;
  return false;
}

async function firestoreRestGet(docPath: string, token: string): Promise<Record<string, unknown> | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET ${docPath}: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { fields?: Record<string, unknown> };
  return body.fields ?? null;
}

async function getAccessToken(): Promise<string> {
  const configPath = path.join(
    process.env.HOME ?? "",
    ".config/configstore/firebase-tools.json",
  );
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
    tokens?: {
      access_token?: string;
      expires_at?: number;
      refresh_token?: string;
    };
  };
  const now = Date.now();
  if (
    raw.tokens?.access_token &&
    typeof raw.tokens.expires_at === "number" &&
    raw.tokens.expires_at > now + 60_000
  ) {
    return raw.tokens.access_token;
  }
  const refreshToken = raw.tokens?.refresh_token?.trim();
  if (!refreshToken) throw new Error("No firebase-tools tokens — run: firebase login");
  const auth = new UserRefreshClient(
    FIREBASE_CLIENT_ID,
    undefined,
    refreshToken,
  );
  const access = await auth.getAccessToken();
  if (!access.token) throw new Error("No access token after refresh");
  return access.token;
}

function decodeFirestoreValue(v: unknown): unknown {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if ("stringValue" in o) return o.stringValue;
  if ("booleanValue" in o) return o.booleanValue;
  if ("nullValue" in o) return null;
  if ("integerValue" in o) return Number(o.integerValue);
  if ("doubleValue" in o) return o.doubleValue;
  if ("timestampValue" in o) return o.timestampValue;
  if ("mapValue" in o) {
    const fields = (o.mapValue as { fields?: Record<string, unknown> })?.fields ?? {};
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(fields)) out[k] = decodeFirestoreValue(val);
    return out;
  }
  if ("arrayValue" in o) {
    const values = (o.arrayValue as { values?: unknown[] })?.values ?? [];
    return values.map(decodeFirestoreValue);
  }
  return null;
}

function decodeFirestoreDoc(fields: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!fields) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeFirestoreValue(v);
  return out;
}

async function restReadDoc(collection: string, id: string): Promise<Record<string, unknown> | null> {
  const token = await getAccessToken();
  const fields = await firestoreRestGet(`${collection}/${id}`, token);
  return decodeFirestoreDoc(fields);
}

function encodeFirestoreValue(v: unknown): Record<string, unknown> {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  }
  if (Array.isArray(v)) {
    return {
      arrayValue: {
        values: v.map((item) => encodeFirestoreValue(item)),
      },
    };
  }
  if (typeof v === "object" && v !== null) {
    const fields: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      fields[k] = encodeFirestoreValue(val);
    }
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

async function restPatchDoc(
  collection: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const token = await getAccessToken();
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    fields[k] = encodeFirestoreValue(v);
  }
  const mask = Object.keys(data)
    .map((k) => `updateMask.fieldPaths=${k}`)
    .join("&");
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${id}?${mask}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore PATCH ${collection}/${id}: ${res.status} ${await res.text()}`);
}

async function runWithAdmin<T>(fn: () => Promise<T>): Promise<T> {
  try {
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: PROJECT_ID });
    }
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/Could not load the default credentials|UNAUTHENTICATED|PERMISSION_DENIED/i.test(msg)) {
      throw e;
    }
    throw new Error(
      `Admin SDK auth failed (${msg}). Use REST fallback or run: gcloud auth application-default login`,
    );
  }
}

async function repairOrderFields(orderId: string, issues: string[]): Promise<void> {
  const patch: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (issues.some((i) => i.includes("not_delivery"))) patch.deliveryType = "delivery";
  if (issues.some((i) => i.includes("not_paid"))) patch.paymentStatus = "paid";
  if (issues.some((i) => i.includes("courier"))) patch.deliveryStatus = "pending";
  if (issues.some((i) => i.includes("driver"))) {
    patch.driverId = null;
    patch.assignedDriverId = null;
  }
  if (issues.some((i) => i.includes("archived") || i.includes("expired"))) {
    patch.expired = false;
    patch.marketplaceArchived = false;
  }
  if (issues.some((i) => i.includes("kitchen"))) patch.status = "payment_confirmed";

  console.log("[REPAIR] patching orders/" + orderId, patch);
  await restPatchDoc("orders", orderId, patch);
}

async function buildRestOrderPayload(
  match: Record<string, unknown>,
  matchId: string,
): Promise<Record<string, unknown>> {
  const users = Array.isArray(match.users)
    ? (match.users as string[]).filter((u) => typeof u === "string")
    : [];
  const adminFoodShareId =
    typeof match.adminFoodShareId === "string" ? match.adminFoodShareId : "";
  const share = adminFoodShareId
    ? await restReadDoc("adminFoodShares", adminFoodShareId)
    : null;
  const usersById: Record<string, Record<string, unknown>> = {};
  const requestsById: Record<string, Record<string, unknown> | null> = {};
  for (const uid of users) {
    usersById[uid] = (await restReadDoc("users", uid)) ?? {};
    if (adminFoodShareId) {
      requestsById[uid] = await restReadDoc("matchRequests", `${adminFoodShareId}_${uid}`);
    }
  }
  const { pickupUserId, dropoffUserId } = resolvePickupDropoffUserIds(users, requestsById);
  const pricing = resolveFoodSharePricing(match, share);
  return buildFoodShareDispatchOrderPayload(matchId, match, users, pricing, {
    share,
    usersById,
    pickupUserId,
    dropoffUserId,
  });
}

async function writePoolFromOrder(orderId: string, order: Record<string, unknown>): Promise<void> {
  const poolDoc = {
    orderId,
    status: order.status ?? "payment_confirmed",
    deliveryType: "delivery",
    deliveryStatus: order.deliveryStatus ?? "pending",
    paymentStatus: "paid",
    expired: false,
    marketplaceArchived: false,
    driverId: null,
    assignedDriverId: null,
    restaurantId: order.restaurantId ?? order.adminFoodShareId ?? null,
    restaurantName: order.restaurantName ?? "Restaurant",
    restaurantAddress: order.restaurantAddress ?? null,
    customerPhone: order.customerPhone ?? order.customerPhoneNumber ?? null,
    deliveryAddress: order.deliveryAddress ?? null,
    pickupUserId: order.pickupUserId ?? null,
    pickupName: order.pickupName ?? null,
    pickupPhone: order.pickupPhone ?? null,
    pickupAddress: order.pickupAddress ?? null,
    pickupLat: order.pickupLat ?? null,
    pickupLng: order.pickupLng ?? null,
    dropoffUserId: order.dropoffUserId ?? null,
    dropoffName: order.dropoffName ?? null,
    dropoffPhone: order.dropoffPhone ?? null,
    dropoffAddress: order.dropoffAddress ?? null,
    dropoffLat: order.dropoffLat ?? null,
    dropoffLng: order.dropoffLng ?? null,
    orderSource: order.orderSource ?? null,
    type: order.type ?? null,
    matchId: order.matchId ?? null,
    items: order.items ?? [],
    subtotal: order.subtotal ?? 0,
    deliveryFee: order.deliveryFee ?? 0,
    totalPrice: order.totalPrice ?? order.total ?? 0,
    estimatedDeliveryTime: 35,
    estimatedDeliveryMinutes: 35,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  console.log("[REPAIR] writing driver_marketplace_pool/" + orderId);
  const token = await getAccessToken();
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(poolDoc)) {
    fields[k] = encodeFirestoreValue(v);
  }
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/driver_marketplace_pool/${orderId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const createRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/driver_marketplace_pool?documentId=${orderId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      },
    );
    if (!createRes.ok) {
      throw new Error(`Pool write failed: ${createRes.status} ${await createRes.text()}`);
    }
  }
}

async function main(): Promise<void> {
  const report: StepEvidence[] = [];
  const orderId = MATCH_ID;

  console.log("\n=== STEP 1: MATCH STATE ===");
  const match = await restReadDoc("matches", MATCH_ID);
  if (!match) {
    console.error("MATCH NOT FOUND", MATCH_ID);
    process.exit(1);
  }
  const matchSummary = {
    lifecycle: match.lifecycle,
    paymentStatus: match.paymentStatus,
    orderId: match.orderId ?? null,
    userPayments: match.userPayments,
    users: match.users,
  };
  console.log(JSON.stringify(matchSummary, null, 2));
  report.push({ step: 1, match: matchSummary });

  console.log("\n=== STEP 2: DISPATCH REPAIR ===");
  let repairResult: Awaited<ReturnType<typeof backfillFoodShareDispatchOrderIfNeeded>> = null;
  try {
    repairResult = await runWithAdmin(() =>
      backfillFoodShareDispatchOrderIfNeeded(MATCH_ID),
    );
    console.log("[ensureFoodShareDispatchOrder equivalent]", repairResult);
  } catch (adminErr) {
    console.warn("[ADMIN SDK unavailable]", adminErr instanceof Error ? adminErr.message : adminErr);
    console.log("[REPAIR] attempting REST-based order create if missing...");
    const existingOrder = await restReadDoc("orders", orderId);
    if (!existingOrder) {
      const payload = await buildRestOrderPayload(match, orderId);
      await restPatchDoc("orders", orderId, payload as Record<string, unknown>);
      await restPatchDoc("matches", MATCH_ID, {
        orderId,
        lifecycle: "ORDER_PLACED",
        orderStatus: "order_placed",
        deliveryStatus: "pending",
        paymentStatus: "paid",
      });
      repairResult = { orderId, created: true, poolExists: false };
      console.log("[FOOD SHARE ORDER CREATED] via REST", {
        orderId,
        matchId: MATCH_ID,
        deliveryAddress: payload.deliveryAddress,
        restaurantAddress: payload.restaurantAddress,
        customerPhone: payload.customerPhone,
        items: payload.items,
      });
    } else {
      const payload = await buildRestOrderPayload(match, orderId);
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      for (const key of [
        "deliveryAddress",
        "restaurantAddress",
        "customerPhone",
        "customerPhoneNumber",
        "customerName",
        "items",
        "restaurantLocation",
        "deliveryLocation",
        "userLocation",
        "pickupUserId",
        "pickupName",
        "pickupPhone",
        "pickupAddress",
        "pickupLat",
        "pickupLng",
        "pickupLocation",
        "dropoffUserId",
        "dropoffName",
        "dropoffPhone",
        "dropoffAddress",
        "dropoffLat",
        "dropoffLng",
        "dropoffLocation",
        "restaurantName",
        "restaurantImage",
      ]) {
        const next = payload[key];
        const prev = existingOrder[key];
        const missing =
          prev == null ||
          prev === "" ||
          (key === "items" &&
            (!Array.isArray(prev) ||
              prev.length === 0 ||
              JSON.stringify(prev) !== JSON.stringify(next))) ||
          (typeof key === "string" &&
            (key === "pickupLat" || key === "pickupLng" || key === "dropoffLat" || key === "dropoffLng") &&
            typeof prev !== "number");
        if (missing && next != null && next !== "") patch[key] = next;
      }
      if (Object.keys(patch).length > 1) {
        console.log("[REPAIR] patching order details via REST", patch);
        await restPatchDoc("orders", orderId, patch);
        repairResult = { orderId, created: false, poolExists: false, repaired: true };
      } else {
        repairResult = { orderId, created: false, poolExists: false };
      }
    }
  }
  report.push({ step: 2, repairResult });

  console.log("\n=== STEP 3: ORDER DOCUMENT ===");
  let order = await restReadDoc("orders", orderId);
  if (!order) {
    console.error("ORDER MISSING", `orders/${orderId}`);
    process.exit(1);
  }
  const orderSummary = {
    path: `orders/${orderId}`,
    deliveryType: order.deliveryType,
    paymentStatus: order.paymentStatus,
    deliveryStatus: order.deliveryStatus,
    driverId: order.driverId,
    assignedDriverId: order.assignedDriverId,
    status: order.status,
    matchId: order.matchId,
    totalPrice: order.totalPrice,
    deliveryAddress: order.deliveryAddress ?? null,
    restaurantAddress: order.restaurantAddress ?? null,
    customerPhone: order.customerPhone ?? order.customerPhoneNumber ?? null,
    items: order.items ?? [],
  };
  console.log(JSON.stringify(orderSummary, null, 2));
  console.log("[FOOD SHARE ORDER DATA]", orderSummary);
  report.push({ step: 3, order: orderSummary });

  console.log("\n=== STEP 4: POOL DOCUMENT ===");
  let pool = await restReadDoc("driver_marketplace_pool", orderId);
  if (!pool) {
    console.warn("POOL MISSING — waiting 3s for syncDriverMarketplacePool trigger...");
    await new Promise((r) => setTimeout(r, 3000));
    pool = await restReadDoc("driver_marketplace_pool", orderId);
  }
  if (!pool && order) {
    console.log("[REPAIR] pool still missing — writing pool doc from order");
    await writePoolFromOrder(orderId, order);
    await new Promise((r) => setTimeout(r, 1000));
    pool = await restReadDoc("driver_marketplace_pool", orderId);
  }
  const poolSummary = pool
    ? {
        path: `driver_marketplace_pool/${orderId}`,
        exists: true,
        deliveryType: pool.deliveryType,
        paymentStatus: pool.paymentStatus,
        deliveryStatus: pool.deliveryStatus,
        driverId: pool.driverId,
        assignedDriverId: pool.assignedDriverId,
        status: pool.status,
        createdAt: pool.createdAt,
        deliveryAddress: pool.deliveryAddress ?? null,
        restaurantAddress: pool.restaurantAddress ?? null,
        customerPhone: pool.customerPhone ?? null,
        items: pool.items ?? [],
      }
    : { path: `driver_marketplace_pool/${orderId}`, exists: false };
  console.log(JSON.stringify(poolSummary, null, 2));
  console.log("[FOOD SHARE DRIVER POOL]", poolSummary);
  report.push({ step: 4, pool: poolSummary });

  console.log("\n=== STEP 5-6: DRIVER HUB ELIGIBILITY + AUTO-FIX ===");
  let attempts = 0;
  let visible = false;
  let lastReason: string | null = "pool_missing";

  while (attempts < 4 && !visible) {
    attempts += 1;
    order = (await restReadDoc("orders", orderId)) ?? order;
    pool = (await restReadDoc("driver_marketplace_pool", orderId)) ?? pool;
    const raw = (pool ?? order) as Record<string, unknown>;

    const publish = poolPublishEligible(raw);
    const stale = isPoolStale(pool?.createdAt);
    const terminal = isTerminal(raw);
    const hub = driverHubEligible(raw, orderId, { stale, terminal });

    if (hub.visible && publish.eligible && pool) {
      visible = true;
      console.log("[DRIVER HUB MATCH FOUND]", {
        orderId,
        matchId: MATCH_ID,
        path: `driver_marketplace_pool/${orderId}`,
        status: raw.status,
        deliveryStatus: raw.deliveryStatus,
        paymentStatus: raw.paymentStatus,
        attempt: attempts,
      });
      break;
    }

    lastReason =
      hub.reason ??
      publish.rejectReason ??
      (pool ? "unknown" : "pool_missing");
    console.log("[DRIVER HUB FILTER REJECTED]", {
      orderId,
      matchId: MATCH_ID,
      reason: lastReason,
      publishEligible: publish.eligible,
      publishReject: publish.rejectReason,
      hubReason: hub.reason,
      stale,
      terminal,
      attempt: attempts,
    });

    const fixIssues: string[] = [];
    if (!publish.eligible && publish.rejectReason) fixIssues.push(publish.rejectReason);
    if (hub.reason) fixIssues.push(hub.reason);
    if (!pool) fixIssues.push("pool_missing");

    if (fixIssues.length === 0) break;

    if (fixIssues.includes("pool_missing") && order) {
      await writePoolFromOrder(orderId, order);
    } else {
      await repairOrderFields(orderId, fixIssues);
      await new Promise((r) => setTimeout(r, 2000));
      order = (await restReadDoc("orders", orderId)) ?? order;
      if (order && !(await restReadDoc("driver_marketplace_pool", orderId))) {
        await writePoolFromOrder(orderId, order);
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  report.push({
    step: 5,
    driverHubVisible: visible,
    lastReason,
    attempts,
  });

  console.log("\n=== STEP 7: DEPLOYED FUNCTIONS ===");
  const { execSync } = await import("node:child_process");
  const fnList = execSync(
    "firebase functions:list --project halforfer 2>&1",
    { encoding: "utf8", cwd: path.join(process.cwd(), "..") },
  );
  const required = [
    "confirmFoodSharePayment",
    "createPaymentIntent",
    "ensureFoodShareDispatchOrder",
    "syncDriverMarketplacePool",
  ];
  const fnStatus = Object.fromEntries(
    required.map((name) => [name, fnList.includes(name)]),
  );
  console.log(JSON.stringify(fnStatus, null, 2));
  report.push({ step: 7, functions: fnStatus });

  const finalMatch = await restReadDoc("matches", MATCH_ID);
  const finalOrder = await restReadDoc("orders", orderId);
  const finalPool = await restReadDoc("driver_marketplace_pool", orderId);

  console.log("\n=== FINAL REPORT ===");
  const finalReport = {
    matchId: MATCH_ID,
    match: {
      lifecycle: finalMatch?.lifecycle,
      paymentStatus: finalMatch?.paymentStatus,
      orderId: finalMatch?.orderId,
    },
    order: finalOrder
      ? {
          exists: true,
          deliveryType: finalOrder.deliveryType,
          paymentStatus: finalOrder.paymentStatus,
          deliveryStatus: finalOrder.deliveryStatus,
          status: finalOrder.status,
          driverId: finalOrder.driverId,
          assignedDriverId: finalOrder.assignedDriverId,
          deliveryAddress: finalOrder.deliveryAddress ?? null,
          restaurantAddress: finalOrder.restaurantAddress ?? null,
          customerPhone:
            finalOrder.customerPhone ?? finalOrder.customerPhoneNumber ?? null,
          items: finalOrder.items ?? [],
        }
      : { exists: false },
    pool: finalPool
      ? {
          exists: true,
          deliveryStatus: finalPool.deliveryStatus,
          paymentStatus: finalPool.paymentStatus,
          driverId: finalPool.driverId,
          deliveryAddress: finalPool.deliveryAddress ?? null,
          restaurantAddress: finalPool.restaurantAddress ?? null,
          customerPhone: finalPool.customerPhone ?? null,
          items: finalPool.items ?? [],
        }
      : { exists: false },
    driverHubVisible: visible,
    remainingBlocker: visible ? null : lastReason,
    outcome: visible ? "A_DRIVER_HUB_CAN_SEE_ORDER" : "B_BLOCKER_REMAINS",
  };
  console.log(JSON.stringify(finalReport, null, 2));
  report.push({ step: 8, finalReport });

  process.exit(visible ? 0 : 1);
}

main().catch((err) => {
  console.error("[VERIFY FAILED]", err);
  process.exit(1);
});
