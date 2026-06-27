import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Backdrop } from '@/components/Backdrop';
import { BreathingOrb } from '@/components/BreathingOrb';
import { GlassFill } from '@/components/GlassFill';
import { useThemeColors } from '@/hooks/useThemeColors';
import { SessionAudio } from '@/lib/audio';
import { soundMeta } from '@/lib/catalog';
import { dayKey, formatClock } from '@/lib/date';
import { GENERATIVE_SUPPORTED, GenerativeEngine, takeGenerative, type LoopData } from '@/lib/generative';
import { describeSpec, loadRatings, nextSpec, recordRating } from '@/lib/preferences';
import type { AmbientSound, FileSound, GenerativeSound, PieceSpec } from '@/lib/types';
import { isGenerative, sectionFor } from '@/lib/types';
import { useAppData } from '@/store/AppData';
import { radius, spacing } from '@/theme';
import { categoryStyle } from '@/theme/categories';

type Phase = 'preparing' | 'running' | 'paused' | 'finished';

// On platforms without live synthesis, generative picks fall back to a track.
const GENERATIVE_FALLBACK: Record<GenerativeSound, FileSound> = {
  gen_rest: 'calm',
  gen_chill: 'lofi',
};

// Sessions shorter than this when ended early aren't worth recording.
const MIN_RECORD_SEC = 20;

