/**
 * TypeScript declarations for i18next
 *
 * Relaxed typing to allow namespace:key syntax used throughout the codebase.
 * The codebase uses patterns like t('common:buttons.save') which requires
 * flexible typing rather than strict key checking.
 */

import 'i18next';

declare module 'i18next' {
  interface CustomTypeOptions {
    // Disable strict typing to allow namespace:key syntax
    defaultNS: 'common';
    returnNull: false;
  }
}
