# Typed API client + TanStack Query hooks + tests

## Summary

Create a typed API client layer and TanStack Query hooks that provide caching, loading states, error handling, and cache invalidation for all backend endpoints. Refactor the existing `useAuth` hook to use the new `useMe` query hook internally. After this issue, every API call in the frontend goes through a single `apiClient` function with typed responses, and all CRUD operations have dedicated hooks with proper mutation/cache invalidation patterns.

## Relevant Skills

- `react-state-management`
- `vercel-react-best-practices`
- `typescript-advanced-types`

## Requirements Coverage

- [F5](../REQUIREMENTS.md) — Diagram lifecycle management via API: hooks for listing, creating, updating, duplicating, renaming, and deleting diagrams provide the data layer for the dashboard and editor.
- [F2-US6](../REQUIREMENTS.md) — User profile via API: the `useMe` hook fetches and caches the current user's profile for display in the header and dashboard.

## Dependencies

- **ISSUE-10** — Routing, app shell, and the initial `useAuth` hook must exist. The `AuthProvider` will be refactored to use `useMe` internally.

## Acceptance Criteria

- [ ] `@tanstack/react-query` is installed in `src/frontend`.
- [ ] `src/frontend/src/api/client.ts` exports an `apiClient<T>(path, options?)` function that prepends `/api/`, parses JSON, returns typed data, and throws `ApiError` on error responses.
- [ ] `apiClient` sets `Content-Type: application/json` for POST, PUT, and PATCH methods.
- [ ] `apiClient` throws a typed `ApiError` (with `code`, `message`, `status`) for non-OK responses.
- [ ] `src/frontend/src/api/hooks/useMe.ts` exports a `useMe()` TanStack Query hook for `GET /api/me`.
- [ ] `src/frontend/src/api/hooks/useDiagrams.ts` exports: `useListDiagrams`, `useDiagram(id)`, `useCreateDiagram`, `useUpdateDiagram`, `useDuplicateDiagram`, `useDeleteDiagram`, `useRenameDiagram`.
- [ ] Mutation hooks invalidate the `["diagrams"]` query key on success.
- [ ] `useCreateDiagram` and `useDuplicateDiagram` return the new diagram data for navigation.
- [ ] `src/frontend/src/api/hooks/useCatalog.ts` exports `useCatalog()` with `staleTime: Infinity`.
- [ ] `src/frontend/src/api/hooks/useAdmin.ts` exports `useAdminUsers(params)`, `usePromoteUser`, `useDemoteUser`, `useDeleteUser`.
- [ ] `src/frontend/src/api/index.ts` re-exports all hooks.
- [ ] `App.tsx` wraps the app in `QueryClientProvider`.
- [ ] `useAuth` is refactored to use `useMe` internally instead of raw fetch.
- [ ] Tests verify each hook with mocked fetch responses, error handling, loading states, and cache invalidation.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### Step 1: Install TanStack Query

```bash
npm install @tanstack/react-query --workspace=src/frontend
```

### Step 2: Create `src/frontend/src/api/client.ts`

The typed fetch wrapper that all hooks use:

