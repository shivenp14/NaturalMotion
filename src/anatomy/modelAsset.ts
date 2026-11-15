import { Asset } from 'expo-asset';
import bodyAsset from '../../assets/models/heatsy/body-smoothed.glb';

// Static import lets Metro bundle the real model in Android/web exports.
export const bodyAssetUri = Asset.fromModule(bodyAsset).uri;
