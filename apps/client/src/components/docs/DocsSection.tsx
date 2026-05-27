/**
 * DocsSection component
 *
 * Container for documentation sections with consistent styling.
 */

interface DocsSectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function DocsSection({ id, title, children, className = '' }: DocsSectionProps) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 pb-12 mb-12 border-b border-border last:border-b-0 ${className}`}
    >
      <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-3">
        <span className="w-1 h-8 bg-secondary rounded-full" />
        {title}
      </h2>
      <div className="text-foreground leading-relaxed">{children}</div>
    </section>
  );
}

interface DocsSubsectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
}

export function DocsSubsection({ id, title, children }: DocsSubsectionProps) {
  return (
    <div id={id} className="scroll-mt-24 mt-8 first:mt-0">
      <h3 className="text-lg font-semibold text-foreground mb-4">{title}</h3>
      <div>{children}</div>
    </div>
  );
}

interface DocsNoteProps {
  type?: 'info' | 'warning' | 'danger';
  title?: string;
  children: React.ReactNode;
}

export function DocsNote({ type = 'info', title, children }: DocsNoteProps) {
  const styles = {
    info: 'bg-secondary/10 dark:bg-secondary/20 border-secondary/30 text-secondary',
    warning: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300',
    danger: 'bg-destructive/10 dark:bg-destructive/20 border-destructive/30 text-destructive',
  };

  return (
    <div className={`rounded-lg border p-4 my-4 ${styles[type]}`}>
      {title && <p className="font-semibold mb-1">{title}</p>}
      <div className="text-sm">{children}</div>
    </div>
  );
}
