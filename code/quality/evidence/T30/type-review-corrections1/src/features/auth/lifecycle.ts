type CleanupHandler = () => void | Promise<void>;

const cleanupHandlers = new Set<CleanupHandler>();

/**
 * Register a resource cleanup handler (e.g. Socket.IO disconnect, LiveKit disconnect)
 * to be invoked on user sign-out or session invalidation.
 */
export function registerAuthCleanup(handler: CleanupHandler): () => void {
  cleanupHandlers.add(handler);
  return () => {
    cleanupHandlers.delete(handler);
  };
}

/**
 * Execute all registered cleanup handlers.
 * Attempts every handler even if one throws, and reports aggregate error if any handler failed.
 */
export async function runAuthCleanups(): Promise<void> {
  const handlers = Array.from(cleanupHandlers);
  const errors: Error[] = [];

  for (const handler of handlers) {
    try {
      await handler();
    } catch (err) {
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }
  }

  if (errors.length > 0) {
    throw new Error(`Auth resource cleanup failed: ${errors.map((e) => e.message).join('; ')}`);
  }
}
