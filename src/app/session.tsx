import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { BreathingOrb } from '@/components/BreathingOrb';
import { TideTimer } from '@/components/TideTimer';
import { useThemeColors } from '@/hooks/useThemeColors';
import { SessionAudio } from '@/lib/audio';
import { dayKey, formatClock } from '@/lib/date';
import { GENERATIVE_SUPPORTED, GenerativeEngine } from '@/lib/generative';
import { describeSpec, loadRatings, nextSpec, recordRating } from '@/lib/preferences';
import type { AmbientSound, FileSound, GenerativeSound, PieceSpec } from '@/lib/types';
import { isGenerative, sectionFor } from '@/lib/types';
import { useAppData } from '@/store/AppData';
import { radius, spacing } from '@/theme';
import { categoryStyle } from '@/theme/categories';

type Phase = 'running' | 'paused' | 'finished';

// On platforms without live synthesis, generative picks fall back to a track.
const GENERATIVE_FALLBACK: Record<GenerativeSound, FileSound> = {
  gen_rest: 'calm',
  gen_chill: 'lofi',
};

// Sessions shorter than this when ended early aren't worth recording.
const MIN_RECORD_SEC = 20;

export default function SessionScreen() {
  useKeepAwake();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings, recordSession, stats } = useAppData();
  const params = useLocalSearchParams<{ duration?: string; ambient?: string }>();

  const totalSec = Math.max(1, Number(params.duration) || settings.durationMin) * 60;
  const ambient = (params.ambient as AmbientSound) || settings.ambient;

  const cat = categoryStyle(ambient);
  const generative = isGenerative(ambient);
  const useEngine = generative && GENERATIVE_SUPPORTED;
  // What the file-based audio layer should play (silent when the engine drives it).
  const effectiveAmbient: AmbientSound = useEngine
    ? 'none'
    : generative
      ? GENERATIVE_FALLBACK[ambient as GenerativeSound]
      : ambient;

  const [remaining, setRemaining] = useState(totalSec);
  const [phase, setPhase] = useState<Phase>('running');
  const [rated, setRated] = useState<number | null>(null);
  const [specLabel, setSpecLabel] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);

  const audioRef = useRef<SessionAudio | null>(null);
  const engineRef = useRef<GenerativeEngine | null>(null);
  const specRef = useRef<PieceSpec | null>(null);
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
      await audio.prepare(effectiveAmbient);
      if (cancelled) return;
      audio.setVolume(settings.volume);
      if (settings.startBell) audio.ringBell();
      if (useEngine) {
        // Choose the next piece, learning from past ratings, then play it live.
        const ratings = await loadRatings();
        if (cancelled) return;
        const spec = nextSpec(sectionFor(ambient as GenerativeSound), ratings);
        specRef.current = spec;
        setSpecLabel(describeSpec(spec));
        const engine = new GenerativeEngine();
        engineRef.current = engine;
        await engine.start(spec);
        engine.setVolume(settings.volume);
      } else {
        audio.startAmbient();
      }
    })();
    return () => {
      cancelled = true;
      engineRef.current?.stop();
      // Let the fade-out finish before tearing down, otherwise cutting the
      // audio mid-sample produces a click.
      void audio.stopAmbient();
      setTimeout(() => audio.release(), 600);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(() => {
    setPhase('finished');
    setRemaining(0);
    persist(totalSec, true);
    if (settings.endBell) audioRef.current?.ringBell();
    haptic();
    engineRef.current?.stop();
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
      audioRef.current?.pauseAmbient();
      engineRef.current?.pause();
    } else if (phase === 'paused') {
      endAtRef.current = Date.now() + remaining * 1000;
      setPhase('running');
      audioRef.current?.resumeAmbient();
      engineRef.current?.resume();
    }
  };

  const endEarly = () => {
    const elapsed = totalSec - remaining;
    persist(elapsed, false);
    engineRef.current?.stop();
    void audioRef.current?.stopAmbient();
    router.back();
  };

  const ratePiece = (score: number) => {
    if (rated !== null || !specRef.current) return;
    setRated(score);
    haptic();
    void recordRating(specRef.current, score);
  };

  // Like the currently-playing generative piece, mid-session.
  const likeCurrent = () => {
    if (liked || !specRef.current) return;
    setLiked(true);
    haptic();
    void recordRating(specRef.current, 1);
  };

  // Swap to a freshly generated piece without ending the session.
  const regenerate = () => {
    if (!useEngine) return;
    engineRef.current?.stop();
    setLiked(false);
    void (async () => {
      const ratings = await loadRatings();
      const spec = nextSpec(sectionFor(ambient as GenerativeSound), ratings);
      specRef.current = spec;
      setSpecLabel(describeSpec(spec));
      const engine = new GenerativeEngine();
      engineRef.current = engine;
      await engine.start(spec);
      engine.setVolume(settings.volume);
    })();
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

          {useEngine && specRef.current && (
            <View style={styles.rating}>
              {rated === null ? (
                <>
                  <AppText variant="body" muted center>
                    How was this piece?
                  </AppText>
                  <View style={styles.rateRow}>
                    <Pressable
                      accessibilityLabel="Dislike this piece"
                      onPress={() => ratePiece(-1)}
                      style={[styles.rateBtn, { borderColor: colors.border }]}>
                      <Ionicons name="thumbs-down-outline" size={26} color={colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Like this piece"
                      onPress={() => ratePiece(1)}
                      style={[styles.rateBtn, { borderColor: colors.border }]}>
                      <Ionicons name="thumbs-up-outline" size={26} color={colors.accent} />
                    </Pressable>
                  </View>
                </>
              ) : (
                <View style={styles.rateRow}>
                  <Ionicons
                    name={rated > 0 ? 'heart' : 'checkmark-circle'}
                    size={20}
                    color={rated > 0 ? colors.accent : colors.success}
                  />
                  <AppText variant="caption" muted>
                    {rated > 0
                      ? "Noted — I'll lean this way next time."
                      : "Got it — I'll try something different."}
                  </AppText>
                </View>
              )}
            </View>
          )}

          <Button label="Done" onPress={() => router.back()} style={styles.doneBtn} />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={colors.gradient} style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['left', 'right', 'bottom']}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End session"
          onPress={endEarly}
          hitSlop={16}
          style={[styles.close, { top: Math.max(insets.top, 44) }]}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>

        {/* box-none lets taps fall through to the close button while the
            fade-in plays, so the X stays tappable from the very start. */}
        <Animated.View
          style={styles.center}
          pointerEvents="box-none"
          entering={FadeIn.duration(1100)}>
          {settings.timerStyle === 'tide' ? (
            <TideTimer active={phase === 'running'} progress={progress} color={cat.accent}>
              <AppText variant="display" color="#FFFFFF" style={styles.clock}>
                {formatClock(remaining)}
              </AppText>
            </TideTimer>
          ) : settings.timerStyle === 'minimal' ? (
            <AppText variant="display" color={cat.accent} style={styles.clockMinimal}>
              {formatClock(remaining)}
            </AppText>
          ) : (
            <BreathingOrb active={phase === 'running'} core={cat.accent} halo={cat.colors[0]}>
              <AppText variant="display" color="#FFFFFF" style={styles.clock}>
                {formatClock(remaining)}
              </AppText>
            </BreathingOrb>
          )}

          <AppText variant="label" muted style={styles.hint}>
            {phase === 'running'
              ? settings.timerStyle === 'orb'
                ? 'Breathe with the orb'
                : settings.timerStyle === 'tide'
                  ? 'Let it fill'
                  : 'Be still'
              : 'Paused'}
          </AppText>
        </Animated.View>

        <View style={styles.controls}>
          {useEngine && specLabel && (
            <View style={[styles.nowPlaying, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.nowPlayingText}>
                <AppText variant="caption" muted>
                  NOW PLAYING
                </AppText>
                <AppText variant="body" numberOfLines={1}>
                  {specLabel}
                </AppText>
              </View>
              <Pressable accessibilityLabel="Like this piece" onPress={likeCurrent} hitSlop={10} style={styles.npBtn}>
                <Ionicons
                  name={liked ? 'heart' : 'heart-outline'}
                  size={22}
                  color={liked ? cat.accent : colors.textSecondary}
                />
              </Pressable>
              <Pressable accessibilityLabel="Play another piece" onPress={regenerate} hitSlop={10} style={styles.npBtn}>
                <Ionicons name="shuffle" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
          )}
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: cat.accent, width: `${Math.min(100, progress * 100)}%` },
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
    right: spacing.sm,
    zIndex: 10,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  clock: { fontSize: 52, fontWeight: '200' },
  clockMinimal: { fontSize: 76, fontWeight: '100' },
  hint: { marginTop: spacing.sm },
  controls: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.lg },
  nowPlaying: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  nowPlayingText: { flex: 1, gap: 2 },
  npBtn: { padding: spacing.xs },
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
  rating: { alignItems: 'center', gap: spacing.md },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  rateBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
