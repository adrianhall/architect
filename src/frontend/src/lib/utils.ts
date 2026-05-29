import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind CSS class names, resolving conflicts in favour of the last
 * class when two utilities target the same CSS property.
 *
 * Combines `clsx` (conditional class joining) with `tailwind-merge` (conflict
 * resolution) to produce a single, deduplicated class string. This is the
 * standard pattern used throughout shadcn/ui components.
 *
 * @param inputs - Any number of class values: strings, arrays, or objects
 *   whose keys are class names and whose values are booleans.
 * @returns A single merged class string with Tailwind conflicts resolved.
 *
 * @example
 * ```ts
 * cn("px-4 py-2", "px-6")           // → "py-2 px-6"  (px-4 is overridden)
 * cn("text-red-500", isError && "text-blue-500") // → conditional
 * cn("flex", { "flex-col": isVertical }) // → object syntax
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
