/**
 * Daily HalfOrder Metrics Report
 * Runs every day at 2:00 PM Ottawa time (America/Toronto).
 */
import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import {defineSecret} from "firebase-functions/params";
import OpenAI from "openai";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";

const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");
const openAiKey = defineSecret("OPENAI_API_KEY");

const ADMIN_EMAIL = "ryadh1409@gmail.com";
const GMAIL_USER = "ryadh1409@gmail.com";

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfDayMs(date: Date): number {
  const d = new Date(date); d.setHours(0, 0, 0, 0); return d.getTime();
}
function startOfWeekMs(date: Date): number {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0); return d.getTime();
}
function startOfMonthMs(date: Date): number {
  const d = new Date(date); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime();
}
function tsToMs(ts: admin.firestore.Timestamp | null | undefined): number {
  return ts ? ts.toMillis() : 0;
}
function fmt(n: number): string { return n.toLocaleString("en-CA"); }
function fmtCurrency(n: number): string { return `$${n.toFixed(2)}`; }
function fmtMins(ms: number): string {
  if (!ms || ms <= 0) return "N/A";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
function stripMarkdown(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/#{1,6}\s/g, "").trim();
}

// ── Metric Types ──────────────────────────────────────────────────────────────

interface TopUser {
  uid: string;
  name: string;
  email: string;
  orderCount: number;
  totalSpent: number;
  lastOrderMs: number;
}

interface TopArea {
  area: string;
  orderCount: number;
  revenue: number;
}

interface DriverStat {
  driverId: string;
  name: string;
  deliveries: number;
  avgCompletionMs: number;
  totalEarnings: number;
}

interface DailyMetrics {
  date: string;
  generatedAt: string;
  totalUsers: number;
  newUsersToday: number;
  newUsersWeek: number;
  newUsersMonth: number;
  activeUsersToday: number;
  totalOrders: number;
  ordersToday: number;
  ordersWeek: number;
  ordersMonth: number;
  revenueToday: number;
  revenueWeek: number;
  revenueMonth: number;
  avgOrderValue: number;
  completedOrders: number;
  pendingOrders: number;
  completionRate: number;
  avgCompletionTimeMs: number;
  totalRestaurants: number;
  openRestaurants: number;
  totalDrivers: number;
  onlineDrivers: number;
  totalReferrals: number;
  successfulReferrals: number;
  referralConversionRate: number;
  totalMatches: number;
  activeMatches: number;
  foodShareRevenue: number;
  paidPayments: number;
  failedPayments: number;
  refundedPayments: number;
  grossRevenue: number;
  topUsers: TopUser[];
  topAreas: TopArea[];
  topDrivers: DriverStat[];
}

// ── Fetch Metrics ─────────────────────────────────────────────────────────────

async function fetchMetrics(): Promise<DailyMetrics> {
  const db = admin.firestore();
  const now = new Date();
  const todayMs = startOfDayMs(now);
  const weekMs = startOfWeekMs(now);
  const monthMs = startOfMonthMs(now);

  const [
    usersSnap,
    ordersSnap,
    restaurantsSnap,
    driversSnap,
    referralsSnap,
    matchesSnap,
    activitySnap,
  ] = await Promise.all([
    db.collection("users").limit(2000).get(),
    db.collection("orders").orderBy("createdAt", "desc").limit(1000).get(),
    db.collection("restaurants").limit(200).get(),
    db.collection("drivers").limit(200).get(),
    db.collection("friendReferrals").limit(500).get(),
    db.collection("matches").limit(500).get(),
    db.collection("userActivity").limit(1000).get(),
  ]);

  // Build user map for name lookups
  const userMap = new Map<string, {name: string; email: string; createdAtMs: number}>();
  let newUsersToday = 0, newUsersWeek = 0, newUsersMonth = 0;
  usersSnap.docs.forEach((d) => {
    const data = d.data();
    const ms = tsToMs(data.createdAt as admin.firestore.Timestamp);
    userMap.set(d.id, {
      name: (data.displayName as string) || (data.name as string) || "Unknown",
      email: (data.email as string) || "",
      createdAtMs: ms,
    });
    if (ms >= todayMs) newUsersToday++;
    if (ms >= weekMs) newUsersWeek++;
    if (ms >= monthMs) newUsersMonth++;
  });

  // Active users today
  let activeUsersToday = 0;
  activitySnap.docs.forEach((d) => {
    if (tsToMs(d.data().lastActiveAt as admin.firestore.Timestamp) >= todayMs) activeUsersToday++;
  });

  // Orders aggregation
  let ordersToday = 0, ordersWeek = 0, ordersMonth = 0;
  let revenueToday = 0, revenueWeek = 0, revenueMonth = 0;
  let completedOrders = 0, pendingOrders = 0;
  let totalCompletionMs = 0, completionCount = 0;
  let paidPayments = 0, failedPayments = 0, refundedPayments = 0;

  // Aggregation maps
  const userOrderMap = new Map<string, {count: number; spent: number; lastMs: number}>();
  const areaMap = new Map<string, {count: number; revenue: number}>();
  const driverMap = new Map<string, {deliveries: number; totalMs: number; earnings: number}>();

  ordersSnap.docs.forEach((d) => {
    const data = d.data();
    const ms = tsToMs(data.createdAt as admin.firestore.Timestamp);
    const price: number = typeof data.totalPrice === "number" ? data.totalPrice : 0;
    const payStatus: string = (data.paymentStatus as string) || "";
    const status: string = ((data.status as string) || "").toLowerCase();

    // Time buckets
    if (ms >= todayMs) { ordersToday++; if (payStatus === "paid") revenueToday += price; }
    if (ms >= weekMs) { ordersWeek++; if (payStatus === "paid") revenueWeek += price; }
    if (ms >= monthMs) { ordersMonth++; if (payStatus === "paid") revenueMonth += price; }

    // Status
    if (status === "completed" || status === "delivered") {
      completedOrders++;
      // Completion time
      const completedAt = tsToMs(
        (data.completedAt ?? data.deliveredAt ?? null) as admin.firestore.Timestamp | null
      );
      if (completedAt && ms) {
        totalCompletionMs += completedAt - ms;
        completionCount++;
      }
    }
    if (status === "pending" || status === "accepted" || status === "preparing") pendingOrders++;

    // Payment stats
    if (payStatus === "paid") paidPayments++;
    else if (payStatus === "failed") failedPayments++;
    else if (payStatus === "refunded") refundedPayments++;

    // Top users
    const uid: string = (data.customerId ?? data.userId ?? data.uid ?? "") as string;
    if (uid) {
      const existing = userOrderMap.get(uid) ?? {count: 0, spent: 0, lastMs: 0};
      userOrderMap.set(uid, {
        count: existing.count + 1,
        spent: existing.spent + (payStatus === "paid" ? price : 0),
        lastMs: Math.max(existing.lastMs, ms),
      });
    }

    // Top areas — use city or first part of address
    const loc = data.deliveryLocation as Record<string, unknown> | undefined;
    const rawArea: string = (
      (loc?.city as string) ??
      (loc?.address as string) ??
      (data.deliveryAddress as string) ??
      ""
    );
    const area = rawArea
      ? rawArea.split(",")[0].trim().substring(0, 30)
      : "Unknown";
    if (area && area !== "Unknown") {
      const existing = areaMap.get(area) ?? {count: 0, revenue: 0};
      areaMap.set(area, {
        count: existing.count + 1,
        revenue: existing.revenue + (payStatus === "paid" ? price : 0),
      });
    }

    // Driver stats
    const driverId: string = (data.driverId ?? data.assignedDriverId ?? "") as string;
    if (driverId && (status === "completed" || status === "delivered")) {
      const completedAt = tsToMs(
        (data.completedAt ?? data.deliveredAt ?? null) as admin.firestore.Timestamp | null
      );
      const timeMs = completedAt && ms ? completedAt - ms : 0;
      const existing = driverMap.get(driverId) ?? {deliveries: 0, totalMs: 0, earnings: 0};
      driverMap.set(driverId, {
        deliveries: existing.deliveries + 1,
        totalMs: existing.totalMs + timeMs,
        earnings: existing.earnings + (payStatus === "paid" ? price * 0.1 : 0),
      });
    }
  });

  const totalOrders = ordersSnap.size;
  const avgOrderValue = ordersMonth > 0 ? revenueMonth / ordersMonth : 0;
  const completionRate = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;
  const avgCompletionTimeMs = completionCount > 0 ? totalCompletionMs / completionCount : 0;

  // Top 100 users sorted by order count
  const topUsers: TopUser[] = Array.from(userOrderMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 100)
    .map(([uid, stats]) => {
      const info = userMap.get(uid);
      return {
        uid,
        name: info?.name ?? "Unknown",
        email: info?.email ?? "",
        orderCount: stats.count,
        totalSpent: stats.spent,
        lastOrderMs: stats.lastMs,
      };
    });

  // Top areas
  const topAreas: TopArea[] = Array.from(areaMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([area, stats]) => ({area, orderCount: stats.count, revenue: stats.revenue}));

  // Top drivers
  const driverUserMap = new Map<string, string>();
  driversSnap.docs.forEach((d) => {
    const data = d.data();
    driverUserMap.set(d.id, (data.displayName ?? data.name ?? "Driver") as string);
  });
  usersSnap.docs.forEach((d) => {
    const data = d.data();
    if ((data.role as string) === "driver" || (data.type as string) === "driver") {
      driverUserMap.set(d.id, (data.displayName ?? data.name ?? "Driver") as string);
    }
  });

  const topDrivers: DriverStat[] = Array.from(driverMap.entries())
    .sort((a, b) => b[1].deliveries - a[1].deliveries)
    .slice(0, 10)
    .map(([driverId, stats]) => ({
      driverId,
      name: driverUserMap.get(driverId) ?? `Driver ${driverId.substring(0, 6)}`,
      deliveries: stats.deliveries,
      avgCompletionMs: stats.deliveries > 0 ? stats.totalMs / stats.deliveries : 0,
      totalEarnings: stats.earnings,
    }));

  // Restaurants
  let openRestaurants = 0;
  restaurantsSnap.docs.forEach((d) => { if (d.data().isOpen) openRestaurants++; });

  // Drivers
  let onlineDrivers = 0;
  driversSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.isOnline || data.online) onlineDrivers++;
  });

  // Referrals
  let successfulReferrals = 0;
  referralsSnap.docs.forEach((d) => {
    const s: string = (d.data().status as string) || "";
    if (s === "reward_issued" || s === "completed_first_order") successfulReferrals++;
  });
  const totalReferrals = referralsSnap.size;
  const referralConversionRate = totalReferrals > 0
    ? Math.round((successfulReferrals / totalReferrals) * 100) : 0;

  // Food Share
  let activeMatches = 0, foodShareRevenue = 0;
  matchesSnap.docs.forEach((d) => {
    const data = d.data();
    const lc: string = ((data.lifecycle as string) || "").toUpperCase();
    if (lc === "MATCHED" || lc === "PAYMENT_CONFIRMED") activeMatches++;
    if (typeof data.totalPrice === "number") foodShareRevenue += data.totalPrice as number;
  });

  const grossRevenue = revenueMonth + foodShareRevenue;

  const ottawaDate = now.toLocaleDateString("en-CA", {
    timeZone: "America/Toronto", weekday: "long", year: "numeric",
    month: "long", day: "numeric",
  });
  const generatedAt = now.toLocaleTimeString("en-CA", {
    timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit",
  });

  return {
    date: ottawaDate, generatedAt,
    totalUsers: usersSnap.size, newUsersToday, newUsersWeek, newUsersMonth, activeUsersToday,
    totalOrders, ordersToday, ordersWeek, ordersMonth,
    revenueToday, revenueWeek, revenueMonth, avgOrderValue,
    completedOrders, pendingOrders, completionRate, avgCompletionTimeMs,
    totalRestaurants: restaurantsSnap.size, openRestaurants,
    totalDrivers: driversSnap.size, onlineDrivers,
    totalReferrals, successfulReferrals, referralConversionRate,
    totalMatches: matchesSnap.size, activeMatches, foodShareRevenue,
    paidPayments, failedPayments, refundedPayments, grossRevenue,
    topUsers, topAreas, topDrivers,
  };
}

