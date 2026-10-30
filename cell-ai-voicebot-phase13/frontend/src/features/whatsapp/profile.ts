import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { whatsappApi, type BusinessProfilePatch } from '@/services/api/whatsapp';

import { whatsappKeys } from './keys';

/** The number's WhatsApp business profile (what customers see). */
export const useBusinessProfile = (channelId: string | null) =>
  useQuery({
    queryKey: whatsappKeys.profile(channelId ?? ''),
    queryFn: channelId ? () => whatsappApi.profile(channelId) : skipToken,
    meta: { silent: true },
  });

export const useUpdateBusinessProfile = (channelId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: BusinessProfilePatch) => whatsappApi.updateProfile(channelId, patch),
    meta: { silent: true },
    onSuccess: (profile) => {
      client.setQueryData(whatsappKeys.profile(channelId), profile);
    },
  });
};

export const useUploadProfilePhoto = (channelId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => whatsappApi.uploadProfilePhoto(channelId, file),
    meta: { silent: true },
    onSuccess: (profile) => {
      client.setQueryData(whatsappKeys.profile(channelId), profile);
    },
  });
};
