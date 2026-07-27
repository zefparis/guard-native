import { useCallback, useState } from 'react';
import {
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getLinkToken, saveLinkToken } from '@/api/linkToken';
import type { PulseGuardLinkConfig } from '@/pulseguard/api';
import { fetchLinkConfig, PulseGuardApiError } from '@/pulseguard/api';

function extractToken(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const tokenParam = url.searchParams.get('token');
    if (tokenParam) return tokenParam;
  } catch {
    // Not a valid URL — assume raw token
  }
  return trimmed;
}

type TestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: PulseGuardLinkConfig; raw: string }
  | { status: 'error'; message: string; code?: string; httpStatus?: number };

export default function HomeScreen() {
  const [token, setToken] = useState('');
  const [testState, setTestState] = useState<TestState>({ status: 'idle' });
  const [storedToken, setStoredToken] = useState<string | null>(null);

  const handleResolve = useCallback(async () => {
    const resolved = extractToken(token);
    if (!resolved) {
      setTestState({ status: 'error', message: 'Enter a link token first' });
      return;
    }

    setTestState({ status: 'loading' });

    try {
      const config = await fetchLinkConfig(resolved);
      const raw = JSON.stringify(config, null, 2);
      setTestState({ status: 'success', data: config, raw });
      await saveLinkToken(resolved);
      setStoredToken(resolved);
    } catch (err) {
      if (err instanceof PulseGuardApiError) {
        setTestState({
          status: 'error',
          message: err.message,
          code: err.code,
          httpStatus: err.status,
        });
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setTestState({ status: 'error', message: msg });
      }
    }
  }, [token]);

  const handleLoadStored = useCallback(async () => {
    const stored = await getLinkToken();
    if (stored) {
      setToken(stored);
      setStoredToken(stored);
    } else {
      setTestState({ status: 'error', message: 'No stored token found' });
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>guard-native</Text>
        <Text style={styles.subtitle}>Connectivity test — link token resolution</Text>

        <View style={styles.section}>
          <Text style={styles.label}>Link token</Text>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            placeholder="Paste link token here"
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            numberOfLines={3}
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.button} onPress={handleResolve}>
              <Text style={styles.buttonText}>Resolve token</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.buttonSecondary} onPress={handleLoadStored}>
              <Text style={styles.buttonSecondaryText}>Load stored</Text>
            </TouchableOpacity>
          </View>
        </View>

        {testState.status === 'loading' && (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>Resolving...</Text>
          </View>
        )}

        {testState.status === 'success' && (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>API response (raw JSON)</Text>
            <Text style={styles.resultJson}>{testState.raw}</Text>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>checkFrequencyMs:</Text>
              <Text style={styles.fieldValue}>{testState.data.checkFrequencyMs}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>captureWindowSec:</Text>
              <Text style={styles.fieldValue}>{testState.data.captureWindowSec}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>cognitiveEnrollmentRequired:</Text>
              <Text style={styles.fieldValue}>
                {testState.data.cognitiveEnrollmentRequired ? 'true' : 'false'}
              </Text>
            </View>
            {storedToken && (
              <Text style={styles.storedNote}>Token saved to secure storage</Text>
            )}
          </View>
        )}

        {testState.status === 'error' && (
          <View style={styles.resultBoxError}>
            <Text style={styles.resultTitleError}>Error</Text>
            {testState.code && (
              <Text style={styles.errorDetail}>Code: {testState.code}</Text>
            )}
            {testState.httpStatus !== undefined && (
              <Text style={styles.errorDetail}>HTTP: {testState.httpStatus}</Text>
            )}
            <Text style={styles.errorDetail}>{testState.message}</Text>
          </View>
        )}

        <Text style={styles.platformNote}>Platform: {Platform.OS}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1a1a1a',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  button: {
    backgroundColor: '#208AEF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: '#208AEF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  buttonSecondaryText: {
    color: '#208AEF',
    fontSize: 15,
    fontWeight: '600',
  },
  resultBox: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0369a1',
    marginBottom: 8,
  },
  resultJson: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#444',
    marginBottom: 12,
    lineHeight: 18,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
  },
  fieldLabel: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  fieldValue: {
    fontSize: 13,
    color: '#1a1a1a',
    fontWeight: '600',
  },
  storedNote: {
    fontSize: 12,
    color: '#16a34a',
    marginTop: 8,
    fontStyle: 'italic',
  },
  resultBoxError: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
  },
  resultTitleError: {
    fontSize: 14,
    fontWeight: '700',
    color: '#dc2626',
    marginBottom: 8,
  },
  errorDetail: {
    fontSize: 13,
    color: '#991b1b',
    marginBottom: 2,
  },
  platformNote: {
    fontSize: 11,
    color: '#bbb',
    marginTop: 24,
    textAlign: 'center',
  },
});
