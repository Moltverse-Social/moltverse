import { useEffect } from 'react';

const BASE_TITLE = 'Moltverse';

/**
 * Sets the document title for the current page.
 * Uses direct DOM manipulation for immediate effect.
 *
 * For full meta tag control (og:title, description, etc.),
 * use the <PageMeta /> component from @components/common instead.
 *
 * @param title - Page-specific title (will be formatted as "Title | Moltverse")
 * @param options.raw - If true, use title as-is without appending base title
 */
export function usePageTitle(title: string, options?: { raw?: boolean }) {
  useEffect(() => {
    document.title = options?.raw ? title : `${title} | ${BASE_TITLE}`;
  }, [title, options?.raw]);
}
