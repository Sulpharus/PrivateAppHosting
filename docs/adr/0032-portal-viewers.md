# ADR 0032: The installed portal shows apps (and optionally outside websites) in its own viewers

- Status: accepted
- Date: 2026-11-26

## Context

The owner installs only the portal as an app (PWA). Every hosted app runs on its own origin
(`<slug>.<domain>`, ADR 0001), which is outside the portal's manifest scope. Chrome therefore opens
an app from the installed portal in its "out of scope" view: a light bar on top with the app's name,
its address, a back arrow and a menu. On a tablet it takes about 130 px and does not match the app.

The web platform's answer, the manifest member `scope_extensions`, does not help here (checked in
Chromium's source, 2026-11-26): the parser accepts at most 10 origins, wildcard origins
(`https://*.<domain>`) sit behind a feature that is disabled by default, and Chrome on Android does
not use the member at all: the data sent to build the installed Android app
(`components/webapk/webapk.proto`) carries only the manifest's own scopes. Serving all apps from one
origin would remove the bar everywhere but end the per-app origin isolation the security model
relies on (cookies, storage, service workers, ADR 0001, ADR 0002).

## Decision

**The installed portal shows apps itself.** When the portal runs as an installed app (display mode
`standalone`, `fullscreen`, `minimal-ui` or `window-controls-overlay`), a click on a link to an app
the gate serves (kind `static`, `spa` or `nextjs`, from the app list the portal loads; not remote
programs, containers on the hardware server, `api.` or `ai.`) opens `/a/<slug>/<path>` in the
portal: the app in a full-screen frame, without any bar. In a browser tab nothing changes. The address stays the app's own origin inside the frame, so login,
data, storage and service worker work as before (portal and apps are the same site, so nothing is
partitioned). The gate's CSP allows exactly the portal's origin as `frame-ancestors` (before:
`'none'`); the portal allows `frame-src https: blob: data:`, so an app in the viewer can
also open pages it made in the browser, such as a PDF (without `blob:` Chrome blocked them with
"Dieser Inhalt ist blockiert").

**Nothing leaves MiniNode for the browser.** In the viewer, `pwa.js` shows what an app opens "in a
new tab" from its own content inside the frame: `window.open` with a `blob:`, `data:` or the app's
own address, links with `target="_blank"` to them, and the address an app gives to an empty window
it opened first (Rechnungen, Haushalt: on the click, so pop-up blockers allow it). In the installed
app such a window became a separate, blank MiniNode window, and the PDF then opened in the browser.
Other web addresses from `window.open` go to the portal like links. Downloads stay downloads. The
system's back gesture returns to the app.

**Links leave the frame through the portal.** `pwa.js` (added to every app page) notices it runs in
the portal's viewer (the parent's origin is the portal) and hands every click on a link to another
origin to the portal (`postMessage({ type: 'mn:open', url })`, sent only to the portal's origin).
The SDK does the same for its sign-in and sign-out redirects. The portal accepts the message only
from the frame it created and from an app origin, and opens portal pages in itself, other apps in
the viewer and outside sites as below. Before loading the frame the portal renews an expired
session and writes the shared cookie, so the gate rarely has to send anyone to sign in from inside
the frame; when it must, it answers with a page whose link opens the sign-in for the whole window.
The kit's `files.js` uses the file field and downloads instead of the file pickers in a frame
(Chromium refuses pickers in cross-origin frames), as it already did for Firefox.

**Outside websites, behind a switch.** Verwaltung → Einstellungen → "Externe Seiten im eigenen
Viewer" (`platform.instance_settings.external_viewer`, off by default; everyone signed in reads it,
an admin with a recent sign-in changes it). When on, the installed portal opens outside links in
`/web?url=…`: a slim bar of its own (back, address, "Im Browser öffnen", close) over a sandboxed frame
(no top navigation, no referrer). A browser cannot tell a page that refused to load in a frame from
one that loaded, so the portal asks the API first: `GET /frame-check?url=` fetches the page (public
https only, at most 3 redirects, rate-limited, cached for six hours) and reads `X-Frame-Options` and
the CSP's `frame-ancestors`. A page that refuses, does not answer or is not HTML opens as before,
under Chrome's bar. When off, outside links behave as before. Links that ask for a new window
(`target="_blank"`, e.g. to GitHub in Verwaltung) keep doing that. `/web` sends people on only when
the portal itself navigated there (router state); a link from elsewhere to `/web?url=…` shows the
address and a button instead, so the portal's domain is no open redirect. "Schließen" returns to the
page the viewer was opened from. The frame has no top navigation at all, so a site's
`target="_top"` links do nothing there.

**The bar that remains is dark.** The portal manifest's `theme_color` is the dark background
(`#121210`), which Chrome uses for its bar over outside websites.

## Consequences

- The bar disappears for apps opened from the installed portal, on every browser, without any change
  to the apps. Apps installed on their own are unaffected.
- The bar's controls (address, "open in Chrome", close) are gone inside apps: back is the system's
  back gesture or the app's "Alle Apps" link.
- Reloading the portal on `/a/<slug>/…` starts the app at the path the viewer was opened with; the
  viewer does not follow navigation inside the app.
- Apps should link to other apps and the portal with ordinary links; a script that sets
  `window.top.location` is blocked by the browser inside the frame.
- In the web viewer, outside sites are third parties: their logins often do not work and pages
  further on may refuse the frame. The check covers only the first page; "Im Browser öffnen" is always
  there. Google, GitHub, banks and most social networks refuse frames and keep opening under Chrome's
  bar.
- "Schließen" in the web viewer replaces only its own entry: pages visited inside the site stay in
  the history, so "back" after closing passes them again before reaching the page before.
- If Chrome on Android one day supports `scope_extensions` with wildcards, the manifest can list
  `https://*.<domain>` and the app viewer becomes unnecessary; the switch for outside sites stays.
