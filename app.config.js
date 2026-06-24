// Dynamic Expo config.
//
// The static configuration lives in app.json. This wrapper exists for one
// reason: the GitHub Pages web deploy serves the app from a repository
// subpath (https://<user>.github.io/meditationApp/), which requires
// `experiments.baseUrl`. That setting is web-only and must NOT leak into the
// native iOS/Android bundles (it can break asset resolution and deep links).
//
// So `baseUrl` is applied here only when EXPO_WEB_BASE_URL is set, which the
// deploy-web workflow does for the `expo export -p web` step. Local web dev
// and all native builds run without it.
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_WEB_BASE_URL;
  if (baseUrl) {
    config.experiments = { ...config.experiments, baseUrl };
  }
  return config;
};
