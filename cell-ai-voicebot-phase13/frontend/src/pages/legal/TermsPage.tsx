import terms from '@/content/legal/terms.md?raw';
import { LegalPage } from '@/features/legal/LegalPage';

/** Public `/terms` (Meta app settings + sign-up consent). */
export function TermsPage() {
  return <LegalPage title="Terms of Service" source={terms} />;
}
