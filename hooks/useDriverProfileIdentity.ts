import {
  resolveDriverProfileIdentity,
  type ResolvedDriverProfileIdentity,
} from '@/lib/driverProfileIdentity';
import { auth, db } from '@/services/firebase';
import { doc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

type DriverProfileIdentityState = ResolvedDriverProfileIdentity & {
  loading: boolean;
};

const EMPTY_IDENTITY: DriverProfileIdentityState = {
  displayName: 'Driver',
  phoneRaw: null,
  phoneDisplay: 'Add phone number',
  photoURL: null,
  loading: true,
};

export function useDriverProfileIdentity(uid: string | null | undefined): DriverProfileIdentityState {
  const [userDoc, setUserDoc] = useState<DocumentData | undefined>(undefined);
  const [driverDoc, setDriverDoc] = useState<DocumentData | undefined>(undefined);
  const [userLoaded, setUserLoaded] = useState(false);
  const [driverLoaded, setDriverLoaded] = useState(false);

  useEffect(() => {
    if (!uid) {
      setUserDoc(undefined);
      setDriverDoc(undefined);
      setUserLoaded(true);
      setDriverLoaded(true);
      return;
    }

    setUserLoaded(false);
    setDriverLoaded(false);

    const userRef = doc(db, 'users', uid);
    const driverRef = doc(db, 'drivers', uid);

    const unsubUser = onSnapshot(
      userRef,
      (snap) => {
        setUserDoc(snap.exists() ? snap.data() : undefined);
        setUserLoaded(true);
      },
      () => {
        setUserDoc(undefined);
        setUserLoaded(true);
      },
    );

    const unsubDriver = onSnapshot(
      driverRef,
      (snap) => {
        setDriverDoc(snap.exists() ? snap.data() : undefined);
        setDriverLoaded(true);
      },
      () => {
        setDriverDoc(undefined);
        setDriverLoaded(true);
      },
    );

    return () => {
      unsubUser();
      unsubDriver();
    };
  }, [uid]);

  return useMemo(() => {
    if (!uid) {
      return { ...EMPTY_IDENTITY, loading: false };
    }
    const identity = resolveDriverProfileIdentity({
      authUser: auth.currentUser,
      userDoc,
      driverDoc,
    });
    return {
      ...identity,
      loading: !userLoaded || !driverLoaded,
    };
  }, [uid, userDoc, driverDoc, userLoaded, driverLoaded]);
}
