"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { cartApi, type CartResponse } from "@/api/cart"
import { requestCartDrawer } from "@/hooks/api/cart/cart-drawer"
import { cartKeys, setCart } from "@/hooks/api/cart/queries"

export function useAddToCart() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ variantId, quantity }: { variantId: string; quantity?: number; openDrawer?: boolean }) => cartApi.add(variantId, quantity),
    onSuccess: (data, { openDrawer }) => {
      setCart(client, data)
      if (openDrawer !== false) requestCartDrawer()
    },
  })
}

export function useUpdateCartLine() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ lineId, quantity }: { lineId: string; quantity: number }) => cartApi.update(lineId, quantity),
    onSuccess: (data) => setCart(client, data),
    onError: () => client.invalidateQueries({ queryKey: cartKeys.all }),
  })
}

export function useRemoveCartLine() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (lineId: string) => cartApi.remove(lineId),
    onSuccess: (data) => setCart(client, data),
    onError: () => client.invalidateQueries({ queryKey: cartKeys.all }),
  })
}

/**
 * Quantity change or removal shown at once (mini bag): the line changes in the cache before the
 * server answers, totals are marked stale until it does, and the previous bag comes back if the
 * request fails. The server's answer always replaces the guess.
 */
export function useOptimisticLine() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ lineId, quantity }: { lineId: string; quantity: number }) => (quantity === 0 ? cartApi.remove(lineId) : cartApi.update(lineId, quantity)),
    onMutate: async ({ lineId, quantity }) => {
      await client.cancelQueries({ queryKey: cartKeys.all })
      const previous = client.getQueryData<CartResponse>(cartKeys.all)
      if (previous) {
        const lines = previous.cart.lines.flatMap((line) =>
          line.id !== lineId ? [line] : quantity === 0 ? [] : [{ ...line, quantity, lineTotal: line.unitPrice * quantity }],
        )
        client.setQueryData<CartResponse>(cartKeys.all, { ...previous, cart: { ...previous.cart, lines, itemCount: lines.reduce((sum, line) => sum + line.quantity, 0) } })
      }
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(cartKeys.all, context.previous)
    },
    onSuccess: (data) => setCart(client, data),
  })
}

export function useApplyCode() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (code: string) => cartApi.applyCode(code), onSuccess: (data) => setCart(client, data) })
}

export function useRemoveCode() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (code: string) => cartApi.removeCode(code), onSuccess: (data) => setCart(client, data) })
}
