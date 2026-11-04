import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import type { CommissionStage, OrderDraft, SubmittedOrder } from '@/types';
import {
  fetchAllCommissionsAdmin,
  fetchMyCommissions,
  fetchPublicStudioData,
  insertCommissionInSupabase,
  updateCommissionStageInDb,
  archiveOrDeclineCommissionInDb,
  deleteCommissionInDb,
  toggleCommissionPaymentInDb,
  updateCommissionScheduleInDb,
  sendCommissionMessageInDb,
  updateStudioSettingsInDb,
  submitPaymentReceiptInDb,
  updateCommissionBriefInDb,
  requestCommissionCancellationInDb,
  fetchUnreadMessageCounts,
  markCommissionReadInDb,
  type StudioSettingsRow,
} from '@/lib/supabase';

export const QUERY_KEYS = {
  publicStudioData: ['publicStudioData'] as const,
  commissions: ['commissions'] as const,
  myCommissions: (userId?: string) => ['commissions', 'mine', userId] as const,
  adminCommissions: ['commissions', 'admin'] as const,
  payments: (commissionId?: string) => ['payments', commissionId] as const,
  unreadMessageCounts: ['unreadMessageCounts'] as const,
};

export function usePublicStudioDataQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.publicStudioData,
    queryFn: fetchPublicStudioData,
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 30, // 30s background refetch
    refetchOnWindowFocus: true,
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
    mutationFn: async ({
      commissionId,
      reason,
      targetStage = 'declined',
    }: {
      commissionId: string;
      reason?: string;
      targetStage?: 'declined' | 'cancelled';
    }) => {
      const res = await archiveOrDeclineCommissionInDb(commissionId, targetStage, reason);
      if (!res.success) throw new Error(res.error ?? `Failed to mark order as ${targetStage}`);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
    },
  });
}

export function useDeleteCommissionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commissionId: string) => {
      const res = await deleteCommissionInDb(commissionId);
      if (!res.success) throw new Error(res.error ?? 'Failed to delete commission');
      return { commissionId, failedStoragePaths: res.failedStoragePaths };
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.commissions });
      const previousAdmin = queryClient.getQueryData<SubmittedOrder[]>(QUERY_KEYS.adminCommissions);

      if (previousAdmin) {
        queryClient.setQueryData<SubmittedOrder[]>(
          QUERY_KEYS.adminCommissions,
          previousAdmin.filter((o) => o.id !== deletedId),
        );
      }
      return { previousAdmin };
    },
    onError: (_err, _deletedId, context) => {
      if (context?.previousAdmin) {
        queryClient.setQueryData(QUERY_KEYS.adminCommissions, context.previousAdmin);
      }
    },
    onSettled: () => {
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


export function useUpdateCommissionBriefMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commissionId,
      patch,
    }: {
      commissionId: string;
      patch: { characterName?: string; poseAndVibe?: string; backgroundNotes?: string };
    }) => {
      return updateCommissionBriefInDb(commissionId, patch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
    },
  });
}

export function useRequestCancellationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commissionId,
      reason,
    }: {
      commissionId: string;
      reason: string;
    }) => {
      return requestCommissionCancellationInDb(commissionId, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
    },
  });
}

export function useUnreadMessageCountsQuery(user: User | null) {
  return useQuery({
    queryKey: QUERY_KEYS.unreadMessageCounts,
    queryFn: fetchUnreadMessageCounts,
    enabled: Boolean(user),
    staleTime: 1000 * 15,
    refetchInterval: 1000 * 30,
  });
}

export function useMarkCommissionReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commissionId: string) => {
      return markCommissionReadInDb(commissionId);
    },
    onMutate: async (commissionId: string) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.unreadMessageCounts });
      const previousCounts = queryClient.getQueryData<Record<string, number>>(QUERY_KEYS.unreadMessageCounts);
      if (previousCounts) {
        queryClient.setQueryData<Record<string, number>>(QUERY_KEYS.unreadMessageCounts, {
          ...previousCounts,
          [commissionId]: 0,
        });
      }
      return { previousCounts };
    },
    onError: (_err, _commissionId, context) => {
      if (context?.previousCounts) {
        queryClient.setQueryData(QUERY_KEYS.unreadMessageCounts, context.previousCounts);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.unreadMessageCounts });
    },
  });
}

