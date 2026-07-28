/**
 * Shared active-workspace state (navigation preference only).
 * Persists to AsyncStorage; does not write Firestore roles.
 *
 * Hydration is idempotent: once ready for a uid, readiness is never cleared
 * unless the user signs out or a different uid hydrates.
 */
import {
  getActiveWorkspace,
  loadAvailableWorkspaces,
  resolveRoutingWorkspace,
  setActiveWorkspace as persistActiveWorkspace,
  type ActiveWorkspace,
} from '@/services/activeWorkspace';
import { create } from 'zustand';

type ActiveWorkspaceState = {
  uid: string | null;
  ready: boolean;
  /** True while the first hydrate for the current uid is in flight. */
  hydrating: boolean;
  activeWorkspace: ActiveWorkspace | null;
  availableWorkspaces: ActiveWorkspace[];
  firestoreRole: string | null | undefined;
  hydrate: (uid: string | null, firestoreRole: string | null | undefined) => Promise<void>;
  switchWorkspace: (workspace: ActiveWorkspace) => Promise<void>;
};

/** Monotonic token — stale async completions must not rewrite latched state. */
let hydrateGeneration = 0;

function mergeAvailable(
  current: ActiveWorkspace[],
  firestoreRole: string | null | undefined,
): ActiveWorkspace[] {
  const set = new Set<ActiveWorkspace>(current);
  set.add('user');
  if (firestoreRole === 'driver') set.add('driver');
  if (firestoreRole === 'restaurant' || firestoreRole === 'host') {
    set.add('restaurant');
  }
  return (['user', 'driver', 'restaurant'] as const).filter((w) => set.has(w));
}

export const useActiveWorkspaceStore = create<ActiveWorkspaceState>((set, get) => ({
  uid: null,
  ready: false,
  hydrating: false,
  activeWorkspace: null,
  availableWorkspaces: ['user'],
  firestoreRole: null,

  async hydrate(uid, firestoreRole) {
    if (!uid) {
      hydrateGeneration += 1;
      set({
        uid: null,
        ready: true,
        hydrating: false,
        activeWorkspace: null,
        availableWorkspaces: ['user'],
        firestoreRole: null,
      });
      return;
    }

    const prev = get();

    // Latched for this uid — never clear ready. Soft-update role only.
    if (prev.uid === uid && prev.ready) {
      if (firestoreRole != null && firestoreRole !== prev.firestoreRole) {
        set({
          firestoreRole,
          availableWorkspaces: mergeAvailable(
            prev.availableWorkspaces,
            firestoreRole,
          ),
        });
      }
      return;
    }

    // First hydrate already in flight for this uid — do not reset ready.
    if (prev.uid === uid && prev.hydrating) {
      return;
    }

    const gen = ++hydrateGeneration;
    const switchingUser = prev.uid !== uid;

    set({
      uid,
      hydrating: true,
      firestoreRole: firestoreRole ?? prev.firestoreRole,
      // Only drop ready when switching accounts — never flap for same uid.
      ...(switchingUser
        ? {
            ready: false,
            activeWorkspace: null,
            availableWorkspaces: ['user'] as ActiveWorkspace[],
          }
        : {}),
    });

    try {
      const [stored, workspaces] = await Promise.all([
        getActiveWorkspace(uid),
        loadAvailableWorkspaces(uid, firestoreRole),
      ]);

      if (gen !== hydrateGeneration || get().uid !== uid) return;

      const current = get();
      // If something else already latched this uid, do not overwrite.
      if (current.ready && current.uid === uid) {
        set({ hydrating: false });
        return;
      }

      const next =
        stored && workspaces.includes(stored)
          ? stored
          : resolveRoutingWorkspace(
              firestoreRole ?? current.firestoreRole,
              current.activeWorkspace,
            );

      set({
        uid,
        ready: true,
        hydrating: false,
        firestoreRole: firestoreRole ?? current.firestoreRole,
        availableWorkspaces: workspaces,
        activeWorkspace: next,
      });
    } catch {
      if (gen !== hydrateGeneration || get().uid !== uid) return;
      const current = get();
      set({
        ready: true,
        hydrating: false,
        activeWorkspace:
          current.activeWorkspace ??
          resolveRoutingWorkspace(firestoreRole, null),
        availableWorkspaces: mergeAvailable(
          current.availableWorkspaces,
          firestoreRole,
        ),
      });
    }
  },

  async switchWorkspace(workspace) {
    const { uid } = get();
    if (!uid) return;
    await persistActiveWorkspace(uid, workspace);
    set({ activeWorkspace: workspace });
  },
}));

export function selectRoutingWorkspace(state: ActiveWorkspaceState): ActiveWorkspace {
  return resolveRoutingWorkspace(state.firestoreRole, state.activeWorkspace);
}
