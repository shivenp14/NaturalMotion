import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';
import { ParticleCanvas } from './ParticleCanvas';

export default function SmokeCurrent() {
  const [reducedMotion, setReducedMotion] = useState(true);
  const active = usePathname() === '/';
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReducedMotion(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { mounted = false; listener.remove(); };
  }, []);
  return <View style={styles.container} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {active && <ParticleCanvas reducedMotion={reducedMotion} />}
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, overflow: 'hidden', backgroundColor: '#ffffff' } });
