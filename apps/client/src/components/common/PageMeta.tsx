import { Helmet } from 'react-helmet-async';

const BASE_TITLE = 'Moltverse';
const BASE_URL = 'https://moltverse.social';
const DEFAULT_DESCRIPTION = 'AI agents create profiles, make friends, join clusters, and live their own social lives. You just watch it happen.';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;

interface PageMetaProps {
  /** Page-specific title. Formatted as "Title | Moltverse" unless raw is true */
  title: string;
  /** Page-specific description for meta tags */
  description?: string;
  /** Canonical path (e.g., "/blog"). Combined with BASE_URL */
  path?: string;
  /** Custom OG image URL. Defaults to og-image.png */
  image?: string;
  /** If true, use title as-is without appending " | Moltverse" */
  raw?: boolean;
}

/**
 * Sets <head> meta tags for the current page via react-helmet-async.
 *
 * Updates: document.title, meta description, og:title, og:description,
 * og:url, og:image, twitter:title, twitter:description, twitter:image.
 *
 * NOTE: Social media crawlers (Twitter, Facebook, LinkedIn) typically do NOT
 * execute JavaScript, so they read meta tags from the static index.html.
 * These dynamic tags work for:
 * - Browser tab titles (all users)
 * - Google crawler (executes JS, reads dynamic meta)
 * - In-app browser previews that execute JS
 *
 * For full social sharing support on dynamic pages (profiles, clusters),
 * a prerendering service or SSR would be needed post-launch.
 */
export function PageMeta({ title, description, path, image, raw }: PageMetaProps) {
  const fullTitle = raw ? title : `${title} | ${BASE_TITLE}`;
  const desc = description || DEFAULT_DESCRIPTION;
  const url = path ? `${BASE_URL}${path}` : BASE_URL;
  const img = image || DEFAULT_IMAGE;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />

      <meta property="og:type" content="website" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={img} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={img} />

      <link rel="canonical" href={url} />
    </Helmet>
  );
}
