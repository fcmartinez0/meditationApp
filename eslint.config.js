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
]);
