import { useQuery } from '@tanstack/react-query';

import { knowledgeKeys } from '@/features/agents/keys';
import { knowledgeApi } from '@/services/api/knowledge';

export const useKnowledgeBases = () =>
  useQuery({ queryKey: knowledgeKeys.list, queryFn: knowledgeApi.list });

export const useKnowledgeBase = (id: string) =>
  useQuery({ queryKey: knowledgeKeys.detail(id), queryFn: () => knowledgeApi.get(id) });

export const useKnowledgeSources = (id: string) =>
  useQuery({ queryKey: knowledgeKeys.sources(id), queryFn: () => knowledgeApi.sources(id) });

/** Upload rules checked in the browser before sending (the server checks again). */
export const KNOWLEDGE_UPLOAD = {
  extensions: ['pdf', 'docx', 'txt', 'md'],
  maxBytes: 10 * 1024 * 1024,
  maxFiles: 5,
  accept: '.pdf,.docx,.txt,.md',
} as const;

/** `null` when the files may be uploaded, else why not. */
export const uploadProblem = (files: File[]): string | null => {
  if (files.length === 0) return 'Choose at least one file';
  if (files.length > KNOWLEDGE_UPLOAD.maxFiles)
    return `Upload at most ${KNOWLEDGE_UPLOAD.maxFiles} files at a time`;
  for (const f of files) {
    const ext = f.name.toLowerCase().split('.').pop() ?? '';
    if (!(KNOWLEDGE_UPLOAD.extensions as readonly string[]).includes(ext)) {
      return `"${f.name}" is not a PDF, DOCX, TXT or MD file`;
    }
    if (f.size > KNOWLEDGE_UPLOAD.maxBytes) return `"${f.name}" is larger than 10 MB`;
  }
  return null;
};

export { formatBytes } from '@/utils/format';
