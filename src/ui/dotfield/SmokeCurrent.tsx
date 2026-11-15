import { Component, useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';
import { ParticleCanvas } from './ParticleCanvas';

class BackgroundBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

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
    {active && <BackgroundBoundary><ParticleCanvas reducedMotion={reducedMotion} /></BackgroundBoundary>}
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, overflow: 'hidden', backgroundColor: '#ffffff' } });
