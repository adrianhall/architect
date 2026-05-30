import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminUsers } from "@/api/hooks/useAdmin";
import { Pagination } from "@/components/admin/Pagination";
import { UserSearch } from "@/components/admin/UserSearch";
import { UserTable } from "@/components/admin/UserTable";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";

/**
 * Skeleton placeholder displayed while the admin user list is loading.
 *
 * Renders five rows of skeleton elements that match the shape of a real table
 * row (email, name, role badge, date, diagrams count, actions button).
 *
 * @returns A set of skeleton rows for the loading state.
 */
function TableSkeleton() {
	return (
		<div className="space-y-2" data-testid="table-skeleton">
			{["sk-0", "sk-1", "sk-2", "sk-3", "sk-4"].map((id) => (
				<div key={id} className="flex gap-4 items-center py-2">
					<Skeleton className="h-4 flex-1" />
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-6 w-16 rounded-full" />
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-4 w-8" />
					<Skeleton className="h-8 w-8 rounded" />
				</div>
			))}
		</div>
	);
}

/**
 * Error state shown when the admin user list fails to load.
 *
 * Displays a brief error message and a "Retry" button that calls `onRetry`.
 *
 * @param props.onRetry - Called when the user clicks the "Retry" button.
 * @returns An error message with a retry action.
 */
function ErrorState({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="text-center py-8 space-y-4" role="alert">
			<p className="text-muted-foreground">Failed to load users. Please try again.</p>
			<Button variant="outline" onClick={onRetry}>
				Retry
			</Button>
		</div>
	);
}

/**
 * Props for the `AdminContent` component.
 */
interface AdminContentProps {
	/** The authenticated admin user's ID, used to disable self-action buttons. */
	currentUserId: string;
}

/**
 * Inner content component for the admin page.
 *
 * Owns all of the table state — search, pagination, sort, and order — and
 * wires them to the `useAdminUsers` query. Renders the search input, table
 * (or skeleton / error state), and pagination controls.
 *
 * Extracted from `Admin` so that `Admin` can perform the auth check and early
 * return before any state hooks are called.
 *
 * @param props - See `AdminContentProps`.
 * @returns The full admin user management UI.
 */
function AdminContent({ currentUserId }: AdminContentProps) {
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

	/**
	 * Handles a sortable column header click.
	 *
	 * If the same column is clicked twice, toggles the sort direction.
	 * Clicking a new column sets ascending order and resets to page 1.
	 *
	 * @param column - The column key that was clicked.
	 */
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
					<UserTable users={data.users} currentUserId={currentUserId} sort={sort} order={order} onSort={handleSort} />
					{data.pagination.totalPages > 1 && (
						<Pagination
							page={data.pagination.page}
							totalPages={data.pagination.totalPages}
							limit={limit}
							onPageChange={setPage}
							onLimitChange={(newLimit) => {
								setLimit(newLimit);
								setPage(1);
							}}
						/>
					)}
				</>
			)}
		</div>
	);
}

/**
 * Admin page — user management.
 *
 * Renders the full user management table at `/admin`. The route is already
 * guarded by `AdminRoute` in `App.tsx`, but this component also performs a
 * client-side redirect for non-admin users as a defence-in-depth measure.
 *
 * If the authenticated user does not have `role === "admin"`, they are
 * redirected to the dashboard. The component renders nothing while auth is
 * still resolving (null return prevents flash of admin content).
 *
 * When the user is confirmed as an admin, `AdminContent` is mounted with the
 * current user's ID so that the actions column can disable the self-row.
 *
 * Must be rendered inside an `AuthProvider` and a React Router context.
 *
 * @returns The admin user management page, or `null` while auth resolves.
 *
 * @example
 * ```tsx
 * <Route
 *   path="/admin"
 *   element={
 *     <AdminRoute>
 *       <Admin />
 *     </AdminRoute>
 *   }
 * />
 * ```
 */
export function Admin() {
	const navigate = useNavigate();
	const { user } = useAuth();

	// Redirect non-admin users to the dashboard.
	useEffect(() => {
		if (user && user.role !== "admin") {
			navigate("/", { replace: true });
		}
	}, [user, navigate]);

	// Don't render admin content while auth is resolving or for non-admins.
	if (user?.role !== "admin") {
		return null;
	}

	return <AdminContent currentUserId={user.id} />;
}
