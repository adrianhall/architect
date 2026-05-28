# Admin UI: user management + audit log display + tests

## Summary

Builds the admin user management page at `/admin` with a paginated, sortable, searchable user table, role management actions (promote/demote), user deletion with confirmation, and diagram count display. The page is gated to admin users only — non-admins are redirected to the dashboard. Uses the admin API hooks from ISSUE-11 and shadcn/ui table primitives. All actions use optimistic updates with rollback on error.

## Relevant Skills

- `shadcn`
- `vercel-react-best-practices`
- `vercel-composition-patterns`

## Requirements Coverage

- [F2-US3](../REQUIREMENTS.md): Paginated, sortable, searchable list of users at `/admin` — the Admin page renders a full user table with pagination controls, sortable column headers, and a search input filtering by email/name.
- [F2-US4](../REQUIREMENTS.md): Promote, demote, or delete a user; cannot modify own account — action dropdowns per row with Promote to Admin / Demote to User / Delete options; current user's row has actions disabled.
- [F2-US5](../REQUIREMENTS.md): Each user's diagram count in the admin list — the table includes a "Diagrams" column showing the count returned by the admin API.
- [F2-US9](../REQUIREMENTS.md): Audit log of admin mutations — admin actions (promote, demote, delete) trigger API calls that emit structured audit logs on the backend (ISSUE-07); the UI provides the interface for triggering these auditable actions.

## Dependencies

- **ISSUE-07** — Admin API endpoints (`GET /api/admin/users`, `PATCH /api/admin/users/:id/role`, `DELETE /api/admin/users/:id`) must exist.
- **ISSUE-11** — Typed API client and TanStack Query hooks (`useAdminUsers`, `usePromoteUser`, `useDemoteUser`, `useDeleteUser`) must exist.

## Acceptance Criteria

- [ ] `/admin` route renders the admin user management page when the logged-in user has `role === "admin"`.
- [ ] Non-admin users navigating to `/admin` are redirected to the dashboard.
- [ ] The user table displays columns: email, name, role, diagram count, created date, and actions.
- [ ] Clicking a column header sorts the table by that column; clicking again toggles asc/desc.
- [ ] The search input filters users by email or name with a 300ms debounce.
- [ ] Pagination controls display page numbers, prev/next buttons, and items-per-page selector (10, 20, 50).
- [ ] Each row has an actions dropdown with Promote to Admin / Demote to User / Delete options.
- [ ] The current user's row has actions disabled (cannot modify self).
- [ ] Promote/Demote actions call the appropriate mutation and update the row optimistically.
- [ ] Delete action opens an AlertDialog confirmation showing the user's email and diagram count.
- [ ] Confirming delete calls the delete mutation, removes the row optimistically, and rolls back on error.
- [ ] User role is displayed as a Badge component (admin = blue variant, user = gray/default variant).
- [ ] Empty state is shown when no users match the search query.
- [ ] Loading state displays a skeleton or spinner while data is being fetched.
- [ ] Error state displays an error message with a retry button.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### 1. Install shadcn Components

Install the required shadcn/ui primitives in the frontend workspace:

```bash
cd src/frontend
npx shadcn@latest add table badge alert-dialog dropdown-menu select skeleton
```

These provide the accessible, styled building blocks for the admin UI:

- `table` — Table, TableHeader, TableRow, TableHead, TableBody, TableCell
- `badge` — Role display (admin/user)
- `alert-dialog` — Delete confirmation modal
- `dropdown-menu` — Per-row action menu
- `select` — Items-per-page selector
- `skeleton` — Loading state placeholder rows

### 2. Create the Admin Page

Create `src/frontend/src/pages/Admin.tsx`:

```tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdminUsers } from "@/api/hooks";
import { UserTable } from "@/components/admin/UserTable";
import { UserSearch } from "@/components/admin/UserSearch";
import { Pagination } from "@/components/admin/Pagination";

export function AdminPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Redirect non-admins to dashboard
  useEffect(() => {
    if (user && user.role !== "admin") {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  // Don't render while checking auth or if non-admin
  if (!user || user.role !== "admin") {
    return null;
  }

  return <AdminContent currentUserId={user.id} />;
}
```

The `AdminContent` child component manages the table state:

