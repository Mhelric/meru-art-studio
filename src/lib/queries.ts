import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import type { CommissionStage, OrderDraft, SubmittedOrder } from '@/types';
import {
  fetchAllCommissionsAdmin,
  fetchMyCommissions,
  fetchPublicStudioData,
  insertCommissionInSupabase,
  updateCommissionStageInDb,
  declineCommissionInDb,
  toggleCommissionPaymentInDb,
  updateCommissionScheduleInDb,
  sendCommissionMessageInDb,
  updateStudioSettingsInDb,
  submitPaymentReceiptInDb,
  type StudioSettingsRow,
} from '@/lib/supabase';

export const QUERY_KEYS = {
  publicStudioData: ['publicStudioData'] as const,
  commissions: ['commissions'] as const,
  myCommissions: (userId?: string) => ['commissions', 'mine', userId] as const,
  adminCommissions: ['commissions', 'admin'] as const,
  payments: (commissionId?: string) => ['payments', commissionId] as const,
};

export function usePublicStudioDataQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.publicStudioData,
    queryFn: fetchPublicStudioData,
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useCommissionsQuery(user: User | null, isArtistAdmin: boolean) {
  return useQuery({
    queryKey: isArtistAdmin ? QUERY_KEYS.adminCommissions : QUERY_KEYS.myCommissions(user?.id),
    queryFn: async (): Promise<SubmittedOrder[]> => {
      if (isArtistAdmin && user) {
        return fetchAllCommissionsAdmin();
      }
      if (user) {
        return fetchMyCommissions(user.id);
      }
      return [];
    },
    // Only query live Supabase when user is authenticated with a JWT
    enabled: Boolean(user),
    staleTime: 1000 * 15, // 15 seconds
  });
}

export function useSubmitCommissionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      user,
      draft,
      pricing,
    }: {
      user: User;
      draft: OrderDraft;
      pricing?: { totalUsd: number; depositUsd: number };
    }) => {
      return insertCommissionInSupabase(user, draft, pricing);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
    },
  });
}

export function useUpdateCommissionStageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commissionId,
      stage,
      progress,
    }: {
      commissionId: string;
      stage: CommissionStage;
      progress?: number;
    }) => {
      return updateCommissionStageInDb(commissionId, stage, progress);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
    },
  });
}

export function useDeclineCommissionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commissionId }: { commissionId: string }) => {
      return declineCommissionInDb(commissionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
    },
  });
}

export function useTogglePaymentFlagMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commissionId,
      field,
      value,
      currentStage,
    }: {
      commissionId: string;
      field: 'deposit_paid' | 'final_paid';
      value: boolean;
      currentStage?: CommissionStage;
    }) => {
      return toggleCommissionPaymentInDb(commissionId, field, value, currentStage);
    },
    onSuccess: (_, { commissionId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.payments(commissionId) });
    },
  });
}

export function useSubmitPaymentReceiptMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commissionId,
      kind,
      amount,
      currency,
      receiptPath,
    }: {
      commissionId: string;
      kind: 'deposit' | 'final' | 'full';
      amount: number;
      currency: any;
      receiptPath?: string;
    }) => {
      return submitPaymentReceiptInDb(commissionId, kind, amount, currency, receiptPath);
    },
    onSuccess: (_, { commissionId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.payments(commissionId) });
    },
  });
}

export function useUpdateScheduleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commissionId,
      startDate,
      estEndDate,
    }: {
      commissionId: string;
      startDate: string;
      estEndDate: string;
    }) => {
      return updateCommissionScheduleInDb(commissionId, startDate, estEndDate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
    },
  });
}

export function useSendMessageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commissionId,
      body,
      opts,
    }: {
      commissionId: string;
      body: string;
      opts?: { attachmentUrl?: string; attachmentKind?: any };
    }) => {
      return sendCommissionMessageInDb(commissionId, body, opts);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
    },
  });
}

export function useUpdateStudioSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<StudioSettingsRow>) => {
      return updateStudioSettingsInDb(patch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
    },
  });
}
