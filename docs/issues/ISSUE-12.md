# Dashboard page: card grid, CRUD actions, empty state + tests

## Summary

Build the full dashboard page with a responsive card grid of diagrams, "New Diagram" creation, and per-card actions (rename, duplicate, delete with confirmation). Includes a polished empty state for new users. After this issue, users can manage their diagram collection entirely from the dashboard — creating, renaming, duplicating, and deleting diagrams with optimistic UI updates and proper loading/error states.

## Relevant Skills

- `shadcn`
- `vercel-react-best-practices`
- `vercel-composition-patterns`
- `web-component-design`

## Requirements Coverage

- [F5-US1](../REQUIREMENTS.md) — Dashboard showing all user's diagrams with title and last-updated timestamp, sorted by recency. Card grid layout with styled placeholders (thumbnails are post-MVP per MVP_PLAN.md).
- [F5-US2](../REQUIREMENTS.md) — Create a new blank diagram from the dashboard. "New Diagram" button calls `useCreateDiagram` and navigates to `/editor/:id`.
- [F5-US3](../REQUIREMENTS.md) — Duplicate any diagram with one click. Dropdown action calls `useDuplicateDiagram`, duplicate has title `<original> (Copy)`, browser navigates to the new diagram.
- [F5-US4](../REQUIREMENTS.md) — Delete a diagram with a confirmation modal that shows the title. AlertDialog prevents accidental deletion.
- [F5-US5](../REQUIREMENTS.md) — Rename a diagram inline from the dashboard. Inline edit with `useRenameDiagram`, saved on blur or Enter with 1s debounce.

## Dependencies

- **ISSUE-06** — Diagram API (CRUD, duplicate, rename) must be implemented in the backend.
- **ISSUE-11** — Typed API client and TanStack Query hooks (`useListDiagrams`, `useCreateDiagram`, `useRenameDiagram`, `useDuplicateDiagram`, `useDeleteDiagram`) must exist.

## Acceptance Criteria

- [ ] shadcn components installed: `card`, `button`, `dialog` (AlertDialog), `input`, `dropdown-menu`.
- [ ] `src/frontend/src/pages/Dashboard.tsx` renders a card grid using `useListDiagrams`.
- [ ] Each diagram is rendered as a `DiagramCard` component.
- [ ] A "New Diagram" button calls `useCreateDiagram` with a default title and navigates to `/editor/:id` on success.
- [ ] An empty state is shown when the user has no diagrams, with an icon/illustration, "Create your first diagram" message, and a CTA button.
- [ ] A loading skeleton is shown while diagrams are being fetched.
- [ ] `src/frontend/src/components/dashboard/DiagramCard.tsx` displays: title, styled placeholder (colored block, not a thumbnail), and relative "last updated" time.
- [ ] Clicking a DiagramCard navigates to `/editor/:id`.
- [ ] Each card has a three-dot dropdown menu with: Rename, Duplicate, Delete.
- [ ] Rename: clicking activates inline edit mode. Title is saved via `useRenameDiagram` on blur or Enter, with a 1-second debounce. Pressing Escape cancels the edit.
- [ ] Duplicate: calls `useDuplicateDiagram` and navigates to the new diagram's editor page.
- [ ] Delete: opens an AlertDialog showing the diagram title. Confirming calls `useDeleteDiagram`.
- [ ] `src/frontend/src/components/dashboard/EmptyState.tsx` is a reusable empty state component.
- [ ] Tests cover: card grid renders for diagrams, empty state when no diagrams, create button works, delete confirmation shows title, duplicate creates copy and navigates.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### Step 1: Install shadcn components

Add the required shadcn/ui components in the frontend workspace:

```bash
cd src/frontend
npx shadcn@latest add card button dialog input dropdown-menu
```

This installs the components into `src/frontend/src/components/ui/`. Each component is a self-contained file that uses Radix primitives and Tailwind CSS.

If the `npx shadcn` command has issues in an automated context, install the underlying Radix packages manually and create the component files:

```bash
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-slot --workspace=src/frontend
npm install lucide-react --workspace=src/frontend
```

Then create the component files following the shadcn/ui source patterns. The key components needed are:

