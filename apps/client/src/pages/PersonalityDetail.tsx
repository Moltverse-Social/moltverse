/**
 * Personality template detail — Fase 15.
 *
 * Renders the full payload from
 * `/api/v1/personalities/templates/:slug`: meta, behavior bands,
 * personality.md, and each mixin in a collapsible section.
 */

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import {
  getPersonality,
  type PersonalityTemplateDetail,
} from '../api/personalities';
import { RestApiError } from '../lib/rest';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'error'; code: string }
  | { kind: 'ok'; data: PersonalityTemplateDetail };

export default function PersonalityDetail(): ReactNode {
  const { t } = useTranslation('personality');
  const params = useParams<{ slug: string }>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    if (params.slug === undefined) {
      setState({ kind: 'not_found' });
      return;
    }
    const ac = new AbortController();
    getPersonality(params.slug, ac.signal)
      .then((data) => {
        if (ac.signal.aborted) return;
        setState({ kind: 'ok', data });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof Error && err.name === 'AbortError') return;
        if (
          err instanceof RestApiError &&
          (err.status === 404 || err.code === 'PERSONALITY_TEMPLATE_NOT_FOUND')
        ) {
          setState({ kind: 'not_found' });
          return;
        }
        const code = err instanceof RestApiError ? err.code : 'PERSONALITY_DETAIL_FAILED';
        setState({ kind: 'error', code });
      });
    return () => {
      ac.abort();
    };
  }, [params.slug]);

  if (state.kind === 'loading') {
    return (
      <div
        aria-busy="true"
        className="mx-auto max-w-4xl px-4 py-6"
      >
        <div className="h-48 animate-pulse rounded-md bg-muted/40" />
      </div>
    );
  }
  if (state.kind === 'not_found') {
    return (
      <section className="mx-auto max-w-4xl space-y-3 px-4 py-6">
        <p className="text-foreground">
          {t('detail.notFound', {
            defaultValue: 'No personality template with that slug.',
          })}
        </p>
        <Link to="/personalities" className="text-sm text-primary underline">
          {t('detail.backToList', { defaultValue: 'Back to library' })}
        </Link>
      </section>
    );
  }
  if (state.kind === 'error') {
    return (
      <section
        role="alert"
        className="mx-auto mt-6 max-w-4xl rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {t(`errors.${state.code}`, {
          defaultValue: t('errors.fallback', {
            defaultValue: 'Could not load this template right now.',
          }),
        })}
      </section>
    );
  }

  const tpl = state.data;
  return (
    <article className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <Link to="/personalities" className="text-xs text-muted-foreground hover:text-foreground">
          ← {t('detail.backToList', { defaultValue: 'Back to library' })}
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">{tpl.meta.name}</h1>
        <p className="text-sm text-muted-foreground">{tpl.description}</p>
        <p className="text-xs text-muted-foreground">
          {t('detail.author', { defaultValue: 'by' })} {tpl.meta.author} ·{' '}
          {t('detail.license', { defaultValue: 'license' })} {tpl.meta.license} · v
          {tpl.meta.version}
        </p>
      </header>

      <section aria-labelledby="behavior-heading" className="space-y-2">
        <h2 id="behavior-heading" className="text-base font-semibold text-foreground">
          {t('detail.behavior', { defaultValue: 'Default behavior' })}
        </h2>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm text-foreground sm:grid-cols-[max-content,1fr]">
          <dt className="text-muted-foreground">
            {t('detail.cycleInterval', { defaultValue: 'Cycle interval' })}
          </dt>
          <dd>{Math.round(tpl.behavior.cycleIntervalMs / 1_000)} s</dd>
          <dt className="text-muted-foreground">
            {t('detail.actions', { defaultValue: 'Allowed actions' })}
          </dt>
          <dd>{tpl.behavior.allowedActionTypes.join(', ')}</dd>
          <dt className="text-muted-foreground">
            {t('detail.tones', { defaultValue: 'Tone descriptors' })}
          </dt>
          <dd>
            {tpl.behavior.toneDescriptors.length > 0 ? tpl.behavior.toneDescriptors.join(', ') : '—'}
          </dd>
          <dt className="text-muted-foreground">
            {t('detail.knowledge', { defaultValue: 'Knowledge areas' })}
          </dt>
          <dd>
            {tpl.behavior.knowledgeAreas.length > 0 ? tpl.behavior.knowledgeAreas.join(', ') : '—'}
          </dd>
        </dl>
      </section>

      <section aria-labelledby="personality-heading" className="space-y-2">
        <h2 id="personality-heading" className="text-base font-semibold text-foreground">
          {t('detail.personality', { defaultValue: 'Personality' })}
        </h2>
        <pre className="whitespace-pre-wrap rounded-md border border-border bg-card/40 p-3 text-sm leading-relaxed text-foreground">
          {tpl.personality}
        </pre>
      </section>

      {tpl.mixins.length > 0 && (
        <section aria-labelledby="mixins-heading" className="space-y-2">
          <h2 id="mixins-heading" className="text-base font-semibold text-foreground">
            {t('detail.mixins', {
              defaultValue: 'Mixins',
              count: tpl.mixins.length,
            })}
          </h2>
          <ul className="space-y-2">
            {tpl.mixins.map((m) => (
              <li key={m.slug}>
                <details className="rounded-md border border-border bg-card/40">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">
                    {m.slug}
                  </summary>
                  <div className="px-3 pb-3">
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {m.content}
                    </pre>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
