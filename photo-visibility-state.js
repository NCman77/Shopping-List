export function getPhotoVisibilityState({ photoUrl = '', hasDrivePhoto = false, hasDriveToken = false } = {}) {
  const src = String(photoUrl || '').trim();
  if (src) {
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

export function shouldBackfillPhotoThumbnail({ photoUrl = '', hasDrivePhoto = false, hasDriveToken = false } = {}) {
  return !String(photoUrl || '').trim() && Boolean(hasDrivePhoto) && Boolean(hasDriveToken);
}
