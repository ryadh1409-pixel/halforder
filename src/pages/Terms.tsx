import { LegalLayout, SUPPORT_EMAIL, legalText } from '../LegalLayout';

export default function Terms() {
  return (
    <LegalLayout title="Terms of Service">
      <h2 style={legalText.sectionTitle}>Service Description</h2>
      <p style={legalText.p}>
        HalfOrder helps connect users who want to share food orders. We provide a
        platform for coordination; the actual arrangement of orders, pickup, and
        payment between users is your responsibility as described below.
      </p>

      <h2 style={legalText.sectionTitle}>Payments</h2>
      <p style={legalText.p}>
        Payments for food and related costs are handled outside the HalfOrder
        app (for example, directly between you, the merchant, or other users).
        HalfOrder does not process or hold payments for your orders unless we
        clearly state otherwise in the product.
      </p>

      <h2 style={legalText.sectionTitle}>User Responsibility</h2>
      <p style={legalText.p}>
        You are responsible for your conduct, the accuracy of information you
        provide, and your agreements with other users. You agree not to misuse
        the service, harass others, or post unlawful or harmful content.
      </p>

      <h2 style={legalText.sectionTitle}>Limitation of Liability</h2>
      <p style={legalText.p}>
        HalfOrder is provided &quot;as is.&quot; To the fullest extent permitted by
        law, we are not liable for indirect, incidental, or consequential
        damages, or for disputes or losses arising between you and other users or
        third parties. Your use of the service is at your own risk.
      </p>

      <h2 style={legalText.sectionTitle}>Contact</h2>
      <p style={legalText.p}>
        Questions about these terms:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#007aff', fontWeight: 600 }}>
          {SUPPORT_EMAIL}
        </a>
      </p>
    </LegalLayout>
  );
}
