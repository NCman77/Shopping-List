export function getPhotoVisibilityState({
  photoUrl = '',
  persistentCoverId = '',
  driveCoverId = '',
  hasDriveToken = false
} = {}) {
  const src = String(photoUrl || '').trim();
  const persistedId = String(persistentCoverId || '').trim();
  const currentDriveId = String(driveCoverId || '').trim();
  const hasDrivePhoto = Boolean(currentDriveId);

  if (src && !persistedId) {
    return { mode: 'persistent', requiresAuthorization: false, src };
  }

  if (src && persistedId && persistedId === currentDriveId) {
    return { mode: 'persistent', requiresAuthorization: false, src };
  }

  if (!hasDrivePhoto) {
    return { mode: 'empty', requiresAuthorization: false, src: '' };
  }

  if (hasDriveToken) {
    return { mode: 'drive', requiresAuthorization: false, src: '' };
  }

  return { mode: 'authorization-required', requiresAuthorization: true, src: '' };
}

export function shouldBackfillPhotoThumbnail({
  photoUrl = '',
  persistentCoverId = '',
  driveCoverId = '',
  hasDriveToken = false
} = {}) {
  if (!hasDriveToken || !String(driveCoverId || '').trim()) return false;
  return !String(photoUrl || '').trim() || String(persistentCoverId || '').trim() !== String(driveCoverId || '').trim();
}

export function shouldClearPersistentThumbnail({ photoUrl = '', persistentCoverId = '', driveCoverId = '' } = {}) {
  return Boolean(String(photoUrl || '').trim() && String(persistentCoverId || '').trim() && !String(driveCoverId || '').trim());
}
