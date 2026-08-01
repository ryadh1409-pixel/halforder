import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { LegalLayout, SUPPORT_EMAIL, legalText } from '../LegalLayout';

const hr = {
  border: 'none',
  borderTop: '1px solid #e8ecf1',
  margin: '1.5rem 0',
} as const;

const list: CSSProperties = {
  margin: '0 0 1rem',
  paddingLeft: '1.25rem',
  fontSize: 'clamp(0.95rem, 2.5vw, 1.05rem)',
  color: '#333',
  lineHeight: 1.55,
};

const listItem: CSSProperties = {
  marginBottom: '0.35rem',
};

export default function Terms() {
  return (
    <LegalLayout title="Terms of Service – HalfOrder">
      <p style={{ ...legalText.p, marginBottom: '0.5rem' }}>
        <strong>Last Updated:</strong> August 2026
      </p>
      <p style={legalText.p}>
        Welcome to HalfOrder. By using our platform, you agree to the following
        Terms of Service. Please read them carefully before using the app.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>1. Overview of Service</h2>
      <p style={legalText.p}>
        HalfOrder is a mobile platform that enables users to discover, share,
        and pay for food orders. The app connects users (customers), drivers,
        and restaurants through a unified marketplace.
      </p>
      <p style={legalText.p}>HalfOrder offers the following features:</p>
      <ul style={list}>
        <li style={listItem}>
          <strong>Swipe &amp; Match:</strong> Discover food cards posted by
          other users and join or split a meal order with them.
        </li>
        <li style={listItem}>
          <strong>Full Order:</strong> Place and pay for a complete food order
          directly through the app.
        </li>
        <li style={listItem}>
          <strong>Food Share:</strong> Share a meal with another user and split
          the cost.
        </li>
        <li style={listItem}>
          <strong>Driver Delivery:</strong> Drivers pick up and deliver orders
          to customers.
        </li>
        <li style={listItem}>
          <strong>Restaurant Portal:</strong> Restaurants list their menus and
          receive orders through the platform.
        </li>
        <li style={listItem}>
          <strong>HalfOrder Cash:</strong> Earn and redeem cashback rewards on
          eligible orders.
        </li>
      </ul>
      <p style={legalText.p}>
        HalfOrder processes payments on behalf of users using Stripe, a
        third-party payment processor. HalfOrder is not a restaurant or
        delivery company.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>2. Eligibility</h2>
      <p style={legalText.p}>To use HalfOrder, you must:</p>
      <ul style={list}>
        <li style={listItem}>Be at least 18 years old.</li>
        <li style={listItem}>
          Have the legal capacity to enter into a binding agreement.
        </li>
        <li style={listItem}>
          Provide accurate, complete, and current information.
        </li>
        <li style={listItem}>
          Not be previously banned or suspended from the platform.
        </li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>3. Account Registration</h2>
      <p style={legalText.p}>
        You may register using your email address, Google account, or Apple ID.
        You are responsible for maintaining the confidentiality of your account
        credentials and for all activity that occurs under your account.
      </p>
      <p style={legalText.p}>
        You agree to notify us immediately of any unauthorized use of your
        account at{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#007aff' }}>
          {SUPPORT_EMAIL}
        </a>
        .
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>4. Payments &amp; Billing</h2>
      <p style={legalText.p}>
        HalfOrder uses <strong>Stripe</strong> to securely process all
        payments. By making a payment through the app, you agree to Stripe's
        Terms of Service and Privacy Policy.
      </p>
      <p style={legalText.p}>We accept the following payment methods:</p>
      <ul style={list}>
        <li style={listItem}>Credit and debit cards (Visa, Mastercard, Amex)</li>
        <li style={listItem}>Apple Pay</li>
        <li style={listItem}>Saved cards via Stripe</li>
        <li style={listItem}>HalfOrder Cash (platform credits)</li>
      </ul>
      <p style={legalText.p}>
        All charges are in <strong>Canadian Dollars (CAD)</strong> unless
        otherwise stated. Applicable taxes (including HST/GST) are added at
        checkout.
      </p>
      <p style={legalText.p}>
        HalfOrder does not store your full card number. Card data is tokenized
        and stored securely by Stripe.
      </p>
      <p style={legalText.p}>
        All payments are <strong>final</strong> unless a refund is approved by
        HalfOrder. Refunds are processed at HalfOrder's discretion and may
        take 5–10 business days.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>5. HalfOrder Cash &amp; Rewards</h2>
      <p style={legalText.p}>
        HalfOrder Cash is a platform credit that may be earned through eligible
        orders, referrals, or promotions.
      </p>
      <ul style={list}>
        <li style={listItem}>
          HalfOrder Cash has no cash value and cannot be withdrawn or
          transferred.
        </li>
        <li style={listItem}>
          Credits expire as described in the app at the time of issuance.
        </li>
        <li style={listItem}>
          HalfOrder reserves the right to modify, suspend, or cancel the
          rewards program at any time.
        </li>
        <li style={listItem}>
          Earned credits may be forfeited if your account is suspended or
          terminated.
        </li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>6. Swipe &amp; Food Sharing</h2>
      <p style={legalText.p}>
        The Swipe feature allows users to post food cards and match with others
        to share or split meal orders. By participating:
      </p>
      <ul style={list}>
        <li style={listItem}>
          You agree to honor any match you accept and complete the associated
          payment.
        </li>
        <li style={listItem}>
          You understand that matches are with other real users and HalfOrder
          does not guarantee match quality or outcomes.
        </li>
        <li style={listItem}>
          Canceling a confirmed match may result in a cancellation fee or
          account restriction.
        </li>
        <li style={listItem}>
          HalfOrder is not liable for disagreements between matched users.
        </li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>7. Full Orders</h2>
      <p style={legalText.p}>
        Full Orders allow users to place a complete food order through the app.
        By placing a Full Order:
      </p>
      <ul style={list}>
        <li style={listItem}>
          You authorize HalfOrder to charge your selected payment method for
          the total amount shown at checkout.
        </li>
        <li style={listItem}>
          Orders are sent directly to the restaurant for preparation.
        </li>
        <li style={listItem}>
          Cancellations may not be possible once the restaurant has confirmed
          the order.
        </li>
        <li style={listItem}>
          HalfOrder is not responsible for food quality, preparation errors, or
          restaurant delays.
        </li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>8. Driver Terms</h2>
      <p style={legalText.p}>
        Drivers on HalfOrder are independent contractors, not employees. By
        registering as a driver:
      </p>
      <ul style={list}>
        <li style={listItem}>
          You confirm that you hold a valid driver's license and are legally
          permitted to operate a vehicle in your jurisdiction.
        </li>
        <li style={listItem}>
          You are responsible for maintaining adequate vehicle insurance.
        </li>
        <li style={listItem}>
          You agree to pick up and deliver orders promptly and professionally.
        </li>
        <li style={listItem}>
          You must not misrepresent your location or falsify delivery
          confirmations.
        </li>
        <li style={listItem}>
          Driver earnings are paid via Stripe Connect. You are responsible for
          your own taxes and deductions.
        </li>
        <li style={listItem}>
          HalfOrder may deactivate driver accounts for misconduct, poor
          ratings, or violations of these terms.
        </li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>9. Restaurant Terms</h2>
      <p style={legalText.p}>
        Restaurants listed on HalfOrder agree to the following:
      </p>
      <ul style={list}>
        <li style={listItem}>
          Menu items, prices, and descriptions must be accurate and kept
          up to date.
        </li>
        <li style={listItem}>
          Restaurants are responsible for food safety, hygiene, and compliance
          with local health regulations.
        </li>
        <li style={listItem}>
          Restaurants must fulfill accepted orders promptly.
        </li>
        <li style={listItem}>
          Restaurants receive payouts via Stripe Connect after platform fees
          are deducted.
        </li>
        <li style={listItem}>
          HalfOrder may suspend or remove a restaurant listing for repeated
          complaints, unsafe practices, or violations of these terms.
        </li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>10. Phone Number &amp; Communications</h2>
      <p style={legalText.p}>
        HalfOrder may collect your phone number for the following purposes:
      </p>
      <ul style={list}>
        <li style={listItem}>
          Driver-to-customer or restaurant-to-customer coordination.
        </li>
        <li style={listItem}>Order status updates and notifications.</li>
        <li style={listItem}>Account verification and security.</li>
      </ul>
      <p style={legalText.p}>
        By providing your phone number, you consent to receiving
        order-related communications. You may opt out of marketing messages at
        any time by contacting us.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>11. User-Generated Content</h2>
      <p style={legalText.p}>
        Users may post content including food photos, messages, reviews, and
        order descriptions. By posting content, you agree that:
      </p>
      <ul style={list}>
        <li style={listItem}>You own or have rights to the content.</li>
        <li style={listItem}>Content does not violate any laws or rights.</li>
        <li style={listItem}>
          Content is not abusive, misleading, offensive, or harmful.
        </li>
        <li style={listItem}>
          You grant HalfOrder a non-exclusive, royalty-free license to display
          your content within the platform.
        </li>
      </ul>
      <p style={legalText.p}>
        HalfOrder reserves the right to remove any content at any time without
        notice.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>12. Community Guidelines</h2>
      <p style={legalText.p}>Users must not:</p>
      <ul style={list}>
        <li style={listItem}>
          Harass, threaten, or abuse other users, drivers, or restaurant staff.
        </li>
        <li style={listItem}>
          Post false, misleading, or fraudulent information.
        </li>
        <li style={listItem}>
          Attempt to manipulate ratings, reviews, or the matching system.
        </li>
        <li style={listItem}>
          Use the platform for any illegal purpose.
        </li>
        <li style={listItem}>
          Create multiple accounts to circumvent suspensions.
        </li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>13. Referral Program</h2>
      <p style={legalText.p}>
        HalfOrder may offer referral bonuses for inviting new users. Referral
        rewards are subject to eligibility requirements and may be modified or
        discontinued at any time. Fraudulent referrals will result in
        disqualification and possible account suspension.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>14. Account Suspension &amp; Termination</h2>
      <p style={legalText.p}>
        HalfOrder may suspend or permanently terminate your account if you:
      </p>
      <ul style={list}>
        <li style={listItem}>Violate these Terms of Service.</li>
        <li style={listItem}>Engage in fraudulent or harmful behavior.</li>
        <li style={listItem}>Receive repeated complaints from other users.</li>
        <li style={listItem}>Abuse the payments, rewards, or referral system.</li>
      </ul>
      <p style={legalText.p}>
        No prior notice is required in serious cases. Upon termination, any
        unused HalfOrder Cash is forfeited.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>15. Food &amp; Safety Disclaimer</h2>
      <p style={legalText.p}>
        HalfOrder does not prepare, handle, or deliver food directly. We do
        not verify:
      </p>
      <ul style={list}>
        <li style={listItem}>Food quality or ingredients</li>
        <li style={listItem}>Allergen information</li>
        <li style={listItem}>Restaurant health and safety standards</li>
      </ul>
      <p style={legalText.p}>
        Users with dietary restrictions or allergies must confirm with
        restaurants directly. HalfOrder is not liable for any health issues,
        allergic reactions, or food-related damages.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>16. Limitation of Liability</h2>
      <p style={legalText.p}>HalfOrder is provided "as is".</p>
      <p style={legalText.p}>
        To the fullest extent permitted by applicable law, HalfOrder and its
        officers, directors, employees, and agents shall not be liable for:
      </p>
      <ul style={list}>
        <li style={listItem}>
          Any indirect, incidental, special, or consequential damages.
        </li>
        <li style={listItem}>
          Failed or delayed deliveries, order errors, or restaurant closures.
        </li>
        <li style={listItem}>
          Disputes between users, drivers, or restaurants.
        </li>
        <li style={listItem}>
          Unauthorized access to your account or payment data.
        </li>
        <li style={listItem}>Food quality, safety, or allergen issues.</li>
      </ul>
      <p style={legalText.p}>
        Our total liability shall not exceed the amount you paid for the
        specific transaction giving rise to the claim.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>17. Privacy</h2>
      <p style={legalText.p}>
        Your use of the app is governed by our{' '}
        <Link to="/privacy" style={{ color: '#007aff', fontWeight: 600 }}>
          Privacy Policy
        </Link>
        , which is incorporated into these Terms by reference.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>18. Changes to Terms</h2>
      <p style={legalText.p}>
        We may update these Terms at any time. When we make material changes,
        we will notify you through the app and require your acceptance before
        continued use. Continued use of the app after notification constitutes
        acceptance of the updated Terms.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>19. Governing Law</h2>
      <p style={legalText.p}>
        These Terms are governed by the laws of the Province of Ontario and
        the federal laws of Canada applicable therein. Any disputes shall be
        resolved in the courts of Ontario, Canada.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>20. Contact Us</h2>
      <p style={legalText.p}>
        For questions, concerns, or support:{' '}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          style={{ color: '#007aff', fontWeight: 600 }}
        >
          {SUPPORT_EMAIL}
        </a>
      </p>

      <hr style={hr} />

      <p style={legalText.footerNote}>
        By using HalfOrder, you acknowledge that you have read, understood,
        and agree to be bound by these Terms of Service.
      </p>
    </LegalLayout>
  );
}
