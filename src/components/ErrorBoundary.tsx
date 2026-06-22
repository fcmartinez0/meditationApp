import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render-time errors anywhere below it and shows a recovery screen
 * instead of a blank app. Wrap the whole tree once at the root.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // A good place to forward to a crash reporter (e.g. Sentry) later.
    console.error('Unhandled app error:', error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji} accessibilityElementsHidden importantForAccessibility="no">
            🌿
          </Text>
          <Text style={styles.title} accessibilityRole="header">
            Something went wrong
          </Text>
          <Text style={styles.message}>
            The app hit an unexpected error. Your streak and settings are safe.
          </Text>
          <Pressable onPress={this.reset} style={styles.button} accessibilityRole="button">
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
    backgroundColor: '#0E1020',
  },
  emoji: { fontSize: 44, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '700', color: '#F2F4FF', textAlign: 'center' },
  message: { fontSize: 15, color: '#A6ABC8', textAlign: 'center', lineHeight: 22 },
  button: {
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
    backgroundColor: '#8B9DF0',
  },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#0E1020' },
});
