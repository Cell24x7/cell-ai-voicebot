import { apiClient, unwrap } from './client';
import type { FlowAudio, FlowAudioUrl, SuccessEnvelope } from './types';

/** `/api/v1/flow-audio` — WAV / MP3 prompts for call flows. */
export const flowAudioApi = {
  list: (q?: string) =>
    unwrap(apiClient.get<SuccessEnvelope<FlowAudio[]>>('/flow-audio', { params: q ? { q } : {} })),
  upload: (file: File, name?: string, onProgress?: (percent: number) => void) => {
    const form = new FormData();
    form.append('file', file);
    if (name) form.append('name', name);
    return unwrap(
      apiClient.post<SuccessEnvelope<FlowAudio>>('/flow-audio', form, {
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      }),
    );
  },
  url: (id: string) =>
    unwrap(apiClient.get<SuccessEnvelope<FlowAudioUrl>>(`/flow-audio/${id}/url`)),
  rename: (id: string, name: string) =>
    unwrap(apiClient.patch<SuccessEnvelope<FlowAudio>>(`/flow-audio/${id}`, { name })),
  remove: async (id: string) => {
    await apiClient.delete(`/flow-audio/${id}`);
  },
};
