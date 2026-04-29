import { useAuth } from '@/services/AuthContext';
import { type UserRole } from '@/services/userService';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export function useRequireRole(allowedRoles: UserRole[]) {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/(auth)/login');
      return;
    }
    if (!role) return;
    if (!allowedRoles.includes(role)) {
      router.replace('/(tabs)');
    }
  }, [allowedRoles, loading, role, router, user]);

  return {
    loading,
    authorized: !!user && !!role && allowedRoles.includes(role),
  };
}

export const requireRole = useRequireRole;
