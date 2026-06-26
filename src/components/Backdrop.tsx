import { StyleSheet, View } from 'react-native';

import { GeometricFlair } from '@/components/GeometricFlair';
import { StarField } from '@/components/StarField';
import { useThemeColors } from '@/hooks/useThemeColors';

/**
 * The app's shared ambient backdrop: a stardust field plus two centred geometric
 * mandalas bleeding off the top and bottom. Decorative; sits behind content.
 * Pass `mandala={false}` for immersive screens where the orb is the geometry.
 */
export function Backdrop({
  count = 110,
  mandala = true,
  dim = false,
}: {
  count?: number;
  mandala?: boolean;
  dim?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <StarField color={colors.text} count={count} />
      {mandala ? (
        <>
          <View style={styles.flairTop}>
            <GeometricFlair color={colors.accent} size={520} opacity={dim ? 0.12 : 0.2} />
          </View>
          <View style={styles.flairBottom}>
            <GeometricFlair color={colors.accent} size={360} opacity={dim ? 0.08 : 0.14} />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flairTop: { position: 'absolute', top: -240, left: 0, right: 0, alignItems: 'center' },
  flairBottom: { position: 'absolute', bottom: -200, left: 0, right: 0, alignItems: 'center' },
});
