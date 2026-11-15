import { VisionDebugScreen } from '../vision/debug/VisionDebugScreen';

export default function VisionDebugRoute() {
  return __DEV__ ? <VisionDebugScreen /> : null;
}
