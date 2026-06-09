import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Customizes the static HTML document for the web build (every page is wrapped
 * with this on `expo export -p web`). Adds security and PWA meta.
 *
 * Note: some protections (HSTS, X-Frame-Options/frame-ancestors,
 * X-Content-Type-Options) can only be set as real HTTP headers, which GitHub
 * Pages can't do — host behind a CDN (e.g. Cloudflare Pages) to add those and
 * to tighten the CSP (drop 'unsafe-inline'/'unsafe-eval') once verified.
 */
const CSP = [
  "default-src 'self'",
  // React Native Web injects inline styles; the bundler/runtime may use eval.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:", // bundled audio is same-origin
  "connect-src 'self'", // the app makes no cross-origin requests
  "worker-src 'self'", // the offline service worker
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#0E1020" />
        {/* PWA / iOS add-to-home-screen */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Stillness" />
        <ScrollViewStyleReset />
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/meditationApp/sw.js',{scope:'/meditationApp/'}).catch(function(){});});}",
          }}
        />
      </body>
    </html>
  );
}