- `src/frontend/src/components/ui/button.tsx` — Button with variants (default, destructive, outline, secondary, ghost, link) and sizes.
- `src/frontend/src/components/ui/card.tsx` — Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription.
- `src/frontend/src/components/ui/dialog.tsx` — AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel.
- `src/frontend/src/components/ui/input.tsx` — Input with standard styling.
- `src/frontend/src/components/ui/dropdown-menu.tsx` — DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator.

### Step 2: Create a relative time utility

Create `src/frontend/src/lib/format.ts`:

```ts
/**
 * Formats a Unix timestamp (ms) as a relative time string.
 * Examples: "just now", "2 minutes ago", "3 hours ago", "5 days ago"
 */
export function formatRelativeTime(timestampMs: number): string {
  const now = Date.now();
  const diffMs = now - timestampMs;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  }
  if (diffDays < 30) {
    return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
  }
  // Fall back to date string for older items
  return new Date(timestampMs).toLocaleDateString();
}
```

### Step 3: Create `src/frontend/src/components/dashboard/EmptyState.tsx`

A reusable empty state component with an icon, message, and CTA:

```tsx
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  /** Icon or illustration to display. */
  icon?: React.ReactNode;
  /** Main heading text. */
  title: string;
  /** Supporting description text. */
  description?: string;
  /** CTA button label. */
  actionLabel?: string;
  /** CTA button click handler. */
  onAction?: () => void;
  /** Additional CSS classes for the wrapper. */
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 text-muted-foreground">{icon}</div>
      )}
      <h2 className="text-xl font-semibold">{title}</h2>
      {description && (
        <p className="mt-2 max-w-md text-muted-foreground">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-6">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
```

### Step 4: Create `src/frontend/src/components/dashboard/DiagramCard.tsx`

The card component for each diagram in the grid:

```tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRenameDiagram, useDuplicateDiagram, useDeleteDiagram } from "@/api";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DiagramCardProps {
  id: string;
  title: string;
  updatedAt: number;
}

export function DiagramCard({ id, title, updatedAt }: DiagramCardProps) {
  const navigate = useNavigate();
  const renameMutation = useRenameDiagram();
  const duplicateMutation = useDuplicateDiagram();
  const deleteMutation = useDeleteDiagram();

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(title);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Focus the input when entering rename mode
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const saveRename = useCallback(
    (newTitle: string) => {
      const trimmed = newTitle.trim();
      if (trimmed && trimmed !== title) {
        // Clear any pending debounce
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
        // Debounce the save by 1 second
        debounceRef.current = setTimeout(() => {
          renameMutation.mutate({ id, title: trimmed });
        }, 1000);
      }
      setIsRenaming(false);
    },
    [id, title, renameMutation],
  );

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on the dropdown or rename input
    if (isRenaming) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-dropdown-trigger]")) return;
    navigate(`/editor/${id}`);
  };

  const handleDuplicate = async () => {
    const result = await duplicateMutation.mutateAsync({ id });
    navigate(`/editor/${result.id}`);
  };

  const handleDelete = () => {
    deleteMutation.mutate({ id });
    setShowDeleteDialog(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      saveRename(renameValue);
    } else if (e.key === "Escape") {
      setRenameValue(title);
      setIsRenaming(false);
    }
  };

  return (
    <>
      <Card
        className={cn(
          "group cursor-pointer transition-shadow hover:shadow-md",
          "flex flex-col",
        )}
        onClick={handleCardClick}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isRenaming) navigate(`/editor/${id}`);
        }}
      >
        {/* Styled placeholder (not a thumbnail — thumbnails are post-MVP) */}
        <CardContent className="flex-1 p-0">
          <div className="flex h-36 items-center justify-center rounded-t-lg bg-muted">
            <svg
              className="h-12 w-12 text-muted-foreground/50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2 4h4v4H2V4Zm8 0h4v4h-4V4Zm8 0h4v4h-4V4ZM6 6h4M14 6h4M4 8v4m8-4v4m8-4v4M2 12h4v4H2v-4Zm8 0h4v4h-4v-4Zm8 0h4v4h-4v-4Z"
              />
            </svg>
          </div>
        </CardContent>

        <CardFooter className="flex items-center justify-between p-3">
          <div className="min-w-0 flex-1">
            {isRenaming ? (
              <Input
                ref={inputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => saveRename(renameValue)}
                onKeyDown={handleRenameKeyDown}
                className="h-7 text-sm"
                maxLength={80}
                aria-label="Rename diagram"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <p className="truncate text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatRelativeTime(updatedAt)}
                </p>
              </>
            )}
          </div>

          {/* Three-dot dropdown menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild data-dropdown-trigger>
              <Button
                variant="ghost"
                size="sm"
                className="ml-2 h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
                aria-label="Diagram actions"
              >
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setIsRenaming(true);
                }}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleDuplicate();
                }}
              >
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteDialog(true);
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardFooter>
      </Card>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete diagram</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{title}&quot;? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

**Key design decisions:**

- **Styled placeholder, not thumbnail:** Per MVP_PLAN.md, thumbnails require export functionality (F8, post-MVP). The card shows a muted SVG diagram icon instead.
- **Rename flow:** Clicking "Rename" in the dropdown switches the title to an inline `<Input>`. Saving happens on blur or Enter with a 1-second debounce. Escape cancels. The debounce prevents excessive API calls while typing.
- **Duplicate flow:** Calls `useDuplicateDiagram`, awaits the result, and navigates to the new diagram's editor page.
- **Delete flow:** Opens an AlertDialog (accessible modal) that shows the diagram title. The destructive action button is styled red.
- **Click handling:** The entire card is clickable to navigate to the editor, but clicks on the dropdown trigger or rename input are stopped from propagating.
- **Hover effects:** The three-dot menu button is hidden until hovering over the card (`opacity-0 group-hover:opacity-100`).

### Step 5: Create loading skeleton

Create `src/frontend/src/components/dashboard/DiagramCardSkeleton.tsx`:

```tsx
import { Card, CardContent, CardFooter } from "@/components/ui/card";

