# Routing, app shell layout, auth context + tests

## Summary

Build the app shell with React Router, an authentication context that calls `GET /api/me`, a protected route wrapper, and placeholder pages for Dashboard, Editor, and Admin. After this issue, navigating to `/` shows the dashboard (with user info in the header), `/editor/:id` shows the editor placeholder, and `/admin` is accessible only to admin users. All auth-dependent components handle loading and error states gracefully.

## Relevant Skills

- `vercel-react-best-practices`
- `vercel-composition-patterns`
- `web-component-design`
- `tailwind-design-system`
- `shadcn`

## Requirements Coverage

- [F2-US6](../REQUIREMENTS.md) — User can see their profile (name, email, avatar) in the editor and dashboard header, confirming they are logged in with the correct account.
- [F4](../REQUIREMENTS.md) (partial) — Editor page shell is established with route parameter for diagram ID; full canvas implementation comes in later issues.
- [F5](../REQUIREMENTS.md) (partial) — Dashboard page shell is established; full card grid and CRUD come in ISSUE-12.

## Dependencies

- **ISSUE-05** — The `GET /api/me` endpoint must exist and return user profile data (id, email, name, avatar_url, role).
- **ISSUE-09** — Frontend scaffolding (Vite, React, Tailwind, shadcn, `cn()` utility) must be in place.

## Acceptance Criteria

- [ ] `react-router-dom` is installed (may already be from ISSUE-09).
- [ ] `src/frontend/src/App.tsx` sets up `BrowserRouter` with routes: `/` -> Dashboard, `/editor/:id` -> Editor, `/admin` -> Admin.
- [ ] `src/frontend/src/hooks/useAuth.ts` exports an `AuthProvider` context and a `useAuth()` hook.
- [ ] `useAuth()` calls `GET /api/me` via fetch on mount and provides `{ user, isLoading, error }`.
- [ ] `AuthProvider` wraps the app in `App.tsx`.
- [ ] `src/frontend/src/components/layout/AppShell.tsx` renders a header with app name and user info (avatar/email from auth context), a sidebar placeholder area, and a main content area using React Router's `<Outlet />`.
- [ ] `src/frontend/src/components/layout/ProtectedRoute.tsx` wraps auth-required routes: shows a loading spinner while auth is pending; redirects to `/_auth/login` if auth fails (401/error).
- [ ] `src/frontend/src/pages/Dashboard.tsx` shows a "Dashboard" heading and the user's email from auth context.
- [ ] `src/frontend/src/pages/Editor.tsx` shows "Editor for diagram {id}" using `useParams()`.
- [ ] `src/frontend/src/pages/Admin.tsx` shows "Admin" heading. It is only accessible if `user.role === 'admin'`; non-admin users see a "Forbidden" message or are redirected.
- [ ] All routes except `/admin` are protected by `ProtectedRoute`.
- [ ] `/admin` is protected by both `ProtectedRoute` and an admin role check.
- [ ] Tests: AuthProvider renders children with user data (mock fetch), ProtectedRoute redirects when not authed, ProtectedRoute shows loading state while auth is pending, AppShell renders header with user info.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### Step 1: Verify react-router-dom is installed

Check that `react-router-dom` is in `src/frontend/package.json` dependencies (it should be from ISSUE-09). If not:

```bash
npm install react-router-dom --workspace=src/frontend
```

### Step 2: Create `src/frontend/src/hooks/useAuth.ts`

This file exports both the `AuthProvider` component and the `useAuth()` hook. The provider fetches the current user from the API on mount and stores the result in React context.

