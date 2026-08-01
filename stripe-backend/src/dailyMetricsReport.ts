/**
 * Daily HalfOrder Metrics Report
 * Runs every day at 2:00 PM Ottawa time (America/Toronto).
 * Fetches all key startup metrics from Firestore,
 * generates an AI executive summary via OpenAI,
 * creates a PDF, and emails it to the admin.
 */
import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import {defineSecret} from "firebase-functions/params";
import OpenAI from "openai";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";

// ── Secrets (set via: firebase functions:secrets:set GMAIL_APP_PASSWORD) ──────
const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");
const openAiKey = defineSecret("OPENAI_API_KEY");

const ADMIN_EMAIL = "ryadh1409@gmail.com";
const GMAIL_USER = "ryadh1409@gmail.com";

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfDayMs(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeekMs(date: Date): number {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonthMs(date: Date): number {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function tsToMs(ts: admin.firestore.Timestamp | null | undefined): number {
  return ts ? ts.toMillis() : 0;
}

function fmt(n: number): string {
  return n.toLocaleString("en-CA");
}

function fmtCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}

// ── Metric Types ──────────────────────────────────────────────────────────────

interface DailyMetrics {
  date: string;
  generatedAt: string;

  // Users
  totalUsers: number;
  newUsersToday: number;
  newUsersWeek: number;
  newUsersMonth: number;
  activeUsersToday: number; // from userActivity

  // Orders
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

  // Restaurants
  totalRestaurants: number;
  openRestaurants: number;

  // Drivers
  totalDrivers: number;
  onlineDrivers: number;

  // Referrals
  totalReferrals: number;
  successfulReferrals: number;
  referralConversionRate: number;

  // Food Share
  totalMatches: number;
  activeMatches: number;
  foodShareRevenue: number;

  // Stripe / Payments
  paidPayments: number;
  failedPayments: number;
  refundedPayments: number;
  grossRevenue: number;
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
    db.collection("orders").orderBy("createdAt", "desc").limit(500).get(),
    db.collection("restaurants").limit(200).get(),
    db.collection("drivers").limit(200).get(),
    db.collection("friendReferrals").limit(500).get(),
    db.collection("matches").limit(500).get(),
    db.collection("userActivity").limit(1000).get(),
  ]);

  // ── Users ────────────────────────────────────────────────────────
  let newUsersToday = 0;
  let newUsersWeek = 0;
  let newUsersMonth = 0;
  usersSnap.docs.forEach((d) => {
    const ms = tsToMs(d.data().createdAt as admin.firestore.Timestamp);
    if (ms >= todayMs) newUsersToday++;
    if (ms >= weekMs) newUsersWeek++;
    if (ms >= monthMs) newUsersMonth++;
  });

  // ── Active users today (from userActivity) ────────────────────────
  let activeUsersToday = 0;
  activitySnap.docs.forEach((d) => {
    const ms = tsToMs(d.data().lastActiveAt as admin.firestore.Timestamp);
    if (ms >= todayMs) activeUsersToday++;
  });

  // ── Orders ───────────────────────────────────────────────────────
  let ordersToday = 0;
  let ordersWeek = 0;
  let ordersMonth = 0;
  let revenueToday = 0;
  let revenueWeek = 0;
  let revenueMonth = 0;
  let completedOrders = 0;
  let pendingOrders = 0;

  ordersSnap.docs.forEach((d) => {
    const data = d.data();
    const ms = tsToMs(data.createdAt as admin.firestore.Timestamp);
    const price: number = typeof data.totalPrice === "number" ? data.totalPrice : 0;
    const payStatus: string = (data.paymentStatus as string) || "";
    const status: string = ((data.status as string) || "").toLowerCase();

    if (ms >= todayMs) { ordersToday++; if (payStatus === "paid") revenueToday += price; }
    if (ms >= weekMs) { ordersWeek++; if (payStatus === "paid") revenueWeek += price; }
    if (ms >= monthMs) { ordersMonth++; if (payStatus === "paid") revenueMonth += price; }
    if (status === "completed" || status === "delivered") completedOrders++;
    if (status === "pending" || status === "accepted" || status === "preparing") pendingOrders++;
  });

  const totalOrders = ordersSnap.size;
  const avgOrderValue = totalOrders > 0 ? revenueMonth / Math.max(ordersMonth, 1) : 0;
  const completionRate = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;

  // ── Restaurants ──────────────────────────────────────────────────
  let openRestaurants = 0;
  restaurantsSnap.docs.forEach((d) => { if (d.data().isOpen) openRestaurants++; });

  // ── Drivers ──────────────────────────────────────────────────────
  let onlineDrivers = 0;
  driversSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.isOnline || data.online) onlineDrivers++;
  });

  // ── Referrals ─────────────────────────────────────────────────────
  let successfulReferrals = 0;
  referralsSnap.docs.forEach((d) => {
    const s: string = (d.data().status as string) || "";
    if (s === "reward_issued" || s === "completed_first_order") successfulReferrals++;
  });
  const totalReferrals = referralsSnap.size;
  const referralConversionRate = totalReferrals > 0
    ? Math.round((successfulReferrals / totalReferrals) * 100)
    : 0;

  // ── Food Share / Matches ──────────────────────────────────────────
  let activeMatches = 0;
  let foodShareRevenue = 0;
  matchesSnap.docs.forEach((d) => {
    const data = d.data();
    const lc: string = ((data.lifecycle as string) || "").toUpperCase();
    if (lc === "MATCHED" || lc === "PAYMENT_CONFIRMED") activeMatches++;
    if (typeof data.totalPrice === "number") foodShareRevenue += data.totalPrice as number;
  });

  // ── Gross revenue (all paid orders + food share) ──────────────────
  const grossRevenue = revenueMonth + foodShareRevenue;

  // ── Payment stats ─────────────────────────────────────────────────
  let paidPayments = 0;
  let failedPayments = 0;
  let refundedPayments = 0;
  ordersSnap.docs.forEach((d) => {
    const ps: string = (d.data().paymentStatus as string) || "";
    if (ps === "paid") paidPayments++;
    else if (ps === "failed") failedPayments++;
    else if (ps === "refunded") refundedPayments++;
  });

  const ottawaDate = now.toLocaleDateString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const generatedAt = now.toLocaleTimeString("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
  });

  return {
    date: ottawaDate,
    generatedAt,
    totalUsers: usersSnap.size,
    newUsersToday,
    newUsersWeek,
    newUsersMonth,
    activeUsersToday,
    totalOrders,
    ordersToday,
    ordersWeek,
    ordersMonth,
    revenueToday,
    revenueWeek,
    revenueMonth,
    avgOrderValue,
    completedOrders,
    pendingOrders,
    completionRate,
    totalRestaurants: restaurantsSnap.size,
    openRestaurants,
    totalDrivers: driversSnap.size,
    onlineDrivers,
    totalReferrals,
    successfulReferrals,
    referralConversionRate,
    totalMatches: matchesSnap.size,
    activeMatches,
    foodShareRevenue,
    paidPayments,
    failedPayments,
    refundedPayments,
    grossRevenue,
  };
}

