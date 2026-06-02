import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { BreathingOrb } from '@/components/BreathingOrb';
import { useThemeColors } from '@/hooks/useThemeColors';
import { SessionAudio } from '@/lib/audio';
import { dayKey, formatClock } from '@/lib/date';
import type { AmbientSound } from '@/lib/types';
import { useAppData } from '@/store/AppData';
import { radius, spacing } from '@/theme';

type Phase = 'running' | 'paused' | 'finished';

// Sessions shorter than this when ended early aren't worth recording.
const MIN_RECORD_SEC = 20;

export default function SessionScreen() {
  useKeepAwake();
  const colors = useThemeColors();
  const router = useRouter();
  const { settings, recordSession, stats } = useAppData();
  const params = useLocalSearchParams<{ duration?: string; ambient?: string }>();

  const totalSec = Math.max(1, Number(params.duration) || settings.durationMin) * 60;
  const ambient = (params.ambient as AmbientSound) || settings.ambient;

  const [remaining, setRemaining] = useState(totalSec);
  const [phase, setPhase] = useState<Phase>('running');

  const audioRef = useRef<SessionAudio | null>(null);
  const endAtRef = useRef<number>(Date.now() + totalSec * 1000);
  const lastBellMarkRef = useRef(0);
  const recordedRef = useRef(false);

  const haptic = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const persist = useCallback(
    (durationSec: number, completed: boolean) => {
      if (recordedRef.current) return;
      if (durationSec < MIN_RECORD_SEC) return;
      recordedRef.current = true;
      void recordSession({
        endedAt: Date.now(),
        day: dayKey(),
        durationSec,
        completed,
        ambient,
      });
    },
    [ambient, recordSession],
  );

  // Set up audio once, on mount.
  useEffect(() => {
    const audio = new SessionAudio();
    audioRef.current = audio;
    let cancelled = false;
    (async () => {
      await audio.prepare(ambient);
      if (cancelled) return;
      if (settings.startBell) audio.ringBell();
      audio.startAmbient();
    })();
    return () => {
      cancelled = true;
      void audio.stopAmbient();
      audio.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(() => {
    setPhase('finished');
    setRemaining(0);
    persist(totalSec, true);
    if (settings.endBell) audioRef.current?.ringBell();
    haptic();
    void audioRef.current?.stopAmbient();
  }, [persist, settings.endBell, totalSec]);

  // The ticking clock — only runs while the session is active.
  useEffect(() => {
    if (phase !== 'running') return;
    const tick = () => {
      const rem = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
      setRemaining(rem);

      const elapsed = totalSec - rem;
      const intervalSec = settings.intervalMin * 60;
      if (intervalSec > 0 && rem > 0) {
        const mark = Math.floor(elapsed / intervalSec);
        if (mark > lastBellMarkRef.current) {
          lastBellMarkRef.current = mark;
          audioRef.current?.ringBell();
          haptic();
        }
      }

      if (rem <= 0) finish();
    };
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [phase, totalSec, settings.intervalMin, finish]);

  const togglePause = () => {
    if (phase === 'running') {
      setPhase('paused');
    } else if (phase === 'paused') {
      endAtRef.current = Date.now() + remaining * 1000;
      setPhase('running');
    }
  };

  const endEarly = () => {
    const elapsed = totalSec - remaining;
    persist(elapsed, false);
    void audioRef.current?.stopAmbient();
    router.back();
  };

  const progress = 1 - remaining / totalSec;

  if (phase === 'finished') {
    return (
      <LinearGradient colors={colors.gradient} style={styles.fill}>
        <SafeAreaView style={styles.completed}>
          <Ionicons name="checkmark-circle" size={88} color={colors.success} />
          <AppText variant="title" center>
            Session complete
          </AppText>
          <AppText variant="body" muted center>
            You meditated for {Math.round(totalSec / 60)} minutes.
          </AppText>
          <View style={styles.streakPill}>
            <Ionicons name="flame" size={20} color={colors.warning} />
            <AppText variant="label">{stats.currentStreak}-day streak</AppText>
          </View>
          <Button label="Done" onPress={() => router.back()} style={styles.doneBtn} />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={colors.gradient} style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End session"
          onPress={endEarly}
          style={styles.close}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>

        <Animated.View style={styles.center} entering={FadeIn.duration(1100)}>
          <BreathingOrb active={phase === 'running'}>
            <AppText variant="display" color={colors.textOnAccent} style={styles.clock}>
              {formatClock(remaining)}
            </AppText>
          </BreathingOrb>

          <AppText variant="label" muted style={styles.hint}>
            {phase === 'running' ? 'Breathe with the orb' : 'Paused'}
          </AppText>
        </Animated.View>

        <View style={styles.controls}>
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: colors.accent, width: `${Math.min(100, progress * 100)}%` },
              ]}
            />
          </View>
          <View style={styles.buttons}>
            <Button
              label={phase === 'running' ? 'Pause' : 'Resume'}
              onPress={togglePause}
              style={styles.flexBtn}
            />
            <Button label="End" variant="secondary" onPress={endEarly} style={styles.flexBtn} />
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  close: {
    position: 'absolute',
    top: Platform.select({ ios: 8, default: 16 }),
    right: spacing.lg,
    zIndex: 10,
    padding: spacing.sm,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  clock: { fontSize: 52, fontWeight: '200' },
  hint: { marginTop: spacing.sm },
  controls: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.lg },
  progressTrack: { height: 4, borderRadius: radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
  buttons: { flexDirection: 'row', gap: spacing.md },
  flexBtn: { flex: 1 },
  completed: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(127,127,127,0.12)',
  },
  doneBtn: { alignSelf: 'stretch', marginTop: spacing.lg },
});
