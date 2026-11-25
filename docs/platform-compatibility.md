# Platform Compatibility Contract

## 1. Supported environments

CameraOptics is designed for the current stable versions of:

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
- Decorative hover outlines, color changes, and icon transforms are gated by
  both `(hover: hover)` and `(pointer: fine)`. Touch feedback uses `:active`
  and must clear when the press ends; it must not depend on a synthetic hover
  state that can remain latched until the next tap.
- Every icon-only interactive control has a localized accessible name and a
  matching hover title. Visible button text remains its own accessible name;
  decorative icons are hidden from assistive technology.
- Use container size rather than global viewport size for card layout decisions.
- Respect safe-area insets only for surfaces that actually meet a physical
  viewport edge, such as fullscreen. Card-contained Stage, carousel, control,
  toast, and dialog surfaces use their own local geometry; applying viewport
  safe-area values there would offset the same control differently by host
  device. A phone edge-to-edge card in `fit_viewport` mode is one narrow
  exception: its outer card boundary underlaps the complete bottom inset so
  media tiles can travel behind host chrome. CameraOptics does not draw a cover
  surface over that content. The complete hardware inset remains retained for
  underlap and scroll clearance. Floating media-list controls are offset above
  that complete inset and never occupy the unsafe band. In Companion, the
  edge-to-edge card overlaps Home Assistant's equal trailing safe-area space
  without adding that inset to the card viewport height, so the outer window
  remains fixed; only the media viewport scrolls beneath the safe area.
  Companion Full Stage landscape is a second viewport-edge exception: its
  CameraOptics-owned top-layer Stage surface covers Home Assistant chrome,
  applies all safe-area padding at the surface boundary, and prevents that geometry from
  entering Stage slots or Camera overlays. Android mirrors the larger inline
  inset onto both sides; iOS retains its reported left and right values. Home Assistant's
  Companion-aware safe-area custom property is authoritative and the browser
  environment inset is only its fallback. Respect text scaling, reduced
  motion, orientation changes, and Home Assistant theme tokens where they
  affect the feature.
- Shared overlay controls own responsive target sizing, Pointer Events,
  touch-focus release, keyboard focus, and tap-highlight suppression. Compact
  stages may use smaller visible media controls than desktop stages. Feature
  controls compose that behavior rather than adding device-specific input
  paths.
- Avoid APIs that require cross-origin isolation or browser flags unless the
  feature has a supported alternative.

### 2.1 Responsive and input profile

CameraOptics device labels are presentation classes derived from the component's
actual container; they are not claims about physical hardware. User-agent,
platform-string, screen-resolution, and operating-system parsing are
prohibited for layout or interaction decisions.

The shared responsive profile uses these container inline-size classes:

| Presentation class | Detailed size class | Inline size   |
| ------------------ | ------------------- | ------------- |
| Phone              | Compact phone       | `< 480px`     |
| Phone              | Phone               | `480–599px`   |
| Tablet             | Compact tablet      | `600–767px`   |
| Tablet             | Tablet              | `768–1023px`  |
| Desktop            | Desktop             | `1024–1279px` |
| Desktop            | Extra-wide desktop  | `>= 1280px`   |

All responsive width decisions use the canonical `480px`, `600px`, `768px`,
`1024px`, and `1280px` points. Runtime classification consumes their numeric
contract; CSS viewport and container queries consume its CSS-safe projection.
Arbitrary feature-local width points are prohibited. A component still chooses
the canonical point appropriate to its content; this shared scale does not
require viewport queries where a container query correctly owns the decision.

These categories may select behavior from a typed device matrix. Purely visual
size changes remain CSS container-query responsibilities.

Stage composition uses a separate two-dimensional presentation profile. The
card container's inline size selects the compact or wider structural variant.
Available block size comes from an explicit container/fit allocation when one
exists and otherwise from the visible viewport. It never comes from an
auto-height card's rendered content height, so desired height cannot feed back
into variant selection. Wider presentations below the canonical `600px`
block-size point are classified as `wide-short`; this classification may
select density or arrangement but does not claim viewport ownership.
The Stage does not mount a provisional responsive variant before its first
container measurement. Initial measurement occurs as soon as the rendered card
shell exists, preventing a wide-to-compact or compact-to-wide first-paint flash.

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

