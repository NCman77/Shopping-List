export async function rollbackUploadedFiles(fileIds, deletePhoto, queueCleanup) {
  for (const fileId of fileIds) {
    try {
      await deletePhoto(fileId);
    } catch {
      try {
        await queueCleanup(fileId);
      } catch {
        // Rollback is best-effort; callers must retain the triggering error.
      }
    }
  }
}

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

  await rollbackUploadedFiles(uploadedFileIds, deletePhoto, queueCleanup);
  throw failed;
}

export async function runPhotoUploadTransaction(options) {
  const { persist, deletePhoto, queueCleanup } = options;
  if (typeof persist !== 'function') throw new TypeError('persist is required.');
  const uploads = await uploadPhotosWithRollback(options);
  try {
    return await persist(uploads);
  } catch (error) {
    await rollbackUploadedFiles(
      uploads.map((entry) => entry?.id).filter(Boolean),
      deletePhoto,
      queueCleanup
    );
    throw error;
  }
}