// ── AI Executive Summary ──────────────────────────────────────────────────────

async function generateExecutiveSummary(m: DailyMetrics, apiKey: string): Promise<string> {
  try {
    const openai = new OpenAI({apiKey});
    const topUserNames = m.topUsers.slice(0, 3).map(u => `${u.name} (${u.orderCount} orders)`).join(", ");
    const topAreaNames = m.topAreas.slice(0, 3).map(a => `${a.area} (${a.orderCount} orders)`).join(", ");

    const prompt = `You are the Chief of Staff at HalfOrder, a Canadian food-sharing startup. Write a concise executive summary (3-5 sentences) for today's metrics report. Do NOT use markdown formatting, asterisks, or bold text. Plain text only. Be data-driven, professional, and confident.

Key metrics (${m.date}):
- Users: ${m.totalUsers} total | +${m.newUsersToday} today | ${m.activeUsersToday} active today
- Orders: ${m.ordersToday} today | ${m.ordersWeek} this week | Revenue today: ${fmtCurrency(m.revenueToday)}
- Avg order value: ${fmtCurrency(m.avgOrderValue)} | Completion rate: ${m.completionRate}%
- Avg delivery time: ${fmtMins(m.avgCompletionTimeMs)}
- Top customers: ${topUserNames || "N/A"}
- Top areas: ${topAreaNames || "N/A"}
- Gross revenue this month: ${fmtCurrency(m.grossRevenue)}`;

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{role: "user", content: prompt}],
      max_tokens: 220,
    });
    const raw = res.choices[0]?.message?.content?.trim() ?? "";
    return stripMarkdown(raw) || "Executive summary unavailable.";
  } catch {
    return "Executive summary unavailable.";
  }
}

