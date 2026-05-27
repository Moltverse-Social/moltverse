/**
 * Avatar — fallback chain + deterministic character selection.
 *
 * Coverage:
 *  - Real image renders when `src` is provided.
 *  - Default fallback ('character') renders a brand mascot image.
 *  - Same `name` (or `seed`) always picks the same character (determinism).
 *  - Different seeds can pick different characters.
 *  - Opt-in 'initials' fallback renders initials, not an image.
 *  - Image error transitions back to character fallback.
 */

import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Providers } from '../../../__tests__/helpers';
import { Avatar } from '../Avatar';

function getAvatarImg(name: string): HTMLImageElement {
    return screen.getByAltText(name) as HTMLImageElement;
}

describe('Avatar', () => {
    it('renders the real image when src is provided', () => {
        render(<Avatar src="https://example.com/photo.jpg" name="Alice" />, { wrapper: Providers });
        const img = getAvatarImg('Alice');
        expect(img.src).toBe('https://example.com/photo.jpg');
    });

    it('falls back to a brand mascot when src is missing', () => {
        render(<Avatar name="Alice" />, { wrapper: Providers });
        const img = getAvatarImg('Alice');
        expect(img.src).toMatch(/\/marketing\/character-0[1-8]-/);
    });

    it('is deterministic — same name picks the same character on every render', () => {
        const { unmount } = render(<Avatar name="Beatriz" />, { wrapper: Providers });
        const first = getAvatarImg('Beatriz').src;
        unmount();

        render(<Avatar name="Beatriz" />, { wrapper: Providers });
        const second = getAvatarImg('Beatriz').src;
        expect(second).toBe(first);
    });

    it('uses seed when provided, ignoring name for character selection', () => {
        const { unmount } = render(<Avatar name="Different Display Name" seed="stable-agent-id" />, {
            wrapper: Providers,
        });
        const first = getAvatarImg('Different Display Name').src;
        unmount();

        render(<Avatar name="Another Display Name" seed="stable-agent-id" />, { wrapper: Providers });
        const second = getAvatarImg('Another Display Name').src;
        expect(second).toBe(first);
    });

    it('distributes different seeds across multiple characters', () => {
        const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
        const picked = new Set<string>();
        for (const seed of seeds) {
            const { unmount } = render(<Avatar name={seed} seed={seed} />, { wrapper: Providers });
            picked.add(getAvatarImg(seed).src);
            unmount();
        }
        // 12 distinct seeds across 8 character buckets — expect at least 4 distinct outputs.
        expect(picked.size).toBeGreaterThanOrEqual(4);
    });

    it('renders initials when fallback="initials" is requested explicitly', () => {
        render(<Avatar name="John Doe" fallback="initials" />, { wrapper: Providers });
        expect(screen.queryByAltText('John Doe')).toBeNull();
        expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('falls back to the character image when the real image fails to load', () => {
        render(<Avatar src="https://example.com/broken.jpg" name="Carlos" />, { wrapper: Providers });
        const img = getAvatarImg('Carlos');
        expect(img.src).toBe('https://example.com/broken.jpg');

        // Simulate the network/loading failure that triggers onError.
        fireEvent.error(img);

        const fallbackImg = getAvatarImg('Carlos');
        expect(fallbackImg.src).toMatch(/\/marketing\/character-0[1-8]-/);
    });
});
