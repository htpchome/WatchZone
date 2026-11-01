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
- Use container size rather than global viewport size for card layout decisions.
- Respect safe-area insets, text scaling, reduced motion, orientation changes,
  and Home Assistant theme tokens where they affect the feature.
- Avoid APIs that require cross-origin isolation or browser flags unless the
  feature has a supported alternative.

## 3. Media rules

Media support is capability-dependent even within one browser family.
Connection adapters therefore own codec, transport, autoplay, visibility, and
background-lifecycle capability checks.

- A successful negotiation is not sufficient; readiness is based on usable
  media output.
- Autoplay rejection is recoverable state and never overwrites user mute intent.
- Backgrounding, app suspension, route changes, and presentation replacement
  must not be confused with explicit user closure.
- iOS, iPadOS, Companion, and Catalyst lifecycle events can require reconnection
  even when ordinary desktop navigation retains a session.
- Unsupported WebRTC, codec, HLS, or media-element behavior is isolated to the
  affected source and may invoke an explicit resolver fallback when one exists.

## 4. Automated validation

Browser-visible changes run Playwright against:

- Chromium, representing the shared engine baseline for Chrome and Edge.
- Firefox.
- WebKit, representing the closest automated Safari engine coverage available
  outside Apple hardware.

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