```tsx
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { User } from "@architect/shared";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  /** Re-fetch the current user (e.g. after role change). */
  refetch: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    error: null,
  });

  const fetchUser = async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await fetch("/api/me");
      if (!res.ok) {
        if (res.status === 401 || res.status === 302) {
          setState({ user: null, isLoading: false, error: "unauthorized" });
          return;
        }
        throw new Error(`Failed to fetch user: ${res.status}`);
      }
      const body = await res.json();
      setState({ user: body.data, isLoading: false, error: null });
    } catch (err) {
      setState({
        user: null,
        isLoading: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, refetch: fetchUser }}>
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

**Key decisions:**

- The hook calls `GET /api/me` via plain `fetch`. In ISSUE-11, this will be refactored to use TanStack Query's `useMe` hook internally, but for now a direct fetch keeps things simple and avoids a dependency on TanStack Query before it's installed.
- The response shape matches the backend: `{ data: { id, email, name, avatar_url, role, created_at, updated_at } }`.
- The `User` type is imported from `@architect/shared` (defined in ISSUE-03).
- A `refetch` function is exposed so other components can trigger a re-fetch (e.g. after an admin promotes the current user).
- The `error` field is set to `"unauthorized"` specifically for 401/302 responses, which downstream components use to redirect to login.

**Note on the `User` type:** The shared `User` type from `@architect/shared` uses camelCase properties (`avatarUrl`, `createdAt`, `updatedAt`). However, the backend API returns snake_case (`avatar_url`, `created_at`, `updated_at`) because the Drizzle schema column names are snake_case and the route handlers return raw row data. The `useAuth` hook should accept either — when ISSUE-11 creates the typed API client, it will handle the mapping. For now, the `body.data` is assigned directly. If the `User` type causes type mismatches, create a local `ApiUser` interface or use `as User` assertion. The safest approach is to define the context as storing `body.data` as-is and let the consuming components access properties as they come from the API.

### Step 3: Create `src/frontend/src/components/layout/AppShell.tsx`

The main layout component that wraps all authenticated pages:

```tsx
import { Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export function AppShell() {
  const { user } = useAuth();

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-primary">
            CF-Architect
          </span>
        </div>
        {user && (
          <div className="flex items-center gap-3">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name ?? user.email}
                className="h-8 w-8 rounded-full"
              />
            ) : (
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full",
                  "bg-primary text-primary-foreground text-sm font-medium",
                )}
              >
                {(user.name ?? user.email).charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-sm text-muted-foreground">
              {user.email}
            </span>
          </div>
        )}
      </header>

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar placeholder — will be populated in canvas issues */}
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

**Design decisions:**

- Uses Tailwind utility classes with design tokens from the `@theme` block (e.g., `bg-background`, `text-primary`, `border-border`).
- The header is a fixed 56px (`h-14`) bar with the app name on the left and user info on the right.
- If the user has an `avatar_url`, it's shown as a circular image. Otherwise, a colored circle with the first letter of their name (or email) is shown.
- The sidebar area is a placeholder `<div>` that will be populated in ISSUE-15 (service palette).
- `<Outlet />` renders the matched child route (Dashboard, Editor, or Admin).

### Step 4: Create `src/frontend/src/components/layout/ProtectedRoute.tsx`

```tsx
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Wraps routes that require authentication.
 * Shows a loading spinner while auth is pending.
 * Redirects to the auth login page if the user is not authenticated.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, error } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center" role="status">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  if (error === "unauthorized" || !user) {
    // Redirect to the cloudflare-auth login page
    return <Navigate to="/_auth/login" replace />;
  }

  return <>{children}</>;
}
```

**Key decisions:**

- The loading spinner is a simple CSS-animated circle using Tailwind's `animate-spin`. It has `role="status"` and a screen-reader-only label for accessibility.
- When auth fails (401 or no user), the component redirects to `/_auth/login` using React Router's `<Navigate>`. This is the cloudflare-auth PIN login page in dev, or the Cloudflare Access login in production.
- `replace` is used so the login redirect doesn't pollute browser history.
- The component renders its `children` (not `<Outlet />`) so it can wrap route elements in the route config.

### Step 5: Create `src/frontend/src/components/layout/AdminRoute.tsx`

A route guard that checks for admin role in addition to authentication:

```tsx
import { useAuth } from "@/hooks/useAuth";

/**
 * Wraps routes that require admin role.
 * Must be nested inside a ProtectedRoute (auth already verified).
 * Shows a forbidden message if the user is not an admin.
 */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (user?.role !== "admin") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">Forbidden</h1>
          <p className="mt-2 text-muted-foreground">
            You do not have permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
```

### Step 6: Create placeholder page components

