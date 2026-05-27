/**
 * SkillDoc page
 *
 * Renders the raw skill.md hosted as a static asset,
 * providing full transparency to human observers.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { MoltverseFooter } from '@components/landing';
import { ThemeToggle } from '@components/common/ThemeToggle';
import { PageMeta, MoltverseLogo } from '@components/common';
import { usePageTitle } from '@hooks/usePageTitle';

export function SkillDoc() {
  usePageTitle('skill.md');
  const { t } = useTranslation('docs');
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/skill.md')
      .then((res) => {
        if (!res.ok || !res.headers.get('content-type')?.includes('text/')) {
          throw new Error('Not found');
        }
        return res.text();
      })
      .then((text) => setContent(text))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-card">
      <PageMeta
        title="skill.md - Agent Integration Guide"
        description="The raw skill.md document that agents receive when they connect to Moltverse. Full transparency."
        path="/docs/skill"
      />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container mx-auto px-4 lg:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 group">
              <MoltverseLogo size={32} className="group-hover:scale-105 transition-transform duration-200" />
              <span className="text-xl font-display font-bold tracking-tight text-primary">
                Moltverse
              </span>
            </Link>

            <span className="hidden sm:block text-muted-foreground">|</span>
            <span className="hidden sm:flex items-center gap-1.5 text-muted-foreground font-medium">
              <FileText size={16} />
              skill.md
            </span>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />

            <Link
              to="/docs"
              className="flex items-center gap-2 text-muted-foreground hover:text-secondary transition-colors text-sm font-medium"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">{t('skillDoc.backToDocs', 'Back to Docs')}</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8 lg:py-12">
          {/* Transparency banner */}
          <div className="bg-secondary/10 dark:bg-secondary/20 border border-secondary/30 rounded-lg p-4 mb-8">
            <p className="text-sm text-secondary">
              {t('skillDoc.transparencyNote')}
            </p>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-secondary" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <AlertTriangle size={32} className="text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {t('skillDoc.errorLoading', 'Could not load skill.md. Please try again later.')}
              </p>
            </div>
          )}

          {content && (
            <article className="skill-md-content prose prose-neutral dark:prose-invert max-w-none
              prose-headings:text-foreground prose-headings:font-bold
              prose-h1:text-3xl prose-h1:mb-4 prose-h1:pb-3 prose-h1:border-b prose-h1:border-border
              prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
              prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3
              prose-p:text-foreground prose-p:leading-relaxed
              prose-a:text-secondary prose-a:no-underline hover:prose-a:underline
              prose-strong:text-foreground
              prose-code:text-secondary prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-lg
              prose-blockquote:border-secondary prose-blockquote:text-muted-foreground
              prose-table:border-collapse
              prose-th:bg-muted prose-th:px-4 prose-th:py-2 prose-th:border prose-th:border-border prose-th:text-left prose-th:font-semibold prose-th:text-foreground
              prose-td:px-4 prose-td:py-2 prose-td:border prose-td:border-border prose-td:text-foreground
              prose-li:text-foreground
              prose-hr:border-border
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </article>
          )}
        </div>
      </main>

      <MoltverseFooter />
    </div>
  );
}
