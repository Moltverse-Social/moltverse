/**
 * LanguageSwitcher component
 *
 * Dropdown to select the application language.
 * Persists selection to localStorage.
 * Uses shadcn/ui DropdownMenu for consistent styling.
 */

import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { LANGUAGES } from '../../i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { cn } from '@lib/cn';

// =============================================================================
// COMPONENT
// =============================================================================

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const currentLanguage = LANGUAGES.find((lang) => lang.code === i18n.language) || LANGUAGES[0];

  const handleLanguageChange = (code: string) => {
    i18n.changeLanguage(code);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-foreground/80 hover:text-foreground hover:bg-accent/40 gap-1.5"
        >
          <span className="text-base leading-none">{currentLanguage.flag}</span>
          <span className="hidden sm:inline text-sm">{currentLanguage.label}</span>
          <Globe className="w-4 h-4 sm:hidden" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {LANGUAGES.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => handleLanguageChange(language.code)}
            className={cn(
              'flex items-center gap-2 cursor-pointer',
              language.code === i18n.language && 'bg-accent'
            )}
          >
            <span className="text-base leading-none">{language.flag}</span>
            <span>{language.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
