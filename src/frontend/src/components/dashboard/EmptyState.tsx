import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Props for the `EmptyState` component.
 */
interface EmptyStateProps {
	/** Icon or illustration to display above the title. */
	icon?: ReactNode;
	/** Main heading text displayed prominently. */
	title: string;
	/** Supporting description text shown below the title. */
	description?: string;
	/** Label for the call-to-action button. Only rendered when `onAction` is also provided. */
	actionLabel?: string;
	/** Click handler for the call-to-action button. Only rendered when `actionLabel` is also provided. */
	onAction?: () => void;
	/** Additional CSS classes applied to the wrapper element. */
	className?: string;
}

/**
 * Reusable empty state component for when a list or collection has no items.
 *
 * Renders a centred column with an optional icon, a required title, an optional
 * description, and an optional call-to-action button. The button is only shown
 * when both `actionLabel` and `onAction` are provided.
 *
 * Used on the dashboard when the user has no diagrams yet.
 *
 * @param props - Component props.
 * @param props.icon - Optional icon or illustration to display above the title.
 * @param props.title - Main heading text (required).
 * @param props.description - Supporting description text (optional).
 * @param props.actionLabel - Label for the CTA button (optional).
 * @param props.onAction - CTA button click handler (optional).
 * @param props.className - Additional CSS classes for the wrapper (optional).
 * @returns The empty state component.
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon={<FileIcon className="size-16" />}
 *   title="No diagrams yet"
 *   description="Create your first diagram to get started."
 *   actionLabel="New Diagram"
 *   onAction={() => handleCreate()}
 * />
 * ```
 */
export function EmptyState({ icon, title, description, actionLabel, onAction, className }: EmptyStateProps) {
	return (
		<div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
			{icon !== undefined && <div className="mb-4 text-muted-foreground">{icon}</div>}
			<h2 className="text-xl font-semibold">{title}</h2>
			{description !== undefined && <p className="mt-2 max-w-md text-muted-foreground">{description}</p>}
			{actionLabel !== undefined && onAction !== undefined && (
				<Button onClick={onAction} className="mt-6">
					{actionLabel}
				</Button>
			)}
		</div>
	);
}