Companion App identity accepts either Home Assistant's injected native bridge
or its branded user-agent marker. The bridge covers WebViews that omit the
marker; the marker remains the compatibility fallback.

An explicit card configuration may select a presentation preference by this
physical client class when the user intentionally enables a phone-only
override. This narrow exception is used for mobile edge-to-edge layout and the
explicit standard/mobile Stage lineup; it does not allow automatic layout
decisions to infer physical hardware from size.
Container-responsive Stage arrangement and control geometry remain separate.

The client identity profile may select policies that genuinely depend on the
physical client or host application, including mobile connection retention and
phone-specific startup audio. Outside the mobile Stage policy below, it does
not select responsive layout, control geometry, or input behavior. Those remain
owned by the container-responsive and input-capability profile above.

Companion's fixed-window height sizing and mobile Stage apply to both phones
and tablets. A Companion mobile client selects the compact variant when its
app window is portrait or square, and the wide-short variant when it is
landscape. The browser orientation media state is authoritative for entering
the landscape structure. CameraOptics waits for stable host, visual-viewport,
and safe-area geometry before that commit. A physically narrow card may leave
the landscape structure immediately while the host's orientation media state
catches up, preventing a stale two-column Stage from painting in portrait.
Other transient window, visual-viewport, and container dimensions cannot enter
the landscape variant. A Companion Full Stage covers Home Assistant chrome by
promoting its existing Stage surface into a modal dialog in the browser top
layer; this is not the browser Fullscreen API. The same Stage DOM remains
mounted while a temporary cover hides intermediate geometry until the layout
profile and safe areas commit together. Phone browsers and phone PWAs remain on the compact,
single-column mobile Stage in both orientations because CameraOptics cannot own
their browser chrome. Tablet browsers, desktop browsers, and Catalyst remain
container-responsive.

For the browser-only Stage policy, a touch device whose physical CSS display
has a short edge below the canonical `600px` Stage boundary is treated as a
phone even when desktop-site mode removes phone markers from its user agent.
This fallback selects presentation only; it does not redefine shared physical
client identity or media policy.

Both mobile variants reuse the same Camera and Activity surfaces. Portrait
remains in ordinary Home Assistant card flow; Companion Full Stage landscape
promotes that same surface into the top layer. A future transition between them must use
the authoritative orientation change as its transaction boundary and use the
shared Motion boundary without introducing another layout or animation engine.

### 2.3 Theme profile

The shared frontend theme profile uses `hass.themes.darkMode` as Home
Assistant's authoritative effective light/dark mode and `hass.themes.theme` as
the active theme identity. It records the configured default theme names and
whether the active theme declares explicit light or dark variants without
copying the complete theme registry. When Home Assistant theme data is not yet
available, the profile temporarily follows `prefers-color-scheme` and reacts to
changes until Home Assistant becomes authoritative.

Theme identity supports diagnostics and future capability choices; features do
not branch on a particular third-party theme name. Visual colors continue to
flow through the semantic token boundary. The profile exposes stable mode data
to the card and editor and synchronizes their `color-scheme` without replacing
theme-provided colors.

Activity classification and review state are deliberate exceptions to
theme-selected color values. Alert presentation uses Home Assistant's
canonical red (`#db4437`), Detection and Not reviewed use canonical amber
(`#ffa600`), and Reviewed uses canonical green (`#43a047`). This applies only
to their badges, camera and thumbnail outlines, activity indicators, and
review-state controls. Generic warning, error, information, and success UI
continues to use the theme-aware semantic tokens; this includes the Suspend
camera dialog. Neutral actions such as AI analysis and information controls
retain ordinary text/icon semantics.

Primary-action contrast prefers Home Assistant's current `on-primary` semantic
tokens. When those tokens are unavailable, CameraOptics preserves compatibility
with established themes by falling back to the legacy `--text-primary-color`,
then the theme's white color, and finally white. Current Home Assistant
semantics therefore protect controls from themes that incorrectly alias the
legacy on-primary variable to ordinary foreground text without discarding the
legacy theme contract on older Home Assistant releases.

Overlay surfaces use three explicit presentation roles at the centralized theme
boundary:

