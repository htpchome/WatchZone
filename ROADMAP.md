# WatchZone Future Roadmap

## Purpose

This is a living product and engineering planning reference. It records likely
future capabilities early enough that today's boundaries do not make them
expensive to add later. It is not a release schedule, a compatibility promise,
or a substitute for the normative rules in `architecture.md` and `docs/`.

The capability inventory is informed by the useful parts of FrigateViewCard,
but WatchZone will not reproduce its fixed page/view architecture or copy its
implementation. Features are independent modules, presentations, controls,
provider services, and connection adapters that users compose into layouts.

## Product direction

- One Home Assistant integration ships the Python backend and Lit frontend.
- Python owns layout schemas, validation, persistence, revisions, permissions,
  provider configuration, and provider-normalized data.
- The browser owns the visual designer, responsive preview, interaction, and
  browser media APIs. The designer is therefore a frontend client of the
  Python-owned layout service rather than a second YAML configuration system.
- Users assemble layouts from modules such as live cameras, camera selectors,
  companion cameras, event lists, recordings, timelines, and navigation or
  control groups.
- WatchZone will not expose FrigateViewCard-style Single, Wide, Mobile,
  Preview, or Card pages as application modes. Equivalent arrangements may be
  assembled by users and may eventually be offered as optional layout
  templates.
- Appearance controls created during early card development are provisional.
  Durable contracts are typed component inputs and semantic `--wzc-*` tokens;
  the future designer may replace temporary Lovelace toggles.

## Architecture that future work must preserve

1. A provider is not a live connection type. Provider adapters supply cameras,
   events, recordings, controls, and capabilities. Connection adapters supply
   browser playback.
2. Camera, event, recording, timeline, selector, and control modules remain
   independently lazy-loadable. A module does not import another module.
3. Shared coordination uses narrow typed contracts. It does not grow into a
   card-wide god object or generic event bus.
4. Live sessions remain document-scoped and lease-based so layout changes,
   editor transitions, and Home Assistant navigation do not reconnect healthy
   cameras.
5. Explicit user mute preference remains separate from forced mute, autoplay
   status, automatic startup audio, talkback state, and audio focus.
6. Provider capabilities drive feature availability. Generic modules do not
   branch on provider names.
7. Python-owned persisted schemas are versioned and migrated. Temporary UI
   controls are not treated as permanent schemas merely because they exist in
   the early editor.
8. Every visual feature consumes WatchZone theme tokens and supports container
   responsiveness, touch, pointer, keyboard, and the supported browser/app
   matrix.
9. Catalyst is a distinct host-runtime pipeline across transport, media,
   visibility/window lifecycle, retention/resume, fullscreen, PiP, gestures,
   and future host-specific behavior. Feature modules consume narrow selected
   adapters and never implement Catalyst as a conditional variation of Browser
   or Companion behavior.

## Capability roadmap

### 1. Python-owned layout and theme designer

- Versioned layout documents with stable layout, node, and module IDs.
- Optimistic revisions, conflict handling, atomic saves, copy, rename, delete,
  import/export, and recoverable validation errors.
- Responsive containers and constraints for phone, tablet, desktop, panel,
  Sections, Masonry, and sidebar contexts without device-specific page modes.
- Drag, resize, reorder, nesting, visibility rules, and module configuration.
- Live draft preview that preserves active media sessions and never writes the
  saved layout until Save.
- Reusable user layouts and optional starting templates that approximate
  familiar camera-wall, focused-camera, wide, or mobile arrangements without
  turning those arrangements into application modes.
- Component metadata describing supported settings, defaults, capabilities,
  editor controls, validation, and responsive constraints.
- A theme editor over supported semantic `--wzc-*` values for surfaces, text,
  accents, borders, radii, shadows, spacing, overlays, status states, and media
  presentation.
- Layout and theme permissions, ownership, revision history or rollback, and
  safe schema migrations.

Planning requirement: Python owns the data and rules; TypeScript renders the
designer and preview. Component configuration must remain usable without the
designer UI so saved layouts are declarative and testable.

### 2. Provider and camera catalog

- Multiple provider types and multiple instances of each provider.
- Frigate provider for cameras, reviews, events, clips, snapshots, recordings,
  PTZ capabilities, presets, talkback capability, stream profiles, and camera
  suspend/resume state.
- MotionEye and future providers through the same WatchZone camera and media
  models where their capabilities overlap.
