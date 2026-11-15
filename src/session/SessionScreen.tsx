import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import SmokeCurrent from '../ui/dotfield/SmokeCurrent';

export function SessionScreen() {
  return <View style={styles.screen} testID="session-screen">
    <StatusBar style="dark" />
    <View style={styles.background} pointerEvents="none">
      <SmokeCurrent />
    </View>
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.brand}>
          <View style={styles.logoBox}>
            <Image source={require('../../assets/naturalmotion-logo-transparent.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="Natural Motion" />
          </View>
          <Text style={styles.subtitle}>Move naturally. Feel Better</Text>
        </View>
        <Pressable testID="start-conversation" accessibilityRole="button" onPress={() => router.push('/live')} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>Start conversation</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  background: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  safeArea: { flex: 1 },
  content: { flex: 1, width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 24, paddingBottom: 20, justifyContent: 'flex-end' },
  brand: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingBottom: 44 },
  logoBox: { borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)', overflow: 'hidden' },
  logo: { width: 240, height: 240, maxWidth: '100%' },
  subtitle: { fontSize: 14, color: '#596778', textAlign: 'center' },
  button: { minHeight: 58, backgroundColor: '#252525', borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  buttonPressed: { opacity: 0.82 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