```ts
import type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiErrorCode,
} from "@architect/shared";

/**
 * Error thrown by the API client for non-OK responses.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Typed API client. Prepends /api/ to the path, handles JSON
 * parsing, and throws ApiError for non-OK responses.
 *
 * @param path - API path without the /api/ prefix (e.g. "me", "diagrams")
 * @param options - Standard fetch options
 * @returns The `data` field from the API success envelope
 */
export async function apiClient<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `/api/${path.replace(/^\//, "")}`;

  const method = options?.method?.toUpperCase() ?? "GET";
  const headers = new Headers(options?.headers);

  // Set Content-Type for mutating methods with a body
  if (
    ["POST", "PUT", "PATCH"].includes(method) &&
    options?.body &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 204 No Content (e.g. DELETE)
  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json();

  if (!res.ok) {
    const errorBody = body as ApiErrorResponse;
    throw new ApiError(
      errorBody.error?.code ?? "INTERNAL_ERROR",
      errorBody.error?.message ?? `Request failed with status ${res.status}`,
      res.status,
      errorBody.error?.details,
    );
  }

  return (body as ApiSuccessResponse<T>).data;
}
```

**Key decisions:**

- The function returns `T` (the `data` field unwrapped from the envelope), not the full `ApiSuccessResponse<T>`. This keeps hook consumers clean — they get the data directly.
- `Content-Type: application/json` is set automatically for POST/PUT/PATCH when a body is present and no Content-Type is already set.
- 204 No Content returns `undefined` — this handles DELETE responses where there's no body.
- Non-OK responses are parsed and thrown as `ApiError` with the error code, message, status, and optional details from the backend envelope.
- The path is normalized to remove leading slashes before prepending `/api/`.

### Step 3: Create `src/frontend/src/api/hooks/useMe.ts`

```ts
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../client";
import type { User } from "@architect/shared";

export const ME_QUERY_KEY = ["me"] as const;

/**
 * Fetches the current user's profile from GET /api/me.
 * Used by AuthProvider internally and can be used directly
 * where user data is needed.
 */
export function useMe() {
  return useQuery<User>({
    queryKey: ME_QUERY_KEY,
    queryFn: () => apiClient<User>("me"),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

**Notes:**

- `retry: false` — If the user is not authenticated, we don't want to retry the request (it would keep returning 401).
- `staleTime: 5 * 60 * 1000` — User profile changes infrequently, so 5 minutes avoids unnecessary refetches.
- The query key `["me"]` is exported so other code can invalidate it if needed.

### Step 4: Create `src/frontend/src/api/hooks/useDiagrams.ts`

```ts
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiClient } from "../client";

// Define local types that match the API response shape.
// These represent the API wire format (snake_case timestamps).
interface Diagram {
  id: string;
  user_id: string;
  title: string;
  graph_data: {
    nodes: unknown[];
    edges: unknown[];
    viewport?: { x: number; y: number; zoom: number };
  };
  version: number;
  created_at: number;
  updated_at: number;
}

export const DIAGRAMS_QUERY_KEY = ["diagrams"] as const;
export const diagramQueryKey = (id: string) => ["diagrams", id] as const;

/**
 * Fetch all diagrams for the current user.
 */
export function useListDiagrams() {
  return useQuery<Diagram[]>({
    queryKey: DIAGRAMS_QUERY_KEY,
    queryFn: () => apiClient<Diagram[]>("diagrams"),
  });
}

/**
 * Fetch a single diagram by ID.
 */
export function useDiagram(id: string) {
  return useQuery<Diagram>({
    queryKey: diagramQueryKey(id),
    queryFn: () => apiClient<Diagram>(`diagrams/${id}`),
    enabled: !!id,
  });
}

/**
 * Create a new blank diagram.
 * Returns the new diagram so callers can navigate to /editor/:id.
 */
export function useCreateDiagram() {
  const queryClient = useQueryClient();

  return useMutation<Diagram, Error, { title: string }>({
    mutationFn: ({ title }) =>
      apiClient<Diagram>("diagrams", {
        method: "POST",
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DIAGRAMS_QUERY_KEY });
    },
  });
}

/**
 * Full update of a diagram (graph_data + title + version check).
 * Sends the current version for optimistic concurrency control.
 */
export function useUpdateDiagram() {
  const queryClient = useQueryClient();

  return useMutation<
    Diagram,
    Error,
    {
      id: string;
      title: string;
      graph_data: unknown;
      version: number;
    }
  >({
    mutationFn: ({ id, ...data }) =>
      apiClient<Diagram>(`diagrams/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: diagramQueryKey(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: DIAGRAMS_QUERY_KEY });
    },
  });
}

/**
 * Rename a diagram (PATCH — title only, no version check).
 */