- Home Assistant-native cameras and controls where no richer provider exists.
- Stable WatchZone camera IDs independent of display names and transport URLs.
- Provider health, partial failure, reauthentication, bounded concurrency, and
  per-provider caching without taking down unrelated providers.
- Capability-driven camera metadata for audio, PTZ, presets, talkback,
  snapshots, events, recordings, downloads, suspension, and linked entities.
- Optional camera grouping for dual-lens devices, fixed/PTZ pairs, doorbells,
  and other multi-sensor presentations without merging their source identity.

### 3. Live connection types and source selection

- Home Assistant Direct playback, including retained WebRTC and low-latency HLS
  fallback.
- Frigate/go2rtc playback with capability-based WebRTC, MSE, HLS, and snapshot
  candidates where appropriate.
- Future provider-specific adapters only when their transport cannot be
  represented by an existing connection contract.
- Ranked source descriptors, capability checks, measured startup, bounded
  fallback, health reporting, reconnect, and stale-session rejection.
- Per-camera preferred connection type with deterministic fallback that does
  not alter camera identity.
- Main streams, substreams, quality profiles, and bandwidth-aware selection.
  A substream changes live presentation only; events, PTZ, recordings, and
  other camera capabilities continue to use the stable camera identity.
- An independent source/status overlay with a persistent connecting indicator
  and timed first-source label; later source-label visibility shares the camera
  controls' interaction state and timer while diagnostics retain the complete
  takeover/fallback history.
- Resource budgets for simultaneous connections, decoders, bandwidth, parked
  sessions, and idle eviction.
- Platform-specific capability handling isolated inside adapters, including
  Safari, Companion, Catalyst, backgrounding, and autoplay constraints.

### 4. Camera module and presentations

- The current single-camera live presentation as the shared primitive for all
  live camera placements.
- Selectable camera source, companion-camera tiles, user-built camera walls,
  carousels, grids, and focused-camera compositions.
- Live, snapshot, suspended, unavailable, connecting, fallback, failed, and
  reconnecting presentation states with consistent overlays.
- Snapshot-only background tiles with configurable refresh and optional
  capability-driven promotion to live video for important activity.
- Camera selector modules and typed selection state shared only with modules in
  the same layout/card runtime that opt into it.
- Multi-camera groups with independent source identity, selectable audio,
  focus/fullscreen behavior, and responsive side-by-side or stacked layouts.
- Object-fit, aspect-ratio, crop, zoom, pan, resize, and rotation-aware controls
  that do not change transport identity.
- Independent card-shell, camera-component, overlay, and module appearance
  settings through semantic tokens.
- Typed component elevation choices (`medium`, `small`, or `none`) backed by
  the WatchZone shadow scale; temporary boolean toggles map into this choice
  until the layout/theme designer exposes the complete control.

### 5. Camera suspend and resume

- Provider capability for querying and changing actual camera runtime state;
  this is not merely pausing the browser video.
- Clear suspended presentation with only valid recovery controls available.
- Confirmation explaining provider-specific consequences for live video,
  detection, and recording.
- Backend authorization policy such as disabled, administrators only, or
  permitted users; frontend visibility is never the security boundary.
- Idempotent suspend/resume commands, progress state, typed failure recovery,
  and reconciliation from provider truth.
- Session-manager coordination so suspension closes or invalidates unusable
  retained connections and resume creates one fresh connection when visible.

### 6. Audio, mute intent, and automatic unmute

- Per-user, per-camera mute preference retained across layouts, editor entry,
  card instances, and Home Assistant route navigation within the document.
- Configurable startup audio/automatic unmute policy without overwriting the
  user's explicit mute choice.
- Appropriate policy scopes for phone, tablet, desktop, selected camera,
  background tiles, and multi-camera layouts based on capability and layout
  role rather than brittle user-agent checks.
- One audible-session focus policy by default, with forced mute reasons for
  hidden, parked, background, talkback, or safety conditions.
- Autoplay-denied state and user-gesture recovery separate from user mute.
- Audio intent applied before a reconnect or source takeover can become
  audible.
- Multi-camera/group audio selection without creating duplicate connections.

### 7. Camera controls

- Mute, fullscreen, Picture-in-Picture, snapshot capture, suspend/resume, and
  source/status controls using the shared overlay control primitive.
- Configurable control placement, order, visibility, device/layout matrix, and
  safe-area behavior supplied by the layout designer.
