import type { MediaType } from 'expo-image-picker';

/**
 * Values for `launchImageLibraryAsync({ mediaTypes })` / `launchCameraAsync`.
 * Replaces deprecated {@link import('expo-image-picker').MediaTypeOptions}.
 *
 * Note: Expo exports `MediaType` only as a type (`'images' | 'videos' | 'livePhotos'`),
 * not as `ImagePicker.MediaType.Images` on the module namespace.
 */
export const PickerMediaType: {
  readonly Images: MediaType;
  readonly Videos: MediaType;
  readonly LivePhotos: MediaType;
} = {
  Images: 'images',
  Videos: 'videos',
  LivePhotos: 'livePhotos',
};

/** Same as legacy `MediaTypeOptions.All` (images + videos). */
export const PickerMediaTypeAll: [MediaType, MediaType] = [
  PickerMediaType.Images,
  PickerMediaType.Videos,
];