#### `src/frontend/src/pages/Dashboard.tsx`

```tsx
import { useAuth } from "@/hooks/useAuth";

export function Dashboard() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      {user && (
        <p className="mt-2 text-muted-foreground">
          Logged in as {user.email}
        </p>
      )}
    </div>
  );
}
```

#### `src/frontend/src/pages/Editor.tsx`

```tsx
import { useParams } from "react-router-dom";

export function Editor() {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      <h1 className="text-2xl font-bold">Editor for diagram {id}</h1>
    </div>
  );
}
```

#### `src/frontend/src/pages/Admin.tsx`

```tsx
import { useAuth } from "@/hooks/useAuth";

export function Admin() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-2xl font-bold">Admin</h1>
      {user && (
        <p className="mt-2 text-muted-foreground">
          Admin user: {user.email}
        </p>
      )}
    </div>
  );
}
```

### Step 7: Update `src/frontend/src/App.tsx`

Replace the placeholder from ISSUE-09 with the full router and app shell:

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AdminRoute } from "@/components/layout/AdminRoute";
import { Dashboard } from "@/pages/Dashboard";
import { Editor } from "@/pages/Editor";
import { Admin } from "@/pages/Admin";

export function App() {
  return (
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
  );
}
```

**Routing structure:**

- `AuthProvider` wraps everything so all components can access `useAuth()`.
- The top-level `<Route>` uses `ProtectedRoute` + `AppShell` as a layout route (no `path`). This means all child routes require auth and share the app shell layout.
- The `AppShell` renders an `<Outlet />` which receives the matched child route.
- `/admin` has an additional `AdminRoute` wrapper that checks for admin role.
- React Router v7 (react-router-dom) is used with the standard `Routes`/`Route` pattern.

### Step 8: Write tests

All tests use `@testing-library/react` with the jsdom environment. Create the following test files:

#### `src/frontend/src/hooks/__tests__/useAuth.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../useAuth";

// Helper component that displays auth state
function AuthDisplay() {
  const { user, isLoading, error } = useAuth();
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (user) return <div>User: {user.email}</div>;
  return <div>No user</div>;
}

describe("useAuth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading state initially", () => {
    // Mock fetch that never resolves
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));

    render(
      <AuthProvider>
        <AuthDisplay />
      </AuthProvider>,
    );

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("provides user data on successful fetch", async () => {
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

    render(
      <AuthProvider>
        <AuthDisplay />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("User: alice@example.com")).toBeInTheDocument();
    });
  });

  it("sets error to 'unauthorized' on 401 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 401 }),
    );

    render(
      <AuthProvider>
        <AuthDisplay />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Error: unauthorized")).toBeInTheDocument();
    });
  });

  it("sets error message on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Network error"),
    );

    render(
      <AuthProvider>
        <AuthDisplay />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Error: Network error")).toBeInTheDocument();
    });
  });

  it("throws when useAuth is used outside AuthProvider", () => {
    // Suppress React error boundary console output
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<AuthDisplay />)).toThrow(
      "useAuth must be used within an AuthProvider",
    );

    spy.mockRestore();
  });
});
```

#### `src/frontend/src/components/layout/__tests__/ProtectedRoute.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "../ProtectedRoute";

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading spinner while auth is pending", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter>
        <AuthProvider>
          <ProtectedRoute>
            <div>Protected content</div>
          </ProtectedRoute>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders children when authenticated", async () => {
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

    render(
      <MemoryRouter>
        <AuthProvider>
          <ProtectedRoute>
            <div>Protected content</div>
          </ProtectedRoute>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Protected content")).toBeInTheDocument();
    });
  });

  it("redirects to /_auth/login when not authenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 401 }),
    );

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <Routes>
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <div>Protected content</div>
                </ProtectedRoute>
              }
            />
            <Route path="/_auth/login" element={<div>Login page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Login page")).toBeInTheDocument();
    });
  });
});
```

#### `src/frontend/src/components/layout/__tests__/AppShell.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AppShell } from "../AppShell";

