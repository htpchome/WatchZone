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
- Detect browser features through capabilities, not browser names or
  user-agent strings. Home Assistant host identity with no equivalent feature
  signal is the narrow exception described below.
- Keep platform-specific behavior behind the smallest owning adapter or helper.
- Do not scatter Safari, Firefox, mobile, Companion, or Catalyst conditionals
  across modules.
- A runtime conditional inside a shared media adapter is not platform
  isolation. When platform-specific playback policy can change startup,
  attachment, autoplay, visibility, recovery, or cleanup, select a dedicated
  adapter at the resolver boundary so ordinary clients neither execute nor
  depend on that implementation. Synthetic browser tests verify contracts but
  do not replace validation on the physical client that motivated the path.
- Provide a deterministic fallback or actionable local error when a required
  capability is unavailable.
- Do not assume hover, a fine pointer, a physical keyboard, a wide viewport, or
  that the Home Assistant client keeps an ordinary browser-tab lifecycle.
- Interactive targets must work with touch, mouse, keyboard, and assistive
  technology. Do not make hover the only way to expose an action.
- Gate hover-only presentation behind hover and fine-pointer capabilities. A
  component that also accepts touch records the latest input modality so
  WebKit emulated hover or pointer focus cannot remain highlighted after a
  touch; keyboard input restores keyboard focus presentation.
- Use container size rather than global viewport size for card layout decisions.
- Respect safe-area insets, text scaling, reduced motion, orientation changes,
  and Home Assistant theme tokens where they affect the feature.
- Apply viewport safe-area environment insets only when WatchZone owns the
  fullscreen viewport. Embedded cards already live inside Home Assistant's
  safe content area and must not add the global notch or home-indicator inset a
  second time.
- Avoid APIs that require cross-origin isolation or browser flags unless the
  feature has a supported alternative.

### 2.1 Unified client environment

Catalyst is a Home Assistant host with media and window lifecycle behavior that
cannot be distinguished through an individual browser capability. The shared
client-environment class may identify that host from the platform and Home
Assistant application signature. No feature component or connection adapter
may parse those strings independently. Catalyst-specific policy is selected
from the resulting typed runtime profile.

There is one client-environment system. Its normalized profile reports these
independent axes:

- Home Assistant host: browser, Companion, or Catalyst.
- Operating system: Android, ChromeOS, iOS, iPadOS, Linux, macOS, Windows, or
  unknown.
- Physical client class: phone, tablet, or desktop.
- Input evidence: touch availability and primary coarse-pointer state.

Detection prefers User-Agent Client Hints where the browser provides them and
combines them with platform, application signature, touch points, and standard
pointer/hover media queries. Legacy UA evidence is isolated inside this one
boundary. iPadOS desktop-UA masquerading is resolved before Catalyst so an
iPad Companion client cannot be misclassified as the macOS application.

Physical client class is used only by settings that explicitly target a phone,
tablet, or PC, including startup audio and typed device matrices. A narrow
desktop card remains a desktop client. Feature code must not duplicate
environment parsing or invent another device profile.

### 2.2 Host-runtime pipelines

Browser, Companion, and Catalyst are distinct Home Assistant host runtimes.
`ClientEnvironment` detects and describes the host once; it does not implement
host policy. A document-scoped runtime composition boundary selects the narrow
adapters required by that host.

Catalyst always uses its own host-runtime pipeline. This requirement is broader
than live playback and covers every concern where Catalyst behavior differs:

- Connection selection and native-media lifecycle.
- Autoplay, audio intent, and audio recovery.
- Visibility, window backgrounding, suspension, and foreground resume.
- Retained-session parking, health validation, and reconnection decisions.
- Fullscreen and Picture-in-Picture entry, exit, and presentation restoration.
- Touch, pointer, gesture, resize, and window-specific interaction behavior.
- Future Catalyst-specific navigation or Home Assistant host integration.

The pipeline composes concern-specific adapters behind typed contracts; it is
not a duplicated card implementation and must not become a god object. Feature
components do not test `environment.catalyst` to implement behavior. They call
the selected concern contract. A Catalyst adapter may share platform-neutral
types and primitives, but it must not share mutable lifecycle policy or an
implementation entry with Browser or Companion.

A Catalyst-only change must leave Browser and Companion adapter code paths and
lazy chunks unchanged. Build validation enforces import isolation where a
separate entry exists, unit tests verify resolver selection, and physical
Catalyst testing remains mandatory for behavior that synthetic engines cannot
reproduce.

### 2.3 Responsive presentation

Container and viewport dimensions are not device detection. Responsive visual
layout and control sizing use CSS container queries, logical dimensions, safe
area insets, and input media queries. They do not create a second JavaScript
phone/tablet/desktop classifier. Features must query the capability they
actually require; a phone classification does not imply touch-only input, and
a desktop classification does not imply hover or a fine pointer.

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
- iPhone native video fullscreen can emit its final inline `pause` after the
  fullscreen-exit event. The camera fullscreen lifecycle resumes the exact
  retained element after inline restoration and watches the bounded exit
  window for that final pause; it must not reconnect or alter mute preference.
- Unsupported WebRTC, codec, HLS, or media-element behavior is isolated to the
  affected source and may invoke an explicit resolver fallback when one exists.

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
