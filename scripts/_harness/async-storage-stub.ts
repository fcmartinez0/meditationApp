// Harness stub: no persisted ratings in the renderer, so every piece is a fresh
// exploration spec (what a brand-new user hears).
export default {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
  multiRemove: async () => {},
};
