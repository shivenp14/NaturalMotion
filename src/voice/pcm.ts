const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** PCM16 little-endian mono; no Node Buffer dependency in the mobile bundle. */
export function encodePcm16(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, index) => {
    const value = Math.max(-1, Math.min(1, Number.isFinite(sample) ? sample : 0));
    view.setInt16(index * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  });
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index], b = bytes[index + 1] ?? 0, c = bytes[index + 2] ?? 0;
    encoded += alphabet[a >> 2] + alphabet[((a & 3) << 4) | (b >> 4)] +
      (index + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)] : '=') +
      (index + 2 < bytes.length ? alphabet[c & 63] : '=');
  }
  return encoded;
}
