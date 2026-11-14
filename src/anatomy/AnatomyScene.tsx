/* Three JSX is rendered by R3F, not the DOM. */
/* eslint-disable react/no-unknown-property */
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { anatomyAppearance } from './appearance';
import { bodyAssetUri } from './modelAsset';
import { prepareAnatomyModel } from './prepareModel';
import { anatomyViewAngles, type AnatomyFocus, type AnatomyView } from './regions';

export type AnatomySceneProps = {
  focus: AnatomyFocus;
  view: AnatomyView;
  onReady: () => void;
};

export function AnatomyScene({ focus, view, onReady }: AnatomySceneProps) {
  const gltf = useLoader(GLTFLoader, bodyAssetUri);
  const model = useMemo(() => prepareAnatomyModel(gltf.scene), [gltf.scene]);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    model.setFocus(focus);
    invalidate();
  }, [model, focus, invalidate]);
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
        <primitive object={model.scene} dispose={null} />
      </group>
    </>
  );
}
