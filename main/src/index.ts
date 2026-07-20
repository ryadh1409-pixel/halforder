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
export {cleanupOldTerminalOrders} from "./orderRetentionCleanup.js";
export {
  generateEmoAiDailyReport,
  generateEmoAiWeeklyReport,
  generateEmoAiMonthlyReport,
} from "./emoAiScheduledReports.js";
export {
  notifyAdminsOnFlaggedMessage,
  notifyAdminsOnHighRiskModeration,
  notifyAdminsOnOrderCreated,
  notifyAdminsOnPaymentIssue,
  notifyAdminsOnReportCreated,
  notifyAdminsOnUserSuspended,
} from "./adminNotifications.js";
export {
  notifyOrderChatMessageCreated,
  provisionDriverChatOnAssignment,
} from "./orderChatProvisioning.js";
