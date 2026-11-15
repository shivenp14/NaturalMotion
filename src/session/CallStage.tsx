import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, useAnimatedValue, View } from 'react-native';

type Props = {
  mainView: 'camera' | 'model';
  camera: ReactNode;
  model: ReactNode;
  onSwap: () => void;
  connectionMarker: string;
  children?: ReactNode;
};

/** Scale the persistent camera and GL surfaces without resizing them each frame. */
export function CallStage({ mainView, camera, model, onSwap, connectionMarker, children }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [reducedMotion, setReducedMotion] = useState(true);
  const progress = useAnimatedValue(mainView === 'camera' ? 1 : 0);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active) setReducedMotion(value);
    }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; listener.remove(); };
  }, []);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: mainView === 'camera' ? 1 : 0,
      duration: reducedMotion ? 0 : 460,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [mainView, progress, reducedMotion]);

  // Preserve the full-screen aspect ratio in the preview so bodies are not distorted.
  const scale = size.width && size.height ? Math.min(105 / size.width, 190 / size.height, 1) : 1;
  const previewWidth = size.width * scale;
  const previewHeight = size.height * scale;
  const preview = { left: 20, bottom: 24, width: previewWidth, height: previewHeight };
  const dx = 20 + previewWidth / 2 - size.width / 2;
  const dy = size.height / 2 - 24 - previewHeight / 2;
  const layerStyle = (isCamera: boolean) => {
    const output = <T,>(small: T, full: T) => isCamera ? [small, full] : [full, small];
    return {
      borderRadius: progress.interpolate({ inputRange: [0, 1], outputRange: output(18 / scale, 0) }),
      transform: [
        { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: output(dx, 0) }) },
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: output(dy, 0) }) },
        { scale: progress.interpolate({ inputRange: [0, 1], outputRange: output(scale, 1) }) },
      ],
    };
  };

  return <View style={styles.stage} testID={connectionMarker} onLayout={({ nativeEvent: { layout } }) => {
    setSize(previous => previous.width === layout.width && previous.height === layout.height ? previous : { width: layout.width, height: layout.height });
  }}>
    <Animated.View pointerEvents="none" testID="live-camera" style={[styles.layer, { zIndex: mainView === 'camera' ? 0 : 2 }, layerStyle(true)]}>{camera}</Animated.View>
    <Animated.View pointerEvents="none" testID="live-model" style={[styles.layer, { zIndex: mainView === 'model' ? 0 : 2 }, layerStyle(false)]}>{model}</Animated.View>
    <Pressable testID="live-swap" accessibilityRole="button" accessibilityLabel={mainView === 'camera' ? 'Show anatomy model' : 'Show camera and start practice'} style={[styles.previewTouch, preview]} onPress={onSwap}>
      <Text style={styles.label}>{mainView === 'camera' ? 'Anatomy' : 'You'}</Text>
    </Pressable>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  stage: { flex: 1, overflow: 'hidden', backgroundColor: '#fff' },
  layer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden', backgroundColor: '#fff' },
  previewTouch: { position: 'absolute', zIndex: 4, justifyContent: 'flex-end', padding: 5, borderRadius: 18 },
  label: { overflow: 'hidden', backgroundColor: 'rgba(25,25,25,0.88)', color: '#fff', fontSize: 11, textAlign: 'center', borderRadius: 10, paddingVertical: 4 },
});