```tsx
function AdminContent({ currentUserId }: { currentUserId: string }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sort, setSort] = useState<string>("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const { data, isLoading, isError, refetch } = useAdminUsers({
    page,
    limit,
    sort,
    order,
    search: debouncedSearch,
  });

  const handleSort = (column: string) => {
    if (sort === column) {
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSort(column);
      setOrder("asc");
    }
    setPage(1);
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <h1 className="text-2xl font-bold">User Management</h1>
      <UserSearch value={search} onChange={setSearch} onDebouncedChange={setDebouncedSearch} />
      {isLoading && <TableSkeleton />}
      {isError && <ErrorState onRetry={refetch} />}
      {data && (
        <>
          <UserTable
            users={data.users}
            currentUserId={currentUserId}
            sort={sort}
            order={order}
            onSort={handleSort}
          />
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
          />
        </>
      )}
    </div>
  );
}
```

**Key decisions:**

- The admin check uses `useEffect` + `navigate` rather than a route guard so the redirect happens client-side after the auth context resolves.
- Search state is split into `search` (input value) and `debouncedSearch` (API query param) to avoid spamming the API.
- Changing sort or limit resets to page 1.

### 3. Create the UserTable Component

Create `src/frontend/src/components/admin/UserTable.tsx`:

```tsx
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserActions } from "./UserActions";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  diagram_count: number;
  created_at: number;
  updated_at: number;
}

interface UserTableProps {
  users: AdminUser[];
  currentUserId: string;
  sort: string;
  order: "asc" | "desc";
  onSort: (column: string) => void;
}

const SORTABLE_COLUMNS = [
  { key: "email", label: "Email" },
  { key: "name", label: "Name" },
  { key: "role", label: "Role" },
  { key: "created_at", label: "Created" },
];

export function UserTable({ users, currentUserId, sort, order, onSort }: UserTableProps) {
  const SortIcon = ({ column }: { column: string }) => {
    if (sort !== column) return <ArrowUpDown className="ml-1 h-4 w-4" />;
    return order === "asc"
      ? <ArrowUp className="ml-1 h-4 w-4" />
      : <ArrowDown className="ml-1 h-4 w-4" />;
  };

  if (users.length === 0) {
    return <p className="text-muted-foreground text-center py-8">No users found.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {SORTABLE_COLUMNS.map((col) => (
            <TableHead
              key={col.key}
              className="cursor-pointer select-none"
              onClick={() => onSort(col.key)}
            >
              <span className="flex items-center">
                {col.label}
                <SortIcon column={col.key} />
              </span>
            </TableHead>
          ))}
          <TableHead>Diagrams</TableHead>
          <TableHead className="w-[80px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="font-medium">{user.email}</TableCell>
            <TableCell>{user.name ?? "—"}</TableCell>
            <TableCell>
              <Badge variant={user.role === "admin" ? "default" : "secondary"}
                     className={user.role === "admin" ? "bg-blue-600" : ""}>
                {user.role}
              </Badge>
            </TableCell>
            <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
            <TableCell className="text-right">{user.diagram_count}</TableCell>
            <TableCell>
              <UserActions
                user={user}
                isSelf={user.id === currentUserId}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

**Key decisions:**

- Sortable columns are defined as a constant array for DRY header rendering.
- The sort icon changes based on active column and direction.
- `diagram_count` is not sortable (not supported by the API).
- The `Badge` uses a blue variant for admin and gray/secondary for regular users.
- `UserActions` is extracted into its own component to isolate mutation logic.

### 4. Create the UserActions Component

Create `src/frontend/src/components/admin/UserActions.tsx`:

This component renders the dropdown menu per user row and handles mutations:

```tsx
import { useState } from "react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, ShieldPlus, ShieldMinus, Trash2 } from "lucide-react";
import { usePromoteUser, useDemoteUser, useDeleteUser } from "@/api/hooks";

