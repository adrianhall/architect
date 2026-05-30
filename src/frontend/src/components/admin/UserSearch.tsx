import { Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

/**
 * Props for the `UserSearch` component.
 */
interface UserSearchProps {
	/** The current raw input value (controlled). */
	value: string;
	/** Called immediately on every keystroke with the new input value. */
	onChange: (value: string) => void;
	/**
	 * Called after the debounce delay has elapsed with the settled input value.
	 * Use this to drive API query parameters — it fires much less frequently
	 * than `onChange`, avoiding excessive network requests.
	 */
	onDebouncedChange: (value: string) => void;
	/**
	 * Debounce delay in milliseconds.
	 * @default 300
	 */
	debounceMs?: number;
}

/**
 * Debounced search input for filtering the admin user table.
 *
 * Renders a labelled text input with a search icon. The `onChange` callback
 * fires on every keystroke (for keeping the controlled input value current),
 * while `onDebouncedChange` fires only after the user has paused typing for
 * `debounceMs` milliseconds — this is the callback that should be wired to the
 * API query parameter so the backend is not called on every character.
 *
 * The debounce timer is tracked in a ref so it is stable across renders and
 * cleaned up properly when the component unmounts or when `value` or
 * `debounceMs` change.
 *
 * @param props - See `UserSearchProps`.
 * @returns A search input with icon and debounced callback.
 *
 * @example
 * ```tsx
 * const [search, setSearch] = useState("");
 * const [debouncedSearch, setDebouncedSearch] = useState("");
 *
 * <UserSearch
 *   value={search}
 *   onChange={setSearch}
 *   onDebouncedChange={setDebouncedSearch}
 * />
 * ```
 */
export function UserSearch({ value, onChange, onDebouncedChange, debounceMs = 300 }: UserSearchProps) {
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	useEffect(() => {
		timerRef.current = setTimeout(() => {
			onDebouncedChange(value);
		}, debounceMs);

		return () => clearTimeout(timerRef.current);
	}, [value, debounceMs, onDebouncedChange]);

	return (
		<div className="relative max-w-sm">
			<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
			<Input
				type="search"
				placeholder="Search by email or name..."
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="pl-9"
				aria-label="Search users"
			/>
		</div>
	);
}
