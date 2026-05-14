import type { StyleProp, ViewStyle } from 'react-native';

export type LatLng = { latitude: number; longitude: number };
export type MapRegion = LatLng & { latitudeDelta: number; longitudeDelta: number };

export type MapRendererMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  pinColor?: string;
  rotation?: number;
  flat?: boolean;
  anchor?: { x: number; y: number };
  /** Native-only custom marker chrome */
  variant?: 'driver' | 'destination' | 'default';
};

export type MapRendererPolyline = {
  id: string;
  coordinates: LatLng[];
  strokeColor: string;
  strokeWidth: number;
};

export type MapRendererProps = {
  style?: StyleProp<ViewStyle>;
  initialRegion: MapRegion;
  mapType?: 'standard' | 'satellite' | 'hybrid' | 'mutedStandard';
  useGoogleProviderOnAndroid?: boolean;
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  toolbarEnabled?: boolean;
  pointerEvents?: 'box-none' | 'none' | 'auto' | 'box-only';
  markers?: MapRendererMarker[];
  polylines?: MapRendererPolyline[];
  userInterfaceStyle?: 'light' | 'dark';
  fitToCoordinates?: LatLng[];
  fitEdgePadding?: { top: number; right: number; bottom: number; left: number };
  /** Web-only: route / ETA cards */
  webTitle?: string;
  webSubtitle?: string;
  webEtaText?: string;
  webFromCoordsText?: string;
  webToCoordsText?: string;
  webOpenMapsUrl?: string;
};
