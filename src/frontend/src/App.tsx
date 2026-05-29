import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AdminRoute } from "@/components/layout/AdminRoute";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AuthProvider } from "@/hooks/useAuth";
import { Admin } from "@/pages/Admin";
import { Dashboard } from "@/pages/Dashboard";
import { Editor } from "@/pages/Editor";

/**
 * Root application component for CF-Architect.
 *
 * Sets up the full React Router v7 route tree with authentication context
 * and role-based access control:
 *
 * - `AuthProvider` wraps the entire tree so every component can call
 *   `useAuth()`.
 * - A pathless layout `<Route>` uses `ProtectedRoute` + `AppShell` to
 *   require authentication and render the shared header/layout for all child
 *   routes.
 * - `/` → `Dashboard` (protected)
 * - `/editor/:id` → `Editor` (protected)
 * - `/admin` → `Admin` (protected + admin role required via `AdminRoute`)
 *
 * The `AppShell` renders an `<Outlet />` which receives the matched child
 * route component.
 *
 * @returns The fully configured application with routing and auth context.
 *
 * @example
 * ```tsx
 * // Entry point (main.tsx):
 * import { App } from "./App";
 * createRoot(document.getElementById("root")!).render(<App />);
 * ```
 */
export function App() {
	return (
		<BrowserRouter>
			<AuthProvider>
				<Routes>
					{/* Layout route: requires auth; renders AppShell for all children */}
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
