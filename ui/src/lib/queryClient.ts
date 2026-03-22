import { QueryClient } from "@tanstack/react-query";

/**
 * 全應用共用 QueryClient，須與 main 中 PersistQueryClientProvider 的 client 為同一實例。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      gcTime: 1000 * 60 * 60 * 24,
    },
  },
});
