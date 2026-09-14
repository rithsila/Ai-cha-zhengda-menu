export type SniffedImage = {
  mime: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  ext: '.png' | '.jpg' | '.gif' | '.webp';
};

/** Detects the real image type from leading bytes; null if not an allowed raster image. */
export function sniffImageType(buf: Buffer): SniffedImage | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: '.png' };
  }

  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: '.jpg' };
  }

  if (
    buf.length >= 6 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    ((buf[4] === 0x37 && buf[5] === 0x61) || (buf[4] === 0x39 && buf[5] === 0x61))
  ) {
    return { mime: 'image/gif', ext: '.gif' };
  }

  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: '.webp' };
  }

  return null;
}