/** A screen-reader-friendly clock, e.g. "5 minutes 30 seconds remaining". */
function spokenClock(sec: number, suffix: string): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const parts: string[] = [];
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (s) parts.push(`${s} second${s === 1 ? '' : 's'}`);
  return `${parts.join(' ') || '0 seconds'} ${suffix}`;
}

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
  // Generative pieces play open-ended: a count-up elapsed clock instead of a
  // countdown, no auto-finish, and nothing recorded toward streaks.
  const [elapsed, setElapsed] = useState(0);
  // Only native needs a "preparing" wait (offline render takes a few seconds).
  // On web the engine starts instantly, so begin running immediately — never
  // gate the timer on audio setup (which can hang on web's AudioContext.resume).
  const needsPrepare = useEngine && Platform.OS !== 'web';
  const [phase, setPhase] = useState<Phase>(needsPrepare ? 'preparing' : 'running');
  const [rated, setRated] = useState<number | null>(null);
  const [specLabel, setSpecLabel] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [composing, setComposing] = useState(false);
  // Surfaced if audio setup fails so the user isn't left in unexplained silence.
  const [audioFailed, setAudioFailed] = useState(false);

  const audioRef = useRef<SessionAudio | null>(null);
  const engineRef = useRef<GenerativeEngine | null>(null);
  const specRef = useRef<PieceSpec | null>(null);
  const endAtRef = useRef<number>(Date.now() + totalSec * 1000);
  const startAtRef = useRef<number>(Date.now());
  const recordedRef = useRef(false);
  // Mirrors for the lock-screen sync listener, which is set up once and must read
  // current values without a stale closure.
  const phaseRef = useRef<Phase>(phase);
  const remainingRef = useRef(remaining);
  const elapsedRef = useRef(elapsed);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    remainingRef.current = remaining;
  }, [remaining]);
  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

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
    // Mirror a pause/resume triggered from the lock screen or control center
    // (file-based sounds only) back into the session UI and its clocks.
    audio.setOnPlayingChange((playing) => {
      if (cancelled) return;
      const cur = phaseRef.current;
      if (playing && cur === 'paused') {
        const now = Date.now();
        endAtRef.current = now + remainingRef.current * 1000; // countdown resume
        startAtRef.current = now - elapsedRef.current * 1000; // count-up resume
        setPhase('running');
      } else if (!playing && cur === 'running') {
        setPhase('paused');
      }
    });
    // Start the timer only once audio is ready, so the render doesn't eat into
    // the session.
    const startCountdown = () => {
      if (cancelled) return;
      const now = Date.now();
      endAtRef.current = now + totalSec * 1000;
      startAtRef.current = now;
      setRemaining(totalSec);
      setElapsed(0);
      setPhase('running');
    };
    (async () => {
      try {
        await audio.prepare(effectiveAmbient, settings.mixWithMusic, soundMeta(ambient).label);
        if (cancelled) return;
        audio.setVolume(settings.volume);
        if (useEngine) {
          const section = sectionFor(ambient as GenerativeSound);
          // Prefer a piece pre-rendered at launch/home for an instant start. If
          // one is still rendering, this awaits it rather than starting a second
          // render (rendering twice was the cause of the long "Composing" hang).
          // Only if nothing was prepared do we choose and render on demand.
          const claimed = await takeGenerative(section);
          if (cancelled) return;
          let spec: PieceSpec;
          let preloaded: LoopData | null = null;
          if (claimed) {
            spec = claimed.spec;
            preloaded = claimed.loop;
          } else {
            const ratings = await loadRatings();
            if (cancelled) return;
            spec = nextSpec(section, ratings);
          }
          specRef.current = spec;
          setSpecLabel(describeSpec(spec));
          setComposing(true);
          const engine = new GenerativeEngine();
          engineRef.current = engine;
          let ok = false;
          try {
            ok = await engine.start(spec, preloaded, settings.mixWithMusic);
          } finally {
            if (!cancelled) setComposing(false);
          }
          if (cancelled) return;
          if (ok) {
            engine.setVolume(settings.volume);
          } else {
            // Render failed — fall back to a bundled track so it's never silent.
            await audio.prepare(GENERATIVE_FALLBACK[ambient as GenerativeSound], settings.mixWithMusic, soundMeta(ambient).label);
            if (cancelled) return;
            audio.setVolume(settings.volume);
            audio.startAmbient();
          }
        } else {
          audio.startAmbient();
        }
      } catch (e) {
        // Audio setup failed — let the session run silently but tell the user,
        // rather than leaving them in unexplained silence.
        if (!cancelled) setAudioFailed(true);
      }
      startCountdown();
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
    haptic();
    engineRef.current?.stop();
    void audioRef.current?.stopAmbient();
  }, [persist, totalSec]);

  // The ticking clock — only runs while the session is active.
  useEffect(() => {
    if (phase !== 'running') return;
    const tick = () => {
      if (useEngine) {
        // Open-ended: count up and never auto-finish.
        const el = Math.max(0, Math.round((Date.now() - startAtRef.current) / 1000));
        setElapsed(el);
        return;
      }
      const rem = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
      setRemaining(rem);
      if (rem <= 0) finish();
    };
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [phase, totalSec, finish, useEngine]);

  const togglePause = () => {
    Haptics.selectionAsync().catch(() => {});
    if (phase === 'running') {
      setPhase('paused');
      audioRef.current?.pauseAmbient();
      engineRef.current?.pause();
    } else if (phase === 'paused') {
      const now = Date.now();
      endAtRef.current = now + remaining * 1000; // countdown resume
      startAtRef.current = now - elapsed * 1000; // count-up resume
      setPhase('running');
      audioRef.current?.resumeAmbient();
      engineRef.current?.resume();
    }
  };

  // Leave a session in progress. Generative plays open-ended and records
  // nothing, so it just stops and offers a rating; timed sessions record the
  // elapsed time toward streaks.
  const endEarly = () => {
    if (useEngine) {
      engineRef.current?.stop();
      void audioRef.current?.stopAmbient();
      setPhase('finished');
      return;
    }
    persist(totalSec - remaining, false);
    engineRef.current?.stop();
    void audioRef.current?.stopAmbient();
    router.back();
  };

  // Bail out before audio is ready (the "preparing"/composing screen) — nothing
  // to record or rate yet, so just leave.
  const cancel = () => {
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
    Haptics.selectionAsync().catch(() => {});
    engineRef.current?.stop();
    setLiked(false);
    void (async () => {
      const ratings = await loadRatings();
      const spec = nextSpec(sectionFor(ambient as GenerativeSound), ratings);
      specRef.current = spec;
      setSpecLabel(describeSpec(spec));
      setComposing(true);
      const engine = new GenerativeEngine();
      engineRef.current = engine;
      let ok = false;
      try {
        ok = await engine.start(spec, null, settings.mixWithMusic);
      } finally {
        setComposing(false);
      }
      if (ok) engine.setVolume(settings.volume);
    })();
  };

  // Generative is open-ended: show a count-up clock and no progress bar.
  const clockSeconds = useEngine ? elapsed : remaining;
  const spokenTime = useEngine
    ? spokenClock(elapsed, 'elapsed')
    : spokenClock(remaining, 'remaining');
  const progress = useEngine ? 0 : 1 - remaining / totalSec;

  if (phase === 'finished') {
    return (
      <View style={[styles.fill, styles.clip, { backgroundColor: colors.background }]}>
        <Backdrop mandala={false} count={90} />
        <SafeAreaView style={styles.completed}>
          <Animated.View entering={FadeInDown.duration(600)}>
            <Ionicons
              name={useEngine ? 'musical-notes' : 'checkmark-circle'}
              size={88}
              color={colors.success}
            />
          </Animated.View>
          <Animated.View entering={FadeInDown.duration(600).delay(120)}>
            <AppText variant="title" center>
              {useEngine ? 'Hope you enjoyed it' : 'Session complete'}
            </AppText>
          </Animated.View>
          {!useEngine && (
            <>
              <AppText variant="body" muted center>
                {Math.round(totalSec / 60)} minutes of stillness.
              </AppText>
              <View style={styles.streakPill}>
                <Ionicons name="flame" size={20} color={colors.warning} />
                <AppText variant="label">{stats.currentStreak}-day streak</AppText>
              </View>
            </>
          )}

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
                      ? "Got it. I'll lean this way next time."
                      : "Okay, I'll try something different next time."}
                  </AppText>
                </View>
              )}
            </View>
          )}

          <Animated.View style={styles.doneBtn} entering={FadeInUp.duration(600).delay(260)}>
            <Button label="Done" onPress={() => router.back()} />
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  }

  // Preparing: a calm screen while the piece renders — no countdown yet.
  if (phase === 'preparing') {
    return (
      <View style={[styles.fill, styles.clip, { backgroundColor: colors.background }]}>
        <Backdrop mandala={false} count={90} />
        <SafeAreaView style={styles.fill} edges={['left', 'right', 'bottom']}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={cancel}
            hitSlop={16}
            style={[styles.close, { top: Math.max(insets.top, 44) }]}>
            <Ionicons name="close" size={26} color={colors.textSecondary} />
          </Pressable>
          <View style={styles.center} pointerEvents="none">
            <BreathingOrb active core={cat.accent} halo={cat.colors[0]} colors={cat.colors}>
              <Ionicons name="sparkles-outline" size={40} color="#FFFFFF" />
            </BreathingOrb>
            <AppText variant="label" muted style={styles.hint}>
              {composing ? 'Composing a piece just for you…' : 'Getting ready…'}
            </AppText>
          </View>

          <View style={[styles.tip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="heart" size={20} color={cat.accent} />
            <AppText variant="caption" muted style={styles.tipText}>
              Tap the <AppText variant="caption" color={cat.accent}>♥</AppText> on a piece you love, or{' '}
              <AppText variant="caption" color={cat.accent}>shuffle</AppText> for a new one. Your music
              quietly learns your taste over time.
            </AppText>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[styles.fill, styles.clip, { backgroundColor: colors.background }]}>
        <Backdrop mandala={false} count={90} />
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
          <BreathingOrb active={phase === 'running'} core={cat.accent} halo={cat.colors[0]} colors={cat.colors}>
            <AppText
              variant="display"
              color="#FFFFFF"
              style={styles.clock}
              accessibilityLabel={spokenTime}>
              {formatClock(clockSeconds)}
            </AppText>
          </BreathingOrb>

          <AppText variant="label" muted style={styles.hint}>
            {phase === 'running' ? 'Breathe with the orb' : 'Paused'}
          </AppText>
        </Animated.View>

        <View style={styles.controls}>
          {audioFailed && (
            <View style={styles.audioWarn}>
              <GlassFill fallback={colors.surface} radius={radius.md} />
              <Ionicons name="volume-mute-outline" size={18} color={colors.warning} />
              <AppText variant="caption" muted style={styles.audioWarnText}>
                Audio couldn’t start, but your session is still running in silence.
              </AppText>
            </View>
          )}
          {useEngine && specLabel && (
            <View style={styles.nowPlaying}>
              <GlassFill fallback={colors.surface} radius={radius.md} />
              <View style={styles.nowPlayingText}>
                <AppText variant="caption" color={cat.accent}>
                  {composing ? 'COMPOSING' : 'NOW PLAYING'}
                </AppText>
                <AppText variant="body" numberOfLines={1}>
                  {composing ? 'Composing a piece just for you…' : specLabel}
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
          {!useEngine && (
            <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: cat.accent, width: `${Math.min(100, progress * 100)}%` },
                ]}
              />
            </View>
          )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  clip: { overflow: 'hidden' },
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
  hint: { marginTop: spacing.sm },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xxxl,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tipText: { flex: 1, lineHeight: 18 },
  controls: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.lg },
  nowPlaying: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  audioWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  audioWarnText: { flex: 1, lineHeight: 16 },
  nowPlayingText: { flex: 1, gap: 2 },
  npBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, // ≥44pt target
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
