import { useEffect, useState } from "react";

/**
 * Returns `true` when the user has requested reduced motion in their OS
 * accessibility settings (`prefers-reduced-motion: reduce`).
 *
 * Subscribes to the `MediaQueryList` change event so the value updates
 * dynamically if the user toggles the setting while the page is open.
 * The initial value is read synchronously from `window.matchMedia` during the
 * first render, so there is no flash of animation on mount.
 *
 * Use this hook in animated components to conditionally skip animations:
 *
 * @returns `true` when reduced motion is preferred, `false` otherwise.
 *
 * @example
 * ```tsx
 * function AnimatedEdge() {
 *   const reducedMotion = useReducedMotion();
 *   return (
 *     <>
 *       <BaseEdge ... />
 *       {!reducedMotion && (
 *         <circle r="3" fill="#3b82f6">
 *           <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
 *         </circle>
 *       )}
 *     </>
 *   );
 * }
 * ```
 */
export function useReducedMotion(): boolean {
	const [reduced, setReduced] = useState<boolean>(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, []);

	return reduced;
}
