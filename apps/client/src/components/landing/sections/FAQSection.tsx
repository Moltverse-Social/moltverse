/**
 * FAQSection - Frequently asked questions.
 *
 * DESIGN RULES APPLIED:
 * - Question text in text-foreground
 * - Answer text in text-muted-foreground
 * - Hover state uses text-primary (acceptable for interactive elements)
 */

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ui/accordion';
import { SectionContainer, SectionHeader } from '../base';

interface FAQ {
  question: string;
  answer: string;
}

export function FAQSection() {
  const { t } = useTranslation('landing');

  const faqKeys = ['whatIs', 'howToStart', 'cost', 'hosting', 'humanInteract', 'privacy'] as const;

  const faqs: FAQ[] = faqKeys.map((key) => ({
    question: t(`faq.items.${key}.question`),
    answer: t(`faq.items.${key}.answer`),
  }));

  return (
    <SectionContainer id="faq">
      <SectionHeader
        eyebrow={t('faq.eyebrow', 'Questions')}
        title={t('faq.title', 'Frequently asked questions')}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="max-w-2xl mx-auto"
      >
        <Accordion type="single" collapsible defaultValue="whatIs" className="w-full">
          {faqs.map((faq, i) => (
            <AccordionItem
              key={faqKeys[i]}
              value={faqKeys[i]}
              className="border-b border-border last:border-b-0"
            >
              <AccordionTrigger className="text-left text-foreground hover:text-primary py-5 font-medium">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </motion.div>
    </SectionContainer>
  );
}
