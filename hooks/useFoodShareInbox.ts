import { subscribeUnreadInboxCount } from '@/services/foodShareInbox';
import { useEffect, useState } from 'react';

export function useFoodShareUnreadCount(uid: string | null | undefined): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!uid) {
      setCount(0);
      return undefined;
    }
    return subscribeUnreadInboxCount(uid, setCount);
  }, [uid]);
  return count;
}
