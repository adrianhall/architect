# Auto-save via DiagramSync abstraction + save status + tests

## Summary

Implements auto-save for the diagram editor using a DiagramSync abstraction layer. The Zustand diagram store dispatches saves through a `DiagramSync` interface rather than calling fetch directly. The MVP implementation is REST-based (debounced PUT of the full graph). A future collaboration feature can swap in a WebSocket-to-Durable-Object implementation without touching canvas components. The save status is displayed in a status bar showing "Saving...", "Saved Xs ago", "Unsaved changes", "Error saving", or "Conflict - reload?". A `beforeunload` handler warns users when navigating away with unsaved changes.

## Relevant Skills

- `react-state-management`
- `typescript-advanced-types`
- `api-design-principles`

## Requirements Coverage

- [F4-US10](../REQUIREMENTS.md): Live save status (saving / saved Xs ago / unsaved / error). Debounce 500 ms; "unsaved changes" browser warning shown on unload when dirty.

## Acceptance Criteria

- [ ] `DiagramSync` interface is defined in `src/frontend/src/sync/types.ts` with `save()` and optional `onRemoteChange()` methods.
- [ ] `SaveResult` type is a discriminated union covering success, conflict, and error cases.
- [ ] `RestSync` implementation in `src/frontend/src/sync/restSync.ts` calls `PUT /api/diagrams/:id` with `{ title, graph_data, version }`.
- [ ] `RestSync` maps HTTP 409 to a conflict `SaveResult` and other errors to an error `SaveResult`.
- [ ] `useDiagramSync` hook debounces save calls by 500ms after diagram store changes.
- [ ] Save status transitions correctly: idle → saving → saved (on success), idle → saving → error (on failure), idle → saving → conflict (on 409).
- [ ] `SaveStatus` component displays the current save status with appropriate text and styling.
- [ ] `SaveStatus` shows relative time ("Saved 5s ago") that updates periodically.
- [ ] `beforeunload` handler fires when the diagram is dirty (unsaved changes pending).
- [ ] `beforeunload` handler does NOT fire when diagram is clean (all changes saved).
- [ ] On conflict (409), the status shows "Conflict - reload?" and the user can reload to fetch the latest version.
- [ ] Diagram store tracks `dirty`, `version`, and `diagramId` state.
- [ ] The `DiagramSync` interface is properly abstracted — tests verify behavior with a mock implementation.
- [ ] The `useDiagramSync` hook is wired into `Editor.tsx` and `SaveStatus` is rendered in the editor status bar.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### 1. Define the DiagramSync Interface

Create `src/frontend/src/sync/types.ts`:

```typescript
// src/frontend/src/sync/types.ts
import type { GraphData } from "@architect/shared";

export type SaveResult =
  | { success: true; version: number }
  | { success: false; conflict: true; serverVersion: number }
  | { success: false; conflict?: false; error: string };

export interface DiagramSync {
  save(
    diagramId: string,
    graphData: GraphData,
    version: number
  ): Promise<SaveResult>;
  onRemoteChange?(
    callback: (graphData: GraphData, version: number) => void
  ): () => void;
}
```

The `onRemoteChange` method is optional — the REST implementation does not use it, but a future WebSocket implementation will. This is the key abstraction point: canvas components never know how saves happen.

### 2. Implement RestSync

Create `src/frontend/src/sync/restSync.ts`:

```typescript
// src/frontend/src/sync/restSync.ts
import type { DiagramSync, SaveResult } from "./types";
import type { GraphData } from "@architect/shared";

export function createRestSync(baseUrl = ""): DiagramSync {
  return {
    async save(
      diagramId: string,
      graphData: GraphData,
      version: number
    ): Promise<SaveResult> {
      try {
        const response = await fetch(`${baseUrl}/api/diagrams/${diagramId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: /* passed separately or read from store */ undefined,
            graph_data: graphData,
            version,
          }),
        });

        if (response.ok) {
          const { data } = await response.json();
          return { success: true, version: data.version };
        }

        if (response.status === 409) {
          const { error } = await response.json();
          return {
            success: false,
            conflict: true,
            serverVersion: error.details?.serverVersion ?? version + 1,
          };
        }

        const errorBody = await response.json().catch(() => null);
        return {
          success: false,
          error:
            errorBody?.error?.message ??
            `Save failed with status ${response.status}`,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Network error",
        };
      }
    },
  };
}
```

**Note:** The `save` method needs the diagram title. There are two approaches:

1. Include `title` in the `save()` signature.
2. Read the title from the diagram store inside the hook.

Option 2 is cleaner — the hook reads both `graphData` and `title` from the store and passes them to the REST endpoint. Adjust the `DiagramSync` interface to also accept `title` as a parameter, or have the `RestSync` factory accept a title getter. The simplest approach: expand the `save` signature to include title:

```typescript
save(diagramId: string, title: string, graphData: GraphData, version: number): Promise<SaveResult>;
```

### 3. Update the Diagram Store

Add the following fields to `src/frontend/src/stores/diagram.ts`:

```typescript
interface DiagramState {
  // ... existing fields
  diagramId: string | null;
  version: number;
  dirty: boolean;
  lastSavedGraphData: GraphData | null; // snapshot of last saved state for dirty comparison
}