export function useRenameDiagram() {
  const queryClient = useQueryClient();

  return useMutation<Diagram, Error, { id: string; title: string }>({
    mutationFn: ({ id, title }) =>
      apiClient<Diagram>(`diagrams/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: diagramQueryKey(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: DIAGRAMS_QUERY_KEY });
    },
  });
}

/**
 * Duplicate a diagram.
 * Returns the new diagram so callers can navigate to /editor/:newId.
 */
export function useDuplicateDiagram() {
  const queryClient = useQueryClient();

  return useMutation<Diagram, Error, { id: string }>({
    mutationFn: ({ id }) =>
      apiClient<Diagram>(`diagrams/${id}/duplicate`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DIAGRAMS_QUERY_KEY });
    },
  });
}

/**
 * Delete a diagram.
 */
export function useDeleteDiagram() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) =>
      apiClient<void>(`diagrams/${id}`, {
        method: "DELETE",
      }),
    onSuccess: (_data, variables) => {
      queryClient.removeQueries({
        queryKey: diagramQueryKey(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: DIAGRAMS_QUERY_KEY });
    },
  });
}
```

**Key decisions:**

- The `Diagram` interface is defined locally to match the API wire format (snake_case). The shared `GraphData` type from `@architect/shared` is used via `unknown[]` for nodes/edges here since the frontend will need to map these to React Flow types later. If strict typing is desired now, import `GraphData` and use it.
- `useDeleteDiagram` uses `removeQueries` (not `invalidateQueries`) for the specific diagram key because the resource no longer exists.
- `useDuplicateDiagram` returns the new diagram so the caller can extract `data.id` and navigate to `/editor/:id`.
- `enabled: !!id` on `useDiagram` prevents the query from running when the ID is undefined.

### Step 5: Create `src/frontend/src/api/hooks/useCatalog.ts`

```ts
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../client";

// The catalog type matches the API response from GET /api/catalog.
// Full typing comes from @architect/shared when ISSUE-08 is implemented.
interface CatalogResponse {
  services: unknown[];
  categories: unknown[];
  edgeTypes: unknown[];
}

export const CATALOG_QUERY_KEY = ["catalog"] as const;

/**
 * Fetch the Cloudflare service catalog.
 * staleTime: Infinity — the catalog rarely changes and is only
 * updated on deployment, so we never consider it stale.
 */
export function useCatalog() {
  return useQuery<CatalogResponse>({
    queryKey: CATALOG_QUERY_KEY,
    queryFn: () => apiClient<CatalogResponse>("catalog"),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
```

### Step 6: Create `src/frontend/src/api/hooks/useAdmin.ts`

```ts
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiClient } from "../client";
import type { User } from "@architect/shared";

interface AdminUsersParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
  search?: string;
}

interface AdminUsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
}

export const ADMIN_USERS_QUERY_KEY = ["admin", "users"] as const;

/**
 * Fetch paginated user list (admin only).
 */
export function useAdminUsers(params: AdminUsersParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.order) searchParams.set("order", params.order);
  if (params.search) searchParams.set("search", params.search);

  const queryString = searchParams.toString();
  const path = queryString ? `admin/users?${queryString}` : "admin/users";

  return useQuery<AdminUsersResponse>({
    queryKey: [...ADMIN_USERS_QUERY_KEY, params],
    queryFn: () => apiClient<AdminUsersResponse>(path),
  });
}

/**
 * Promote a user to admin role.
 */
export function usePromoteUser() {
  const queryClient = useQueryClient();

  return useMutation<User, Error, { userId: string }>({
    mutationFn: ({ userId }) =>
      apiClient<User>(`admin/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: "admin" }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
    },
  });
}

/**
 * Demote a user to regular user role.
 */
export function useDemoteUser() {
  const queryClient = useQueryClient();

  return useMutation<User, Error, { userId: string }>({
    mutationFn: ({ userId }) =>
      apiClient<User>(`admin/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: "user" }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
    },
  });
}

/**
 * Delete a user (admin only).
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { userId: string }>({
    mutationFn: ({ userId }) =>
      apiClient<void>(`admin/users/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
    },
  });
}
```

### Step 7: Create `src/frontend/src/api/index.ts`

Barrel export for all API hooks:

```ts
// Client
export { apiClient, ApiError } from "./client";

