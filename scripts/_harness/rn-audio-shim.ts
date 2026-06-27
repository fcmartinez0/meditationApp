// Harness shim: stands in for `react-native-audio-api` so the generative engine
// can run headless under Node. Web Audio classes come from node-web-audio-api;
// the native-only session manager is stubbed out.
export { AudioContext, OfflineAudioContext } from 'node-web-audio-api';

export const AudioManager = {
  setAudioSessionOptions() {},
  setAudioSessionActivity() {
    return Promise.resolve();
  },
};
