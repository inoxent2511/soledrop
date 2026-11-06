"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { adminAccountApi } from "@/api/admin/account"

export const adminAccountKeys = { sessions: ["admin", "account", "sessions"] as const }

export function useStaffSessions() {
  return useQuery({ queryKey: adminAccountKeys.sessions, queryFn: ({ signal }) => adminAccountApi.sessions(signal) })
}

export function useRevokeSession() {
  const client = useQueryClient()
  return useMutation({ mutationFn: adminAccountApi.revokeSession, onSuccess: () => client.invalidateQueries({ queryKey: adminAccountKeys.sessions }) })
}

export function useChangeStaffPassword() {
  const client = useQueryClient()
  return useMutation({ mutationFn: adminAccountApi.changePassword, onSuccess: () => client.invalidateQueries({ queryKey: adminAccountKeys.sessions }) })
}
