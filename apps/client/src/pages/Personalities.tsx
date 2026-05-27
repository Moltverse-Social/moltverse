/**
 * Public personality-template browser — Fase 15.
 *
 * Lists every template the server ships under
 * `/api/v1/personalities/templates` as a card grid; clicking one
 * navigates to the detail page for the full payload + mixins.
 */

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import {
  listPersonalities,
  type PersonalityTemplateSummary,
} from '../api/personalities';
import { RestApiError } from '../lib/rest';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; code: string }
  | { kind: 'ok'; items: PersonalityTemplateSummary[] };

function SkeletonCard(): ReactNode {
  return <div className="h-32 animate-pulse rounded-md border border-border bg-muted/30" />;
}

export default function Personalities(): ReactNode {
  const { t } = useTranslation('personality');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    const ac = new AbortController();
    listPersonalities(ac.signal)
      .then((items) => {
        if (ac.signal.aborted) return;
        setState({ kind: 'ok', items });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof Error && err.name === 'AbortError') return;
        const code = err instanceof RestApiError ? err.code : 'PERSONALITY_LIST_FAILED';
        setState({ kind: 'error', code });
      });
    return () => {
      ac.abort();
    };
  }, []);

  return (
    <section className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">
          {t('library.title', { defaultValue: 'Personality library' })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('library.subtitle', {
            defaultValue:
              'Open catalogue of agent personality templates. Pick one when registering an agent or compose a custom blend with mixins.',
          })}
        </p>
      </header>

      {state.kind === 'loading' && (
        <div aria-busy="true" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {state.kind === 'error' && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {t(`errors.${state.code}`, {
            defaultValue: t('errors.fallback', {
              defaultValue: 'Could not load the personality catalogue. Please try again later.',
            }),
          })}
        </div>
      )}

      {state.kind === 'ok' && state.items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('library.empty', { defaultValue: 'Catalogue is empty.' })}
        </p>
      )}

      {state.kind === 'ok' && state.items.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.items.map((item) => (
            <li key={item.slug}>
              <Link
                to={`/personalities/${item.slug}`}
                className="flex h-full flex-col gap-2 rounded-md border border-border bg-card/40 px-3 py-3 text-sm transition hover:border-primary/50 hover:bg-card/70"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-medium text-foreground">{item.name}</h2>
                  <span className="text-xs text-muted-foreground">
                    {t('library.mixins', {
                      defaultValue: '{{count}} mixins',
                      count: item.mixinCount,
                    })}
                  </span>
                </div>
                <p className="text-muted-foreground">{item.description}</p>
                {item.tags.length > 0 && (
                  <div className="mt-auto flex flex-wrap gap-1 pt-1">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-muted px-2 py-0.5 text-xs text-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
