import {
  selectRoutingWorkspace,
  useActiveWorkspaceStore,
} from '@/store/activeWorkspaceStore';
import { useAuth } from '@/services/AuthContext';
import { useEffect } from 'react';

/**
 * Active workspace preference for multi-role switching (local only).
 * Hydrates from Auth + AsyncStorage into a shared store (idempotent).
 */
export function useActiveWorkspace() {
  const { user, firestoreUserRole } = useAuth();
  const uid = user?.uid ?? null;

  const ready = useActiveWorkspaceStore((s) => s.ready);
  const storeUid = useActiveWorkspaceStore((s) => s.uid);
  const activeWorkspace = useActiveWorkspaceStore((s) => s.activeWorkspace);
  const availableWorkspaces = useActiveWorkspaceStore((s) => s.availableWorkspaces);
  const switchWorkspace = useActiveWorkspaceStore((s) => s.switchWorkspace);
  const routingWorkspace = useActiveWorkspaceStore(selectRoutingWorkspace);

  useEffect(() => {
    const state = useActiveWorkspaceStore.getState();
    // Skip no-op re-entry when this uid is already latched ready.
    if (
      uid &&
      state.uid === uid &&
      state.ready &&
      (firestoreUserRole == null || state.firestoreRole === firestoreUserRole)
    ) {
      return;
    }
    void useActiveWorkspaceStore.getState().hydrate(uid, firestoreUserRole);
  }, [uid, firestoreUserRole]);

  return {
    ready: !uid ? true : ready && storeUid === uid,
    activeWorkspace,
    availableWorkspaces,
    routingWorkspace,
    switchWorkspace,
  };
}
