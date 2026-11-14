import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PoseCamera, useCameraPermission, type PoseFrame } from 'react-native-pose-detection';
import { theme } from '../ui/theme';

export type CameraPoseViewProps = {
  active?: boolean;
  onFrame: (frame: PoseFrame) => void;
  onReady?: (state: { delegate: string; targetFps: number; deviceTier: string }) => void;
  onPerformance?: (actualFps: number) => void;
  onError?: (message: string) => void;
};

/**
 * Live camera with the pose overlay.
 *
 * This is the only file in `src/vision/` that imports the native package. Everything else is pure
 * TypeScript, so the geometry stays testable without a phone.
 */
export function CameraPoseView({
  active = true,
  onFrame,
  onReady,
  onPerformance,
  onError,
}: CameraPoseViewProps) {
  const permission = useCameraPermission();

  if (!permission.granted) {
    return (
      <View style={styles.message}>
        <Text style={styles.title}>
          {permission.pending ? 'Asking for camera access' : 'Camera access is required'}
        </Text>
        <Text style={styles.body}>
          {permission.error
            ? 'This build cannot ask for the camera. Install the development build; Expo Go does not include the pose module.'
            : 'NaturalMotion uses the camera to observe your movement. Video stays on this phone.'}
        </Text>
        {permission.canAskAgain && (
          <Pressable
            accessibilityRole="button"
            style={styles.button}
            onPress={() => {
              void permission.request();
            }}
          >
            <Text style={styles.buttonText}>Allow camera</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <PoseCamera
      style={styles.camera}
      facing="front"
      active={active}
      data={{ mode: 'throttled', throttleMs: 100 }}
      overlay={{ color: theme.accent, lineWidth: 3, pointRadius: 4, minVisibility: 0.5 }}
      onPose={onFrame}
      onReady={(event) =>
        onReady?.({
          delegate: event.delegate,
          targetFps: event.targetFps,
          deviceTier: event.deviceTier,
        })
      }
      onPerformanceChange={(event) => onPerformance?.(event.actualFps)}
      onError={(event) => onError?.(`${event.code}: ${event.message}`)}
    />
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1 },
  message: { flex: 1, justifyContent: 'center', gap: 12, padding: 24, backgroundColor: theme.surface },
  title: { color: theme.text, fontSize: 20, fontWeight: '500' },
  body: { color: theme.muted, fontSize: 14, lineHeight: 21 },
  button: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: { color: theme.background, fontSize: 15, fontWeight: '600' },
});
