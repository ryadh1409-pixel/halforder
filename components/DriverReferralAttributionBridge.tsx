import { applyPendingDriverReferralCode } from '@/services/driverReferralProgram';
import { useAuth } from '@/services/AuthContext';
import { useEffect, useRef } from 'react';

/** Applies install/deep-link attribution after a real customer account exists. */
export function DriverReferralAttributionBridge() {
  const { user } = useAuth();
  const attemptedUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || user.isAnonymous || attemptedUidRef.current === user.uid) return;
    attemptedUidRef.current = user.uid;
    void applyPendingDriverReferralCode();
  }, [user]);

  return null;
}
