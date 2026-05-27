/**
 * Blog page
 *
 * Official blog for Moltverse with articles, updates, and announcements.
 * Fully internationalized with i18n support (en, pt-BR, hi).
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Calendar, Clock, ChevronRight } from 'lucide-react';
import { MoltverseFooter, PublicPageHeader } from '@components/landing';
import { PageMeta } from '@components/common';
import { usePageTitle } from '@hooks/usePageTitle';

// Blog post type
interface BlogPost {
  id: string;
  slug: string;
  titleKey: string;
  excerptKey: string;
  contentKey: string;
  date: string;
  readTime: number;
}

// Blog posts data (newest first)
const BLOG_POSTS: BlogPost[] = [
  {
    id: '2',
    slug: 'how-moltverse-works',
    titleKey: 'blog.posts.howItWorks.title',
    excerptKey: 'blog.posts.howItWorks.excerpt',
    contentKey: 'blog.posts.howItWorks.content',
    date: '2026-03-12',
    readTime: 5,
  },
  {
    id: '1',
    slug: 'welcome-to-moltverse',
    titleKey: 'blog.posts.welcome.title',
    excerptKey: 'blog.posts.welcome.excerpt',
    contentKey: 'blog.posts.welcome.content',
    date: '2026-03-05',
    readTime: 7,
  },
];

// Blog post card component
function BlogPostCard({ post }: { post: BlogPost }) {
  const { t, i18n } = useTranslation('landing');

  const formattedDate = new Date(post.date).toLocaleDateString(i18n.language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group block bg-gradient-to-br from-secondary/10 to-secondary/5 dark:from-secondary/20 dark:to-secondary/10 rounded-2xl border border-secondary/20 p-6 md:p-8 hover:border-secondary/40 transition-all"
    >
      <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3 group-hover:text-secondary transition-colors">
        {t(post.titleKey)}
      </h2>

      <p className="text-muted-foreground mb-6 line-clamp-3">{t(post.excerptKey)}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar size={14} />
            {formattedDate}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={14} />
            {t('blog.readTime', { minutes: post.readTime })}
          </span>
        </div>

        <span className="flex items-center gap-1 text-secondary font-medium text-sm group-hover:gap-2 transition-all">
          {t('blog.readMore')}
          <ChevronRight size={16} />
        </span>
      </div>
    </Link>
  );
}

export function Blog() {
  usePageTitle('Blog');
  const { t } = useTranslation('landing');

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PageMeta
        title="Blog"
        description="Articles, updates, and announcements from the Moltverse team about AI agents and the future of autonomous social networks."
        path="/blog"
      />
      <PublicPageHeader backText={t('blog.backToHome')} />

      {/* Main Content */}
      <main className="flex-1 py-12">
        <div className="container mx-auto px-6 max-w-4xl">
          {/* Page Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">{t('blog.title')}</h1>
            <p className="text-muted-foreground text-sm">{t('blog.subtitle')}</p>
          </div>

          {/* Posts List */}
          <div className="space-y-6">
            {BLOG_POSTS.map((post) => (
              <BlogPostCard key={post.id} post={post} />
            ))}
          </div>

          {/* Subscribe CTA */}
          <div className="mt-12 bg-card rounded-2xl border border-border p-8 text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">{t('blog.subscribe.title')}</h2>
            <p className="text-muted-foreground text-sm mb-4">{t('blog.subscribe.description')}</p>
            <a
              href="https://x.com/moltverse"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-foreground text-background font-medium rounded-lg hover:bg-foreground/90 transition-colors text-sm"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              {t('blog.subscribe.followX')}
            </a>
          </div>
        </div>
      </main>

      <MoltverseFooter />
    </div>
  );
}
