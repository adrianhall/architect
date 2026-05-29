import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDeleteDiagram, useDuplicateDiagram, useRenameDiagram } from "@/api";
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
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Props for the `DiagramCard` component.
 */
interface DiagramCardProps {
	/** ULID of the diagram. Used for navigation and mutation calls. */
	id: string;
	/** Human-readable diagram title displayed on the card. */
	title: string;
	/** Unix timestamp (ms) of the last update. Rendered as a relative time string. */
	updatedAt: number;
}

/**
 * Card component representing a single diagram in the dashboard grid.
 *
 * Displays a styled placeholder (no thumbnail — thumbnails are post-MVP),
 * the diagram title, and a relative "last updated" timestamp. Clicking the
 * card navigates to `/editor/:id`.
 *
 * A three-dot dropdown menu exposes per-card actions:
 * - **Rename** — activates inline title edit mode; saves via `useRenameDiagram`
 *   on blur or Enter with a 1-second debounce; Escape cancels.
 * - **Duplicate** — calls `useDuplicateDiagram` and navigates to the new
 *   diagram's editor page.
 * - **Delete** — opens an `AlertDialog` showing the diagram title; confirming
 *   calls `useDeleteDiagram`.
 *
 * @param props - Component props.
 * @param props.id - ULID of the diagram.
 * @param props.title - Human-readable diagram title.
 * @param props.updatedAt - Unix timestamp (ms) for the last-updated display.
 * @returns The diagram card element plus the delete confirmation dialog.
 *
 * @example
 * ```tsx
 * <DiagramCard
 *   id="01HXZ..."
 *   title="My Architecture"
 *   updatedAt={diagram.updated_at}
 * />
 * ```
 */