// Hooks
export { useMe, ME_QUERY_KEY } from "./hooks/useMe";
export {
  useListDiagrams,
  useDiagram,
  useCreateDiagram,
  useUpdateDiagram,
  useDuplicateDiagram,
  useDeleteDiagram,
  useRenameDiagram,
  DIAGRAMS_QUERY_KEY,
  diagramQueryKey,
} from "./hooks/useDiagrams";
export { useCatalog, CATALOG_QUERY_KEY } from "./hooks/useCatalog";
export {
  useAdminUsers,
  usePromoteUser,
  useDemoteUser,
  useDeleteUser,
  ADMIN_USERS_QUERY_KEY,
} from "./hooks/useAdmin";
```

### Step 8: Wrap App in QueryClientProvider

Update `src/frontend/src/App.tsx` to create a `QueryClient` and wrap the app:

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AdminRoute } from "@/components/layout/AdminRoute";
import { Dashboard } from "@/pages/Dashboard";
import { Editor } from "@/pages/Editor";
import { Admin } from "@/pages/Admin";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/editor/:id" element={<Editor />} />
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <Admin />
                  </AdminRoute>
                }
              />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

**Notes:**

- `QueryClientProvider` must wrap everything, including `AuthProvider`, because `useMe` (used inside `AuthProvider` after refactoring) is a TanStack Query hook.
- `refetchOnWindowFocus: false` — Prevents unnecessary refetches when switching browser tabs. The app uses explicit invalidation after mutations.
- `retry: 1` — One retry for transient failures, but not excessive.

### Step 9: Refactor `useAuth` to use `useMe`

Update `src/frontend/src/hooks/useAuth.ts` to delegate to the `useMe` TanStack Query hook:

```tsx
import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { User } from "@architect/shared";
import { useMe } from "@/api/hooks/useMe";
import type { ApiError } from "@/api/client";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error, refetch } = useMe();

  const errorMessage = error
    ? (error as ApiError).status === 401
      ? "unauthorized"
      : error.message
    : null;

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error: errorMessage,
        refetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
```

**What changed:**

- Removed the `useState` + `useEffect` + raw `fetch` pattern.
- Now delegates entirely to `useMe()` from TanStack Query.
- The error handling maps `ApiError` with status 401 to the `"unauthorized"` string that `ProtectedRoute` checks for.
- The `refetch` function comes from TanStack Query's `useQuery` return value.

### Step 10: Write tests

All tests use Vitest with `@testing-library/react`. TanStack Query requires a `QueryClient` wrapper in tests.

Create a test utility at `src/frontend/src/test/query-wrapper.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Creates a fresh QueryClient + Provider wrapper for testing.
 * retry: false prevents retries in tests.
 */
export function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return { queryClient, Wrapper };
}
```

#### `src/frontend/src/api/__tests__/client.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient, ApiError } from "../client";

describe("apiClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prepends /api/ to the path", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { version: "1.0.0" } }), {
        status: 200,
      }),
    );

    await apiClient("version");

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/version",
      expect.any(Object),
    );
  });

  it("returns the data field from success envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: { id: "123", title: "My Diagram" } }),
        { status: 200 },
      ),
    );

    const result = await apiClient<{ id: string; title: string }>("diagrams/123");
    expect(result).toEqual({ id: "123", title: "My Diagram" });
  });

  it("throws ApiError for non-OK responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "NOT_FOUND", message: "Diagram not found" },
        }),
        { status: 404 },
      ),
    );

    await expect(apiClient("diagrams/missing")).rejects.toThrow(ApiError);

    try {
      await apiClient("diagrams/missing");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.code).toBe("NOT_FOUND");
      expect(apiErr.message).toBe("Diagram not found");
      expect(apiErr.status).toBe(404);
    }
  });

  it("sets Content-Type: application/json for POST requests with body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), { status: 201 }),
    );

    await apiClient("diagrams", {
      method: "POST",
      body: JSON.stringify({ title: "New" }),
    });

    const calledHeaders = fetchSpy.mock.calls[0][1]?.headers;
    expect(calledHeaders).toBeDefined();
    const headers = new Headers(calledHeaders as HeadersInit);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("handles 204 No Content responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    const result = await apiClient("diagrams/123", { method: "DELETE" });
    expect(result).toBeUndefined();
  });

  it("normalizes leading slashes in path", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), { status: 200 }),
    );

    await apiClient("/version");

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/version",
      expect.any(Object),
    );
  });
});
```

#### `src/frontend/src/api/hooks/__tests__/useMe.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMe } from "../useMe";
import { createQueryWrapper } from "../../../test/query-wrapper";