export function UserActions({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const promote = usePromoteUser();
  const demote = useDemoteUser();
  const deleteUser = useDeleteUser();

  const handlePromote = () => promote.mutate(user.id);
  const handleDemote = () => demote.mutate(user.id);
  const handleDelete = () => {
    deleteUser.mutate(user.id, {
      onSettled: () => setDeleteDialogOpen(false),
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={isSelf}
                  aria-label={`Actions for ${user.email}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {user.role === "user" ? (
            <DropdownMenuItem onClick={handlePromote}>
              <ShieldPlus className="mr-2 h-4 w-4" /> Promote to Admin
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={handleDemote}>
              <ShieldMinus className="mr-2 h-4 w-4" /> Demote to User
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setDeleteDialogOpen(true)}
            className="text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete User
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{user.email}</strong>?
              This will also delete their <strong>{user.diagram_count}</strong> diagram{user.diagram_count !== 1 ? "s" : ""}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
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

**Key decisions:**

- The trigger button is disabled when `isSelf` is true, preventing any interaction.
- The dropdown conditionally shows "Promote" or "Demote" based on the user's current role.
- Delete opens an AlertDialog (not just a dropdown action) per the design notes requiring confirmation modals for destructive actions.
- The confirmation dialog shows both the user's email and their diagram count so the admin understands the impact.

### 5. Create the UserSearch Component

Create `src/frontend/src/components/admin/UserSearch.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface UserSearchProps {
  value: string;
  onChange: (value: string) => void;
  onDebouncedChange: (value: string) => void;
  debounceMs?: number;
}

export function UserSearch({
  value,
  onChange,
  onDebouncedChange,
  debounceMs = 300,
}: UserSearchProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      onDebouncedChange(value);
    }, debounceMs);

    return () => clearTimeout(timerRef.current);
  }, [value, debounceMs, onDebouncedChange]);

  return (
    <div className="relative max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search by email or name..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9"
      />
    </div>
  );
}
```

The component uses a simple `setTimeout` debounce pattern. The parent manages both the raw search value (for controlled input) and the debounced value (for API calls).

### 6. Create the Pagination Component

Create `src/frontend/src/components/admin/Pagination.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

export function Pagination({ page, totalPages, limit, onPageChange, onLimitChange }: PaginationProps) {
  const pages = getPageNumbers(page, totalPages);

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Rows per page</span>
        <Select value={String(limit)} onValueChange={(v) => onLimitChange(Number(v))}>
          <SelectTrigger className="w-[70px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" disabled={page <= 1}
                onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground">...</span>
          ) : (
            <Button key={p} variant={p === page ? "default" : "outline"} size="icon"
                    onClick={() => onPageChange(p as number)}>
              {p}
            </Button>
          )
        )}
        <Button variant="outline" size="icon" disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Generate page numbers with ellipsis for large ranges. */
