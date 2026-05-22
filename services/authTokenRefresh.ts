import { auth } from './firebase';

let forcedTokenRefreshUid: string | null = null;

export function resetForcedTokenRefreshUid(): void {
  forcedTokenRefreshUid = null;
}

/** Force-refresh ID token only the first time for each uid in this JS session. */
export async function getIdTokenForceOnce(uid: string): Promise<string> {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) {
    return user?.getIdToken() ?? '';
  }
  if (forcedTokenRefreshUid === uid) {
    return user.getIdToken();
  }
  forcedTokenRefreshUid = uid;
  return user.getIdToken(true);
}
