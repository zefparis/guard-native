/**
 * Link token secure storage
 *
 * Stores the PulseGuard link token in the device's secure enclave
 * (Keychain on iOS, Keystore on Android) via expo-secure-store.
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import * as SecureStore from 'expo-secure-store';

const LINK_TOKEN_KEY = 'guard_link_token';

export async function saveLinkToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(LINK_TOKEN_KEY, token);
}

export async function getLinkToken(): Promise<string | null> {
  return SecureStore.getItemAsync(LINK_TOKEN_KEY);
}

export async function deleteLinkToken(): Promise<void> {
  await SecureStore.deleteItemAsync(LINK_TOKEN_KEY);
}
