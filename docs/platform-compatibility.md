# Platform Compatibility Contract

## 1. Supported environments

WatchZone is designed for the current stable versions of:

- Chrome and Edge.
- Firefox.
- Safari on macOS, iOS, and iPadOS.
- Home Assistant Companion on Android and iOS.
- Home Assistant clients running through macOS Catalyst.

The interface supports phone, tablet, laptop, desktop, dashboard panel, and
full-size layouts. A platform is not removed from this matrix merely because a
new browser API makes another platform easier or faster.

## 2. Implementation rules

- Use standards-based browser APIs and Home Assistant public surfaces.
- Detect capabilities, not browser names or user-agent strings.
- Keep platform-specific behavior behind the smallest owning adapter or helper.
- Do not scatter Safari, Firefox, mobile, Companion, or Catalyst conditionals
  across modules.
- Provide a deterministic fallback or actionable local error when a required
  capability is unavailable.
- Do not assume hover, a fine pointer, a physical keyboard, a wide viewport, or
  that the Home Assistant client keeps an ordinary browser-tab lifecycle.
- Interactive targets must work with touch, mouse, keyboard, and assistive
  technology. Do not make hover the only way to expose an action.
- Every icon-only interactive control has a localized accessible name and a
  matching hover title. Visible button text remains its own accessible name;
  decorative icons are hidden from assistive technology.
- Use container size rather than global viewport size for card layout decisions.
- Respect safe-area insets only for surfaces that actually meet a physical
  viewport edge, such as fullscreen. Card-contained Stage, carousel, control,
  toast, and dialog surfaces use their own local geometry; applying viewport
  safe-area values there would offset the same control differently by host
  device. Respect text scaling, reduced motion, orientation changes, and Home
  Assistant theme tokens where they affect the feature.
- Shared overlay controls own minimum touch-target sizing, Pointer Events,
  touch-focus release, keyboard focus, and tap-highlight suppression. Feature
  controls compose that behavior rather than adding device-specific input
  paths.
- Avoid APIs that require cross-origin isolation or browser flags unless the
  feature has a supported alternative.

### 2.1 Responsive and input profile

WatchZone device labels are presentation classes derived from the component's
actual container; they are not claims about physical hardware. User-agent,
platform-string, screen-resolution, and operating-system parsing are
prohibited for layout or interaction decisions.

The shared responsive profile uses these container inline-size classes:

| Presentation class | Detailed size class | Inline size   |
| ------------------ | ------------------- | ------------- |
| Phone              | Compact phone       | `< 360px`     |
| Phone              | Phone               | `360–599px`   |
| Tablet             | Compact tablet      | `600–767px`   |
| Tablet             | Tablet              | `768–1023px`  |
| Desktop            | Desktop             | `1024–1439px` |
| Desktop            | Wide desktop        | `>= 1440px`   |

These categories may select behavior from a typed device matrix. Purely visual
size changes remain CSS container-query responsibilities.

Input capability is an independent dimension. The profile records primary
pointer accuracy, primary and available hover, touch availability, and a
derived `touch`, `pointer`, `hybrid`, or `none` input mode using standardized
pointer/hover media queries and `maxTouchPoints`. Orientation is derived from
the observed container rather than the physical screen.

The profile reacts to container resize and pointing-device changes. Features
must query the capability they actually require; a phone label does not imply
touch-only input, and a desktop label does not imply hover or a fine pointer.

### 2.2 Client identity profile

Physical-client and Home Assistant application policy uses a separate,
document-scoped client identity profile. It classifies phone, tablet, and
desktop clients; distinguishes iOS and Android where the browser exposes that
identity; and identifies Home Assistant Companion and Mac Catalyst clients.
It uses User-Agent Client Hints first, then narrowly scoped user-agent and
platform markers with touch capability for iPadOS and Android-tablet
disambiguation. Client identity never derives from viewport, screen, card, or
container width.

The client identity profile may select policies that genuinely depend on the
physical client or host application, including mobile connection retention and
phone-specific startup audio. It does not select responsive layout, control
geometry, or input behavior. Those remain owned by the container-responsive
and input-capability profile above. User-agent and platform parsing remains
prohibited for presentation decisions.

## 3. Media rules

Media support is capability-dependent even within one browser family.
Connection adapters therefore own codec, transport, autoplay, visibility, and
background-lifecycle capability checks.

- A successful negotiation is not sufficient; readiness is based on usable
  media output.
- Autoplay rejection is recoverable state and never overwrites user mute intent.
- Backgrounding, app suspension, route changes, and presentation replacement
  must not be confused with explicit user closure.
- `pagehide` is not proof of final document destruction in WebKit or embedded
  Home Assistant WebViews and must not close the document-scoped session pool.
- Native iOS video fullscreen cannot contain WatchZone-authored overlays and
  therefore displays the platform's native controls rather than WatchZone's
  control and information overlays.
- iOS, iPadOS, Companion, and Catalyst lifecycle events can require reconnection
  even when ordinary desktop navigation retains a session.
- Unsupported WebRTC, codec, HLS, or media-element behavior is isolated to the
  affected source and may invoke an explicit resolver fallback when one exists.
- A positively identified Home Assistant Mac Catalyst host resolves Frigate
  go2rtc playback to native HLS before transport acquisition. It does not start
  WebRTC, MSE, or HLS.js as speculative alternatives.

## 4. Automated validation

Browser-visible changes run Playwright against:

- Chromium, representing the shared engine baseline for Chrome and Edge.
- Firefox.
- WebKit, representing the closest automated Safari engine coverage available
  outside Apple hardware.

The browser harness loads the same scoped custom-element registry polyfill used
by Home Assistant before importing WatchZone. A test environment without that
polyfill does not exercise Home Assistant's custom-element constructor rules
and is insufficient for card lifecycle validation.

Responsive tests use component/container sizes representative of at least:

- Phone: 320 to 480 CSS pixels.
- Tablet: 600 to 1024 CSS pixels.
- Desktop or panel: 1024 CSS pixels and wider.

Tests cover behavior and cleanup, not pixel-identical rendering. Media tests use
controlled fakes or local streams and do not depend on internet services.

## 5. Physical-client validation

Automated engine coverage does not prove compatibility with real Safari,
hardware codecs, WebViews, Companion lifecycle rules, or Catalyst. Before a
feature that changes media, gestures, fullscreen behavior, background handling,
or editor lifecycle is called release-ready, record focused smoke results for
the affected entries in this matrix:

| Environment        | Required focus                                 |
| ------------------ | ---------------------------------------------- |
| Chrome desktop     | Rendering, WebRTC, keyboard and pointer        |
| Edge desktop       | Rendering and WebRTC                           |
| Firefox desktop    | Rendering, WebRTC, cleanup                     |
| Safari macOS       | WebKit media, autoplay, visibility             |
| Safari iPhone/iPad | Touch, rotation, safe area, autoplay           |
| Companion Android  | WebView media and app background/restore       |
| Companion iOS      | WKWebView media and app background/restore     |
| Catalyst client    | Media, visibility, navigation, window resizing |

An untested entry is reported as unverified, not silently treated as passing.
Known platform limitations are documented beside the owning feature and must
not be hidden behind generic failure messages.

Affected Mac Catalyst WebKit releases may keep displaying the ordinary pointer
when camera pan uses `move` or the stage handle uses `ns-resize`. Custom URL
cursors do not reliably change that behavior, and CSS exposes no capability
test for whether an accepted cursor value was actually painted. WatchZone keeps
the standard cursors used by other clients and does not add user-agent
detection for this visual-only Catalyst limitation; the interactions remain
fully functional.