interface DiagramActions {
  // ... existing actions
  setDiagramId: (id: string) => void;
  setVersion: (version: number) => void;
  markClean: (version: number) => void;
  loadDiagram: (id: string, title: string, graphData: GraphData, version: number) => void;
}
```

The `dirty` flag is computed: after every mutating action, set `dirty = true`. When a save succeeds and `markClean(newVersion)` is called, set `dirty = false` and update `version`. The `loadDiagram` action initializes the store with data from the API and sets `dirty = false`.

### 4. Implement useDiagramSync Hook

Create `src/frontend/src/sync/useDiagramSync.ts`:

```typescript
// src/frontend/src/sync/useDiagramSync.ts
import { useEffect, useRef, useCallback, useState } from "react";
import { useDiagramStore } from "../stores/diagram";
import type { DiagramSync } from "./types";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export function useDiagramSync(diagramId: string, sync: DiagramSync) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  // Subscribe to store changes and debounce saves
  useEffect(() => {
    const unsubscribe = useDiagramStore.subscribe((state, prevState) => {
      // Only trigger save if diagram data actually changed
      if (
        state.nodes === prevState.nodes &&
        state.edges === prevState.edges &&
        state.title === prevState.title
      ) {
        return;
      }

      if (!state.dirty) return;

      // Clear any pending debounce
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce 500ms
      debounceTimerRef.current = setTimeout(async () => {
        if (isSavingRef.current) return;
        isSavingRef.current = true;
        setStatus("saving");

        const { title, nodes, edges, viewport, version } =
          useDiagramStore.getState();
        const graphData = { nodes, edges, viewport };

        const result = await sync.save(diagramId, title, graphData, version);

        if (result.success) {
          useDiagramStore.getState().markClean(result.version);
          setStatus("saved");
          setLastSavedAt(Date.now());
          setErrorMessage(null);
        } else if (result.conflict) {
          setStatus("conflict");
          setErrorMessage(
            "Another session saved changes. Please reload to see the latest version."
          );
        } else {
          setStatus("error");
          setErrorMessage(result.error);
        }

        isSavingRef.current = false;
      }, 500);
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [diagramId, sync]);

  // beforeunload handler
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      const { dirty } = useDiagramStore.getState();
      if (dirty) {
        e.preventDefault();
        // Modern browsers ignore custom messages but require returnValue to be set
        e.returnValue = "You have unsaved changes.";
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return { status, lastSavedAt, errorMessage };
}
```

### 5. Implement SaveStatus Component

Create `src/frontend/src/components/canvas/SaveStatus.tsx`:

```typescript
// src/frontend/src/components/canvas/SaveStatus.tsx
import { useEffect, useState } from "react";
import type { SaveStatus as SaveStatusType } from "../../sync/useDiagramSync";

interface SaveStatusProps {
  status: SaveStatusType;
  lastSavedAt: number | null;
  errorMessage: string | null;
  onReload?: () => void;
}

export function SaveStatus({
  status,
  lastSavedAt,
  errorMessage,
  onReload,
}: SaveStatusProps) {
  const [relativeTime, setRelativeTime] = useState("");

  // Update relative time every 10 seconds
  useEffect(() => {
    if (!lastSavedAt) return;

    function updateRelativeTime() {
      const seconds = Math.floor((Date.now() - lastSavedAt!) / 1000);
      if (seconds < 5) setRelativeTime("just now");
      else if (seconds < 60) setRelativeTime(`${seconds}s ago`);
      else if (seconds < 3600)
        setRelativeTime(`${Math.floor(seconds / 60)}m ago`);
      else setRelativeTime(`${Math.floor(seconds / 3600)}h ago`);
    }

    updateRelativeTime();
    const interval = setInterval(updateRelativeTime, 10_000);
    return () => clearInterval(interval);
  }, [lastSavedAt]);

  switch (status) {
    case "idle":
      return null;
    case "saving":
      return <span className="text-muted-foreground text-sm">Saving...</span>;
    case "saved":
      return (
        <span className="text-muted-foreground text-sm">
          Saved {relativeTime}
        </span>
      );
    case "error":
      return (
        <span className="text-destructive text-sm" title={errorMessage ?? ""}>
          Error saving
        </span>
      );
    case "conflict":
      return (
        <span className="text-destructive text-sm">
          Conflict —{" "}
          <button
            type="button"
            className="underline"
            onClick={onReload}
          >
            reload?
          </button>
        </span>
      );
  }
}
```

### 6. Wire Into Editor.tsx

In `Editor.tsx`:

1. Import `useDiagramSync` and `createRestSync`.
2. Create the sync instance once (memoized or at module level).
3. Mount the hook: `const { status, lastSavedAt, errorMessage } = useDiagramSync(diagramId, restSync)`.
4. Render `<SaveStatus>` in the editor's status bar area (bottom bar or header).
5. The `onReload` callback should call `window.location.reload()` or re-fetch the diagram from the API and reload the store.

```typescript
// In Editor.tsx
import { createRestSync } from "../sync/restSync";
import { useDiagramSync } from "../sync/useDiagramSync";
import { SaveStatus } from "../components/canvas/SaveStatus";

const restSync = createRestSync(); // module-level singleton

function Editor() {
  const { diagramId } = useParams();
  const { status, lastSavedAt, errorMessage } = useDiagramSync(
    diagramId!,
    restSync
  );

  return (
    <div className="flex flex-col h-full">
      {/* Canvas area */}
      <ReactFlow /* ... */ />
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1 border-t">
        <SaveStatus
          status={status}
          lastSavedAt={lastSavedAt}
          errorMessage={errorMessage}
          onReload={() => window.location.reload()}
        />
      </div>
    </div>
  );
}
```

### 7. Diagram Loading Flow

When the editor mounts:

1. Use TanStack Query to fetch the diagram by ID from `GET /api/diagrams/:id`.
2. On success, call `useDiagramStore.getState().loadDiagram(id, title, graphData, version)`.
3. This sets the store to a clean state with the fetched data, ready for editing.

This loading logic likely already exists from ISSUE-13; this issue adds the `loadDiagram` action and the `dirty`/`version` tracking.

## Testing

Tests go in `src/frontend/src/sync/__tests__/restSync.test.ts`, `src/frontend/src/sync/__tests__/useDiagramSync.test.ts`, and `src/frontend/src/components/canvas/__tests__/SaveStatus.test.ts`.

### RestSync Tests (`restSync.test.ts`)

1. **Successful save returns success with new version:**
   - Mock `fetch` to return 200 with `{ data: { version: 2 } }`.
   - Call `sync.save(...)`. Assert result is `{ success: true, version: 2 }`.

1. **409 response returns conflict result:**
   - Mock `fetch` to return 409.
   - Call `sync.save(...)`. Assert result has `success: false, conflict: true`.

1. **500 response returns error result:**
   - Mock `fetch` to return 500 with error body.
   - Call `sync.save(...)`. Assert result has `success: false, error: <message>`.

1. **Network error returns error result:**
   - Mock `fetch` to throw a `TypeError`.
   - Call `sync.save(...)`. Assert result has `success: false, error: "Network error"` or similar.

1. **Sends correct HTTP method, URL, and body:**
   - Mock `fetch` and inspect the request arguments.
   - Assert method is PUT, URL ends with `/api/diagrams/<id>`, body contains title, graph_data, version.

### useDiagramSync Tests (`useDiagramSync.test.ts`)

1. **Debounce delays save by 500ms:**
   - Use `vi.useFakeTimers()`. Trigger a store change.
   - Assert save not called immediately.
   - Advance timers by 500ms. Assert save called once.

1. **Multiple rapid changes only trigger one save:**
   - Trigger 5 store changes in rapid succession.
   - Advance timers by 500ms. Assert save called only once with the latest state.

1. **Successful save updates status to 'saved':**
   - Mock sync to return success. Trigger a change and advance timers.
   - Assert status transitions: saving → saved.

1. **Failed save updates status to 'error':**
   - Mock sync to return error. Trigger a change and advance timers.
   - Assert status is 'error' with error message.

1. **Conflict (409) shows conflict status:**
    - Mock sync to return conflict result. Trigger a change and advance timers.
    - Assert status is 'conflict'.

1. **beforeunload fires when dirty:**
    - Set store to dirty state. Create a `BeforeUnloadEvent` and dispatch it.
    - Assert `event.defaultPrevented` is true (or `returnValue` is set).

1. **beforeunload does NOT fire when clean:**
    - Set store to clean state. Dispatch `beforeunload`.
    - Assert the event is not prevented.

### DiagramSync Abstraction Test

1. **Mock DiagramSync works identically to RestSync:**
    - Create a mock `DiagramSync` implementation that records calls.
    - Wire it into `useDiagramSync`. Assert the hook calls `save()` with correct arguments.
    - This proves the abstraction works — any implementation can be swapped in.

### SaveStatus Component Tests (`SaveStatus.test.ts`)

1. **Renders "Saving..." when status is 'saving'.**
1. **Renders "Saved Xs ago" when status is 'saved' with a lastSavedAt timestamp.**
1. **Renders "Error saving" when status is 'error'.**
1. **Renders "Conflict — reload?" with a clickable button when status is 'conflict'.**
1. **Clicking reload button calls onReload callback.**
1. **Renders nothing when status is 'idle'.**

### Manual Tests

After running locally with `npm start`:

1. Open a diagram in the editor. Make a change (add a node). Observe the status bar change from idle → "Saving..." → "Saved just now".
2. Wait 30 seconds. The status should update to "Saved 30s ago".
3. Make a change and immediately close the browser tab — a "You have unsaved changes" warning should appear.
4. Save a change, then wait for the "Saved" status. Close the tab — no warning should appear.
5. To test conflict: open the same diagram in two tabs. Make changes in both. The second tab to save should show "Conflict — reload?" status. Clicking reload should refresh the page with the latest data.
6. Disconnect network (DevTools → Offline). Make a change. Status should show "Error saving". Reconnect — status should recover on the next save attempt.
