import type { CSSProperties } from 'react';
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

const subheading: CSSProperties = {
  margin: '1rem 0 0.45rem',
  fontSize: 'clamp(1rem, 2.5vw, 1.08rem)',
  fontWeight: 600,
  color: '#0d1726',
};

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy – HalfOrder">
      <p style={{ ...legalText.p, marginBottom: '0.5rem' }}>
        <strong>Last Updated:</strong> August 2026
      </p>
      <p style={legalText.p}>
        HalfOrder (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) respects your privacy and is
        committed to protecting your personal data. This Privacy Policy explains
        what information we collect, how we use it, and your rights regarding
        your data. By using HalfOrder, you agree to the practices described in
        this policy.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>1. Information We Collect</h2>
      <p style={legalText.p}>
        We collect information you provide directly and information generated
        through your use of the app.
      </p>

      <h3 style={subheading}>a. Personal Information</h3>
      <ul style={list}>
        <li style={listItem}>Full name</li>
        <li style={listItem}>Email address</li>
        <li style={listItem}>
          Phone number (for order coordination and account verification)
        </li>
        <li style={listItem}>Profile photo (if uploaded)</li>
        <li style={listItem}>
          Sign-in method (Email/Password, Google, or Apple ID)
        </li>
      </ul>

      <h3 style={subheading}>b. Payment Information</h3>
      <ul style={list}>
        <li style={listItem}>
          Payment method type (card brand, last 4 digits) — stored securely by
          Stripe
        </li>
        <li style={listItem}>
          Apple Pay tokens — processed by Apple and Stripe; we never see your
          full card details
        </li>
        <li style={listItem}>
          Transaction history (order amounts, dates, payment status)
        </li>
        <li style={listItem}>HalfOrder Cash balance and transaction records</li>
      </ul>
      <p style={legalText.p}>
        We do <strong>not</strong> store your full card number, CVV, or
        expiry date. All card data is handled by Stripe. See{' '}
        <a
          href="https://stripe.com/privacy"
          style={{ color: '#007aff' }}
          target="_blank"
          rel="noopener noreferrer"
        >
          Stripe's Privacy Policy
        </a>{' '}
        for details.
      </p>

      <h3 style={subheading}>c. Location Data</h3>
      <ul style={list}>
        <li style={listItem}>
          Approximate GPS location — used to show nearby restaurants, match
          users for food sharing, and estimate delivery areas.
        </li>
        <li style={listItem}>
          Driver location — collected while a delivery is active to show
          real-time tracking to customers.
        </li>
      </ul>
      <p style={legalText.p}>
        We do <strong>not</strong> track your location continuously in the
        background when you are not actively using the app.
      </p>

      <h3 style={subheading}>d. Usage &amp; Activity Data</h3>
      <ul style={list}>
        <li style={listItem}>Orders created, joined, or completed</li>
        <li style={listItem}>Swipe and match activity</li>
        <li style={listItem}>Messages sent between users</li>
        <li style={listItem}>App screens viewed and features used</li>
        <li style={listItem}>Referrals sent and accepted</li>
      </ul>

      <h3 style={subheading}>e. Device Information</h3>
      <ul style={list}>
        <li style={listItem}>Device type and operating system</li>
        <li style={listItem}>Push notification token</li>
        <li style={listItem}>App version</li>
        <li style={listItem}>Crash logs and error reports</li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>2. How We Use Your Information</h2>
      <p style={legalText.p}>We use your data to:</p>
      <ul style={list}>
        <li style={listItem}>
          Provide and operate all HalfOrder features (Swipe, Full Order, Food
          Share, delivery)
        </li>
        <li style={listItem}>
          Process payments and manage HalfOrder Cash balances
        </li>
        <li style={listItem}>
          Match users with nearby restaurants and food-sharing opportunities
        </li>
        <li style={listItem}>
          Enable real-time delivery tracking for customers and drivers
        </li>
        <li style={listItem}>
          Send order confirmations, status updates, and push notifications
        </li>
        <li style={listItem}>
          Detect and prevent fraud, abuse, or unauthorized activity
        </li>
        <li style={listItem}>
          Improve app performance, fix bugs, and develop new features
        </li>
        <li style={listItem}>
          Comply with legal obligations and enforce our Terms of Service
        </li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>3. Payment &amp; Stripe</h2>
      <p style={legalText.p}>
        All payments on HalfOrder are processed by{' '}
        <strong>Stripe, Inc.</strong>, a PCI-DSS-compliant payment processor.
        When you make a payment:
      </p>
      <ul style={list}>
        <li style={listItem}>
          Your card details are encrypted and sent directly to Stripe — we
          never see or store your full card number.
        </li>
        <li style={listItem}>
          Apple Pay tokens are processed by Apple and Stripe without exposing
          your card data to HalfOrder.
        </li>
        <li style={listItem}>
          Driver payouts are processed via Stripe Connect.
        </li>
        <li style={listItem}>
          Restaurant payouts are processed via Stripe Connect after applicable
          platform fees.
        </li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>4. Location Data</h2>
      <p style={legalText.p}>
        We request access to your device location to:
      </p>
      <ul style={list}>
        <li style={listItem}>
          Show restaurants and food cards near your current location.
        </li>
        <li style={listItem}>
          Set your delivery address automatically.
        </li>
        <li style={listItem}>
          Track driver location during active deliveries (drivers only).
        </li>
      </ul>
      <p style={legalText.p}>
        You can revoke location access at any time in your device Settings.
        Some features may not work without location access.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>5. Photos &amp; Camera</h2>
      <p style={legalText.p}>
        We may request access to your camera or photo library to:
      </p>
      <ul style={list}>
        <li style={listItem}>Upload a profile photo.</li>
        <li style={listItem}>Add food photos to your orders or food cards.</li>
      </ul>
      <p style={legalText.p}>
        We only access photos you explicitly select. We do{' '}
        <strong>not</strong> scan or access your full photo library. All
        uploaded images are stored securely on Firebase Storage.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>6. Messaging &amp; Chat</h2>
      <p style={legalText.p}>
        Messages between users (customers, drivers, restaurants) are stored in
        Firebase Firestore to:
      </p>
      <ul style={list}>
        <li style={listItem}>Enable in-app communication.</li>
        <li style={listItem}>Resolve disputes between users.</li>
        <li style={listItem}>Detect and prevent abuse or harmful content.</li>
      </ul>
      <p style={legalText.p}>
        We do <strong>not</strong> sell or share your messages with third
        parties for advertising purposes.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>7. Driver Data</h2>
      <p style={legalText.p}>
        For driver accounts, we collect additional information:
      </p>
      <ul style={list}>
        <li style={listItem}>Real-time location during active deliveries.</li>
        <li style={listItem}>
          Delivery history, completion rate, and ratings.
        </li>
        <li style={listItem}>
          Stripe Connect account details for payout processing.
        </li>
      </ul>
      <p style={legalText.p}>
        Driver location is shared with the assigned customer during an active
        delivery only. It is not visible to other users.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>8. Restaurant Data</h2>
      <p style={legalText.p}>
        For restaurant accounts, we collect:
      </p>
      <ul style={list}>
        <li style={listItem}>Restaurant name, address, and contact details.</li>
        <li style={listItem}>Menu items, prices, and photos.</li>
        <li style={listItem}>Order history and fulfillment data.</li>
        <li style={listItem}>
          Stripe Connect account details for payout processing.
        </li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>9. Data Sharing</h2>
      <p style={legalText.p}>
        We do <strong>not</strong> sell your personal data to advertisers or
        third parties.
      </p>
      <p style={legalText.p}>We may share your data with:</p>
      <ul style={list}>
        <li style={listItem}>
          <strong>Stripe</strong> — for payment processing and driver/restaurant
          payouts.
        </li>
        <li style={listItem}>
          <strong>Firebase (Google)</strong> — for database, authentication,
          storage, and push notifications.
        </li>
        <li style={listItem}>
          <strong>Other users</strong> — your display name and photo are visible
          to users you match or transact with.
        </li>
        <li style={listItem}>
          <strong>Law enforcement</strong> — if required by applicable law or
          court order.
        </li>
        <li style={listItem}>
          <strong>Safety purposes</strong> — to protect users or prevent fraud.
        </li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>10. Push Notifications</h2>
      <p style={legalText.p}>
        We send push notifications for:
      </p>
      <ul style={list}>
        <li style={listItem}>Order confirmations and status updates.</li>
        <li style={listItem}>New messages from other users.</li>
        <li style={listItem}>Driver assignment and delivery updates.</li>
        <li style={listItem}>Promotions and platform announcements.</li>
      </ul>
      <p style={legalText.p}>
        You can disable push notifications at any time in your device Settings.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>11. Data Security</h2>
      <p style={legalText.p}>
        We implement industry-standard security measures including:
      </p>
      <ul style={list}>
        <li style={listItem}>
          Firebase Security Rules to restrict data access.
        </li>
        <li style={listItem}>
          Encrypted connections (HTTPS/TLS) for all data in transit.
        </li>
        <li style={listItem}>
          Stripe's PCI-DSS-compliant infrastructure for payment data.
        </li>
        <li style={listItem}>
          Firebase Authentication for secure account access.
        </li>
      </ul>
      <p style={legalText.p}>
        However, no system is 100% secure. We encourage you to use a strong,
        unique password and enable device security features.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>12. Your Rights</h2>
      <p style={legalText.p}>
        Under Canadian privacy law (PIPEDA) and applicable provincial laws,
        you have the right to:
      </p>
      <ul style={list}>
        <li style={listItem}>
          <strong>Access</strong> the personal data we hold about you.
        </li>
        <li style={listItem}>
          <strong>Correct</strong> inaccurate or outdated information.
        </li>
        <li style={listItem}>
          <strong>Delete</strong> your account and associated personal data.
        </li>
        <li style={listItem}>
          <strong>Withdraw consent</strong> for data processing (which may
          limit app functionality).
        </li>
        <li style={listItem}>
          <strong>Port</strong> your data in a machine-readable format.
        </li>
      </ul>
      <p style={legalText.p}>
        To exercise any of these rights, contact us at:{' '}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          style={{ color: '#007aff', fontWeight: 600 }}
        >
          {SUPPORT_EMAIL}
        </a>
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>13. Data Retention</h2>
      <p style={legalText.p}>
        We retain your data for as long as your account is active or as
        required to provide the service. Specific retention periods:
      </p>
      <ul style={list}>
        <li style={listItem}>
          Account data — retained until you request deletion.
        </li>
        <li style={listItem}>
          Transaction records — retained for 7 years for legal and tax
          compliance.
        </li>
        <li style={listItem}>
          Messages — retained for 2 years for dispute resolution.
        </li>
        <li style={listItem}>
          Deleted account data — removed within 30 days, except where
          retention is legally required.
        </li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>14. Children&apos;s Privacy</h2>
      <p style={legalText.p}>
        HalfOrder is not intended for users under the age of 18. We do not
        knowingly collect personal information from anyone under 18. If we
        become aware that a minor has created an account, we will promptly
        delete it.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>15. Third-Party Services</h2>
      <p style={legalText.p}>
        HalfOrder uses the following third-party services that have their own
        privacy policies:
      </p>
      <ul style={list}>
        <li style={listItem}>
          <strong>Firebase (Google)</strong> —{' '}
          <a
            href="https://firebase.google.com/support/privacy"
            style={{ color: '#007aff' }}
            target="_blank"
            rel="noopener noreferrer"
          >
            firebase.google.com/support/privacy
          </a>
        </li>
        <li style={listItem}>
          <strong>Stripe</strong> —{' '}
          <a
            href="https://stripe.com/privacy"
            style={{ color: '#007aff' }}
            target="_blank"
            rel="noopener noreferrer"
          >
            stripe.com/privacy
          </a>
        </li>
        <li style={listItem}>
          <strong>Google Maps</strong> — used for location and address
          autocomplete.
        </li>
        <li style={listItem}>
          <strong>Apple Sign In</strong> — sign-in via Apple ID; Apple may
          share a masked email with us.
        </li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>16. Changes to This Policy</h2>
      <p style={legalText.p}>
        We may update this Privacy Policy from time to time. When we make
        material changes, we will notify you through the app and require your
        acknowledgment before continued use. The updated policy will be
        effective as of the date shown at the top of this page.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>17. Governing Law</h2>
      <p style={legalText.p}>
        This Privacy Policy is governed by the laws of Canada, including the
        Personal Information Protection and Electronic Documents Act (PIPEDA)
        and applicable provincial legislation.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>18. Contact Us</h2>
      <p style={legalText.p}>
        For any privacy questions, data requests, or concerns:
      </p>
      <p style={legalText.p}>
        <strong>Email:</strong>{' '}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          style={{ color: '#007aff', fontWeight: 600 }}
        >
          {SUPPORT_EMAIL}
        </a>
      </p>

      <hr style={hr} />

      <p style={legalText.footerNote}>
        By using HalfOrder, you acknowledge that you have read and understood
        this Privacy Policy and consent to the collection and use of your
        information as described herein.
      </p>
    </LegalLayout>
  );
}
