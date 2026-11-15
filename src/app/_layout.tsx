import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider } from '../session/SessionProvider';
import { theme } from '../ui/theme';
import { anatomyAgentCapabilities } from '../anatomy/agentCapabilities';

export default function RootLayout() {
  return (
    <SessionProvider catalog={anatomyAgentCapabilities.catalog} compositionPolicy={anatomyAgentCapabilities.compositionPolicy}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }} />
    </SessionProvider>
  );
}