// ── PDF Generation ────────────────────────────────────────────────────────────

async function generatePDF(m: DailyMetrics, summary: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: {top: 50, bottom: 50, left: 50, right: 50},
      info: {
        Title: `HalfOrder Daily Report — ${m.date}`,
        Author: "HalfOrder Analytics",
        Subject: "Daily Startup Metrics",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const PRIMARY = "#7C3AED";
    const DARK = "#111827";
    const GRAY = "#6B7280";
    const W = doc.page.width - 100;

    // ── Header ──────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 90).fill(PRIMARY);
    doc.fillColor("#FFFFFF").fontSize(26).font("Helvetica-Bold").text("HalfOrder", 50, 25);
    doc.fontSize(11).font("Helvetica").text("Daily Startup Metrics Report", 50, 56);
    doc.fontSize(10).text(`Generated ${m.date} at ${m.generatedAt} Ottawa time`, 50, 72);

    // ── Executive Summary ────────────────────────────────────────────
    doc.fillColor(PRIMARY).fontSize(13).font("Helvetica-Bold").text("Executive Summary", 50, 110);
    doc.moveTo(50, 128).lineTo(50 + W, 128).strokeColor(PRIMARY).lineWidth(1.5).stroke();
    doc.fillColor(DARK).fontSize(10.5).font("Helvetica").text(summary, 50, 135, {width: W, lineGap: 4});

    let y = doc.y + 20;

    // ── Helper functions ─────────────────────────────────────────────
    function section(title: string, yPos: number): number {
      doc.fillColor(PRIMARY).fontSize(12).font("Helvetica-Bold").text(title, 50, yPos);
      doc.moveTo(50, yPos + 17).lineTo(50 + W, yPos + 17).strokeColor(PRIMARY).lineWidth(1).stroke();
      return yPos + 25;
    }

    function row(label: string, value: string, yPos: number, x = 50, w = W): number {
      doc.fillColor(GRAY).fontSize(9).font("Helvetica").text(label, x, yPos, {width: w * 0.62});
      doc.fillColor(DARK).fontSize(10).font("Helvetica-Bold").text(value, x + w * 0.62, yPos, {width: w * 0.36, align: "right"});
      doc.moveTo(x, yPos + 14).lineTo(x + w, yPos + 14).strokeColor("#E5E7EB").lineWidth(0.5).stroke();
      return yPos + 18;
    }

    function twoCol(l1: string, v1: string, l2: string, v2: string, yPos: number): number {
      const hw = W / 2 - 5;
      row(l1, v1, yPos, 50, hw);
      row(l2, v2, yPos, 55 + hw, hw);
      return yPos + 18;
    }

    function checkPage(yPos: number, needed = 80): number {
      if (yPos > doc.page.height - 100 - needed) { doc.addPage(); return 50; }
      return yPos;
    }

    // ── Users ────────────────────────────────────────────────────────
    y = checkPage(y);
    y = section("USERS", y);
    y = twoCol("Total Registered Users", fmt(m.totalUsers), "New Users Today", `+${fmt(m.newUsersToday)}`, y);
    y = twoCol("New Users This Week", `+${fmt(m.newUsersWeek)}`, "New Users This Month", `+${fmt(m.newUsersMonth)}`, y);
    y = row("Active Users Today (page views / sign-ins)", fmt(m.activeUsersToday), y + 2);
    y += 14;

    // ── Orders ───────────────────────────────────────────────────────
    y = checkPage(y);
    y = section("ORDERS & REVENUE", y);
    y = twoCol("Orders Today", fmt(m.ordersToday), "Revenue Today", fmtCurrency(m.revenueToday), y);
    y = twoCol("Orders This Week", fmt(m.ordersWeek), "Revenue This Week", fmtCurrency(m.revenueWeek), y);
    y = twoCol("Orders This Month", fmt(m.ordersMonth), "Revenue This Month", fmtCurrency(m.revenueMonth), y);
    y = twoCol("Avg Order Value (MTD)", fmtCurrency(m.avgOrderValue), "Order Completion Rate", `${m.completionRate}%`, y);
    y = twoCol("Completed Orders (all time)", fmt(m.completedOrders), "Active / Pending Orders", fmt(m.pendingOrders), y);
    y = row("Avg Order Completion Time", fmtMins(m.avgCompletionTimeMs), y + 2);
    y += 14;

    // ── Payments ─────────────────────────────────────────────────────
    y = checkPage(y);
    y = section("PAYMENTS", y);
    y = twoCol("Successful Payments", fmt(m.paidPayments), "Failed Payments", fmt(m.failedPayments), y);
    y = twoCol("Refunded Payments", fmt(m.refundedPayments), "Gross Revenue (MTD)", fmtCurrency(m.grossRevenue), y);
    y += 14;

    // ── Restaurants & Drivers ────────────────────────────────────────
    y = checkPage(y);
    y = section("RESTAURANTS & DRIVERS", y);
    y = twoCol("Total Restaurants", fmt(m.totalRestaurants), "Open Now", fmt(m.openRestaurants), y);
    y = twoCol("Total Drivers", fmt(m.totalDrivers), "Online Now", fmt(m.onlineDrivers), y);
    y += 14;

    // ── Referrals ─────────────────────────────────────────────────────
    y = checkPage(y);
    y = section("REFERRAL PROGRAM", y);
    y = twoCol("Total Referrals", fmt(m.totalReferrals), "Successful Referrals", fmt(m.successfulReferrals), y);
    y = row("Referral Conversion Rate", `${m.referralConversionRate}%`, y + 2);
    y += 14;

    // ── Food Share ────────────────────────────────────────────────────
    y = checkPage(y);
    y = section("FOOD SHARE (SPLIT ORDERS)", y);
    y = twoCol("Total Matches", fmt(m.totalMatches), "Active Matches", fmt(m.activeMatches), y);
    y = row("Food Share Revenue (all time)", fmtCurrency(m.foodShareRevenue), y + 2);
    y += 14;

    // ── TOP USERS TABLE ───────────────────────────────────────────────
    if (m.topUsers.length > 0) {
      y = checkPage(y, 120);
      y = section(`TOP ${Math.min(m.topUsers.length, 100)} CUSTOMERS BY ORDERS (ALL TIME)`, y);

      // Table header
      const colX = [50, 210, 310, 400, 490];
      const headers = ["Customer Name", "Email", "Orders", "Total Spent", "Last Order"];
      doc.fillColor("#F5F3FF");
      doc.rect(50, y, W, 16).fill();
      headers.forEach((h, i) => {
        doc.fillColor(PRIMARY).fontSize(8).font("Helvetica-Bold")
          .text(h, colX[i], y + 3, {width: (colX[i + 1] ?? 550) - colX[i] - 4});
      });
      y += 16;

      const displayUsers = m.topUsers.slice(0, 100);
      displayUsers.forEach((u, idx) => {
        y = checkPage(y, 16);
        if (idx % 2 === 0) {
          doc.fillColor("#FAFAFA").rect(50, y - 1, W, 15).fill();
        }
        const lastOrderDate = u.lastOrderMs
          ? new Date(u.lastOrderMs).toLocaleDateString("en-CA", {month: "short", day: "numeric", year: "numeric"})
          : "—";
        const cols = [
          u.name.substring(0, 22),
          u.email.substring(0, 24),
          String(u.orderCount),
          fmtCurrency(u.totalSpent),
          lastOrderDate,
        ];
        cols.forEach((val, i) => {
          doc.fillColor(DARK).fontSize(8).font("Helvetica")
            .text(val, colX[i], y, {width: (colX[i + 1] ?? 550) - colX[i] - 4, lineBreak: false});
        });
        doc.moveTo(50, y + 13).lineTo(50 + W, y + 13).strokeColor("#F3F4F6").lineWidth(0.3).stroke();
        y += 14;
      });
      y += 10;
    }

    // ── TOP DELIVERY AREAS ────────────────────────────────────────────
    if (m.topAreas.length > 0) {
      y = checkPage(y, 100);
      y = section("TOP DELIVERY AREAS", y);

      const areaColX = [50, 260, 360, 460];
      const areaHeaders = ["Area / Neighbourhood", "Orders", "Revenue", "% of Total"];
      doc.fillColor("#F5F3FF").rect(50, y, W, 16).fill();
      areaHeaders.forEach((h, i) => {
        doc.fillColor(PRIMARY).fontSize(8).font("Helvetica-Bold")
          .text(h, areaColX[i], y + 3, {width: (areaColX[i + 1] ?? 550) - areaColX[i] - 4});
      });
      y += 16;

      const totalAreaOrders = m.topAreas.reduce((s, a) => s + a.orderCount, 0);
      m.topAreas.forEach((a, idx) => {
        y = checkPage(y, 16);
        if (idx % 2 === 0) doc.fillColor("#FAFAFA").rect(50, y - 1, W, 15).fill();
        const pct = totalAreaOrders > 0 ? Math.round((a.orderCount / totalAreaOrders) * 100) : 0;
        const cols = [a.area, String(a.orderCount), fmtCurrency(a.revenue), `${pct}%`];
        cols.forEach((val, i) => {
          doc.fillColor(DARK).fontSize(8).font("Helvetica")
            .text(val, areaColX[i], y, {width: (areaColX[i + 1] ?? 550) - areaColX[i] - 4, lineBreak: false});
        });
        doc.moveTo(50, y + 13).lineTo(50 + W, y + 13).strokeColor("#F3F4F6").lineWidth(0.3).stroke();
        y += 14;
      });
      y += 10;
    }

    // ── DRIVER PERFORMANCE ────────────────────────────────────────────
    if (m.topDrivers.length > 0) {
      y = checkPage(y, 100);
      y = section("DRIVER PERFORMANCE", y);

      const dColX = [50, 200, 295, 390, 480];
      const dHeaders = ["Driver", "Deliveries", "Avg Time", "Est. Earnings", "Rating"];
      doc.fillColor("#F5F3FF").rect(50, y, W, 16).fill();
      dHeaders.forEach((h, i) => {
        doc.fillColor(PRIMARY).fontSize(8).font("Helvetica-Bold")
          .text(h, dColX[i], y + 3, {width: (dColX[i + 1] ?? 550) - dColX[i] - 4});
      });
      y += 16;

      m.topDrivers.forEach((d, idx) => {
        y = checkPage(y, 16);
        if (idx % 2 === 0) doc.fillColor("#FAFAFA").rect(50, y - 1, W, 15).fill();
        const rank = idx === 0 ? "★ Best" : idx === 1 ? "★★" : idx === 2 ? "★★★" : `#${idx + 1}`;
        const cols = [
          d.name.substring(0, 20),
          String(d.deliveries),
          fmtMins(d.avgCompletionMs),
          fmtCurrency(d.totalEarnings),
          rank,
        ];
        cols.forEach((val, i) => {
          doc.fillColor(i === 4 && idx === 0 ? PRIMARY : DARK).fontSize(8).font(i === 4 && idx === 0 ? "Helvetica-Bold" : "Helvetica")
            .text(val, dColX[i], y, {width: (dColX[i + 1] ?? 550) - dColX[i] - 4, lineBreak: false});
        });
        doc.moveTo(50, y + 13).lineTo(50 + W, y + 13).strokeColor("#F3F4F6").lineWidth(0.3).stroke();
        y += 14;
      });
      y += 10;
    }

    // ── FOUNDER DASHBOARD ─────────────────────────────────────────────
    y = checkPage(y, 130);
    doc.rect(50, y, W, 130).fill("#F5F3FF").stroke();
    doc.fillColor(PRIMARY).fontSize(12).font("Helvetica-Bold")
      .text("FOUNDER'S DASHBOARD — KEY METRICS", 62, y + 10);

    const kpis = [
      ["Total Users", fmt(m.totalUsers)],
      ["Active Today", fmt(m.activeUsersToday)],
      ["Monthly Revenue", fmtCurrency(m.grossRevenue)],
      ["Avg Order Value", fmtCurrency(m.avgOrderValue)],
      ["Completion Rate", `${m.completionRate}%`],
      ["Avg Delivery Time", fmtMins(m.avgCompletionTimeMs)],
      ["Referral Conv.", `${m.referralConversionRate}%`],
      ["Top Customer Orders", m.topUsers.length > 0 ? fmt(m.topUsers[0].orderCount) : "—"],
      ["Top Area", m.topAreas.length > 0 ? m.topAreas[0].area : "—"],
      ["Best Driver", m.topDrivers.length > 0 ? m.topDrivers[0].name.split(" ")[0] : "—"],
      ["Open Restaurants", fmt(m.openRestaurants)],
      ["Food Share Matches", fmt(m.activeMatches)],
    ];

    const kpiY = y + 32;
    const kpiCols = 4;
    kpis.forEach(([label, val], i) => {
      const col = i % kpiCols;
      const rowNum = Math.floor(i / kpiCols);
      const kx = 60 + col * (W / kpiCols);
      const ky = kpiY + rowNum * 32;
      doc.fillColor(GRAY).fontSize(7.5).font("Helvetica").text(label, kx, ky, {width: W / kpiCols - 5});
      doc.fillColor(DARK).fontSize(10.5).font("Helvetica-Bold").text(val, kx, ky + 11);
    });
    y += 140;

    // ── Footer ────────────────────────────────────────────────────────
    doc.fillColor(GRAY).fontSize(8).font("Helvetica")
      .text(
        `HalfOrder — Confidential — ${m.date} — Auto-generated daily at 2:00 PM Ottawa`,
        50, doc.page.height - 35, {width: W, align: "center"},
      );

    doc.end();
  });
}

