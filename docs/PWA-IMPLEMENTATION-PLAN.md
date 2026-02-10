# PWA Implementation Plan – DC Management System

**Phase 1–3 implemented:** manifest, PWA icons (192 & 512), and root layout meta. Regenerate icons with `npm run generate-pwa-icons` if you change the logo.

This plan makes the DCMS web app installable on phones and tablets as a Progressive Web App (PWA), so users can “Add to Home Screen” and use it like a native app (full-screen, icon, optional offline).

---

## Goals

- **Installable:** “Add to Home Screen” on iOS and Android shows an app icon and opens in standalone/fullscreen.
- **App-like:** Splash screen, theme color, no browser chrome when launched from home screen.
- **Reliable:** Optional caching so the shell loads quickly and works on flaky networks (offline fallback is optional).

---

## Phase 1: Web App Manifest

The manifest tells the browser the app name, icons, colors, and how to display the app (standalone = like a native app).

### 1.1 Create `public/manifest.json`

Add a file at `public/manifest.json` with at least:

- **name** – Short name under the icon (e.g. “DCMS” or “Dana Committee”).
- **short_name** – Very short (e.g. “DCMS”) for home screen label.
- **description** – One line for app stores / install UI.
- **start_url** – `/` (your app root).
- **display** – `standalone` (recommended) so it opens without browser UI.
- **background_color** – Splash screen background (e.g. your brand color).
- **theme_color** – Status bar / browser chrome color.
- **orientation** – `portrait` or `any` depending on your UX.
- **icons** – Array of `{ src, sizes, type }` for at least **192x192** and **512x512** (required for install).

You can add more icon sizes (72, 96, 128, 144, 152, 384) later for better quality on different devices.

### 1.2 Link manifest in root layout

In `app/layout.tsx`:

- Add `<link rel="manifest" href="/manifest.json" />` (via metadata or a `<head>` fragment).
- Ensure **theme-color** and **viewport** are set in metadata for mobile.

---

## Phase 2: PWA Icons

Browsers and “Add to Home Screen” require multiple icon sizes. You currently have `public/logo.png`.

### 2.1 Required sizes (minimum for install)

- **192×192** – Android home screen, Chrome install.
- **512×512** – Android splash, install UI, high-DPI.

### 2.2 Optional (better quality on more devices)

- 72×72, 96×96, 128×128, 144×144, 152×152, 384×384.

### 2.3 How to generate

- Use an image tool (Figma, ImageMagick, squoosh.app) to resize `logo.png` (or “DANA COMMITTEE LOGO.png”) to 192 and 512, then optionally the rest.
- Save under `public/icons/` (e.g. `icon-192.png`, `icon-512.png`) and reference them in `manifest.json`.

**Example manifest icons entry:**

```json
"icons": [
  { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
  { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
]
```

---

## Phase 3: Mobile meta tags and manifest link

In `app/layout.tsx` (Next.js metadata or `<head>`):

- **viewport** – Already usually set by Next; ensure it’s mobile-friendly (e.g. `width=device-width, initial-scale=1`).
- **theme-color** – Same as `manifest.json` theme_color (e.g. `#0f172a` or your brand color).
- **apple-mobile-web-app-capable** – `yes` so iOS can run in standalone mode.
- **apple-mobile-web-app-status-bar-style** – `default` or `black-translucent`.
- **apple-touch-icon** – Link to a 180×180 icon for iOS “Add to Home Screen” (e.g. `public/icons/icon-192.png` or a dedicated 180×180).

Link the manifest:

- `rel="manifest"` `href="/manifest.json"`.

---

## Phase 4: Service worker (caching and offline)

A service worker lets the app load quickly and, if you want, work partly offline.

### 4.1 Option A: Serwist (recommended)

- Use **@serwist/next** (successor to Workbox, works well with Next.js App Router).
- Install: `npm i @serwist/next` (and optionally `serwist` if needed).
- Configure in `next.config.ts`: inject a service worker that caches:
  - **Static assets** – JS, CSS, images (cache-first or stale-while-revalidate).
  - **App shell** – HTML/Shell for `/` and key routes (network-first with cache fallback).
- Serwist can generate `sw.js` and `workbox-*.js` at build time and register the SW from the client.

### 4.2 Option B: next-pwa

- **next-pwa** uses Workbox under the hood. It can conflict with Turbopack or newer Next.js; if you use it, pin versions and test build + deploy.
- Configure in `next.config.js/ts` with `dest: 'public'` and disable if it causes build errors.

### 4.3 Option C: Minimal (manifest only, no SW)

- Only implement Phase 1–3. The app is still installable and runs in standalone; it just won’t have a custom service worker for caching/offline. You can add a SW later.

**Recommendation:** Start with **Phase 1–3** (manifest + icons + meta). Once install works on your phone, add **Phase 4** with Serwist for caching.

---

## Phase 5: Register the service worker (if you add Phase 4)

- In a client component (e.g. a layout client wrapper or a `PWAProvider`), on mount:
  - Check if `serviceWorker` is in `navigator`.
  - Call `navigator.serviceWorker.register('/sw.js')` (or the path Serwist/next-pwa outputs).
  - Prefer registering after the app is interactive (e.g. after first paint or in `useEffect`).
- Optionally listen for `controllerchange` or `registration.updatefound` to prompt the user to refresh when a new SW is available.

---

## Phase 6: Optional enhancements

- **Install prompt:** Capture `beforeinstallprompt` and show a custom “Install app” banner for Android/desktop (iOS does not fire this; users use Share → Add to Home Screen).
- **Offline fallback:** Serve a simple offline page (e.g. “You’re offline”) when the SW detects no network and the request is for a document.
- **Update notice:** When the SW updates, show a toast or banner: “New version available. Refresh to update.”

---

## Implementation order (summary)

| Step | Task | Effort |
|------|------|--------|
| 1 | Add `public/manifest.json` with name, short_name, start_url, display, theme_color, background_color, icons (192 + 512). | Small |
| 2 | Generate and add PWA icons (192, 512) under `public/icons/` and reference in manifest. | Small |
| 3 | In `app/layout.tsx`: link manifest, set theme-color, viewport, apple-mobile-web-app-* and apple-touch-icon. | Small |
| 4 | Test “Add to Home Screen” on Android and iOS; confirm standalone and splash. | Small |
| 5 | (Optional) Add @serwist/next, configure caching, register SW in a client component. | Medium |
| 6 | (Optional) Offline fallback page and/or install prompt. | Low–Medium |

---

## Files to create or modify

- **Create:** `public/manifest.json`
- **Create:** `public/icons/icon-192.png`, `public/icons/icon-512.png` (and optionally more).
- **Modify:** `app/layout.tsx` – manifest link, theme-color, viewport, Apple meta tags, apple-touch-icon.
- **Optional:** `next.config.ts` – Serwist/next-pwa config; client component to register SW.

---

## Testing

- **Chrome (Android/Desktop):** Install via menu or install icon in address bar; confirm standalone window and correct icon/name.
- **Safari (iOS):** Share → “Add to Home Screen”; open from home screen and confirm fullscreen and correct icon.
- **Lighthouse:** Run PWA audit (manifest, icons, service worker if used, HTTPS) and fix any reported issues.

Once Phase 1–3 are done, users can install the app on their phones and use it like a native app; Phase 4–6 improve performance and offline behavior.
