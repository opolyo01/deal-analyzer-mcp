import { useEffect, useState } from 'react';
import { getCurrentUser } from '../lib/api';
import { errorMessage } from '../lib/format';
import type { CurrentUser } from '../lib/types';

export function useAuth() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const currentUser = await getCurrentUser();
        if (!cancelled) {
          setUser(currentUser);
          setError(null);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(errorMessage(caughtError, 'Failed to load user.'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { user, isLoading, error };
}
