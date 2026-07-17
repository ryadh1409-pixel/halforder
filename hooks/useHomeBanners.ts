import {
  subscribeActiveHomeBanners,
  subscribeHomeBannerSettings,
} from '@/services/homeBanners';
import type { HomeBannerDoc, HomeBannerSettings } from '@/types/homeBanner';
import { useEffect, useState } from 'react';

type State = {
  banners: HomeBannerDoc[];
  settings: HomeBannerSettings;
  loading: boolean;
};

/** Realtime Home banner carousel + global visibility setting. */
export function useHomeBanners(): State {
  const [banners, setBanners] = useState<HomeBannerDoc[]>([]);
  const [settings, setSettings] = useState<HomeBannerSettings>({ visible: true });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let bannersReady = false;
    let settingsReady = false;

    const maybeDone = () => {
      if (bannersReady && settingsReady) setLoading(false);
    };

    const unsubBanners = subscribeActiveHomeBanners(
      (rows) => {
        setBanners(rows);
        bannersReady = true;
        maybeDone();
      },
      () => {
        bannersReady = true;
        maybeDone();
      },
    );

    const unsubSettings = subscribeHomeBannerSettings(
      (next) => {
        setSettings(next);
        settingsReady = true;
        maybeDone();
      },
      () => {
        settingsReady = true;
        maybeDone();
      },
    );

    return () => {
      unsubBanners();
      unsubSettings();
    };
  }, []);

  return { banners, settings, loading };
}
