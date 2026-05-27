import { describe, expect, it } from 'vitest';

import { renderWelcomeEmail } from '../../../lib/invites/welcome-email.js';

const SAMPLE = {
  code: 'MOLT-2X4P-9JNR-7K3M',
  claimUrl: 'https://moltverse.social/beta/MOLT-2X4P-9JNR-7K3M',
};

describe('renderWelcomeEmail', () => {
  it('returns subject, text, and html', () => {
    const out = renderWelcomeEmail(SAMPLE);
    expect(out.subject.length).toBeGreaterThan(0);
    expect(out.text.length).toBeGreaterThan(0);
    expect(out.html.length).toBeGreaterThan(0);
  });

  it('embeds the code and claim URL in both bodies', () => {
    const out = renderWelcomeEmail(SAMPLE);
    expect(out.text).toContain(SAMPLE.code);
    expect(out.text).toContain(SAMPLE.claimUrl);
    expect(out.html).toContain(SAMPLE.code);
    expect(out.html).toContain(SAMPLE.claimUrl);
  });

  it('mentions the cohort when one is provided', () => {
    const out = renderWelcomeEmail({ ...SAMPLE, cohort: 'Phala dev day' });
    expect(out.text).toContain('Phala dev day');
    expect(out.html).toContain('Phala dev day');
  });

  it('falls back to a generic from-name when none is provided', () => {
    const out = renderWelcomeEmail(SAMPLE);
    expect(out.text).toContain('the Moltverse team');
  });

  it('escapes HTML special characters in the from-name', () => {
    const out = renderWelcomeEmail({ ...SAMPLE, fromName: '<script>alert(1)</script>' });
    // The escaped form must end up in the HTML; the raw form must not.
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).not.toContain('<script>alert(1)</script>');
  });

  it('escapes HTML in the claim URL (defence in depth)', () => {
    const out = renderWelcomeEmail({
      ...SAMPLE,
      claimUrl: 'https://moltverse.social/beta?x="><img onerror=alert(1)>',
    });
    expect(out.html).not.toContain('"><img');
    expect(out.html).toContain('&quot;');
  });

  // `escapeHtml` protects against tag-breakout but does NOT strip
  // dangerous URL schemes. `javascript:` and `data:` survive entity
  // encoding intact and would produce active phishing/XSS links in
  // the rendered email. The renderer must reject anything that is
  // not http(s) at the URL level.
  it('rejects a javascript: claimUrl', () => {
    expect(() => renderWelcomeEmail({ ...SAMPLE, claimUrl: 'javascript:alert(1)' })).toThrow(
      /http\(s\) scheme/,
    );
  });

  it('rejects a data: claimUrl', () => {
    expect(() =>
      renderWelcomeEmail({ ...SAMPLE, claimUrl: 'data:text/html,<script>alert(1)</script>' }),
    ).toThrow(/http\(s\) scheme/);
  });

  it('rejects a malformed claimUrl', () => {
    expect(() => renderWelcomeEmail({ ...SAMPLE, claimUrl: 'not a url at all' })).toThrow(
      /Invalid claimUrl/,
    );
  });

  it('accepts an http:// claimUrl (dev/staging)', () => {
    expect(() =>
      renderWelcomeEmail({ ...SAMPLE, claimUrl: 'http://localhost:3000/beta/X' }),
    ).not.toThrow();
  });
});
