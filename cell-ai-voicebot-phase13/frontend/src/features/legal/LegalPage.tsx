import { useMemo } from 'react';

import { legalValues } from './config';
import { LegalDocument } from './LegalDocument';
import { fillPlaceholders, parseLegal } from './markdown';
import { PublicLayout } from './PublicLayout';

/** A legal text page: placeholders filled from `VITE_LEGAL_*`, draft banner when not final. */
export function LegalPage({ title, source }: { title: string; source: string }) {
  const doc = useMemo(() => {
    const { values, missing } = legalValues();
    const parsed = parseLegal(fillPlaceholders(source, { ...values }));
    return { parsed, draft: parsed.meta.status !== 'approved' || missing.length > 0 };
  }, [source]);
  // the document's own "# Title" heading is the page title
  const blocks =
    doc.parsed.blocks[0]?.kind === 'heading' ? doc.parsed.blocks.slice(1) : doc.parsed.blocks;
  return (
    <PublicLayout title={title}>
      <LegalDocument doc={{ ...doc.parsed, blocks }} draft={doc.draft} />
    </PublicLayout>
  );
}
