import { LegalLayout, SUPPORT_EMAIL, legalText } from '../LegalLayout';

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy">
      <h2 style={legalText.sectionTitle}>Information We Collect</h2>
      <p style={legalText.p}>
        We collect information you provide when you use HalfOrder, such as your
        name, email address, and usage data related to how you interact with the
        service (for example, orders you create or join and basic app activity)
        so we can operate and improve the product.
      </p>

      <h2 style={legalText.sectionTitle}>How We Use Information</h2>
      <p style={legalText.p}>
        We use this information to provide and improve HalfOrder, to connect you
        with other users for shared orders, to communicate with you about your
        account or support requests, and to keep the platform safe and reliable.
      </p>

      <h2 style={legalText.sectionTitle}>Data Sharing</h2>
      <p style={legalText.p}>
        We do not sell your personal data. We may share information only as
        needed to run the service (for example, with infrastructure or email
        providers under contract) or when required by law.
      </p>

      <h2 style={legalText.sectionTitle}>Contact</h2>
      <p style={legalText.p}>
        Questions about this policy:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#007aff', fontWeight: 600 }}>
          {SUPPORT_EMAIL}
        </a>
      </p>
    </LegalLayout>
  );
}
