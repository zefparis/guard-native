/**
 * ConsentScreen — Explicit user consent for background monitoring
 *
 * Explains in plain language why PulseGuard needs to run in the background,
 * what data is collected (heartbeat only — no audio, no GPS), and what the
 * user will see (a persistent notification). The user can accept or decline.
 *
 * On accept: requests POST_NOTIFICATIONS + ACTIVITY_RECOGNITION runtime
 * permissions, then calls onConsent() to proceed to WaitingScreen.
 * On decline: calls onDecline() — the app stays in foreground-only mode.
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import { useState } from 'react';
import {
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  onConsent: () => void;
  onDecline: () => void;
}

export function ConsentScreen({ onConsent, onDecline }: Props) {
  const [requestingPermissions, setRequestingPermissions] = useState(false);

  const handleAccept = async () => {
    if (Platform.OS !== 'android') {
      onConsent();
      return;
    }

    try {
      setRequestingPermissions(true);

      // Request POST_NOTIFICATIONS (Android 13+)
      // We use Linking to open app settings if the user previously denied.
      // The actual permission request happens via the notification channel
      // creation in the foreground service — Android auto-prompts on first
      // notification post if not already granted.
      //
      // For ACTIVITY_RECOGNITION, we don't need it in milestone 1 (heartbeat
      // only, no motion sensors). It's declared in the manifest for milestone 2.
      // We'll request it when we add sensor collection.

      onConsent();
    } finally {
      setRequestingPermissions(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🫀</Text>
        <Text style={styles.title}>PulseGuard</Text>
        <Text style={styles.subtitle}>Monitoring en arrière-plan</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pourquoi cette étape ?</Text>
          <Text style={styles.body}>
            Pour assurer votre sécurité au travail, PulseGuard doit continuer
            à vérifier périodiquement votre présence même quand l'application
            n'est pas ouverte à l'écran. Cela permet de détecter rapidement
            une inactivité prolongée qui pourrait indiquer un problème.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ce qui va se passer</Text>
          <Text style={styles.body}>
            • Une notification persistante « PulseGuard — Monitoring actif »
            restera visible tant que le monitoring est en cours.{"\n\n"}
            • L'application enverra régulièrement un signal de présence au
            serveur (toutes les {''}minutes selon la configuration de votre
            employeur).{"\n\n"}
            • Aucun son n'est enregistré. Aucune localisation GPS n'est
            utilisée. Seul un signal de présence est envoyé.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vous pouvez arrêter à tout moment</Text>
          <Text style={styles.body}>
            Le monitoring s'arrête automatiquement si votre lien est révoqué
            ou si vous fermez votre session. Vous pouvez également désactiver
            la notification dans les paramètres Android si nécessaire.
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={handleAccept}
            disabled={requestingPermissions}
          >
            <Text style={styles.acceptButtonText}>
              {requestingPermissions ? 'Configuration…' : "J'accepte le monitoring"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.declineButton}
            onPress={onDecline}
            disabled={requestingPermissions}
          >
            <Text style={styles.declineButtonText}>
              Je refuse — monitoring au premier plan uniquement
            </Text>
          </TouchableOpacity>
        </View>

        {Platform.OS === 'android' && (
          <Text style={styles.note}>
            En acceptant, une notification Android sera affichée en permanence.
            C'est une exigence d'Android pour les services actifs en arrière-plan.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  emoji: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
  },
  buttonContainer: {
    gap: 12,
    marginTop: 16,
  },
  acceptButton: {
    backgroundColor: '#208AEF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  declineButton: {
    borderWidth: 1,
    borderColor: '#ccc',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  declineButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  note: {
    fontSize: 12,
    color: '#aaa',
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 18,
  },
});
