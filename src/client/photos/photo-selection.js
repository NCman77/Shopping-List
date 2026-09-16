export function acceptCompressedPhoto({
  selectionGeneration,
  currentGeneration,
  compressed,
  revoke = () => {}
} = {}) {
  if (selectionGeneration !== currentGeneration) {
    if (compressed) revoke(compressed);
    return null;
  }
  return compressed;
}
