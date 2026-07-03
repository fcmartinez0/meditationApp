// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'scripts/_harness/*', 'public/sw.js'],
  },
  {
    // Build/dev tooling (audio generation, harness, icon gen) runs under Node,
    // not React Native — give it Node globals so Buffer/process/etc. aren't
    // flagged as undefined.
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // The new React Compiler correctness rules over-flag legitimate patterns in
    // this codebase — most notably Reanimated's documented `sharedValue.value =`
    // mutation, plus intentional ref/timer reads on the session screen. Keep them
    // as warnings (visible, not CI-blocking) rather than errors; revisit when the
    // session-screen state machine is refactored.
    rules: {
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