describe("AppShell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders header with app name and user email", async () => {
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

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<div>Child content</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("CF-Architect")).toBeInTheDocument();
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
      expect(screen.getByText("Child content")).toBeInTheDocument();
    });
  });

  it("renders avatar initial when no avatar_url", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: "01ABC",
            email: "alice@example.com",
            name: "Alice",
            avatar_url: null,
            role: "user",
            created_at: 1000,
            updated_at: 1000,
          },
        }),
        { status: 200 },
      ),
    );

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<div>Content</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      // Should show first letter of name as avatar
      expect(screen.getByText("A")).toBeInTheDocument();
    });
  });
});
```

#### `src/frontend/src/App.test.tsx` (update)

Replace the ISSUE-09 smoke test with a more comprehensive routing test:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";

const mockUser = {
  id: "01ABC",
  email: "alice@example.com",
  name: "alice",
  avatar_url: null,
  role: "user",
  created_at: 1000,
  updated_at: 1000,
};

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the dashboard when authenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: mockUser }), { status: 200 }),
    );

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Dashboard" }),
      ).toBeInTheDocument();
    });
  });
});
```

### Step 9: Create directory structure

Ensure the following directories exist before creating files:

```text
src/frontend/src/hooks/
src/frontend/src/hooks/__tests__/
src/frontend/src/components/layout/
src/frontend/src/components/layout/__tests__/
src/frontend/src/pages/
```

### Step 10: Verify everything works

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
| `src/frontend/src/hooks/useAuth.ts` | Auth context provider + `useAuth()` hook |
| `src/frontend/src/components/layout/AppShell.tsx` | Main layout: header + sidebar placeholder + outlet |
| `src/frontend/src/components/layout/ProtectedRoute.tsx` | Auth guard: loading spinner / redirect to login |
| `src/frontend/src/components/layout/AdminRoute.tsx` | Admin role guard: forbidden message for non-admins |
| `src/frontend/src/pages/Dashboard.tsx` | Dashboard placeholder page |
| `src/frontend/src/pages/Editor.tsx` | Editor placeholder page with route params |
| `src/frontend/src/pages/Admin.tsx` | Admin placeholder page |
| `src/frontend/src/App.tsx` | Router setup with all routes + providers |
| `src/frontend/src/hooks/__tests__/useAuth.test.tsx` | Tests for auth provider and hook |
| `src/frontend/src/components/layout/__tests__/ProtectedRoute.test.tsx` | Tests for protected route guard |
| `src/frontend/src/components/layout/__tests__/AppShell.test.tsx` | Tests for app shell layout |
| `src/frontend/src/App.test.tsx` | Updated app-level routing test |

## Testing

### Unit Tests

| File | What it tests |
|------|---------------|
| `src/frontend/src/hooks/__tests__/useAuth.test.tsx` | AuthProvider loading state, successful user fetch, 401 handling, network error handling, useAuth outside provider throws |
| `src/frontend/src/components/layout/__tests__/ProtectedRoute.test.tsx` | Loading spinner while auth pending, renders children when authed, redirects to login on 401 |
| `src/frontend/src/components/layout/__tests__/AppShell.test.tsx` | Header renders app name and user email, avatar initial shown when no avatar_url, child content rendered via Outlet |
| `src/frontend/src/App.test.tsx` | App renders dashboard when authenticated |

### Manual Tests

After `npm start` completes:

1. **Login and see dashboard:** Open `http://localhost:8787`. Log in via the PIN form. You should see the AppShell header with "CF-Architect" on the left and your email on the right, plus a "Dashboard" heading with your email.

2. **Navigate to editor:** Open `http://localhost:8787/editor/test-123`. You should see "Editor for diagram test-123" in the content area, with the same AppShell header.

3. **Admin access control (non-admin):** Log in as a regular user. Navigate to `http://localhost:8787/admin`. You should see a "Forbidden" message.

4. **Admin access (admin user):** Log in using the `SEED_ADMIN_EMAIL`. Navigate to `http://localhost:8787/admin`. You should see "Admin" heading with your email.

5. **Unauthenticated redirect:** Open an incognito window and navigate to `http://localhost:8787/`. You should be redirected to the `/_auth/login` PIN form.
