const DEFAULTS = { maxEdge: 1280, quality: 0.82 };

export function calculateContainedSize(width, height, maxEdge = DEFAULTS.maxEdge) {
  if (![width, height, maxEdge].every(Number.isFinite) || width <= 0 || height <= 0 || maxEdge <= 0) {
    throw new RangeError('圖片尺寸必須是正數。');
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

export function calculateWidthBoundSize(width, height, maxWidth = 1280) {
  if (![width, height, maxWidth].every(Number.isFinite) || width <= 0 || height <= 0 || maxWidth <= 0) {
    throw new RangeError('圖片尺寸必須是正數。');
  }
  const scale = Math.min(1, maxWidth / width);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw(ctx, width, height) { ctx.drawImage(bitmap, 0, 0, width, height); },
      cleanup() { bitmap.close?.(); }
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw(ctx, width, height) { ctx.drawImage(image, 0, 0, width, height); },
      cleanup() { URL.revokeObjectURL(objectUrl); }
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function encodeResizedImage(file, sizeResolver, quality) {
  let decoded;
  try {
    decoded = await decodeImage(file);
    const size = sizeResolver(decoded.width, decoded.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new TypeError('無法建立圖片畫布。');
    decoded.draw(ctx, size.width, size.height);

    let blob = await canvasToBlob(canvas, 'image/webp', quality);
    let mimeType = 'image/webp';
    if (!blob) {
      blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      mimeType = 'image/jpeg';
    }
    if (!blob) throw new TypeError('無法輸出壓縮圖片。');

    return {
      blob,
      mimeType,
      width: size.width,
      height: size.height,
      size: blob.size,
      previewUrl: URL.createObjectURL(blob)
    };
  } catch {
    throw new TypeError('無法讀取這張照片。');
  } finally {
    decoded?.cleanup?.();
  }
}

export async function compressImage(file, options = {}) {
  const maxEdge = options.maxEdge ?? DEFAULTS.maxEdge;
  const quality = options.quality ?? DEFAULTS.quality;
  return encodeResizedImage(file, (width, height) => calculateContainedSize(width, height, maxEdge), quality);
}

export async function compressImageToWidth(file, options = {}) {
  const maxWidth = options.maxWidth ?? 1280;
  const quality = options.quality ?? 0.74;
  return encodeResizedImage(file, (width, height) => calculateWidthBoundSize(width, height, maxWidth), quality);
}

export function revokeCompressedImage(photo) {
  if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
}