- Snapshot capture of the displayed frame, with a privacy-safe fallback when
  canvas extraction is unavailable; optional capture of current zoom/pan.
- Browser-native fullscreen and Picture-in-Picture with Firefox, WebKit,
  Companion, and Catalyst behavior isolated behind capability helpers.
- Optional AirPlay or platform media actions only where supported and useful.
- Typed control intents routed to the owning camera/session/provider service;
  controls do not contain provider or connection logic.

### 8. PTZ

- Capability-driven pan, tilt, zoom, and preset recall.
- Continuous press/hold motion with guaranteed stop on release, cancel,
  disconnect, visibility loss, or error.
- Direction remapping for rotated camera installations without rotating the
  provider's coordinate system implicitly.
- Compact directional controls and larger precision controls as alternate
  presentations of one PTZ command contract.
- Provider-reported presets, including explicit names; never assume the first
  preset is Home.
- Separation of optical/provider PTZ from browser display zoom and pan.
- Permissions, rate limiting, command serialization, and visible failure state.

### 9. Two-way talk

- Capability detection for provider backchannels and supported Home Assistant
  WebRTC paths.
- Explicit microphone permission and secure-context requirements.
- Separate outgoing talk session from retained incoming live playback when the
  transport requires it.
- Push-to-talk and/or latched talk modes decided from provider and UX testing.
- Talk start/stop, microphone mute, incoming-audio mute, audio focus, and live
  mute preference kept as distinct state.
- Full cancellation and cleanup for permission denial, camera switch, layout
  removal, backgrounding, disconnect, and late async completion.
- Optional lightweight audio-level visualization loaded only while required.

### 10. Events, reviews, clips, and snapshots

- Provider-normalized event/review model with alert/detection classification,
  camera, labels, zones, timestamps, media availability, and favorite/retain
  state.
- Independently placeable lists, compact lists, counters, badges, filters,
  calendars, and activity summaries.
- Clips, snapshots, and cross-navigation between related media.
- Progressive/windowed loading, cursor pagination, cancellation, deduplicated
  requests, and bounded caches.
- Filters for camera, provider, label, zone, classification, favorites, and
  date/time ranges.
- Favorite/retain mutations with optimistic UI only when provider semantics
  allow safe rollback.
- Media availability fallbacks that show a related snapshot or an actionable
  missing-media state instead of broken elements.
- Alert-driven camera promotion or takeover as an explicit layout policy, not
  hidden global behavior.

### 11. Recordings and recording segments

- Day/time navigation and continuous recording availability from providers
  that support it.
- A normalized recording-range model that represents playable spans, gaps,
  events, alerts, detections, and source changes.
- Segmented timeline/scrubber with markers, event preview, seeking, zoomed time
  scales, and bounded progressive loading.
- User-selected start/end ranges and downloads assembled or resolved by the
  backend/provider when supported.
- Optional pre/post-roll around event media without pretending unavailable
  recording spans exist.
- Camera-group recordings remain distinct tracks when their timelines overlap.
- WatchZone's recording-segment workflow will be designed around normalized
  ranges and backend capabilities rather than copying FrigateViewCard's segment
  editor or assuming every provider stores footage like Frigate.

### 12. Media viewer and downloads

- Modal/drawer/inline media viewer presentations reusable by event, recording,
  snapshot, and timeline modules.
- Paged carousel, touch swipe, keyboard navigation, zoom, pan, fullscreen,
  Picture-in-Picture, and intrinsic-aspect sizing as capabilities permit.
- Recording scrub markers with snapshot previews and clear loading/error state.
- Download clip, snapshot, recording range, or displayed frame through
  authenticated backend/provider operations.
- Abortable downloads, progress where measurable, filenames and MIME types
  from trusted metadata, and no credentials embedded in frontend URLs.

### 13. Timelines and activity visualization

- Independently placeable vertical or horizontal timelines driven by shared
  normalized event/recording queries rather than another copy of provider data.
- Configurable time range and scale, current-time anchoring, calendar/filter
  synchronization, dense-event grouping, and accessible non-visual summaries.
- Timeline selection emits typed camera/media/time intents that other modules
  may opt into.
- Responsive conversion between inline panel and overlay/drawer without owning
  the surrounding layout.

### 14. Linked Home Assistant entities and actions

- Capability-based controls for linked lights and future entities/actions.
- Home Assistant service calls through a typed frontend/backend boundary with
  permission-aware failures.
