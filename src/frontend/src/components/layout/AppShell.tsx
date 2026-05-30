import { Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

/**
 * Main application layout shell rendered for all authenticated pages.
 *
 * Renders a fixed top header bar containing the app name ("CF-Architect") on
 * the left and the signed-in user's avatar and email on the right, followed by
 * a flexible content area that renders the matched child route via React
 * Router's `<Outlet />`.
 *
 * The header avatar shows the user's profile image when `avatar_url` is
 * present; otherwise it falls back to a coloured circle with the first letter
 * of the user's name (or email if no name is set).
 *
 * This component must be rendered inside an `AuthProvider` and a React Router
 * context. It is used as a layout route element in `App.tsx` so that all child
 * routes inherit the header.
 *
 * @returns The full-screen layout with header and content outlet.
 *
 * @example
 * ```tsx
 * // Used as a layout route in App.tsx:
 * <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
 *   <Route path="/" element={<Dashboard />} />
 * </Route>
 * ```
 */
export function AppShell() {
	const { user } = useAuth();

	return (
		<div className="flex h-screen flex-col bg-background text-foreground">
			{/* Header */}
			<header className="flex h-14 items-center justify-between border-b border-border px-4">
				<div className="flex items-center gap-2">
					<span className="text-lg font-semibold text-primary">CF-Architect</span>
				</div>
				{user !== null && (
					<div className="flex items-center gap-3">
						{user.avatar_url ? (
							<img src={user.avatar_url} alt={user.name ?? user.email} className="h-8 w-8 rounded-full" />
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
						<span className="text-sm text-muted-foreground">{user.email}</span>
					</div>
				)}
			</header>

			{/* Content area */}
			<div className="flex flex-1 overflow-hidden">
				{/* Sidebar placeholder — will be populated in ISSUE-15 (service palette) */}
				<main className="flex-1 overflow-auto">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
