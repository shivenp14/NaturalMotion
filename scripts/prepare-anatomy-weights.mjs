import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { MathUtils, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { smoothSkinWeights } from '../src/anatomy/smoothSkinWeights.ts';
import vocabulary from '../assets/models/heatsy/muscles.json' with { type: 'json' };

async function main() {
  const source = await readFile('assets/models/heatsy/body.glb');
  assert.equal(createHash('sha256').update(source).digest('hex'), 'ce9859de013c2ee9713dbe3158275208b57be1b4ff31957eca87195b991c0ab1', 'Inspect a changed source asset before adapting its weights.');
  const gltf = await new GLTFLoader().parseAsync(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), '');
  const meshes = [];
  gltf.scene.traverse((object) => { if (object.isSkinnedMesh) meshes.push(object); });
  assert.equal(meshes.length, 1);
  const mesh = meshes[0];
  const smoothed = smoothSkinWeights(mesh.geometry, mesh.skeleton.bones.length, 64);
  // Preserve the broad torso origins of the superficial trapezius, lats and
  // pecs. The source auto-rig lets some medial vertices follow the arm/scapula,
  // opening the spine/sternum seam when the arms rise. These continuous masks
  // are authored visual anchors, not anatomical force/activation estimates.
  const partIds = mesh.geometry.getAttribute('_part_id');
  const point = new Vector3();
  const boneIndex = (name) => {
    const index = mesh.skeleton.bones.findIndex((bone) => bone.name === name);
    assert.ok(index >= 0, `Missing anchor bone ${name}`);
    return index;
  };
  const torsoIndex = boneIndex('spine_03');
  const movingIndices = {
    L: { clavicle: boneIndex('clavicleL'), scapula: boneIndex('scapulaL'), upperarm: boneIndex('upperarmL') },
    R: { clavicle: boneIndex('clavicleR'), scapula: boneIndex('scapulaR'), upperarm: boneIndex('upperarmR') },
  };
  for (let vertex = 0; vertex < partIds.count; vertex++) {
    const code = partIds.getX(vertex);
    const part = vocabulary.parts[Math.floor((code - 1) / 2)];
    if (!part || !['trapezius', 'latissimus_dorsi', 'pectoralis_major'].includes(part.muscle)) continue;
    mesh.getVertexPosition(vertex, point);
    const x = Math.abs(point.x);
    const side = code % 2 === 1 ? 'L' : 'R';
    let influence;
    let movingIndex;
    if (part.muscle === 'trapezius') {
      influence = MathUtils.smoothstep(x, 0.035, 0.16);
      movingIndex = part.id === 'trapezius_upper' ? movingIndices[side].clavicle : movingIndices[side].scapula;
    } else if (part.muscle === 'latissimus_dorsi') {
      influence = MathUtils.smoothstep(x, 0.065, 0.19) * MathUtils.smoothstep(point.y, 1.14, 1.39);
      movingIndex = movingIndices[side].upperarm;
    } else {
      influence = MathUtils.smoothstep(x, 0.035, 0.20) * MathUtils.smoothstep(point.y, 1.18, 1.38);
      movingIndex = movingIndices[side].upperarm;
    }
    smoothed.indices.setXYZW(vertex, torsoIndex, movingIndex, 0, 0);
    smoothed.weights.setXYZW(vertex, 1 - influence, influence, 0, 0);
  }
  const jsonLength = source.readUInt32LE(12);
  const glb = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
  const result = Buffer.from(source);
  const binaryStart = 20 + jsonLength + 8;
  for (const name of ['JOINTS_0', 'WEIGHTS_0']) {
    const accessor = glb.accessors[glb.meshes[0].primitives[0].attributes[name]];
    const view = glb.bufferViews[accessor.bufferView];
    assert.equal(accessor.componentType, 5121, 'This adapter preserves the source unsigned-byte encoding.');
    assert.equal(accessor.count, smoothed.weights.count);
    if (name === 'WEIGHTS_0') assert.equal(accessor.normalized, true);
    const attribute = name === 'JOINTS_0' ? smoothed.indices : smoothed.weights;
    for (let vertex = 0; vertex < accessor.count; vertex++) {
      const values = [0, 1, 2, 3].map((slot) => Math.round(attribute.getComponent(vertex, slot) * (name === 'WEIGHTS_0' ? 255 : 1)));
      if (name === 'WEIGHTS_0') {
        const largest = values.indexOf(Math.max(...values));
        values[largest] += 255 - values.reduce((sum, value) => sum + value, 0);
      }
      const start = binaryStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + vertex * (view.byteStride ?? 4);
      values.forEach((value, slot) => result.writeUInt8(value, start + slot));
    }
  }
  await writeFile('assets/models/heatsy/body-smoothed.glb', result);
  console.log(`Wrote body-smoothed.glb (${result.length} bytes), SHA-256 ${createHash('sha256').update(result).digest('hex')}`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