- Informational and specialized viewing dialogs, including AI analysis and
  recorded media, use Home Assistant's native dialog surface, matching
  backdrop-filter, radius, and shadow. Modal information uses Home Assistant's
  scrim hooks. Both recorded-media presentations are non-blocking and have no
  scrim. The manual-popover drawer allows Home Assistant navigation and other
  outside content to remain interactive while it is open.
- The Home Assistant card-editor shell uses a mode-aware opaque surface without
  a backdrop filter: Home Assistant's default surface in light mode and the
  active theme's primary background in dark mode. The complete Config,
  Visibility, and Layout dialog therefore remains uniform over media and
  dashboard content without flattening distinct dark-theme palettes.
- Configuration, form, destructive-confirmation, filter, calendar, and other
  focused task surfaces use the theme's solid primary surface while retaining
  Home Assistant's dialog radius and shadow. Modal tasks also retain the Home
  Assistant scrim. These surfaces do not apply a second backdrop filter.

Use this matrix when selecting tokens for a new overlay surface:

| Presentation role | Examples                                                                           | Background                       | Backdrop filter                                | Radius and shadow                                      | Scrim                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| HA glass          | AI analysis, recorded-media viewers, minimal live viewer, informational dialogs    | `--wzc-dialog-background`        | `--wzc-dialog-backdrop-filter`                 | `--wzc-dialog-radius`, `--wzc-dialog-shadow`           | `--wzc-dialog-scrim-*` for ordinary modal dialogs; none for either recorded-media viewer |
| Solid task        | Filter, calendar, Suspend Camera, recorded-media information, forms, confirmations | `--wzc-task-dialog-background`   | `--wzc-task-dialog-backdrop-filter` (`none`)   | `--wzc-task-dialog-radius`, `--wzc-task-dialog-shadow` | `--wzc-dialog-scrim-*` for modal tasks; none for popovers                                |
| Editor shell      | Home Assistant card editor, CameraOptics editor content                            | `--wzc-editor-dialog-background` | `--wzc-editor-dialog-backdrop-filter` (`none`) | Owned by the Home Assistant editor shell               | Owned by the Home Assistant editor shell                                                 |

`--wzc-popover-*` is a compatibility alias of the solid-task family, not a
fourth presentation. Filter and calendar components may consume that alias for
placement-specific styling, but it must resolve to the solid-task background,
filter, radius, and shadow tokens.

An owning surface paints a translucent semantic background exactly once.
Nested headers, bodies, segmented controls, and similar structural children
remain transparent unless they represent a deliberately distinct surface.
Reapplying the same translucent token creates theme-dependent opacity bands
and is prohibited. Camera navigation therefore paints
`--wzc-camera-navigation-background` on its outer bar while its nested
segmented-control track stays transparent; only the active option paints
`--wzc-camera-navigation-active-background`.

The selection-bar background uses the same secondary media-tile surface as
Reviews, Events, Recordings, Exports, and Camera Navigation. Compact segmented
selectors and Camera Navigation consume the exact same
`--wzc-selection-bar-background` token without an editor-only outline or color
override. Compact segmented selectors use the semantic small shadow on their
outer track. Camera Navigation retains its separately configurable bar corners
and outer shadow. Its nested segmented-control track remains transparent,
borderless, and shadowless so the outer navigation surface is not painted
twice. Camera Navigation divides consecutive cameras into container-measured
pages containing only complete labels. Swipe and overflow controls advance one
page; each page is start-aligned, and resizing or external camera selection
keeps the selected camera's page visible. The paging policy is identical across
physical clients and Stage variants.

The isolated editor bridge applies the editor-shell role to Home Assistant's
owning card-edit dialog for its complete lifetime, including Home Assistant's
Visibility and Layout tabs, then restores the original inline surface state on
close. The custom editor does not paint a second editor surface. Features
consume only these CameraOptics roles and do not branch on a specific theme name
or synthesize colors from multiple translucent card and page surfaces.

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
- Native iOS video fullscreen cannot contain CameraOptics-authored overlays and
  therefore displays the platform's native controls rather than CameraOptics's
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
by Home Assistant before importing CameraOptics. A test environment without that
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
test for whether an accepted cursor value was actually painted. CameraOptics keeps
the standard cursors used by other clients and does not add user-agent
detection for this visual-only Catalyst limitation; the interactions remain
fully functional.
