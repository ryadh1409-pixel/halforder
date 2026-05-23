import { useAuth } from '@/services/AuthContext';

/** Stable auth uid string for listener/provider dependencies. */
export function useAuthUid(): string {
  const { user } = useAuth();
  return user?.uid?.trim() ?? '';
}
