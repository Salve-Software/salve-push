/**
 * salve-push SDK example app - exercises configure/checkForUpdate/downloadUpdate/installUpdate/notifyAppReady
 * against a locally running salve-push-server (see docker-compose.yml at the repo root).
 *
 * @format
 */

import { useEffect, useState } from 'react';
import {
  Button,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  Platform,
} from 'react-native';
import SalvePush, { type UpdateInfo } from 'react-native-salve-push';

SalvePush.configure({
  // Android emulators reach the host machine via 10.0.2.2, not localhost.
  serverUrl: Platform.OS === 'android' ? 'http://10.0.2.2:8090' : 'http://localhost:8090',
  channel: 'staging',
  runtimeVersion: '1.0.0',
  platform: Platform.OS === 'ios' ? 'ios' : 'android',
  signingPublicKey: '7/9cDOa8xLMnF+8ntvtDQ/XpLB6R6cxa8lQTo6tqaPI=',
});

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [status, setStatus] = useState('idle');
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [currentReleaseId, setCurrentReleaseId] = useState('');

  const refreshCurrentReleaseId = async () => {
    setCurrentReleaseId(await SalvePush.getCurrentReleaseId());
  };

  useEffect(() => {
    // Confirms the currently running release booted successfully; required
    // for crash-loop rollback to release the previous release (ADR 0004).
    SalvePush.notifyAppReady()
      .then(refreshCurrentReleaseId)
      .catch((error: unknown) => {
        setStatus(`notifyAppReady failed: ${String(error)}`);
      });
  }, []);

  const checkForUpdate = async () => {
    setStatus('checking...');
    try {
      const result = await SalvePush.checkForUpdate();
      setUpdate(result);
      setStatus(result ? `update available: ${result.id}` : 'up to date');
    } catch (error) {
      setStatus(`check failed: ${String(error)}`);
    }
  };

  const sync = async () => {
    setStatus('syncing...');
    try {
      await SalvePush.sync();
      await refreshCurrentReleaseId();
      setStatus('synced (restart app to boot the new release)');
    } catch (error) {
      setStatus(`sync failed: ${String(error)}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View style={styles.content}>
        <Text style={styles.title}>salve-push demo</Text>
        <Text style={styles.status}>{status}</Text>
        <Text style={styles.status}>current release: {currentReleaseId || '(none)'}</Text>
        {update ? <Text style={styles.status}>found: {update.id}</Text> : null}
        <View style={styles.buttonRow}>
          <Button title="Check for update" onPress={checkForUpdate} />
          <Button title="Sync" onPress={sync} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  status: {
    fontSize: 14,
    opacity: 0.7,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
});

export default App;
