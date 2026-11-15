/* Three JSX is rendered by R3F, not the DOM. */
/* eslint-disable react/no-unknown-property */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { DoubleSide } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { anatomyAppearance } from './appearance';
import { bodyAssetUri } from './modelAsset';
import { prepareAnatomyModel } from './prepareModel';
import { anatomyViewAngles, type AnatomyFocus, type AnatomyView } from './regions';
import { createWallAngelRig, sampleWallAngelCycle, type WallAngelPreview } from './wallAngel';
import type { PlaybackState } from '../shared/contracts';
import { createPlaybackReporter, sampleUpperBodyProgram, type UpperBodyProgram } from './upperBodySequence';

export type AnatomySceneProps = {
  focus: AnatomyFocus;
  view: AnatomyView;
  onReady: () => void;
  preview?: WallAngelPreview;
  onPreviewComplete?: () => void;
  program?: UpperBodyProgram | null;
  playbackPaused?: boolean;
  onPlaybackChange?: (state: PlaybackState) => void;
};

export function AnatomyScene({ focus, view, onReady, preview, onPreviewComplete, program, playbackPaused = false, onPlaybackChange }: AnatomySceneProps) {
  const gltf = useLoader(GLTFLoader, bodyAssetUri);
  const model = useMemo(() => prepareAnatomyModel(gltf.scene), [gltf.scene]);
  const rig = useMemo(() => createWallAngelRig(model.scene), [model]);
  const invalidate = useThree((state) => state.invalidate);
  const camera = useThree((state) => state.camera);
  const elapsed = useRef(0);
  const previousMode = useRef<WallAngelPreview['mode']>('rest');
  const firstFrame = useRef(true);
  const running = useRef(false);
  const programTime = useRef(0);
  const programDone = useRef(false);
  const focusedStep = useRef(-1);
  const callback = useRef(onPlaybackChange);
  useLayoutEffect(() => { callback.current = onPlaybackChange; }, [onPlaybackChange]);
  const report = useRef<ReturnType<typeof createPlaybackReporter> | null>(null);
  const movementVisible = !!program || (!!preview && preview.mode !== 'rest');
  useLayoutEffect(() => {
    programTime.current = 0;
    programDone.current = false;
    focusedStep.current = -1;
    firstFrame.current = true;
    report.current = program ? createPlaybackReporter(program.id, (state) => callback.current?.(state)) : null;
    if (program) { rig.beginPreparation(); rig.prepare(0); }
    invalidate();
  }, [program, rig, invalidate]);
  useLayoutEffect(() => {
    if (!program || !report.current || programDone.current) return;
    const sample = programTime.current < 1 ? { stepIndex: 0, phase: 'preparing' as const } : sampleUpperBodyProgram(program, programTime.current - 1);
    report.current(sample.stepIndex, sample.phase, playbackPaused ? 'paused' : 'playing', Date.now());
    firstFrame.current = true;
    invalidate();
  }, [program, playbackPaused, invalidate]);
  useLayoutEffect(() => {
    camera.position.set(0, movementVisible ? 1.03 : 0.86, movementVisible ? 4.6 : 3.65);
    camera.lookAt(0, movementVisible ? 1.03 : 0.86, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, movementVisible, invalidate]);
  useLayoutEffect(() => {
    if (program) { running.current = false; return; }
    const mode = preview?.mode ?? 'rest';
    running.current = mode === 'playing';
    if (mode === 'rest') {
      rig.reset();
      elapsed.current = 0;
    } else if (mode === 'playing') {
      if (previousMode.current !== 'paused') elapsed.current = 0;
      firstFrame.current = true;
      rig.apply(sampleWallAngelCycle(elapsed.current, preview!.parameters).progress, preview!.parameters);
    } else if (mode !== 'paused') {
      elapsed.current = 0;
      rig.apply(mode === 'top' ? 1 : mode === 'midpoint' ? 0.5 : 0, preview!.parameters);
    }
    previousMode.current = mode;
    invalidate();
  }, [rig, preview, program, invalidate]);
  useFrame((_, delta) => {
    if (program && report.current) {
      if (playbackPaused || programDone.current) return;
      if (firstFrame.current) firstFrame.current = false;
      else programTime.current += Math.min(delta, 0.1);
      if (programTime.current < 1) {
        rig.prepare(programTime.current);
      } else {
        const sample = sampleUpperBodyProgram(program, programTime.current - 1);
        rig.applyPose(sample.pose);
        if (focusedStep.current !== sample.stepIndex) {
          model.setFocusCodes(program.segments[sample.stepIndex].focusCodes);
          focusedStep.current = sample.stepIndex;
        }
        report.current(sample.stepIndex, sample.phase, sample.completed ? 'completed' : 'playing', Date.now());
        programDone.current = sample.completed;
      }
      if (!programDone.current) invalidate();
      return;
    }
    if (!running.current || !preview) return;
    // The first demand frame may follow a long idle; background stalls must
    // not jump through an entire demonstration either.
    if (firstFrame.current) firstFrame.current = false;
    else elapsed.current += Math.min(delta, 0.1);
    const sample = sampleWallAngelCycle(elapsed.current, preview.parameters);
    rig.apply(sample.progress, preview.parameters);
    if (sample.completed) {
      running.current = false;
      onPreviewComplete?.();
    } else invalidate();
  });
  useLayoutEffect(() => {
    if (program) {
      const index = programTime.current < 1 ? 0 : sampleUpperBodyProgram(program, programTime.current - 1).stepIndex;
      model.setFocusCodes(program.segments[index].focusCodes);
      focusedStep.current = index;
    } else model.setFocus(focus);
    invalidate();
  }, [model, focus, program, invalidate]);
  useEffect(() => {
    onReady();
    return () => model.dispose();
  }, [model, onReady]);
  return (
    <>
      <color attach="background" args={[anatomyAppearance.background]} />
      <hemisphereLight args={['#ffffff', '#303030', 1.15]} />
      <directionalLight position={[-2, 3, 4]} intensity={2.4} color="#ffffff" />
      <directionalLight position={[2, 1.5, 3]} intensity={0.65} color="#ffffff" />
      <directionalLight position={[1, 2, -3]} intensity={1.8} color="#ffffff" />
      <group rotation={[0, anatomyViewAngles[view], 0]}>
        {movementVisible && (
          <mesh position={[0, 1, -0.16]}>
            <planeGeometry args={[1.55, 2.1]} />
            <meshBasicMaterial color="#52616a" side={DoubleSide} transparent opacity={0.12} depthWrite={false} />
          </mesh>
        )}
        <primitive object={model.scene} dispose={null} />
      </group>
    </>
  );
}
