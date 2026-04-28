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

export default function SafetyGuidelines() {
  return (
    <LegalLayout title="Safety & Community Guidelines – HalfOrder">
      <p style={{ ...legalText.p, marginBottom: '0.5rem' }}>
        <strong>Last Updated:</strong> April 2026
      </p>
      <p style={legalText.p}>
        At HalfOrder, we are committed to creating a safe, respectful, and
        trustworthy environment for all users.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>1. Respect &amp; Behavior</h2>
      <p style={legalText.p}>Users must:</p>
      <ul style={list}>
        <li style={listItem}>Treat others with respect</li>
        <li style={listItem}>Communicate clearly and honestly</li>
        <li style={listItem}>
          Avoid offensive, abusive, or discriminatory language
        </li>
      </ul>
      <p style={legalText.p}>
        Harassment, threats, or inappropriate behavior will result in account
        suspension.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>2. Honest Use of the Platform</h2>
      <p style={legalText.p}>You agree to:</p>
      <ul style={list}>
        <li style={listItem}>Create genuine food orders only</li>
        <li style={listItem}>
          Provide accurate details (restaurant, price, location)
        </li>
        <li style={listItem}>Not mislead or scam other users</li>
      </ul>
      <p style={legalText.p}>
        Any fraudulent activity will lead to immediate removal.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>3. Meeting &amp; Personal Safety</h2>
      <p style={legalText.p}>
        HalfOrder connects users, but does not supervise interactions.
      </p>
      <p style={legalText.p}>For your safety:</p>
      <ul style={list}>
        <li style={listItem}>Meet in public places when possible</li>
        <li style={listItem}>Avoid sharing sensitive personal information</li>
        <li style={listItem}>Use your judgment before meeting someone</li>
      </ul>
      <p style={legalText.p}>You are responsible for your personal safety.</p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>4. Food Responsibility</h2>
      <p style={legalText.p}>Users are responsible for:</p>
      <ul style={list}>
        <li style={listItem}>Choosing where to order from</li>
        <li style={listItem}>Confirming food quality and safety</li>
        <li style={listItem}>Managing allergies or dietary restrictions</li>
      </ul>
      <p style={legalText.p}>
        HalfOrder does not verify restaurants or food quality.
      </p>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>5. Prohibited Content</h2>
      <p style={legalText.p}>The following is strictly prohibited:</p>
      <ul style={list}>
        <li style={listItem}>Fake orders</li>
        <li style={listItem}>Spam or promotional abuse</li>
        <li style={listItem}>Offensive images or messages</li>
        <li style={listItem}>Illegal activities</li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>6. Reporting &amp; Enforcement</h2>
      <p style={legalText.p}>
        If you encounter unsafe behavior, report to:{' '}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          style={{ color: '#007aff', fontWeight: 600 }}
        >
          {SUPPORT_EMAIL}
        </a>
      </p>
      <p style={legalText.p}>We may:</p>
      <ul style={list}>
        <li style={listItem}>Review content</li>
        <li style={listItem}>Suspend or remove accounts</li>
        <li style={listItem}>Take necessary action without notice</li>
      </ul>

      <hr style={hr} />

      <h2 style={legalText.sectionTitle}>7. Our Role</h2>
      <p style={legalText.p}>HalfOrder is a coordination platform only.</p>
      <p style={legalText.p}>We do not:</p>
      <ul style={list}>
        <li style={listItem}>Facilitate payments</li>
        <li style={listItem}>Guarantee transactions</li>
        <li style={listItem}>Verify users or food providers</li>
      </ul>

      <hr style={hr} />

      <p style={legalText.footerNote}>
        By using HalfOrder, you agree to follow these guidelines and help
        maintain a safe community.
      </p>
    </LegalLayout>
  );
}
