# Deploying to Vercel

ERD Studio builds to a static site (`next build` → `out/`), so it deploys to
Vercel with no server functions and no environment variables.

## One-time setup

1. Push `main` to GitHub, then in Vercel choose **Add New → Project** and import
   the repository. Keep the **Next.js** framework preset and leave _Build
   Command_ and _Output Directory_ on their defaults — Vercel's Next.js builder
   reads `.next/` and serves the static export itself. Overriding the output
   directory to `out` fails with "routes-manifest.json couldn't be found".
2. **Settings → Git**: production branch `main`; leave preview deployments on
   for pull requests.
3. **Settings → General → Node.js version**: 22.x (matches `.nvmrc`).
4. Add your domain under **Settings → Domains** if you have one.

## Recommended GitHub settings

- Protect `main`: require a pull request, require the `CI` checks
  (_Lint, typecheck, unit tests_ and _Build and end-to-end tests_) and the
  Vercel preview check, and block force-pushes.
- Enable Dependabot security updates and secret scanning (Settings → Code security).
- Allow squash merging only, and enable "Automatically delete head branches".

## Pre-launch checklist

- [ ] Choose a licence and add `LICENSE` (MIT is common for tools like this).
- [ ] Final name, favicon/app icon (`src/app/icon.svg`) and Open Graph image
      (`src/app/opengraph-image.png`); set `metadataBase` in `layout.tsx` to the
      production URL.
- [ ] `robots.txt` and `sitemap.xml` (`src/app/robots.ts`, `src/app/sitemap.ts`
      work with static export).
- [ ] Review the Content-Security-Policy in `vercel.json` after the first preview
      deploy (browser console should show no CSP violations). Static export
      needs `'unsafe-inline'` for scripts because Next.js inlines its bootstrap
      data; there is no per-request nonce without a server.
- [ ] Privacy note: the app stores diagrams only in the browser. If you add
      analytics (Vercel Web Analytics is cookie-free), mention it and add its
      domain to `connect-src`.
- [ ] Error reporting (optional): a client-side error boundary is in place;
      hook it to a service only if you're happy to send error data off-device.
- [ ] Test on Safari (iOS and macOS) and Firefox — pointer, pinch-zoom and
      clipboard behaviour differ from Chromium.
- [ ] Lighthouse pass on the preview URL (performance, accessibility ≥ 95).
