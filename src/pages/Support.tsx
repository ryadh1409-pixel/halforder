import { LegalLayout, SUPPORT_EMAIL, legalText } from '../LegalLayout';

export default function Support() {
  return (
    <LegalLayout title="HalfOrder Support">
      <p style={legalText.p}>
        If you need help or have any questions, contact us:
      </p>
      <p style={legalText.p}>
        Email:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#007aff', fontWeight: 600 }}>
          {SUPPORT_EMAIL}
        </a>
      </p>
      <p style={legalText.footerNote}>
        We usually respond within 24 hours.
      </p>
    </LegalLayout>
  );
}
