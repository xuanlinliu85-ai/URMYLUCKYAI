const lockTails = new Map<string, Promise<void>>();

export async function withPreferenceScopeLock<T>(projectId: string, userKey: string, operation: () => Promise<T>): Promise<T> {
  const key = `${projectId}\u0000${userKey}`;
  const previous = lockTails.get(key) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => { release = resolve; });
  lockTails.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (lockTails.get(key) === current) lockTails.delete(key);
  }
}
