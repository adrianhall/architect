import { MoreHorizontal, ShieldMinus, ShieldPlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { type AdminUser, useDeleteUser, useDemoteUser, usePromoteUser } from "@/api/hooks/useAdmin";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Props for the `UserActions` component.
 */
interface UserActionsProps {
	/** The user row that these actions act upon. */
	user: AdminUser;
	/**
	 * When `true` the trigger button is disabled and no actions can be taken.
	 * This prevents an admin from modifying their own account.
	 */
	isSelf: boolean;
}

/**
 * Per-row action menu for the admin user table.
 *
 * Renders a three-dot button that opens a dropdown with role-change and delete
 * actions. When the current row belongs to the authenticated user (`isSelf`),
 * the trigger is disabled to prevent self-modification.
 *
 * Actions:
 * - **Promote to Admin** — shown when `user.role === "user"`. Calls
 *   `usePromoteUser` with the user's ID.
 * - **Demote to User** — shown when `user.role === "admin"`. Calls
 *   `useDemoteUser` with the user's ID.
 * - **Delete User** — always shown. Opens an `AlertDialog` confirmation that
 *   displays the user's email and diagram count before calling `useDeleteUser`.
 *
 * Per AGENTS.md, Radix `DropdownMenuItem` state changes must be placed in
 * `onSelect` (not `onClick`) because the portal unmounts on `pointerup`.
 *
 * @param props - See `UserActionsProps`.
 * @returns The actions dropdown and delete confirmation dialog.
 *
 * @example
 * ```tsx
 * <UserActions user={row} isSelf={row.id === currentUserId} />
 * ```
 */
export function UserActions({ user, isSelf }: UserActionsProps) {
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const promote = usePromoteUser();
	const demote = useDemoteUser();
	const deleteUser = useDeleteUser();

	/** Calls the promote mutation for this user. */
	const handlePromote = () => promote.mutate({ userId: user.id });

	/** Calls the demote mutation for this user. */
	const handleDemote = () => demote.mutate({ userId: user.id });

	/** Calls the delete mutation and closes the dialog when settled. */
	const handleDelete = () => {
		deleteUser.mutate({ userId: user.id }, { onSettled: () => setDeleteDialogOpen(false) });
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" disabled={isSelf} aria-label={`Actions for ${user.email}`}>
						<MoreHorizontal className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{user.role === "user" ? (
						<DropdownMenuItem onSelect={handlePromote} onClick={(e) => e.stopPropagation()}>
							<ShieldPlus className="mr-2 h-4 w-4" />
							Promote to Admin
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem onSelect={handleDemote} onClick={(e) => e.stopPropagation()}>
							<ShieldMinus className="mr-2 h-4 w-4" />
							Demote to User
						</DropdownMenuItem>
					)}
					<DropdownMenuItem
						onSelect={() => setDeleteDialogOpen(true)}
						onClick={(e) => e.stopPropagation()}
						className="text-destructive"
					>
						<Trash2 className="mr-2 h-4 w-4" />
						Delete User
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete User</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete <strong>{user.email}</strong>? This will also delete their{" "}
							<strong>{user.diagram_count}</strong> {user.diagram_count !== 1 ? "diagrams" : "diagram"}. This action
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
