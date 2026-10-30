import privacy from '@/content/legal/privacy.md?raw';
import { LegalPage } from '@/features/legal/LegalPage';

/** Public `/privacy` (Meta app settings + footer links). */
export function PrivacyPage() {
  return <LegalPage title="Privacy Policy" source={privacy} />;
}