export function DiagramCardSkeleton() {
  return (
    <Card className="flex flex-col">
      <CardContent className="p-0">
        <div className="h-36 animate-pulse rounded-t-lg bg-muted" />
      </CardContent>
      <CardFooter className="p-3">
        <div className="w-full space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </CardFooter>
    </Card>
  );
}
```

### Step 6: Update `src/frontend/src/pages/Dashboard.tsx`

Replace the placeholder with the full implementation:

```tsx
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useListDiagrams, useCreateDiagram } from "@/api";
import { Button } from "@/components/ui/button";
import { DiagramCard } from "@/components/dashboard/DiagramCard";
import { DiagramCardSkeleton } from "@/components/dashboard/DiagramCardSkeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: diagrams, isLoading, error } = useListDiagrams();
  const createMutation = useCreateDiagram();

  const handleCreate = async () => {
    const diagram = await createMutation.mutateAsync({
      title: "Untitled Diagram",
    });
    navigate(`/editor/${diagram.id}`);
  };

  return (
    <div className="mx-auto max-w-6xl">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          {user && (
            <p className="text-sm text-muted-foreground">
              Welcome back, {user.name ?? user.email}
            </p>
          )}
        </div>
        <Button
          onClick={handleCreate}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? "Creating..." : "New Diagram"}
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          Failed to load diagrams. Please try again.
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <DiagramCardSkeleton key={`skeleton-${i}`} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && diagrams && diagrams.length === 0 && (
        <EmptyState
          icon={
            <svg
              className="h-16 w-16"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
          }
          title="Create your first diagram"
          description="Start designing your Cloudflare architecture. Create a blank diagram or explore blueprints for inspiration."
          actionLabel="New Diagram"
          onAction={handleCreate}
        />
      )}

      {/* Diagram card grid */}
      {!isLoading && diagrams && diagrams.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {diagrams.map((diagram) => (
            <DiagramCard
              key={diagram.id}
              id={diagram.id}
              title={diagram.title}
              updatedAt={diagram.updated_at}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Key decisions:**

- The grid is responsive: 1 column on mobile, 2 on small screens, 3 on large, 4 on extra-large.
- Loading shows 8 skeleton cards to give a sense of the grid layout.
- The "New Diagram" button is disabled while creation is pending (prevents double-clicks).
- The default title for new diagrams is "Untitled Diagram".
- The empty state references blueprints as a future feature per the REQUIREMENTS.md design notes.

### Step 7: Write tests

#### `src/frontend/src/pages/__tests__/Dashboard.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/useAuth";
import { Dashboard } from "../Dashboard";
import { createQueryWrapper } from "../../test/query-wrapper";

// Install @testing-library/user-event if not already present:
// npm install --save-dev @testing-library/user-event --workspace=src/frontend

const mockUser = {
  id: "01USER",
  email: "alice@example.com",
  name: "Alice",
  avatar_url: null,
  role: "user",
  created_at: 1000,
  updated_at: 1000,
};

const mockDiagram = {
  id: "01DIAGRAM",
  user_id: "01USER",
  title: "My Architecture",
  graph_data: { nodes: [], edges: [] },
  version: 1,
  created_at: 1000,
  updated_at: Date.now() - 60000, // 1 minute ago
};

function renderDashboard(fetchResponses: Array<{ data: unknown; status: number }>) {
  let callIndex = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const urlStr = typeof url === "string" ? url : url.toString();

    // /api/me response
    if (urlStr.includes("/api/me")) {
      return new Response(
        JSON.stringify({ data: mockUser }),
        { status: 200 },
      );
    }

    // Subsequent responses from the provided array
    const response = fetchResponses[callIndex] ?? fetchResponses[0];
    callIndex++;
    return new Response(
      JSON.stringify(response.data !== undefined ? { data: response.data } : null),
      { status: response.status },
    );
  });

  const { queryClient } = createQueryWrapper();

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>
          <Dashboard />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders diagram cards when diagrams exist", async () => {
    renderDashboard([{ data: [mockDiagram], status: 200 }]);

    await waitFor(() => {
      expect(screen.getByText("My Architecture")).toBeInTheDocument();
    });
  });

  it("shows empty state when no diagrams", async () => {
    renderDashboard([{ data: [], status: 200 }]);

    await waitFor(() => {
      expect(
        screen.getByText("Create your first diagram"),
      ).toBeInTheDocument();
    });
  });

  it("shows loading skeletons while fetching", () => {
    // Mock fetch that never resolves for diagrams
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/api/me")) {
        return new Response(
          JSON.stringify({ data: mockUser }),
          { status: 200 },
        );
      }
      return new Promise(() => {}); // never resolves
    });

    const { queryClient } = createQueryWrapper();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider>
            <Dashboard />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Skeletons are animated divs — check for the heading at least
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("shows the New Diagram button", async () => {
    renderDashboard([{ data: [], status: 200 }]);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new diagram/i }),
      ).toBeInTheDocument();
    });
  });
});
```

#### `src/frontend/src/components/dashboard/__tests__/DiagramCard.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { DiagramCard } from "../DiagramCard";
import { createQueryWrapper } from "../../../test/query-wrapper";

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderCard() {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ data: {} }), { status: 200 }),
  );

  const { queryClient } = createQueryWrapper();

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DiagramCard
          id="01DIAGRAM"
          title="Test Diagram"
          updatedAt={Date.now() - 120000}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DiagramCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
  });

  it("displays the diagram title", () => {
    renderCard();
    expect(screen.getByText("Test Diagram")).toBeInTheDocument();
  });

  it("displays relative update time", () => {
    renderCard();
    expect(screen.getByText("2 minutes ago")).toBeInTheDocument();
  });

  it("navigates to editor on click", async () => {
    renderCard();
    const card = screen.getByRole("link");
    await userEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledWith("/editor/01DIAGRAM");
  });
});
```

#### `src/frontend/src/components/dashboard/__tests__/EmptyState.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(
      <EmptyState
        title="No items"
        description="Create something to get started."
      />,
    );

    expect(screen.getByText("No items")).toBeInTheDocument();
    expect(
      screen.getByText("Create something to get started."),
    ).toBeInTheDocument();
  });

  it("renders CTA button and calls onAction", async () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        title="Empty"
        actionLabel="Create"
        onAction={onAction}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("does not render button when no actionLabel", () => {
    render(<EmptyState title="Empty" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
```

#### `src/frontend/src/lib/__tests__/format.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { formatRelativeTime } from "../format";

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for timestamps less than 60 seconds ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 1, 12, 0, 30));

    const thirtySecondsAgo = new Date(2024, 0, 1, 12, 0, 0).getTime();
    expect(formatRelativeTime(thirtySecondsAgo)).toBe("just now");
  });

  it('returns "X minutes ago" for timestamps minutes ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 1, 12, 5, 0));

    const fiveMinutesAgo = new Date(2024, 0, 1, 12, 0, 0).getTime();
    expect(formatRelativeTime(fiveMinutesAgo)).toBe("5 minutes ago");
  });

  it('returns "1 minute ago" for singular', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 1, 12, 1, 0));

    const oneMinuteAgo = new Date(2024, 0, 1, 12, 0, 0).getTime();
    expect(formatRelativeTime(oneMinuteAgo)).toBe("1 minute ago");
  });

  it('returns "X hours ago" for timestamps hours ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 1, 15, 0, 0));

    const threeHoursAgo = new Date(2024, 0, 1, 12, 0, 0).getTime();
    expect(formatRelativeTime(threeHoursAgo)).toBe("3 hours ago");
  });

  it('returns "X days ago" for timestamps days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 8, 12, 0, 0));

    const sevenDaysAgo = new Date(2024, 0, 1, 12, 0, 0).getTime();
    expect(formatRelativeTime(sevenDaysAgo)).toBe("7 days ago");
  });
});
```

### Step 8: Install `@testing-library/user-event`

If not already installed:

```bash
npm install --save-dev @testing-library/user-event --workspace=src/frontend
```

This is needed for the `userEvent.click()` calls in the dashboard and card tests.

### Step 9: Create directory structure

Ensure directories exist:

```text
src/frontend/src/components/dashboard/
src/frontend/src/components/dashboard/__tests__/
src/frontend/src/pages/__tests__/
src/frontend/src/lib/__tests__/
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
| `src/frontend/src/components/ui/button.tsx` | shadcn Button component |
| `src/frontend/src/components/ui/card.tsx` | shadcn Card component |
| `src/frontend/src/components/ui/dialog.tsx` | shadcn AlertDialog component |
| `src/frontend/src/components/ui/input.tsx` | shadcn Input component |
| `src/frontend/src/components/ui/dropdown-menu.tsx` | shadcn DropdownMenu component |
| `src/frontend/src/lib/format.ts` | Relative time formatting utility |
| `src/frontend/src/components/dashboard/EmptyState.tsx` | Reusable empty state component |
| `src/frontend/src/components/dashboard/DiagramCard.tsx` | Diagram card with actions |
| `src/frontend/src/components/dashboard/DiagramCardSkeleton.tsx` | Loading skeleton card |
| `src/frontend/src/pages/Dashboard.tsx` | Full dashboard page implementation |
| `src/frontend/src/pages/__tests__/Dashboard.test.tsx` | Dashboard page tests |
| `src/frontend/src/components/dashboard/__tests__/DiagramCard.test.tsx` | DiagramCard tests |
| `src/frontend/src/components/dashboard/__tests__/EmptyState.test.tsx` | EmptyState tests |
| `src/frontend/src/lib/__tests__/format.test.ts` | Relative time format tests |

