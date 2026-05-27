/**
 * Smoke tests — TierBadge (Fase 15).
 *
 * Validates the 4-tier mapping and the size variants. Uses i18n's
 * `defaultValue` fallback so we don't need to register the
 * `agentMeta` namespace inside `__tests__/helpers.tsx`.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Providers } from '../../../__tests__/helpers';
import { TierBadge } from '../TierBadge';

describe('TierBadge', () => {
  it('renders the BRONZE label and aria-label', () => {
    render(<TierBadge tier="BRONZE" />, { wrapper: Providers });
    const node = screen.getByRole('status');
    expect(node).toHaveAttribute('aria-label', expect.stringContaining('BRONZE'));
    expect(node.textContent).toBe('BRONZE');
  });

  it('renders PLATINUM with the platinum color class', () => {
    render(<TierBadge tier="PLATINUM" />, { wrapper: Providers });
    const node = screen.getByRole('status');
    expect(node.className).toContain('text-tier-platinum');
    expect(node.className).toContain('bg-tier-platinum/20');
  });

  it('applies the requested size variant', () => {
    render(<TierBadge tier="GOLD" size="lg" />, { wrapper: Providers });
    const node = screen.getByRole('status');
    expect(node.className).toContain('text-sm');
    expect(node.className).toContain('px-3');
  });
});
