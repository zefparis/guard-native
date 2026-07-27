/**
 * PulseGuard — TrailTapScreen (sequential path tapping test)
 *
 * React Native port of pulseguard-app/src/screens/TrailTapScreen.tsx.
 * Displays 5 numbered nodes. User must tap in order.
 * Measures completion_ms, wrong_taps, hesitation_count, path_efficiency.
 *
 * @copyright (c) 2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 */

import { useEffect, useState, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  TRAIL_TAP_MIN_NODES,
  generateNormalizedTrailPoints,
  computeTrailTapLayout,
  computeNodeRadius,
  computeTrailTapResult,
} from '@/pulseguard/cognitive/trailTapChallenge';
import type { TrailTapSignal } from '@/pulseguard/cognitive/cognitiveTypes';
import type { TrailTapNode, TrailTapEvent } from '@/pulseguard/cognitive/trailTapChallenge';
import { recordTaskStart, recordTrailTap } from '@/pulseguard/behavior/taskBehaviorRecorder';
import type { BehaviorSession } from '@/pulseguard/behavior/behaviorSession';

interface Props {
  session: BehaviorSession;
  onComplete: (signal: TrailTapSignal) => void;
  onError: (reason: string) => void;
}

export function TrailTapScreen({ session, onComplete }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const AREA_W = Math.min(screenWidth - 40, 320);
  const AREA_H = Math.min(screenHeight * 0.55, 400);

  const [nodes] = useState<TrailTapNode[]>(() => {
    const normalized = generateNormalizedTrailPoints(TRAIL_TAP_MIN_NODES);
    const radius = computeNodeRadius(AREA_W);
    return computeTrailTapLayout(AREA_W, AREA_H, normalized, radius);
  });
  const [events, setEvents] = useState<TrailTapEvent[]>([]);
  const [nextIdx, setNextIdx] = useState(0);
  const [wrongNodeId, setWrongNodeId] = useState<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const completedRef = useRef(false);
  const eventsRef = useRef<TrailTapEvent[]>([]);
  const nextIdxRef = useRef(0);

  useEffect(() => {
    recordTaskStart(session, 'trail_tap');
    startTimeRef.current = performance.now();
  }, [session]);

  const handleTap = (node: TrailTapNode) => {
    if (completedRef.current) return;
    const expectedId = nextIdxRef.current + 1;
    const correct = node.id === expectedId;
    const event: TrailTapEvent = { nodeId: node.id, timestamp: performance.now(), correct };

    if (correct) {
      const prevNode = nextIdxRef.current > 0 ? nodes[nextIdxRef.current - 1] : null;
      const pathDist = prevNode ? Math.sqrt((node.x - prevNode.x) ** 2 + (node.y - prevNode.y) ** 2) : null;
      const optimalDist = prevNode ? pathDist : null;
      recordTrailTap(session, true, pathDist, optimalDist);
      eventsRef.current = [...eventsRef.current, event];
      setEvents(eventsRef.current);
      nextIdxRef.current = nextIdxRef.current + 1;
      setNextIdx(nextIdxRef.current);

      if (nextIdxRef.current >= nodes.length) {
        completedRef.current = true;
        const completionMs = performance.now() - startTimeRef.current;
        const signal = computeTrailTapResult(nodes, eventsRef.current, completionMs);
        onComplete(signal);
      }
    } else {
      recordTrailTap(session, false, null, null);
      eventsRef.current = [...eventsRef.current, event];
      setEvents(eventsRef.current);
      setWrongNodeId(node.id);
      setTimeout(() => setWrongNodeId(null), 500);
    }
  };

  const radius = computeNodeRadius(AREA_W);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Trail Tap</Text>
        <Text style={styles.progress}>5/6</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.instruction}>
          Tap the numbers in order (1 to {nodes.length})
        </Text>
        <View style={[styles.trailArea, { width: AREA_W, height: AREA_H }]}>
          {nodes.map((node) => {
            const tapped = node.id <= nextIdx;
            const isWrong = wrongNodeId === node.id;
            return (
              <Pressable
                key={node.id}
                onPress={() => handleTap(node)}
                style={[
                  styles.node,
                  {
                    left: node.x - radius,
                    top: node.y - radius,
                    width: radius * 2,
                    height: radius * 2,
                    borderRadius: radius,
                    backgroundColor: isWrong ? '#ef4444' : tapped ? '#22c55e' : '#208AEF',
                    opacity: tapped ? 0.5 : 1,
                  },
                ]}
              >
                <Text style={styles.nodeText}>{node.id}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  progress: { fontSize: 14, color: '#888', marginTop: 4 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  instruction: { fontSize: 16, color: '#555', marginBottom: 16, textAlign: 'center' },
  trailArea: {
    position: 'relative',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
  },
  node: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nodeText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
