export async function uploadPhotosWithRollback({
  photos,
  concurrency = 2,
  uploadPhoto,
  deletePhoto,
  queueCleanup
}) {
  const values = Array.isArray(photos) ? photos : [];
  if (!values.length) return [];
  if (typeof uploadPhoto !== 'function') throw new TypeError('uploadPhoto is required.');
  if (typeof deletePhoto !== 'function') throw new TypeError('deletePhoto is required.');
  if (typeof queueCleanup !== 'function') throw new TypeError('queueCleanup is required.');

  const limit = Math.max(1, Math.min(Number(concurrency) || 1, values.length));
  const results = new Array(values.length);
  const uploadedFileIds = [];
  let cursor = 0;
  let failed = null;

  async function worker() {
    while (!failed) {
      const index = cursor++;
      if (index >= values.length) return;
      try {
        const result = await uploadPhoto(values[index], index);
        results[index] = result;
        const fileId = result?.id;
        if (fileId) uploadedFileIds.push(fileId);
      } catch (error) {
        failed = error;
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));

  if (!failed) return results;

  for (const fileId of uploadedFileIds) {
    try {
      await deletePhoto(fileId);
    } catch {
      queueCleanup(fileId);
    }
  }

  throw failed;
}
