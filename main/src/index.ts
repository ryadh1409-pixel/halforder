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
/** Earnings wallets — credit restaurant/driver/admin ledgers on order completion. */
export {syncEarningsWallets} from "./syncEarningsWallets.js";
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
export {notifyRestaurantOnNewOrder} from "./restaurantNewOrderNotifications.js";
export {
  notifyOrderChatMessageCreated,
  provisionDriverChatOnAssignment,
} from "./orderChatProvisioning.js";
export {
  enrollDriverLaunchCampaign,
  markDriverLaunchBonusPaid,
  trackDriverLaunchCampaignProgress,
} from "./driverLaunchCampaign.js";
export {
  attachDriverReferral,
  getAdminDriverReferralCampaign,
  getDriverReferralDashboard,
  saveAdminDriverReferralCampaign,
  trackDriverReferralReward,
  updateDriverReferralRewardStatus,
} from "./driverReferralProgram.js";
export {
  expireCashbackRewards,
  getAdminCashbackRewards,
  getCashbackWallet,
  saveAdminCashbackRewards,
  trackCashbackReward,
} from "./cashbackRewards.js";
export {
  applyAbandonedCheckoutRecoveryOffer,
  processAbandonedCheckoutRecovery,
  recordAbandonedCheckoutNotificationOpen,
} from "./abandonedCheckoutRecovery.js";
