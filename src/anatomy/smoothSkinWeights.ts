import { Float32BufferAttribute, Uint16BufferAttribute, type BufferGeometry } from 'three';

/**
 * The source auto-weights jump sharply across adjacent vertices. Diffuse them
 * over connected faces, keeping four normalized influences per vertex. This
 * is a cosmetic skinning correction, not a biomechanical muscle model.
 */
export function smoothSkinWeights(geometry: BufferGeometry, boneCount: number, passes = 16) {
  const indices = geometry.index;
  const sourceBones = geometry.getAttribute('skinIndex');
  const sourceWeights = geometry.getAttribute('skinWeight');
  if (!indices) throw new Error('Anatomy weight smoothing requires indexed geometry.');
  const count = sourceWeights.count;
  const degree = new Uint32Array(count);
  for (let face = 0; face < indices.count; face += 3) {
    for (let edge = 0; edge < 3; edge++) {
      degree[indices.getX(face + edge)] += 2;
    }
  }
  const offsets = new Uint32Array(count + 1);
  for (let i = 0; i < count; i++) offsets[i + 1] = offsets[i] + degree[i];
  const neighbors = new Uint32Array(offsets[count]);
  const cursor = offsets.slice();
  for (let face = 0; face < indices.count; face += 3) {
    for (let edge = 0; edge < 3; edge++) {
      const vertex = indices.getX(face + edge);
      neighbors[cursor[vertex]++] = indices.getX(face + (edge + 1) % 3);
      neighbors[cursor[vertex]++] = indices.getX(face + (edge + 2) % 3);
    }
  }
  let bones = new Uint16Array(count * 4);
  let weights = new Float32Array(count * 4);
  let nextBones = new Uint16Array(count * 4);
  let nextWeights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 4; k++) {
      bones[4 * i + k] = sourceBones.getComponent(i, k);
      weights[4 * i + k] = sourceWeights.getComponent(i, k);
    }
  }
  const sum = new Float32Array(boneCount);
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < count; i++) {
      sum.fill(0);
      const neighborScale = degree[i] ? 0.65 / degree[i] : 0;
      for (let k = 0; k < 4; k++) sum[bones[4 * i + k]] += weights[4 * i + k] * (degree[i] ? 0.35 : 1);
      for (let n = offsets[i]; n < offsets[i + 1]; n++) {
        const vertex = neighbors[n];
        for (let k = 0; k < 4; k++) sum[bones[4 * vertex + k]] += weights[4 * vertex + k] * neighborScale;
      }
      let total = 0;
      for (let k = 0; k < 4; k++) {
        let strongest = 0;
        for (let bone = 1; bone < boneCount; bone++) if (sum[bone] > sum[strongest]) strongest = bone;
        nextBones[4 * i + k] = strongest;
        nextWeights[4 * i + k] = sum[strongest];
        total += sum[strongest];
        sum[strongest] = 0;
      }
      for (let k = 0; k < 4; k++) nextWeights[4 * i + k] /= total || 1;
    }
    [bones, nextBones] = [nextBones, bones];
    [weights, nextWeights] = [nextWeights, weights];
  }
  return { indices: new Uint16BufferAttribute(bones, 4), weights: new Float32BufferAttribute(weights, 4) };
}
