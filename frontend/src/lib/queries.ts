"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  CreateCampaignRequest,
  CreateCampaignResponse,
  EmailDetail,
  EmailFilter,
  EmailListItem,
  EmailStats,
  EmailTab,
  MeResponse,
  Paginated,
  SendersResponse,
} from "./types";

export const queryKeys = {
  me: ["me"] as const,
  emails: (tab: EmailTab, page: number, q: string, filter: EmailFilter) => ["emails", tab, page, q, filter] as const,
  email: (id: string) => ["email", id] as const,
  stats: ["stats"] as const,
  senders: ["senders"] as const,
};

/** Live views poll so status changes made by the worker show up without a reload. */
const LIVE_REFRESH_MS = 5000;

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api<MeResponse>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
}

export const PAGE_SIZE = 25;

export function useEmails(tab: EmailTab, page: number, q: string, filter: EmailFilter) {
  const params = new URLSearchParams({ tab, page: String(page), pageSize: String(PAGE_SIZE) });
  if (q) params.set("q", q);
  if (filter.status) params.set("status", filter.status);
  if (filter.starred) params.set("starred", "true");
  return useQuery({
    queryKey: queryKeys.emails(tab, page, q, filter),
    queryFn: () => api<Paginated<EmailListItem>>(`/emails?${params}`),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useEmail(id: string) {
  return useQuery({
    queryKey: queryKeys.email(id),
    queryFn: () => api<EmailDetail>(`/emails/${id}`),
    refetchInterval: (query) =>
      query.state.data && ["sent", "failed"].includes(query.state.data.status) ? false : LIVE_REFRESH_MS,
  });
}

export function useStats() {
  return useQuery({
    queryKey: queryKeys.stats,
    queryFn: () => api<EmailStats>("/emails/stats"),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useSenders() {
  return useQuery({
    queryKey: queryKeys.senders,
    queryFn: () => api<SendersResponse>("/senders"),
    refetchInterval: 10_000,
  });
}

export function useCreateCampaign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCampaignRequest) =>
      api<CreateCampaignResponse>("/campaigns", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["emails"] });
      void client.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
}

/** Star/unstar with an optimistic update across every cached list and the detail view. */
export function useToggleStar() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) =>
      api<{ id: string; starred: boolean }>(`/emails/${id}/star`, { method: "PATCH", body: JSON.stringify({ starred }) }),
    onMutate: async ({ id, starred }) => {
      await client.cancelQueries({ queryKey: ["emails"] });
      client.setQueriesData<Paginated<EmailListItem>>({ queryKey: ["emails"] }, (data) =>
        data ? { ...data, items: data.items.map((e) => (e.id === id ? { ...e, starred } : e)) } : data,
      );
      client.setQueryData<EmailDetail>(queryKeys.email(id), (data) => (data ? { ...data, starred } : data));
    },
    onSettled: (_data, _err, { id }) => {
      void client.invalidateQueries({ queryKey: ["emails"] });
      void client.invalidateQueries({ queryKey: queryKeys.email(id) });
    },
  });
}

export function useEmailLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api<{ created: boolean }>("/auth/email", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST" }),
    onSuccess: () => client.clear(),
  });
}

export function useDisconnectSlack() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("/slack", { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useTestSlack() {
  return useMutation({ mutationFn: () => api<{ ok: true }>("/slack/test", { method: "POST" }) });
}
