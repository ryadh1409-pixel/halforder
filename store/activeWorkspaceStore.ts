/**
 * Shared active-workspace state (navigation preference only).
 * Persists to AsyncStorage; does not write Firestore roles.
 *
 * Hydration waits for a known Firestore role before latching so a pre-approval
 * `user` preference cannot beat `driver` / `restaurant` after admin approval.
 */
import {
  getActiveWorkspace,
  loadAvailableWorkspaces,
  primaryWorkspaceForRole,
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
  /** Activate a newly granted workspace immediately (persist + latch in one step). */
  activateWorkspace: (
    uid: string,
    workspace: ActiveWorkspace,
    firestoreRole?: string | null,
  ) => Promise<void>;
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

function isPartnerRole(role: string | null | undefined): boolean {
  return role === 'driver' || role === 'restaurant' || role === 'host';
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

    // Soft-update after latch: adopt newly granted partner role immediately.
    if (prev.uid === uid && prev.ready) {
      if (firestoreRole != null && firestoreRole !== prev.firestoreRole) {
        const primary = primaryWorkspaceForRole(firestoreRole);
        const shouldAdoptPartnerShell =
          isPartnerRole(firestoreRole) &&
          (prev.activeWorkspace === 'user' ||
            prev.activeWorkspace == null ||
            !isPartnerRole(prev.firestoreRole));

        if (shouldAdoptPartnerShell) {
          await persistActiveWorkspace(uid, primary);
          set({
            firestoreRole,
            availableWorkspaces: mergeAvailable(
              prev.availableWorkspaces,
              firestoreRole,
            ),
            activeWorkspace: primary,
          });
          return;
        }

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

    // Do not latch shells until Firestore role is known — prevents defaulting
    // to customer before an approved driver/restaurant role arrives.
    if (firestoreRole == null) {
      if (prev.uid === uid && prev.hydrating) return;
      set({
        uid,
        hydrating: true,
        ready: false,
        firestoreRole: null,
        ...(prev.uid !== uid
          ? {
              activeWorkspace: null,
              availableWorkspaces: ['user'] as ActiveWorkspace[],
            }
          : {}),
      });
      return;
    }

    // First hydrate already in flight for this uid — do not reset ready.
    if (prev.uid === uid && prev.hydrating && prev.firestoreRole != null) {
      return;
    }

    const gen = ++hydrateGeneration;
    const switchingUser = prev.uid !== uid;

    set({
      uid,
      hydrating: true,
      firestoreRole,
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
      if (current.ready && current.uid === uid) {
        set({ hydrating: false });
        return;
      }

      const primary = primaryWorkspaceForRole(firestoreRole);
      // Partner Firestore role is source of truth — ignore stale pre-approval "user".
      const next: ActiveWorkspace =
        primary === 'driver' || primary === 'restaurant'
          ? primary
          : stored && workspaces.includes(stored)
            ? stored
            : resolveRoutingWorkspace(firestoreRole, current.activeWorkspace);

      await persistActiveWorkspace(uid, next);

      set({
        uid,
        ready: true,
        hydrating: false,
        firestoreRole,
        availableWorkspaces: workspaces,
        activeWorkspace: next,
      });
    } catch {
      if (gen !== hydrateGeneration || get().uid !== uid) return;
      const primary = primaryWorkspaceForRole(firestoreRole);
      set({
        ready: true,
        hydrating: false,
        activeWorkspace: primary,
        availableWorkspaces: mergeAvailable(
          get().availableWorkspaces,
          firestoreRole,
        ),
        firestoreRole,
      });
    }
  },

  async switchWorkspace(workspace) {
    const { uid } = get();
    if (!uid) return;
    await persistActiveWorkspace(uid, workspace);
    set({ activeWorkspace: workspace });
  },

  /**
   * Role was just granted in Firestore — make the workspace active now.
   * `hydrate` intentionally never overwrites a latched `activeWorkspace`, so a
   * freshly granted role needs this explicit activation to take effect without
   * an app restart.
   */
  async activateWorkspace(uid, workspace, firestoreRole) {
    const id = uid.trim();
    if (!id) return;

    await persistActiveWorkspace(id, workspace);

    const prev = get();
    const baseAvailable: ActiveWorkspace[] =
      prev.uid === id ? prev.availableWorkspaces : ['user'];
    const available = mergeAvailable(
      [...baseAvailable, workspace],
      firestoreRole ?? prev.firestoreRole,
    );

    hydrateGeneration += 1;
    set({
      uid: id,
      ready: true,
      hydrating: false,
      activeWorkspace: workspace,
      availableWorkspaces: available,
      firestoreRole: firestoreRole ?? prev.firestoreRole,
    });
  },
}));

export function selectRoutingWorkspace(state: ActiveWorkspaceState): ActiveWorkspace {
  return resolveRoutingWorkspace(state.firestoreRole, state.activeWorkspace);
}
