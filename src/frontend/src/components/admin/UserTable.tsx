import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { AdminUser } from "@/api/hooks/useAdmin";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserActions } from "./UserActions";

/**
 * Props for the `UserTable` component.
 */
interface UserTableProps {
	/**
	 * The list of users to display. When empty, an "No users found" message
	 * is shown instead of the table.
	 */
	users: AdminUser[];
	/** ID of the currently authenticated admin user (used to disable self-actions). */
	currentUserId: string;
	/** The column key that the table is currently sorted by. */
	sort: string;
	/** The current sort direction. */
	order: "asc" | "desc";
	/**
	 * Called when the user clicks a sortable column header.
	 *
	 * @param column - The column key that was clicked.
	 */
	onSort: (column: string) => void;
}

/**
 * Definitions for the table's sortable columns.
 *
 * The `key` must match the API's accepted `sort` parameter values.
 * `diagram_count` is intentionally omitted — the API does not support sorting
 * by that field.
 */
const SORTABLE_COLUMNS = [
	{ key: "email", label: "Email" },
	{ key: "name", label: "Name" },
	{ key: "role", label: "Role" },
	{ key: "created_at", label: "Created" },
] as const;

/**
 * Icon displayed inside a sortable column header.
 *
 * - When the column is not the active sort column, shows a neutral up/down
 *   arrow (`ArrowUpDown`).
 * - When the column is active and sorted ascending, shows `ArrowUp`.
 * - When the column is active and sorted descending, shows `ArrowDown`.
 *
 * @param column - The column key for this icon.
 * @param sort - The currently active sort column key.
 * @param order - The currently active sort direction.
 * @returns The appropriate sort indicator icon.
 */
function SortIcon({ column, sort, order }: { column: string; sort: string; order: "asc" | "desc" }) {
	if (sort !== column) {
		return <ArrowUpDown className="ml-1 h-4 w-4 inline" aria-hidden="true" />;
	}
	return order === "asc" ? (
		<ArrowUp className="ml-1 h-4 w-4 inline" aria-hidden="true" />
	) : (
		<ArrowDown className="ml-1 h-4 w-4 inline" aria-hidden="true" />
	);
}

/**
 * Sortable user table for the admin management page.
 *
 * Displays a table of all users with the following columns: Email, Name, Role
 * (badge), Created date, Diagram count, and Actions. Clicking a column header
 * calls `onSort` with the column's key; the parent is responsible for toggling
 * the sort direction when the same column is clicked again.
 *
 * When `users` is empty, renders a "No users found." paragraph instead of the
 * table, satisfying the empty-state requirement.
 *
 * The `Actions` column renders a `UserActions` dropdown per row; the current
 * user's row has its actions disabled to prevent self-modification.
 *
 * @param props - See `UserTableProps`.
 * @returns A sortable user table or an empty-state message.
 *
 * @example
 * ```tsx
 * <UserTable
 *   users={data.users}
 *   currentUserId={currentUserId}
 *   sort={sort}
 *   order={order}
 *   onSort={handleSort}
 * />
 * ```
 */
export function UserTable({ users, currentUserId, sort, order, onSort }: UserTableProps) {
	if (users.length === 0) {
		return <p className="text-muted-foreground text-center py-8">No users found.</p>;
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					{SORTABLE_COLUMNS.map((col) => (
						<TableHead key={col.key} className="cursor-pointer select-none" onClick={() => onSort(col.key)}>
							<span className="flex items-center">
								{col.label}
								<SortIcon column={col.key} sort={sort} order={order} />
							</span>
						</TableHead>
					))}
					<TableHead>Diagrams</TableHead>
					<TableHead className="w-20">Actions</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{users.map((user) => (
					<TableRow key={user.id}>
						<TableCell className="font-medium">{user.email}</TableCell>
						<TableCell>{user.name ?? "—"}</TableCell>
						<TableCell>
							<Badge
								variant={user.role === "admin" ? "default" : "secondary"}
								className={user.role === "admin" ? "bg-blue-600" : ""}
							>
								{user.role}
							</Badge>
						</TableCell>
						<TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
						<TableCell className="text-right">{user.diagram_count}</TableCell>
						<TableCell>
							<UserActions user={user} isSelf={user.id === currentUserId} />
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
