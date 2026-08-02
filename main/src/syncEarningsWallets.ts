/**
 * Trigger: orders/{orderId} write → credit earnings wallets when order completes.
 * Additive only — does not alter marketplace, payout fields, or completion math.
 */

import {getFirestore, type DocumentData} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {
  creditEarningsWalletsForOrder,
  shouldCreditEarningsWallets,
} from "./earningsWalletCredit.js";

const db = getFirestore();

export const syncEarningsWallets = onDocumentWritten(
  {
    document: "orders/{orderId}",
    region: "us-central1",
  },
  async (event) => {
    const orderId = event.params.orderId as string;
    const before = event.data?.before?.data() as DocumentData | undefined;
    const after = event.data?.after?.data() as DocumentData | undefined;

    if (!after) return;
    if (!shouldCreditEarningsWallets(before, after)) return;

    try {
      const result = await creditEarningsWalletsForOrder(orderId, after);
      logger.info("[syncEarningsWallets]", {orderId, ...result});
    } catch (err) {
      logger.error("[syncEarningsWallets] failed", {orderId, err});
      // Re-throw so Functions retries transient failures.
      throw err;
    }

    // Touch nothing else on the order beyond credit helper's merge flag.
    void db;
  },
);