// ── AI Executive Summary ──────────────────────────────────────────────────────

async function generateExecutiveSummary(m: DailyMetrics, apiKey: string): Promise<string> {
  try {
    const openai = new OpenAI({apiKey});
    const prompt = `You are the Chief of Staff at HalfOrder, a Canadian food-sharing startup. Write a concise executive summary (3-5 sentences) for today's daily metrics report. Highlight what's going well, any concerns, and one forward-looking insight. Be data-driven and professional. Tone: confident startup founder.

Today's metrics (${m.date}):
- Users: ${m.totalUsers} total | +${m.newUsersToday} today | +${m.newUsersWeek} this week | ${m.activeUsersToday} active today
- Orders: ${m.ordersToday} today | ${m.ordersWeek} this week | Revenue today: ${fmtCurrency(m.revenueToday)} | Week: ${fmtCurrency(m.revenueWeek)}
- Avg order value: ${fmtCurrency(m.avgOrderValue)} | Completion rate: ${m.completionRate}%
- Restaurants: ${m.totalRestaurants} total | ${m.openRestaurants} open now
- Drivers: ${m.totalDrivers} total | ${m.onlineDrivers} online now
- Referrals: ${m.totalReferrals} total | ${m.successfulReferrals} successful | ${m.referralConversionRate}% conversion
- Food Share matches: ${m.activeMatches} active | ${m.totalMatches} total
- Gross revenue this month: ${fmtCurrency(m.grossRevenue)}`;

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{role: "user", content: prompt}],
      max_tokens: 200,
    });
    return res.choices[0]?.message?.content?.trim() ?? "Executive summary unavailable.";
  } catch {
    return "Executive summary unavailable — OpenAI call failed.";
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
    const W = doc.page.width - 100; // usable width

    // ── Header ──────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 90).fill(PRIMARY);
    doc.fillColor("#FFFFFF").fontSize(26).font("Helvetica-Bold")
      .text("HalfOrder", 50, 25);
    doc.fontSize(11).font("Helvetica")
      .text("Daily Startup Metrics Report", 50, 56);
    doc.fontSize(10)
      .text(`Generated ${m.date} at ${m.generatedAt} Ottawa time`, 50, 72);

    doc.moveDown(3);

    // ── Executive Summary ────────────────────────────────────────────
    doc.fillColor(PRIMARY).fontSize(13).font("Helvetica-Bold")
      .text("Executive Summary", 50, 110);
    doc.moveTo(50, 128).lineTo(50 + W, 128).strokeColor(PRIMARY).lineWidth(1.5).stroke();

    doc.fillColor(DARK).fontSize(10.5).font("Helvetica")
      .text(summary, 50, 135, {width: W, lineGap: 4});

    const summaryBottom = doc.y + 20;

    // ── Section helper ───────────────────────────────────────────────
    function section(title: string, y: number): number {
      doc.fillColor(PRIMARY).fontSize(12).font("Helvetica-Bold").text(title, 50, y);
      doc.moveTo(50, y + 17).lineTo(50 + W, y + 17).strokeColor(PRIMARY).lineWidth(1).stroke();
      return y + 25;
    }

    function metricRow(
      label: string,
      value: string,
      y: number,
      col: number = 0,
      colWidth: number = W,
    ): number {
      const x = 50 + col * (W / 2 + 10);
      const cw = colWidth;
      doc.fillColor(GRAY).fontSize(9).font("Helvetica").text(label, x, y, {width: cw * 0.6});
      doc.fillColor(DARK).fontSize(10).font("Helvetica-Bold")
        .text(value, x + cw * 0.6, y, {width: cw * 0.38, align: "right"});
      doc.moveTo(x, y + 14).lineTo(x + cw, y + 14).strokeColor("#E5E7EB").lineWidth(0.5).stroke();
      return y + 18;
    }

    function twoCol(
      l1: string, v1: string,
      l2: string, v2: string,
      y: number,
    ): number {
      const hw = W / 2 - 5;
      metricRow(l1, v1, y, 0, hw);
      metricRow(l2, v2, y, 1, hw);
      return y + 18;
    }

    // ── Users ────────────────────────────────────────────────────────
    let y = section("👤 Users", summaryBottom);
    y = twoCol("Total Registered Users", fmt(m.totalUsers), "New Users Today", `+${fmt(m.newUsersToday)}`, y);
    y = twoCol("New Users This Week", `+${fmt(m.newUsersWeek)}`, "New Users This Month", `+${fmt(m.newUsersMonth)}`, y);
    y = metricRow("Active Users Today (page views / sign-ins)", fmt(m.activeUsersToday), y + 2);
    y += 16;

    // ── Orders ───────────────────────────────────────────────────────
    y = section("📦 Orders", y);
    y = twoCol("Orders Today", fmt(m.ordersToday), "Revenue Today", fmtCurrency(m.revenueToday), y);
    y = twoCol("Orders This Week", fmt(m.ordersWeek), "Revenue This Week", fmtCurrency(m.revenueWeek), y);
    y = twoCol("Orders This Month", fmt(m.ordersMonth), "Revenue This Month", fmtCurrency(m.revenueMonth), y);
    y = twoCol("Avg Order Value (MTD)", fmtCurrency(m.avgOrderValue), "Order Completion Rate", `${m.completionRate}%`, y);
    y = twoCol("Completed Orders (all time)", fmt(m.completedOrders), "Active / Pending Orders", fmt(m.pendingOrders), y);
    y += 16;

    // ── Payments ─────────────────────────────────────────────────────
    y = section("💳 Payments", y);
    y = twoCol("Successful Payments", fmt(m.paidPayments), "Failed Payments", fmt(m.failedPayments), y);
    y = twoCol("Refunded Payments", fmt(m.refundedPayments), "Gross Revenue (MTD)", fmtCurrency(m.grossRevenue), y);
    y += 16;

    // ── Check page space ─────────────────────────────────────────────
    if (y > 680) { doc.addPage(); y = 50; }

    // ── Restaurants & Drivers ────────────────────────────────────────
    y = section("🏪 Restaurants & 🚗 Drivers", y);
    y = twoCol("Total Restaurants", fmt(m.totalRestaurants), "Open Now", fmt(m.openRestaurants), y);
    y = twoCol("Total Drivers", fmt(m.totalDrivers), "Online Now", fmt(m.onlineDrivers), y);
    y += 16;

    // ── Referrals ─────────────────────────────────────────────────────
    y = section("🔗 Referral Program", y);
    y = twoCol("Total Referrals", fmt(m.totalReferrals), "Successful Referrals", fmt(m.successfulReferrals), y);
    y = metricRow("Referral Conversion Rate", `${m.referralConversionRate}%`, y + 2);
    y += 16;

    // ── Food Share ────────────────────────────────────────────────────
    y = section("🍽️ Food Share (Split Orders)", y);
    y = twoCol("Total Matches", fmt(m.totalMatches), "Active Matches", fmt(m.activeMatches), y);
    y = metricRow("Food Share Revenue (all time)", fmtCurrency(m.foodShareRevenue), y + 2);
    y += 20;

    // ── Investor KPI box ──────────────────────────────────────────────
    if (y > 660) { doc.addPage(); y = 50; }

    doc.rect(50, y, W, 110).fill("#F5F3FF").stroke();
    doc.fillColor(PRIMARY).fontSize(12).font("Helvetica-Bold")
      .text("📊 Investor KPI Snapshot", 62, y + 10);

    const kpis = [
      ["Total Users", fmt(m.totalUsers)],
      ["Weekly Active Users", fmt(m.activeUsersToday * 7)],
      ["MoM User Growth", `+${fmt(m.newUsersMonth)} users`],
      ["Monthly Revenue", fmtCurrency(m.grossRevenue)],
      ["Avg Order Value", fmtCurrency(m.avgOrderValue)],
      ["Order Completion Rate", `${m.completionRate}%`],
      ["Referral Conv. Rate", `${m.referralConversionRate}%`],
      ["Active Restaurants", fmt(m.openRestaurants)],
    ];

    const kpiY = y + 30;
    const kpiCols = 4;
    kpis.forEach(([label, val], i) => {
      const col = i % kpiCols;
      const row = Math.floor(i / kpiCols);
      const kx = 60 + col * (W / kpiCols);
      const ky = kpiY + row * 32;
      doc.fillColor(GRAY).fontSize(8).font("Helvetica").text(label, kx, ky, {width: W / kpiCols - 5});
      doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text(val, kx, ky + 11);
    });

    // ── Footer ────────────────────────────────────────────────────────
    doc.fillColor(GRAY).fontSize(8).font("Helvetica")
      .text(
        `HalfOrder — Confidential — ${m.date} — Auto-generated by HalfOrder Analytics`,
        50,
        doc.page.height - 35,
        {width: W, align: "center"},
      );

    doc.end();
  });
}

