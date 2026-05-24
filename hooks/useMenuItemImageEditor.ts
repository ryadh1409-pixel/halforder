import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { setFoodItemImage } from '@/services/foodService';
import {
  deleteLegacyMenuItemImage,
  pickMenuImageFromLibrary,
  uploadMenuItemImage,
  type MenuImageUploadProgress,
} from '@/services/menuImageService';
import { menuImageDisplayUri } from '@/utils/menuImageUrl';
import { getReadableErrorMessage } from '@/utils/errorMessages';
import { showError, showSuccess } from '@/utils/toast';

export type UseMenuItemImageEditorOptions = {
  restaurantId: string | undefined;
  /** Known when editing; omitted for new items until after first save. */
  itemId: string | undefined;
  initialImageUrl: string | null;
  initialUpdatedAtMs?: number | null;
  /** When false, in-flight uploads are aborted (e.g. modal closed). */
  active?: boolean;
};

export type UseMenuItemImageEditorResult = {
  /** URI for `<Image source={{ uri }} />` — local preview wins over remote. */
  displayUri: string | null;
  /** Download URL ready to persist (after upload completes). */
  committedImageUrl: string | null;
  isPicking: boolean;
  isUploading: boolean;
  uploadProgress: number;
  canSave: boolean;
  pickImage: () => Promise<void>;
  /**
   * Upload pending local image and write Firestore when `itemId` exists.
   * For new items, call after `addFoodItem` returns an id.
   */
  finalizeImageForItem: (itemId: string) => Promise<string | null>;
  reset: (imageUrl?: string | null, updatedAtMs?: number | null) => void;
};

export function useMenuItemImageEditor(
  options: UseMenuItemImageEditorOptions,
): UseMenuItemImageEditorResult {
  const {
    restaurantId,
    itemId,
    initialImageUrl,
    initialUpdatedAtMs,
    active = true,
  } = options;

  const [localPreviewUri, setLocalPreviewUri] = useState<string | null>(null);
  const [committedImageUrl, setCommittedImageUrl] = useState<string | null>(
    initialImageUrl,
  );
  const [updatedAtMs, setUpdatedAtMs] = useState<number | null>(
    initialUpdatedAtMs ?? null,
  );
  const [isPicking, setIsPicking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const mountedRef = useRef(true);
  const uploadAbortRef = useRef({ aborted: false });
  const previousImageRef = useRef<string | null>(initialImageUrl);
  const uploadGenerationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      uploadAbortRef.current.aborted = true;
    };
  }, []);

  useEffect(() => {
    if (!active) {
      uploadAbortRef.current.aborted = true;
      uploadGenerationRef.current += 1;
      uploadAbortRef.current = { aborted: false };
      if (mountedRef.current) {
        setIsUploading(false);
        setIsPicking(false);
        setUploadProgress(0);
      }
    }
  }, [active]);

  const reset = useCallback(
    (imageUrl?: string | null, nextUpdatedAtMs?: number | null) => {
      uploadAbortRef.current.aborted = true;
      uploadAbortRef.current = { aborted: false };
      uploadGenerationRef.current += 1;
      setLocalPreviewUri(null);
      setCommittedImageUrl(imageUrl ?? null);
      setUpdatedAtMs(nextUpdatedAtMs ?? null);
      setIsPicking(false);
      setIsUploading(false);
      setUploadProgress(0);
      previousImageRef.current = imageUrl ?? null;
    },
    [],
  );

  const displayUri = useMemo(() => {
    if (localPreviewUri) return localPreviewUri;
    return menuImageDisplayUri(committedImageUrl, updatedAtMs);
  }, [localPreviewUri, committedImageUrl, updatedAtMs]);

  const runUpload = useCallback(
    async (
      targetItemId: string,
      localUri: string,
      previousUrl: string | null,
    ): Promise<string> => {
      const rid = restaurantId?.trim();
      if (!rid) {
        throw new Error('Restaurant not loaded');
      }

      const generation = ++uploadGenerationRef.current;
      const abort = uploadAbortRef.current;

      setIsUploading(true);
      setUploadProgress(0);

      const onProgress = (p: MenuImageUploadProgress) => {
        if (!mountedRef.current || generation !== uploadGenerationRef.current) {
          return;
        }
        setUploadProgress(p.progress);
      };

      try {
        const downloadUrl = await uploadMenuItemImage({
          restaurantId: rid,
          itemId: targetItemId,
          localUri,
          onProgress,
          abort,
        });

        if (!mountedRef.current || generation !== uploadGenerationRef.current) {
          return downloadUrl;
        }

        await setFoodItemImage(rid, targetItemId, downloadUrl);
        if (__DEV__) {
          console.log('[menuImage] firestore updated', {
            restaurantId: rid,
            itemId: targetItemId,
          });
        }

        await deleteLegacyMenuItemImage({
          restaurantId: rid,
          itemId: targetItemId,
          previousImageUrl: previousUrl,
        });

        const now = Date.now();
        setCommittedImageUrl(downloadUrl);
        setUpdatedAtMs(now);
        setLocalPreviewUri(null);
        previousImageRef.current = downloadUrl;
        return downloadUrl;
      } finally {
        if (mountedRef.current && generation === uploadGenerationRef.current) {
          setIsUploading(false);
          setUploadProgress(0);
        }
      }
    },
    [restaurantId],
  );

  const pickImage = useCallback(async () => {
    if (!restaurantId?.trim()) {
      showError('Restaurant not loaded.');
      return;
    }
    if (isPicking || isUploading) return;

    setIsPicking(true);
    try {
      const picked = await pickMenuImageFromLibrary(0.85);
      if ('cancelled' in picked) return;

      setLocalPreviewUri(picked.localUri);

      const knownItemId = itemId?.trim();
      if (knownItemId) {
        try {
          await runUpload(knownItemId, picked.localUri, previousImageRef.current);
          showSuccess('Photo updated.');
        } catch (error) {
          const message = getReadableErrorMessage(error, 'upload');
          if (__DEV__) {
            console.warn('[menuImage] upload failed', error);
          }
          Alert.alert('Upload failed', message);
        }
      }
    } catch (error) {
      showError(getReadableErrorMessage(error, 'upload'));
    } finally {
      if (mountedRef.current) {
        setIsPicking(false);
      }
    }
  }, [restaurantId, itemId, isPicking, isUploading, runUpload]);

  const finalizeImageForItem = useCallback(
    async (targetItemId: string): Promise<string | null> => {
      const rid = restaurantId?.trim();
      const id = targetItemId.trim();
      if (!rid || !id) return committedImageUrl;

      if (localPreviewUri) {
        try {
          const url = await runUpload(id, localPreviewUri, previousImageRef.current);
          return url;
        } catch (error) {
          const message = getReadableErrorMessage(error, 'upload');
          if (__DEV__) {
            console.warn('[menuImage] finalize upload failed', error);
          }
          throw new Error(message);
        }
      }

      return committedImageUrl;
    },
    [restaurantId, localPreviewUri, committedImageUrl, runUpload],
  );

  const canSave = !isPicking && !isUploading;

  return {
    displayUri,
    committedImageUrl,
    isPicking,
    isUploading,
    uploadProgress,
    canSave,
    pickImage,
    finalizeImageForItem,
    reset,
  };
}