describe("useMe", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and returns user data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: "01ABC",
            email: "alice@example.com",
            name: "alice",
            avatar_url: null,
            role: "user",
            created_at: 1000,
            updated_at: 1000,
          },
        }),
        { status: 200 },
      ),
    );

    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useMe(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.email).toBe("alice@example.com");
  });

  it("returns error on 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "UNAUTHORIZED", message: "Not authenticated" },
        }),
        { status: 401 },
      ),
    );

    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useMe(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
```

#### `src/frontend/src/api/hooks/__tests__/useDiagrams.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import {
  useListDiagrams,
  useCreateDiagram,
  useDeleteDiagram,
  useDuplicateDiagram,
  useRenameDiagram,
} from "../useDiagrams";
import { createQueryWrapper } from "../../../test/query-wrapper";

const mockDiagram = {
  id: "01DIAGRAM",
  user_id: "01USER",
  title: "Test Diagram",
  graph_data: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
  version: 1,
  created_at: 1000,
  updated_at: 1000,
};

describe("useListDiagrams", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and returns diagram list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [mockDiagram] }), { status: 200 }),
    );

    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useListDiagrams(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].title).toBe("Test Diagram");
  });
});

describe("useCreateDiagram", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a diagram and returns it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: mockDiagram }), { status: 201 }),
    );

    const { Wrapper, queryClient } = createQueryWrapper();
    const { result } = renderHook(() => useCreateDiagram(), {
      wrapper: Wrapper,
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      await result.current.mutateAsync({ title: "Test Diagram" });
    });

    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe("useDeleteDiagram", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes a diagram and invalidates cache", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    const { Wrapper, queryClient } = createQueryWrapper();
    const { result } = renderHook(() => useDeleteDiagram(), {
      wrapper: Wrapper,
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      await result.current.mutateAsync({ id: "01DIAGRAM" });
    });

    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe("useDuplicateDiagram", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("duplicates and returns the new diagram", async () => {
    const duplicated = { ...mockDiagram, id: "01COPY", title: "Test Diagram (Copy)" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: duplicated }), { status: 201 }),
    );

    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useDuplicateDiagram(), {
      wrapper: Wrapper,
    });

    let newDiagram: typeof duplicated | undefined;
    await act(async () => {
      newDiagram = await result.current.mutateAsync({ id: "01DIAGRAM" });
    });

    expect(newDiagram?.id).toBe("01COPY");
    expect(newDiagram?.title).toBe("Test Diagram (Copy)");
  });
});

describe("useRenameDiagram", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renames a diagram", async () => {
    const renamed = { ...mockDiagram, title: "Renamed" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: renamed }), { status: 200 }),
    );

    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useRenameDiagram(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: "01DIAGRAM",
        title: "Renamed",
      });
    });

    expect(result.current.data?.title).toBe("Renamed");
  });
});
```

#### `src/frontend/src/api/hooks/__tests__/useCatalog.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCatalog } from "../useCatalog";
import { createQueryWrapper } from "../../../test/query-wrapper";

describe("useCatalog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches catalog data", async () => {
    const mockCatalog = {
      services: [{ id: "workers", name: "Workers" }],
      categories: [{ id: "developer", name: "Developer Platform" }],
      edgeTypes: [],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: mockCatalog }), { status: 200 }),
    );

    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCatalog(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.services).toHaveLength(1);
  });
});
```

#### `src/frontend/src/api/hooks/__tests__/useAdmin.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAdminUsers, usePromoteUser, useDeleteUser } from "../useAdmin";
import { createQueryWrapper } from "../../../test/query-wrapper";

describe("useAdminUsers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches paginated user list", async () => {
    const mockResponse = {
      users: [
        {
          id: "01ABC",
          email: "alice@example.com",
          name: "alice",
          avatarUrl: null,
          role: "user" as const,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: mockResponse }), { status: 200 }),
    );

    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAdminUsers({ page: 1 }), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.users).toHaveLength(1);
    expect(result.current.data?.total).toBe(1);
  });
});