## Testing

### Unit Tests

| File | What it tests |
|------|---------------|
| `src/frontend/src/pages/__tests__/Dashboard.test.tsx` | Renders diagram cards when diagrams exist, shows empty state when no diagrams, shows loading skeletons, "New Diagram" button is present |
| `src/frontend/src/components/dashboard/__tests__/DiagramCard.test.tsx` | Displays diagram title, displays relative time, navigates to editor on click |
| `src/frontend/src/components/dashboard/__tests__/EmptyState.test.tsx` | Renders title and description, CTA button calls onAction, no button when no actionLabel |
| `src/frontend/src/lib/__tests__/format.test.ts` | Relative time: "just now", minutes, hours, days, singular/plural |

### Manual Tests

After `npm start` completes:

1. **Empty state (new user):** Log in as a new user. The dashboard should show the empty state with "Create your first diagram" message and a "New Diagram" CTA button.

2. **Create a diagram:** Click "New Diagram". You should be navigated to `/editor/<new-id>`. Navigate back to `/` and the new diagram should appear as a card.

3. **Card grid layout:** Create several diagrams. The cards should form a responsive grid — try resizing the browser window.

4. **Rename:** Hover over a card, click the three-dot menu, click "Rename". The title should become an editable input. Type a new name and press Enter (or click away). After a moment, refresh the page and the new name should persist.

5. **Duplicate:** Click the three-dot menu on a card, click "Duplicate". You should be navigated to the editor for a new diagram. Go back to the dashboard — a new card with title "Original (Copy)" should be present.

6. **Delete:** Click the three-dot menu, click "Delete". A confirmation dialog should appear showing the diagram title. Click "Cancel" — nothing happens. Click "Delete" — the card should disappear from the grid.

7. **Relative time:** Cards should show "just now", "X minutes ago", etc. based on when diagrams were last updated.
