import { useNavigate } from "react-router-dom";
import { useCreateDiagram, useListDiagrams } from "@/api";
import { DiagramCard } from "@/components/dashboard/DiagramCard";
import { DiagramCardSkeleton } from "@/components/dashboard/DiagramCardSkeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

/**
 * Dashboard page — the primary landing page after login.
 *
 * Displays a responsive grid of the current user's diagrams via
 * `useListDiagrams`. Each diagram is rendered as a `DiagramCard` with
 * per-card actions (rename, duplicate, delete). A "New Diagram" button
 * creates a blank diagram and navigates the user to the editor.
 *
 * Loading state: shows 8 skeleton cards while the list is fetching.
 * Empty state: shows an `EmptyState` component when the user has no diagrams.
 * Error state: shows an inline error banner when the list fetch fails.
 *
 * Must be rendered within an `AuthProvider` (for `useAuth`) and a
 * `QueryClientProvider` (for TanStack Query hooks).
 *
 * @returns The full dashboard page.
 *
 * @example
 * ```tsx
 * // In your router:
 * <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
 * ```
 */
export function Dashboard() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const { data: diagrams, isLoading, error } = useListDiagrams();
	const createMutation = useCreateDiagram();

	/** Create a blank diagram titled "Untitled Diagram" and navigate to its editor. */
	const handleCreate = async () => {
		const diagram = await createMutation.mutateAsync({ title: "Untitled Diagram" });
		navigate(`/editor/${diagram.id}`);
	};

	return (
		<div className="mx-auto max-w-6xl p-4">
			{/* Page header */}
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Dashboard</h1>
					{user !== null && <p className="text-sm text-muted-foreground">Welcome back, {user.name ?? user.email}</p>}
				</div>
				<Button onClick={() => void handleCreate()} disabled={createMutation.isPending}>
					{createMutation.isPending ? "Creating..." : "New Diagram"}
				</Button>
			</div>

			{/* Error state */}
			{error !== null && error !== undefined && (
				<div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
					Failed to load diagrams. Please try again.
				</div>
			)}

			{/* Loading skeletons */}
			{isLoading && (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{Array.from({ length: 8 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: skeleton items have no meaningful identity
						<DiagramCardSkeleton key={`skeleton-${i}`} />
					))}
				</div>
			)}

			{/* Empty state */}
			{!isLoading && error === null && diagrams !== undefined && diagrams.length === 0 && (
				<EmptyState
					icon={
						<svg
							className="size-16"
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
				/>
			)}

			{/* Diagram card grid */}
			{!isLoading && diagrams !== undefined && diagrams.length > 0 && (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{diagrams.map((diagram) => (
						<DiagramCard key={diagram.id} id={diagram.id} title={diagram.title} updatedAt={diagram.updated_at} />
					))}
				</div>
			)}
		</div>
	);
}
