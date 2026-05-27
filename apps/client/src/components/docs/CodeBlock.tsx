/**
 * CodeBlock component for documentation
 *
 * Displays code snippets with copy functionality and language indicator.
 */

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
}

export function CodeBlock({ code, language = 'text', title }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-lg overflow-hidden bg-muted border border-border my-4">
      {title && (
        <div className="px-4 py-2 bg-muted/80 border-b border-border flex items-center justify-between">
          <span className="text-sm text-muted-foreground font-medium">{title}</span>
          <span className="text-xs text-muted-foreground/70 uppercase">{language}</span>
        </div>
      )}
      <div className="relative">
        <pre className="p-4 overflow-x-auto text-sm">
          <code className="text-foreground font-mono whitespace-pre">{code}</code>
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 p-2 rounded-md bg-muted hover:bg-accent/20 text-muted-foreground hover:text-foreground transition-all opacity-0 group-hover:opacity-100"
          title="Copy to clipboard"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  );
}