export function DiagramCard({ id, title, updatedAt }: DiagramCardProps) {
	const navigate = useNavigate();
	const renameMutation = useRenameDiagram();
	const duplicateMutation = useDuplicateDiagram();
	const deleteMutation = useDeleteDiagram();

	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(title);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	/**
	 * Tracks whether the dropdown menu was closed in order to enter rename mode.
	 * Used by `onCloseAutoFocus` on DropdownMenuContent to prevent Radix from
	 * restoring focus to the trigger button, which would immediately blur the
	 * rename input and cancel the edit session.
	 */
	const willRenameRef = useRef(false);

	// Focus and select all text when entering rename mode.
	// IMPORTANT: Skip auto-focus when the rename was triggered via the dropdown menu
	// (`willRenameRef.current === true`). In that case the DropdownMenu's FocusScope
	// is `trapped` while it is still open: focusing the Input synchronously (inside
	// Radix's `ReactDOM.flushSync`) causes the FocusScope to steal focus back,
	// triggering an immediate `onBlur → saveRename → setIsRenaming(false)` cascade.
	// Focus is handled safely by `onCloseAutoFocus` instead, which fires via
	// `setTimeout(fn, 0)` after the FocusScope has unmounted.
	useEffect(() => {
		if (isRenaming && inputRef.current && !willRenameRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isRenaming]);

	// Clean up any pending debounce timer on unmount.
	useEffect(() => {
		return () => {
			if (debounceRef.current !== undefined) {
				clearTimeout(debounceRef.current);
			}
		};
	}, []);

	/**
	 * Commits a rename: trims the value, fires the mutation after a 1-second
	 * debounce if the title actually changed, then exits rename mode.
	 *
	 * @param newTitle - The raw title string from the input.
	 */
	const saveRename = useCallback(
		(newTitle: string) => {
			const trimmed = newTitle.trim();
			if (trimmed && trimmed !== title) {
				if (debounceRef.current !== undefined) {
					clearTimeout(debounceRef.current);
				}
				debounceRef.current = setTimeout(() => {
					renameMutation.mutate({ id, title: trimmed });
				}, 1000);
			}
			setIsRenaming(false);
		},
		[id, title, renameMutation],
	);

	/**
	 * Navigate to the editor unless the click originated from the dropdown or
	 * inline input. Also checks `willRenameRef` because React batches state
	 * updates: `isRenaming` might still be `false` when the card's click handler
	 * fires even though `setIsRenaming(true)` was called in the `onSelect` of the
	 * Rename menu item (which fires on `pointerup`, before `click`).
	 */
	const handleCardClick = (e: React.MouseEvent) => {
		if (isRenaming || willRenameRef.current) return;
		const target = e.target as HTMLElement;
		if (target.closest("[data-dropdown-trigger]")) return;
		navigate(`/editor/${id}`);
	};

	/** Duplicate the diagram and navigate directly to the copy's editor page. */
	const handleDuplicate = async () => {
		const result = await duplicateMutation.mutateAsync({ id });
		navigate(`/editor/${result.id}`);
	};

	/** Confirm and execute deletion after the AlertDialog is accepted. */
	const handleDelete = () => {
		deleteMutation.mutate({ id });
		setShowDeleteDialog(false);
	};

	/** Handle keyboard shortcuts inside the inline rename input. */
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
				className={cn("group cursor-pointer transition-shadow hover:shadow-md", "flex flex-col")}
				onClick={handleCardClick}
				role="link"
				tabIndex={0}
				onKeyDown={(e) => {
					if (e.key === "Enter" && !isRenaming) navigate(`/editor/${id}`);
				}}
			>
				{/* Styled placeholder — thumbnails are post-MVP (F8). */}
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
								onBlur={(e) => {
									// Radix DropdownMenu asynchronously restores focus to the
									// trigger button after the menu closes. If the input blurs
									// because the trigger received focus, stay in rename mode
									// and refocus the input instead of saving.
									if (e.relatedTarget instanceof Element && e.relatedTarget.closest("[data-dropdown-trigger]")) {
										inputRef.current?.focus();
										return;
									}
									saveRename(renameValue);
								}}
								onKeyDown={handleRenameKeyDown}
								className="h-7 text-sm"
								maxLength={80}
								aria-label="Rename diagram"
								onClick={(e) => e.stopPropagation()}
							/>
						) : (
							<>
								<p className="truncate text-sm font-medium">{title}</p>
								<p className="text-xs text-muted-foreground">{formatRelativeTime(updatedAt)}</p>
							</>
						)}
					</div>

					{/* Three-dot actions dropdown */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild data-dropdown-trigger>
							<Button
								variant="ghost"
								size="sm"
								className="ml-2 size-8 p-0 opacity-0 group-hover:opacity-100"
								onClick={(e) => e.stopPropagation()}
								aria-label="Diagram actions"
							>
								<svg className="size-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
									<path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
								</svg>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							onCloseAutoFocus={(e) => {
								if (willRenameRef.current) {
									// Prevent Radix from restoring focus to the trigger button.
									// The FocusScope is now unmounting (this callback fires inside
									// a setTimeout(fn, 0)), so it is safe to focus the Input here
									// without the trapped FocusScope stealing focus back.
									e.preventDefault();
									willRenameRef.current = false;
									inputRef.current?.focus();
									inputRef.current?.select();
								}
							}}
						>
							{/*
							 * Use `onSelect` (fires on pointerup, before menu unmounts) rather
							 * than `onClick` (fires on the click event, after Radix has already
							 * unmounted the portal content). This guarantees that our state
							 * updates are called while the component is still mounted, which is
							 * required for React to properly batch and apply them.
							 */}
							<DropdownMenuItem
								onSelect={() => {
									willRenameRef.current = true;
									setIsRenaming(true);
								}}
							>
								Rename
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => void handleDuplicate()}>Duplicate</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem className="text-destructive" onSelect={() => setShowDeleteDialog(true)}>
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
							Are you sure you want to delete &quot;{title}&quot;? This action cannot be undone.
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
