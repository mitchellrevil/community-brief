import { useCallback, useRef } from 'react';

/**
 * Hook to create stable callback references that don't change between renders.
 *
 * This is useful for passing callbacks to memoized child components without
 * causing unnecessary re-renders. The actual handler functions are stored in
 * refs and updated on each render, but the returned callback references remain stable.
 *
 * @description Creates wrapper functions that delegate to the latest version of
 * handlers stored in refs. The wrappers never change identity, preventing
 * child component re-renders from callback prop changes.
 *
 * @template T - Record of callback functions
 * @param {T} handlers - Object mapping names to callback functions
 *
 * @returns {T} Object with same keys but stable callback references
 *
 * @example
 * ```tsx
 * import { useMemoizedCallbacks } from '@/hooks/useMemoizedCallbacks';
 *
 * function RecordingsPage() {
 *   const router = useRouter();
 *   const [playingId, setPlayingId] = useState<string | null>(null);
 *
 *   // These callbacks have stable references across renders
 *   const callbacks = useMemoizedCallbacks({
 *     onViewDetails: (recording: Recording) => {
 *       router.navigate({ to: `/recordings/${recording.id}` });
 *     },
 *     onPlay: (recording: Recording) => {
 *       setPlayingId(recording.id);
 *     },
 *     onDelete: (recording: Recording) => {
 *       handleDelete(recording); // Can use latest closure values
 *     },
 *   });
 *
 *   return (
 *     <RecordingsList
 *       recordings={recordings}
 *       onViewDetails={callbacks.onViewDetails}
 *       onPlay={callbacks.onPlay}
 *       onDelete={callbacks.onDelete}
 *     />
 *   );
 * }
 * ```
 *
 * @see {@link useStableCallback} for single callback version
 * @see {@link React.memo} for memoized components that benefit from this
 */
export function useMemoizedCallbacks<T extends Record<string, (...args: Array<any>) => any>>(
  handlers: T
): T {
  // Store the latest handlers in a ref
  const handlersRef = useRef(handlers);
  
  // Update the ref on each render to capture the latest handlers
  handlersRef.current = handlers;
  
  // Create stable callback wrappers that delegate to the current handler
  const stableCallbacksRef = useRef<T | null>(null);
  
  if (stableCallbacksRef.current === null) {
    // Initialize stable callbacks on first render
    const stableCallbacks = {} as T;
    
    for (const key of Object.keys(handlers) as Array<keyof T>) {
      // Create a stable wrapper function that always calls the latest handler
      stableCallbacks[key] = ((...args: Array<unknown>) => {
        return handlersRef.current[key](...args);
      }) as T[keyof T];
    }
    
    stableCallbacksRef.current = stableCallbacks;
  }
  
  return stableCallbacksRef.current;
}

/**
 * Creates a single stable callback reference.
 *
 * This is a simpler alternative to useMemoizedCallbacks for single callbacks.
 * The returned function reference is stable across renders but always calls
 * the latest version of the handler.
 *
 * @description Stores the callback in a ref and returns a stable wrapper.
 * The wrapper's identity never changes but it always invokes the current callback.
 *
 * @template T - Callback function type
 * @param {T} callback - The callback function
 *
 * @returns {T} Stable callback reference
 *
 * @example
 * ```tsx
 * import { useStableCallback } from '@/hooks/useMemoizedCallbacks';
 *
 * function SearchBox({ onSearch }: { onSearch: (query: string) => void }) {
 *   const [query, setQuery] = useState('');
 *
 *   // Stable reference that still captures latest query
 *   const handleSubmit = useStableCallback((e: FormEvent) => {
 *     e.preventDefault();
 *     onSearch(query); // Uses latest query value
 *   });
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <input value={query} onChange={(e) => setQuery(e.target.value)} />
 *     </form>
 *   );
 * }
 * ```
 */
export function useStableCallback<T extends (...args: Array<any>) => any>(
  callback: T
): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  
  return useCallback(((...args: Parameters<T>) => {
    return callbackRef.current(...args);
  }) as T, []);
}

/**
 * Comparison function for React.memo that compares recording objects.
 *
 * Use this as the second argument to React.memo for components that receive
 * recording objects as props. Performs shallow comparison of key properties.
 *
 * @template P - Props type extending recording prop
 * @param {P} prevProps - Previous props
 * @param {P} nextProps - Next props
 *
 * @returns {boolean} True if props are equal (skip re-render)
 *
 * @example
 * ```tsx
 * import { recordingPropsAreEqual } from '@/hooks/useMemoizedCallbacks';
 *
 * const AudioRecordingCard = memo(
 *   function AudioRecordingCardComponent({ recording, onPlay }) {
 *     return <div onClick={() => onPlay(recording)}>{recording.name}</div>;
 *   },
 *   recordingPropsAreEqual
 * );
 * ```
 */
export function recordingPropsAreEqual<
  TProps extends { recording: { id: string; status: string; created_at: number } }
>(prevProps: TProps, nextProps: TProps): boolean {
  const prev = prevProps.recording;
  const next = nextProps.recording;
  
  return (
    prev.id === next.id &&
    prev.status === next.status &&
    prev.created_at === next.created_at &&
    (prev as any).displayname === (next as any).displayname &&
    (prev as any).display_name === (next as any).display_name &&
    (prev as any).file_name === (next as any).file_name
  );
}

/**
 * Comparison function for React.memo on recording list components.
 *
 * Returns true (skip re-render) if:
 * - Same number of recordings
 * - Same recording IDs in same order
 * - Same statuses for each recording
 * - Same isLoading state
 * - Same viewMode
 *
 * @template P - Props type extending list props
 * @param {P} prevProps - Previous props
 * @param {P} nextProps - Next props
 *
 * @returns {boolean} True if props are equal (skip re-render)
 *
 * @example
 * ```tsx
 * import { recordingsListPropsAreEqual } from '@/hooks/useMemoizedCallbacks';
 *
 * const RecordingsList = memo(
 *   function RecordingsListComponent({ recordings, isLoading, viewMode }) {
 *     return recordings.map((r) => <RecordingRow key={r.id} recording={r} />);
 *   },
 *   recordingsListPropsAreEqual
 * );
 * ```
 */
export function recordingsListPropsAreEqual<
  TProps extends {
    recordings: Array<{ id: string; status: string }>;
    isLoading: boolean;
    viewMode: 'card' | 'table';
  }
>(prevProps: TProps, nextProps: TProps): boolean {
  // Loading state changed
  if (prevProps.isLoading !== nextProps.isLoading) {
    return false;
  }
  
  // View mode changed
  if (prevProps.viewMode !== nextProps.viewMode) {
    return false;
  }
  
  // Different number of recordings
  if (prevProps.recordings.length !== nextProps.recordings.length) {
    return false;
  }
  
  // Check each recording for changes
  for (let i = 0; i < prevProps.recordings.length; i++) {
    const prev = prevProps.recordings[i];
    const next = nextProps.recordings[i];
    
    if (
      prev.id !== next.id ||
      prev.status !== next.status ||
      (prev as any).displayname !== (next as any).displayname ||
      (prev as any).display_name !== (next as any).display_name
    ) {
      return false;
    }
  }
  
  return true;
}