function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}
```

**Key decisions:**

- The `getPageNumbers` helper produces a compact window around the current page with ellipsis for large page counts (e.g., `1 ... 4 5 6 ... 20`).
- Previous/Next buttons are disabled at boundaries.
- Items-per-page uses a Select component with 10/20/50 options.

### 7. Optimistic Updates in TanStack Query Hooks

The mutation hooks from ISSUE-11 (`usePromoteUser`, `useDemoteUser`, `useDeleteUser`) should be configured with optimistic updates. If not already implemented in ISSUE-11, update them here:

```typescript
export function usePromoteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.patch(`/api/admin/users/${userId}/role`, { role: "admin" }),
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: ["admin", "users"] });
      const previous = queryClient.getQueryData(["admin", "users"]);
      queryClient.setQueryData(["admin", "users"], (old: any) => ({
        ...old,
        users: old.users.map((u: any) =>
          u.id === userId ? { ...u, role: "admin" } : u
        ),
      }));
      return { previous };
    },
    onError: (_err, _userId, context) => {
      queryClient.setQueryData(["admin", "users"], context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}
```

Apply the same pattern for `useDemoteUser` (sets role to `"user"`) and `useDeleteUser` (removes the user from the list optimistically).

### 8. Register the Admin Route

In the app router (set up in ISSUE-10), add the `/admin` route:

```tsx
import { AdminPage } from "@/pages/Admin";

// Inside the route configuration:
<Route path="/admin" element={<AdminPage />} />
```

### 9. Add Navigation Link

Add an "Admin" link in the app header/navigation that is only visible when `user.role === "admin"`. This should link to `/admin`.

### File Inventory

| File | Purpose |
|------|---------|
| `src/frontend/src/pages/Admin.tsx` | Admin page with auth guard, state management, and layout |
| `src/frontend/src/components/admin/UserTable.tsx` | Sortable user table with role badges |
| `src/frontend/src/components/admin/UserActions.tsx` | Per-row dropdown + delete confirmation dialog |
| `src/frontend/src/components/admin/UserSearch.tsx` | Debounced search input |
| `src/frontend/src/components/admin/Pagination.tsx` | Page navigation + items-per-page control |

## Testing

All tests go in `src/frontend/src/pages/Admin.test.tsx` and `src/frontend/src/components/admin/__tests__/` using `@testing-library/react`, `vitest`, and mocked TanStack Query hooks.

### Test Setup

- Mock `useAuth` to return either an admin user or a regular user.
- Mock `useAdminUsers` to return paginated user data.
- Mock `usePromoteUser`, `useDemoteUser`, `useDeleteUser` to return controllable mutation objects.
- Wrap components in a `MemoryRouter` and `QueryClientProvider` for routing and query context.
- Use `vi.fn()` for mutation functions to assert they're called with correct arguments.

### Unit / Integration Tests

1. **Admin page renders user table for admin user**
   - Mock `useAuth` to return an admin user. Render `AdminPage`. Assert the user table is displayed with correct column headers.

2. **Non-admin user is redirected to dashboard**
   - Mock `useAuth` to return a regular user. Render `AdminPage` inside `MemoryRouter`. Assert that `navigate("/")` was called (or the admin content is not rendered).

3. **User table displays all columns correctly**
   - Render `UserTable` with mock user data. Assert each row shows email, name, role badge, diagram count, and created date.

4. **Role badge shows correct variant**
   - Render a user with `role: "admin"`. Assert the badge has the blue/default style. Render a user with `role: "user"`. Assert the badge has the secondary/gray style.

5. **Search input filters with debounce**
   - Render `UserSearch`. Type into the input. Assert `onDebouncedChange` is not called immediately. Wait 300ms. Assert `onDebouncedChange` is called with the typed value.

6. **Clicking column header calls onSort**
   - Render `UserTable`. Click the "Email" header. Assert `onSort` was called with `"email"`.

7. **Sort toggles order on same column**
   - Render `AdminContent` with initial sort state. Click "Email" header twice. Assert first click sets `sort=email, order=asc`, second click toggles to `order=desc`.

8. **Promote action calls usePromoteUser mutation**
   - Render `UserActions` for a regular user. Open dropdown. Click "Promote to Admin". Assert the promote mutation was called with the user's ID.

9. **Demote action calls useDemoteUser mutation**
   - Render `UserActions` for an admin user (not self). Open dropdown. Click "Demote to User". Assert the demote mutation was called with the user's ID.

10. **Delete opens confirmation dialog with email and diagram count**
    - Render `UserActions` for a user with 5 diagrams. Open dropdown. Click "Delete User". Assert the AlertDialog is visible and contains the user's email and "5 diagrams".

11. **Confirming delete calls useDeleteUser mutation**
    - Open the delete dialog. Click the "Delete" confirmation button. Assert the delete mutation was called with the user's ID.

12. **Self-actions are disabled**
    - Render `UserActions` with `isSelf={true}`. Assert the actions trigger button is disabled and cannot be clicked.

13. **Pagination renders correct page numbers**
    - Render `Pagination` with `page=3, totalPages=10`. Assert pages 1, 2, 3, 4, ..., 10 are displayed.

14. **Pagination prev/next buttons work**
    - Render `Pagination` with `page=2, totalPages=5`. Click "Next". Assert `onPageChange(3)` was called. Click "Previous". Assert `onPageChange(1)` was called.

15. **Pagination prev disabled on first page**
    - Render `Pagination` with `page=1`. Assert the "Previous" button is disabled.

16. **Items-per-page selector works**
    - Render `Pagination` with `limit=20`. Change the select to 50. Assert `onLimitChange(50)` was called.

17. **Loading state shows skeleton**
    - Mock `useAdminUsers` to return `isLoading: true`. Render `AdminContent`. Assert skeleton elements are visible.

18. **Error state shows retry button**
    - Mock `useAdminUsers` to return `isError: true`. Render `AdminContent`. Assert error message is displayed. Click "Retry". Assert `refetch` was called.

19. **Empty search result shows empty state**
    - Mock `useAdminUsers` to return `users: []`. Render the table. Assert "No users found" message is displayed.

### Manual Tests

After deploying locally with `npm start`:

1. **Admin access:** Log in as the seed admin email. Navigate to `/admin`. Verify the user table loads with at least one user (yourself).

2. **Non-admin redirect:** Log in as a non-admin user. Navigate to `/admin`. Verify you are redirected to the dashboard.

3. **Search:** Type a partial email in the search box. Verify the table filters after a brief debounce delay.

4. **Sort:** Click the "Email" column header. Verify users are sorted alphabetically by email. Click again. Verify the sort direction reverses.

5. **Promote/Demote:** Create a second user (log in with a different email via dev auth). As admin, open the actions menu for that user and click "Promote to Admin". Verify the role badge changes to blue "admin". Demote them back.

6. **Self-action prevention:** Verify your own row's action button is disabled/grayed out.

7. **Delete with confirmation:** Open the actions menu for a test user. Click "Delete User". Verify the confirmation dialog shows their email and diagram count. Confirm deletion. Verify the user disappears from the table.

8. **Pagination:** If you have enough users (>20), verify pagination controls appear and navigating between pages works correctly.