describe("usePromoteUser", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("promotes a user and invalidates cache", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: "01ABC",
            email: "alice@example.com",
            name: "alice",
            avatarUrl: null,
            role: "admin",
            createdAt: 1000,
            updatedAt: 2000,
          },
        }),
        { status: 200 },
      ),
    );

    const { Wrapper, queryClient } = createQueryWrapper();
    const { result } = renderHook(() => usePromoteUser(), {
      wrapper: Wrapper,
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      await result.current.mutateAsync({ userId: "01ABC" });
    });

    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe("useDeleteUser", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes a user", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useDeleteUser(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ userId: "01ABC" });
    });

    expect(result.current.isSuccess).toBe(true);
  });
});
```

### Step 11: Update existing useAuth tests

The `useAuth` tests from ISSUE-10 need to be updated since `AuthProvider` now uses TanStack Query. Wrap the test renders in the query wrapper:

Update `src/frontend/src/hooks/__tests__/useAuth.test.tsx` to wrap `AuthProvider` with `QueryClientProvider` from the test utility. The test assertions remain the same — the behavior hasn't changed, only the implementation.

### Step 12: Verify everything works

```bash
npm install
npm run build
npm run check
npm test
npm run test:coverage
npm start
```

### File inventory

| File | Purpose |
|------|---------|
| `src/frontend/src/api/client.ts` | Typed fetch wrapper with error handling |
| `src/frontend/src/api/hooks/useMe.ts` | TanStack Query hook for GET /api/me |
| `src/frontend/src/api/hooks/useDiagrams.ts` | All diagram CRUD hooks with cache invalidation |
| `src/frontend/src/api/hooks/useCatalog.ts` | Catalog query hook (staleTime: Infinity) |
| `src/frontend/src/api/hooks/useAdmin.ts` | Admin user management hooks |
| `src/frontend/src/api/index.ts` | Barrel export for all API hooks |
| `src/frontend/src/test/query-wrapper.tsx` | Test utility for QueryClient + Provider |
| `src/frontend/src/api/__tests__/client.test.ts` | API client tests |
| `src/frontend/src/api/hooks/__tests__/useMe.test.tsx` | useMe hook tests |
| `src/frontend/src/api/hooks/__tests__/useDiagrams.test.tsx` | Diagram hook tests |
| `src/frontend/src/api/hooks/__tests__/useCatalog.test.tsx` | Catalog hook tests |
| `src/frontend/src/api/hooks/__tests__/useAdmin.test.tsx` | Admin hook tests |

## Testing

### Unit Tests

| File | What it tests |
|------|---------------|
| `src/frontend/src/api/__tests__/client.test.ts` | Path prepending, JSON envelope unwrapping, Content-Type header for POST/PUT/PATCH, ApiError throwing for non-OK responses, 204 No Content handling, path normalization |
| `src/frontend/src/api/hooks/__tests__/useMe.test.tsx` | Successful user fetch, 401 error handling |
| `src/frontend/src/api/hooks/__tests__/useDiagrams.test.tsx` | List diagrams fetch, create diagram returns data, delete invalidates cache, duplicate returns new diagram, rename mutation |
| `src/frontend/src/api/hooks/__tests__/useCatalog.test.tsx` | Catalog fetch returns services and categories |
| `src/frontend/src/api/hooks/__tests__/useAdmin.test.tsx` | Paginated user list fetch, promote user invalidates cache, delete user |

### Manual Tests

After `npm start` completes:

1. **Auth still works:** Open `http://localhost:8787`, log in, and verify the dashboard loads with your email in the header. This confirms the refactored `useAuth` -> `useMe` pipeline works.

2. **TanStack Query devtools (optional):** If `@tanstack/react-query-devtools` is installed, open the devtools panel and verify the `["me"]` query is cached with user data.

3. **API client error handling:** Open the browser console, navigate to a non-existent diagram URL (e.g., `http://localhost:8787/editor/nonexistent`). When the editor eventually tries to fetch the diagram, the console should not show unhandled promise rejections — errors should be caught by TanStack Query.
