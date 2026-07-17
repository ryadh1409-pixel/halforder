/** Admin-managed promotional banner shown on the marketplace Home screen. */
export type HomeBannerDoc = {
  id: string;
  imageUrl: string;
  /** Small badge above headline (optional). */
  badgeText: string;
  headline: string;
  subtitle: string;
  /** CTA pill label (optional). */
  buttonText: string;
  /** In-app route (`/(tabs)/search`) or external URL (optional). */
  buttonDestination: string;
  sortOrder: number;
  /** When false, banner is hidden from the Home carousel. */
  active: boolean;
};

export type HomeBannerSettings = {
  /** When false, the entire Home banner section is hidden. */
  visible: boolean;
};