- On/off and supported brightness for lights, preserving Home Assistant's
  entity behavior rather than maintaining parallel state.
- Designer-controlled placement as a control module or camera overlay action.

### 15. Navigation, selection, and deep links

- Typed selection of active camera, event, recording range, and media item
  within a layout runtime.
- Optional synchronization between camera selectors, camera presentations,
  event lists, timelines, and media viewers through narrow shared state.
- Notification/deep-link resolution for cameras, events, reviews, clips, and
  snapshots with authorization and missing-target handling.
- Supported URL state is consumed once and cleaned without hardcoding Home
  Assistant dashboard paths.
- WatchZone internal navigation components may exist, but fixed application
  pages and global dashboard takeover are not assumed.

### 16. Operational quality

- Centralized structured logging with levels, redaction, duplicate/rate
  control, and opt-in diagnostics; the normal console remains one startup
  banner plus actionable problems.
- Redacted live-session diagnostics, startup timings, provider health, fallback
  history, lease ownership, and resource-budget visibility.
- Localization from the first broadly user-facing feature set.
- Accessible names, focus order, keyboard operation, reduced motion, text
  scaling, and screen-reader status announcements.
- Physical smoke matrix for Chrome, Edge, Firefox, Safari, iOS/iPadOS,
  Companion Android/iOS, and Catalyst in addition to automated browser tests.
- Security review for provider credentials, signed media, downloads, layout
  validation, permissions, microphone use, and external URLs.

## Dependency-oriented delivery sequence

This is an ordering guide, not a dated release plan.

1. **Foundation:** integration lifecycle, release packaging, theme tokens,
   editor lifecycle, single-camera presentation, retained HA Direct playback,
   basic overlays, and platform tests.
2. **Layout authority:** Python layout storage/API, module metadata, frontend
   layout runtime, and the first minimal designer workflow.
3. **Camera domain:** normalized camera catalog, provider capabilities,
   multiple provider instances, selectors, and stable camera IDs.
4. **Connection expansion:** source resolver, Frigate/go2rtc adapters,
   substreams/profiles, health/fallback policy, and resource budgets.
5. **Composable camera experiences:** companion cameras, walls/carousels,
   groups, snapshot/live promotion, suspend/resume, and configurable controls.
6. **Media domain:** events/reviews, clips, snapshots, favorites, filters,
   calendars, viewer, downloads, and deep links.
7. **Recording domain:** recording availability, normalized ranges, scrubber,
   segment selection/download, and timelines.
8. **Advanced camera control:** PTZ, presets, two-way talk, linked entities,
   startup audio policy, and richer audio focus.
9. **Designer maturity:** responsive constraints, templates, theming, import/
   export, permissions, conflict resolution, and safe migrations.
10. **Hardening:** localization, accessibility, diagnostics, performance
    budgets, physical-client validation, and security review across all prior
    capabilities.

## Decision gates before implementation

For each roadmap capability, confirm these before writing its feature code:

- Who owns the persisted data: integration config, Python layout storage,
  provider state, or browser-local preference?
- Is it a provider capability, connection capability, presentation option,
  interaction state, or user preference?
- What stable ID and typed contract cross the boundary?
- What is lazy-loaded, and what must remain in the eager shell?
- Which retained-session resources are acquired, transferred, parked, or
  closed?
- If the change is presentation-only, what preserves the canonical session and
  proves that no connection factory or renegotiation runs?
- What permissions and backend validation are required?
- What are the empty, loading, unavailable, suspended, denied, partial-failure,
  and retry states?
- How does it behave with touch, keyboard, phone/tablet/desktop containers,
  editor preview, Home Assistant navigation, and all supported engines/apps?
- Which semantic tokens does it consume, and can a future theme/layout designer
  control it without changing component CSS?
- What measurement or tests prove that the change does not add duplicate
  connections, unbounded data, eager code, or unnecessary rerenders?

## Explicitly excluded assumptions

- No fixed FrigateViewCard page/view hierarchy.
- No Frigate-only camera or media model in shared modules.
- No layout tree stored in Lovelace YAML.
- No frontend-only provider credentials or permission enforcement.
- No editor control treated as permanent merely because it exists today.
- No one transport, codec, browser, device class, or provider assumed to serve
  every camera.
- No speculative compatibility layers for pre-release schemas that have no
  real installed migration requirement.
