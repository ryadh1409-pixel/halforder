import type { ReactNode } from 'react';

const PRIMARY = '#007aff';

const styles = {
  outer: {
    minHeight: '100vh',
    padding: 'clamp(16px, 4vw, 32px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
  } as const,
  card: {
    width: '100%',
    maxWidth: 640,
    marginTop: 'clamp(24px, 6vh, 48px)',
    marginBottom: 48,
    padding: 'clamp(20px, 5vw, 36px)',
    background: '#fff',
    borderRadius: 16,
    boxShadow:
      '0 4px 24px rgba(0, 90, 200, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06)',
  } as const,
  title: {
    margin: '0 0 20px',
    fontSize: 'clamp(1.5rem, 4vw, 1.85rem)',
    fontWeight: 700,
    color: '#0d1726',
    lineHeight: 1.25,
  } as const,
  link: {
    color: PRIMARY,
    fontWeight: 600,
    textDecoration: 'none',
  } as const,
  linkHover: {
    textDecoration: 'underline',
  } as const,
};

type LegalLayoutProps = {
  title: string;
  children: ReactNode;
};

export function LegalLayout({ title, children }: LegalLayoutProps) {
  return (
    <div style={styles.outer}>
      <article style={styles.card}>
        <h1 style={styles.title}>{title}</h1>
        <div className="legal-body">{children}</div>
      </article>
    </div>
  );
}

export const legalText = {
  p: {
    margin: '0 0 1rem',
    fontSize: 'clamp(0.95rem, 2.5vw, 1.05rem)',
    color: '#333',
  } as const,
  sectionTitle: {
    margin: '1.5rem 0 0.6rem',
    fontSize: 'clamp(1.05rem, 2.8vw, 1.15rem)',
    fontWeight: 700,
    color: '#0d1726',
  } as const,
  footerNote: {
    marginTop: '1.75rem',
    paddingTop: '1.25rem',
    borderTop: '1px solid #e8ecf1',
    fontSize: '0.95rem',
    color: '#5c6b7a',
  } as const,
};

export const SUPPORT_EMAIL = 'support@halforder.app';
export const primaryColor = PRIMARY;
