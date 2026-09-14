import { compressImageToWidth, revokeCompressedImage } from './image-compression.js';

const MAX_PREVIEW_CHARS = 700000;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('無法建立商品詳情預覽圖。'));
    reader.readAsDataURL(blob);
  });
}

export function resolveDetailPhotoDisplay({
  previewDataUrl = '',
  homepagePhotoUrl = '',
  isCover = false,
  hasDriveToken = false
} = {}) {
  const preview = String(previewDataUrl || '').trim();
  if (preview) return { mode: 'persistent-preview', src: preview };

  if (hasDriveToken) return { mode: 'drive-backfill', src: '' };

  const homepage = String(homepagePhotoUrl || '').trim();
  if (isCover && homepage) return { mode: 'homepage-fallback', src: homepage };

  return { mode: 'authorization-required', src: '' };
}

export async function createDetailPhotoPreview(blob, {
  compress = compressImageToWidth,
  toDataUrl = blobToDataUrl,
  revoke = revokeCompressedImage,
  maxChars = MAX_PREVIEW_CHARS
} = {}) {
  const attempts = [
    { maxWidth: 1280, quality: 0.74 },
    { maxWidth: 1280, quality: 0.62 },
    { maxWidth: 1280, quality: 0.50 }
  ];

  for (const options of attempts) {
    let compressed = null;
    try {
      compressed = await compress(blob, options);
      const dataUrl = await toDataUrl(compressed.blob);
      if (dataUrl && dataUrl.length <= maxChars) {
        return {
          dataUrl,
          width: compressed.width,
          height: compressed.height
        };
      }
    } catch {
      // Detail previews are an optimization; the Drive photo remains the source of truth.
    } finally {
      if (compressed) revoke(compressed);
    }
  }

  return { dataUrl: '', width: 0, height: 0 };
}

export function createDetailPreviewBackfillService({
  downloadPhoto,
  createPreview = createDetailPhotoPreview,
  updatePreview
}) {
  if (typeof downloadPhoto !== 'function' || typeof createPreview !== 'function' || typeof updatePreview !== 'function') {
    throw new TypeError('Detail preview backfill dependencies must be functions.');
  }

  return {
    async backfillPhotos(photos = []) {
      let updated = 0;
      for (const photo of photos) {
        if (!photo || (photo.status && photo.status !== 'active')) continue;
        if (String(photo.previewDataUrl || '').trim()) continue;
        if (!photo.id || !photo.driveFileId) continue;

        const blob = await downloadPhoto(photo.driveFileId);
        const preview = await createPreview(blob);
        if (!preview?.dataUrl) continue;
        await updatePreview(photo.id, preview, photo);
        updated += 1;
      }
      return { updated };
    }
  };
}
