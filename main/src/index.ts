/**
 * Firebase Cloud Functions (main codebase).
 *
 * @see publicMatchableSync — denormalized join directory for AI / assistant queries.
 */
import {initializeApp} from "firebase-admin/app";

initializeApp();

export {syncPublicMatchableOrder} from "./publicMatchableSync.js";
export {refreshUserRoleClaims, syncUserRoleClaims} from "./syncUserRoleClaims.js";
/** Driver Hub pool — triggered on every `orders/{orderId}` write. */
export {syncDriverMarketplacePool} from "./syncDriverMarketplacePool.js";
export {linkPaymentTransactionDriver} from "./linkPaymentTransactionDriver.js";
export {cleanupExpiredOrders} from "./cleanupExpiredOrders.js";