// ── Send Email ────────────────────────────────────────────────────────────────

async function sendEmail(pdfBuffer: Buffer, m: DailyMetrics, appPassword: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {user: GMAIL_USER, pass: appPassword},
  });

  const topUserRows = m.topUsers.slice(0, 5).map((u, i) =>
    `<tr style="background:${i % 2 === 0 ? "#fff" : "#F9FAFB"}">
      <td style="padding:6px 8px;font-size:12px;color:#111827;">#${i + 1} ${u.name}</td>
      <td style="padding:6px 8px;font-size:12px;color:#111827;text-align:center;">${u.orderCount}</td>
      <td style="padding:6px 8px;font-size:12px;color:#059669;text-align:right;">${fmtCurrency(u.totalSpent)}</td>
    </tr>`
  ).join("");

  const topAreaRows = m.topAreas.slice(0, 3).map((a, i) =>
    `<tr><td style="padding:5px 8px;font-size:12px;color:#111827;">#${i + 1} ${a.area}</td>
     <td style="padding:5px 8px;font-size:12px;color:#111827;text-align:right;">${a.orderCount} orders</td></tr>`
  ).join("");

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#F9FAFB;margin:0;padding:0;">
  <div style="max-width:580px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:#7C3AED;padding:28px 32px;">
      <h1 style="color:#fff;margin:0;font-size:22px;">HalfOrder Daily Report</h1>
      <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">${m.date} · ${m.generatedAt} Ottawa</p>
    </div>
    <div style="padding:28px 32px;">
      <h2 style="font-size:15px;color:#111827;margin:0 0 16px;">Today at a Glance</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #F3F4F6;color:#6B7280;">New Users Today</td><td style="padding:8px 0;border-bottom:1px solid #F3F4F6;font-weight:700;color:#111827;text-align:right;">+${fmt(m.newUsersToday)}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #F3F4F6;color:#6B7280;">Orders Today</td><td style="padding:8px 0;border-bottom:1px solid #F3F4F6;font-weight:700;color:#111827;text-align:right;">${fmt(m.ordersToday)}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #F3F4F6;color:#6B7280;">Revenue Today</td><td style="padding:8px 0;border-bottom:1px solid #F3F4F6;font-weight:700;color:#059669;text-align:right;">${fmtCurrency(m.revenueToday)}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #F3F4F6;color:#6B7280;">Revenue This Week</td><td style="padding:8px 0;border-bottom:1px solid #F3F4F6;font-weight:700;color:#059669;text-align:right;">${fmtCurrency(m.revenueWeek)}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #F3F4F6;color:#6B7280;">Avg Delivery Time</td><td style="padding:8px 0;border-bottom:1px solid #F3F4F6;font-weight:700;color:#111827;text-align:right;">${fmtMins(m.avgCompletionTimeMs)}</td></tr>
        <tr><td style="padding:8px 0;color:#6B7280;">Monthly Gross Revenue</td><td style="padding:8px 0;font-weight:700;color:#059669;text-align:right;">${fmtCurrency(m.grossRevenue)}</td></tr>
      </table>

      ${topUserRows ? `<h2 style="font-size:14px;color:#111827;margin:24px 0 10px;">Top 5 Customers</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#F5F3FF;"><th style="padding:6px 8px;font-size:11px;color:#7C3AED;text-align:left;">Customer</th><th style="padding:6px 8px;font-size:11px;color:#7C3AED;text-align:center;">Orders</th><th style="padding:6px 8px;font-size:11px;color:#7C3AED;text-align:right;">Spent</th></tr>
        ${topUserRows}
      </table>` : ""}

      ${topAreaRows ? `<h2 style="font-size:14px;color:#111827;margin:20px 0 10px;">Top Delivery Areas</h2>
      <table style="width:100%;border-collapse:collapse;background:#F9FAFB;border-radius:8px;">
        ${topAreaRows}
      </table>` : ""}

      <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">Full report with Top 100 customers, driver performance & investor KPIs attached as PDF.</p>
    </div>
    <div style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #F3F4F6;">
      <p style="font-size:11px;color:#9CA3AF;margin:0;">HalfOrder · Confidential · Auto-generated daily at 2:00 PM Ottawa</p>
    </div>
  </div></body></html>`;

  await transporter.sendMail({
    from: `"HalfOrder Analytics" <${GMAIL_USER}>`,
    to: ADMIN_EMAIL,
    subject: `HalfOrder Daily Report — ${m.date}`,
    html,
    attachments: [{
      filename: `HalfOrder_Report_${new Date().toISOString().split("T")[0]}.pdf`,
      content: pdfBuffer,
      contentType: "application/pdf",
    }],
  });
}

// ── Scheduled Function ────────────────────────────────────────────────────────

export const sendDailyMetricsReport = functions
  .runWith({
    secrets: [gmailAppPassword, openAiKey],
    memory: "512MB",
    timeoutSeconds: 300,
  })
  .pubsub.schedule("0 14 * * *")
  .timeZone("America/Toronto")
  .onRun(async () => {
    functions.logger.info("[dailyMetricsReport] Starting daily report generation");
    try {
      const metrics = await fetchMetrics();
      functions.logger.info("[dailyMetricsReport] Metrics fetched", {
        totalUsers: metrics.totalUsers,
        ordersToday: metrics.ordersToday,
        topUsersCount: metrics.topUsers.length,
        topAreasCount: metrics.topAreas.length,
      });
      const summary = await generateExecutiveSummary(metrics, openAiKey.value());
      const pdf = await generatePDF(metrics, summary);
      functions.logger.info("[dailyMetricsReport] PDF generated", {sizeBytes: pdf.length});
      await sendEmail(pdf, metrics, gmailAppPassword.value());
      functions.logger.info("[dailyMetricsReport] Email sent", {to: ADMIN_EMAIL});
    } catch (err) {
      functions.logger.error("[dailyMetricsReport] Failed", err);
      throw err;
    }
  });
