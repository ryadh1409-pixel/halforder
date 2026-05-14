import { Platform, type ViewStyle } from 'react-native';

/**
 * iOS: `shadow*` — Android: `elevation` — Web: CSS `boxShadow` (avoids deprecated web shadow props).
 */
export function platformElevation(opts: {
  web: string;
  ios: Pick<
    ViewStyle,
    'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius'
  >;
  android: Pick<ViewStyle, 'elevation'>;
}): ViewStyle {
  if (Platform.OS === 'web') {
    return { boxShadow: opts.web };
  }
  if (Platform.OS === 'android') {
    return opts.android;
  }
  return opts.ios;
}
