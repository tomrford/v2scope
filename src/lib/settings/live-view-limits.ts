export const computeLiveFrameFloorHz = (
  durationS: number,
  minSamples: number = 60,
  maxHz: number = 50,
): number => {
  const duration = Math.max(1, durationS);
  const floor = Math.ceil(minSamples / duration);
  return Math.max(1, Math.min(maxHz, floor));
};

export const normalizeFrameHz = (
  frameHz: number,
  durationS: number,
  maxHz: number = 50,
): number => {
  const floor = computeLiveFrameFloorHz(durationS, 60, maxHz);
  const bounded = Math.max(1, Math.min(maxHz, Math.round(frameHz)));
  return Math.max(floor, bounded);
};