// ── Send Email ────────────────────────────────────────────────────────────────

async function sendEmail(
  pdfBuffer: Buffer,
  m: DailyMetrics,
  appPassword: string,
): Promise<void> {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {user: GMAIL_USER, pass: appPassword},
  });

  const subject = `📊 HalfOrder Daily Report — ${m.date}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:sans-serif;background:#F9FAFB;margin:0;padding:0;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:#7C3AED;padding:28px 32px;">
      <h1 style="color:#fff;margin:0;font-size:22px;">HalfOrder Daily Report</h1>
      <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">${m.date} · Generated at ${m.generatedAt} Ottawa</p>
    </div>
    <div style="padding:28px 32px;">
      <h2 style="font-size:15px;color:#111827;margin:0 0 16px;">Today at a glance</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #F3F4F6;color:#6B7280;">New Users Today</td>
          <td style="padding:8px 0;border-bottom:1px solid #F3F4F6;font-weight:700;color:#111827;text-align:right;">+${fmt(m.newUsersToday)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #F3F4F6;color:#6B7280;">Orders Today</td>
          <td style="padding:8px 0;border-bottom:1px solid #F3F4F6;font-weight:700;color:#111827;text-align:right;">${fmt(m.ordersToday)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #F3F4F6;color:#6B7280;">Revenue Today</td>
          <td style="padding:8px 0;border-bottom:1px solid #F3F4F6;font-weight:700;color:#059669;text-align:right;">${fmtCurrency(m.revenueToday)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #F3F4F6;color:#6B7280;">Revenue This Week</td>
          <td style="padding:8px 0;border-bottom:1px solid #F3F4F6;font-weight:700;color:#059669;text-align:right;">${fmtCurrency(m.revenueWeek)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #F3F4F6;color:#6B7280;">Active Users Today</td>
          <td style="padding:8px 0;border-bottom:1px solid #F3F4F6;font-weight:700;color:#111827;text-align:right;">${fmt(m.activeUsersToday)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #F3F4F6;color:#6B7280;">Drivers Online Now</td>
          <td style="padding:8px 0;border-bottom:1px solid #F3F4F6;font-weight:700;color:#111827;text-align:right;">${fmt(m.onlineDrivers)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6B7280;">Monthly Gross Revenue</td>
          <td style="padding:8px 0;font-weight:700;color:#059669;text-align:right;">${fmtCurrency(m.grossRevenue)}</td>
        </tr>
      </table>
      <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">Full metrics with investor KPI snapshot attached as PDF.</p>
    </div>
    <div style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #F3F4F6;">
      <p style="font-size:11px;color:#9CA3AF;margin:0;">HalfOrder · Confidential · Auto-generated daily at 2:00 PM Ottawa</p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"HalfOrder Analytics" <${GMAIL_USER}>`,
    to: ADMIN_EMAIL,
    subject,
    html,
    attachments: [
      {
        filename: `HalfOrder_Report_${new Date().toISOString().split("T")[0]}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

// ── Scheduled Function ────────────────────────────────────────────────────────

export const sendDailyMetricsReport = functions
  .runWith({
    secrets: [gmailAppPassword, openAiKey],
    memory: "512MB",
    timeoutSeconds: 120,
  })
  .pubsub.schedule("0 14 * * *")   // 2:00 PM
  .timeZone("America/Toronto")      // Ottawa timezone — DST handled automatically
  .onRun(async () => {
    functions.logger.info("[dailyMetricsReport] Starting daily report generation");

    try {
      const metrics = await fetchMetrics();
      functions.logger.info("[dailyMetricsReport] Metrics fetched", {
        totalUsers: metrics.totalUsers,
        ordersToday: metrics.ordersToday,
        revenueToday: metrics.revenueToday,
      });

      const summary = await generateExecutiveSummary(metrics, openAiKey.value());
      functions.logger.info("[dailyMetricsReport] AI summary generated");

      const pdf = await generatePDF(metrics, summary);
      functions.logger.info("[dailyMetricsReport] PDF generated", {sizeBytes: pdf.length});

      await sendEmail(pdf, metrics, gmailAppPassword.value());
      functions.logger.info("[dailyMetricsReport] Email sent to", {to: ADMIN_EMAIL});
    } catch (err) {
      functions.logger.error("[dailyMetricsReport] Failed", err);
      throw err;
    }
  });
