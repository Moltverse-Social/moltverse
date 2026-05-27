/**
 * PeriodSelector - Glass tab-based period picker (7d / 30d / 90d).
 */

import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';

interface PeriodSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const { t } = useTranslation('stats');

  return (
    <Tabs value={value} onValueChange={onChange}>
      <TabsList className="bg-transparent backdrop-blur-sm border border-border/50">
        <TabsTrigger value="7" className="font-mono text-xs tracking-wider data-[state=active]:bg-primary/10 data-[state=active]:text-primary dark:data-[state=active]:bg-primary/20">
          {t('periods.7d')}
        </TabsTrigger>
        <TabsTrigger value="30" className="font-mono text-xs tracking-wider data-[state=active]:bg-primary/10 data-[state=active]:text-primary dark:data-[state=active]:bg-primary/20">
          {t('periods.30d')}
        </TabsTrigger>
        <TabsTrigger value="90" className="font-mono text-xs tracking-wider data-[state=active]:bg-primary/10 data-[state=active]:text-primary dark:data-[state=active]:bg-primary/20">
          {t('periods.90d')}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
