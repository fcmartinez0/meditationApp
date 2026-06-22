# Stillness — Store Listing & Submission Guide

Everything you need to publish Stillness to the **App Store** and **Google Play**.
Copy/paste the listing fields, then work top-to-bottom through the checklist.

---

## 1. App Store Connect / Google Play listing copy

### App name (30 char max on iOS)
```
Stillness
```

### Subtitle (iOS, 30 char max)
```
Meditate, breathe, focus, rest
```

### Promotional text (iOS, 170 char — editable without review)
```
New: richer, spatial nature sounds. Breathe with guided rhythms, drift to
endless generative music, and keep your daily streak. No ads, no tracking.
```

### Short description (Google Play, 80 char max)
```
Meditation timer, guided breathing & a deep sound library. No ads, no tracking.
```

### Full description
```
Stillness is a calm, beautifully simple space to meditate, breathe, focus, and
rest — wherever you are.

MEDITATION TIMER
Pick a length, choose a sound, and follow a calming visual — a breathing orb, a
gently filling tide, or a minimal clock.

GUIDED BREATHING
Box, 4-7-8, Calm, and Coherent rhythms with an animated pace guide and gentle
haptics to keep you in time.

A DEEP LIBRARY OF SOUND — all generated on your device, no recordings
• Ambient: rain, ocean, forest, stream, campfire, night crickets, and brown,
  pink & white noise.
• Frequencies: binaural-beat tracks tuned for Calm, Clarity, Focus, Dream, and
  Deep states (headphones recommended).
• Beats: original instrumental grooves, from warm melodic house to dusty lo-fi.
• Generative: endless, never-repeating music that learns what you like as you
  rate it.

STREAKS & PROGRESS
Build a daily habit with a streak counter, total minutes and sessions, and a
weekly chart.

DAILY REMINDERS
An optional, gentle nudge at a time you choose.

PRIVATE BY DESIGN
No account. No server. No ads. No tracking or analytics. Your settings, streak,
history, and music preferences live only on your device.

Headphones are recommended for the binaural and low-frequency tracks. The
frequency tracks are a wellness aid, not a medical treatment.
```

### Keywords (iOS, 100 char max, comma-separated, no spaces)
```
meditation,breathe,sleep,calm,focus,relax,mindfulness,binaural,white noise,timer,rest,anxiety
```

### Category
- **Primary:** Health & Fitness
- **Secondary:** Lifestyle

### Age rating
- **4+ / Everyone.** No objectionable content. (See the medical-claim note in the checklist.)

### Support / marketing URLs
- **Support URL:** _(required)_ — a contact page or `mailto:fcmartinez0@outlook.com` landing page.
- **Privacy Policy URL:** _(required)_ — host `public/privacy.html` publicly (your GitHub Pages
  deploy already serves it).

---

## 2. Privacy / data-safety answers (both stores)

The app is local-first with **no data collection**, so:

- **Apple "App Privacy":** Data Not Collected. (Matches the `privacyManifests` block in `app.json`
  with `NSPrivacyTracking: false`.)
- **Google Play "Data safety":** No data collected, no data shared.
- **App Tracking Transparency:** Not required — you don't track. Do **not** add the ATT prompt.

---

## 3. Submission checklist

### One-time account setup (you must do — needs your login)
- [ ] **Apple Developer Program** membership active ($99/yr).
- [ ] **Google Play Developer** account active ($25 one-time).
- [ ] Run **`eas init`** to create the Expo project (writes `extra.eas.projectId` + `owner`).
- [ ] Fill `eas.json` → replace `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` and
      `REPLACE_WITH_APPLE_TEAM_ID`; confirm `appleId`.
- [ ] Create the **app record** in App Store Connect and a **Play Console** app; copy the
      App Store Connect App ID (ascAppId) back into `eas.json`.
- [ ] Generate a **Google Play service-account JSON**, save as
      `google-play-service-account.json` in the repo root (already gitignored).

### Already done in the codebase ✅
- [x] Bundle ID / package set (`com.fcmartinez0.stillness`), version 1.0.0, build 1.
- [x] Unused microphone permission removed.
- [x] `baseUrl` scoped to web only (native bundles clean).
- [x] Icons, splash, adaptive icon all present and correctly sized.
- [x] iOS privacy manifest + encryption exemption (`ITSAppUsesNonExemptEncryption: false`).
- [x] No tracking/analytics/ads SDKs.
- [x] In-app Privacy & Disclaimer screen.
- [x] Typecheck + tests green.

### Listing assets to produce (outside the code)
- [ ] **Screenshots** — iPhone 6.9" & 6.5" (required); iPad 13" if you keep `supportsTablet`.
      Android phone + 7"/10" tablet. Capture: Home, a session (orb), breathing, sound browse, progress.
- [ ] **App preview video** (optional but recommended for meditation apps).
- [ ] Feature graphic (1024×500) for Google Play.
- [ ] Host the **privacy policy** and a **support page** at public URLs.

### Build & submit
- [ ] `eas build --platform all --profile production`
- [ ] `eas submit --platform ios` → TestFlight, smoke-test on a real device.
- [ ] `eas submit --platform android` → internal track, then promote.

### Review notes (paste into App Store Connect "Notes for Reviewer")
```
Stillness plays continuous background audio so meditation/sleep sessions keep
running with the screen locked — this is why UIBackgroundModes includes "audio".
All audio is synthesized on-device; the app does not record audio and requests
no microphone access. There is no account, server, tracking, or analytics; all
data stays on the device.
```

---

## 4. ⚠️ Watch-outs before you hit submit

1. **Beats named after artists.** The README describes the Beats as "an homage to an
   artist's style." Do **not** reference any real artist/brand names in store metadata,
   screenshots, or in-app track titles — that risks IP/trademark rejection. Keep titles
   generic (e.g. "Melodic House", "Lo-Fi").
2. **No medical claims.** Binaural/frequency wording must stay as a *wellness aid*, never a
   treatment/cure for anxiety, insomnia, etc. The current disclaimer copy is fine — keep it.
3. **Reminders permission.** First launch of reminders triggers the notification prompt; make
   sure that flow is reachable for the reviewer (it's optional, so the app must work without it).
4. **Generative "learns what you like".** This is on-device personalization only — make sure the
   data-safety forms still say "no data collected" (they should; nothing leaves the device).
```
