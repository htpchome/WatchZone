# Live Session Lifecycle and Audio-State Contract

## 1. Status and scope

This document is normative. It expands the retained-media requirements in
`architecture.md` and governs every WatchZone live connection adapter, live
module, preview surface, editor surface, and card instance.

Its goals are to:

- Preserve healthy live connections across WatchZone layout and view changes.
- Preserve connections while moving between normal view, pre-editor, and
  editor preview.
- Preserve eligible connections while navigating within Home Assistant's
  single-page application.
- Prevent duplicate sessions for the same resolved source.
- Bound background bandwidth, decoders, memory, and provider connections.
- Preserve explicit user mute choices across all automatic behavior.

## 2. Guarantees and limits

WatchZone guarantees retention only while the same Home Assistant browser
document and JavaScript realm remain alive.

Retention is expected across:

- Module rerenders.
- Responsive reflow and module movement.
- WatchZone layout changes.
- WatchZone internal view changes.
- Dashboard edit mode and WatchZone pre-editor/editor preview.
- Navigation to another dashboard or another Home Assistant route when the
  frontend keeps the same document alive.

Retention cannot be guaranteed across:

- Hard refresh or direct URL reload.
- Browser tab or process termination.
- Home Assistant frontend restart or module replacement.
- Device sleep that terminates network or decoder resources.
- Provider restart, expired authorization, or network loss.
- Browser resource reclamation outside WatchZone's control.

After a non-retainable transition, WatchZone reconnects from saved camera and
audio preferences without claiming the original connection survived.

## 3. Ownership model

### 3.1 Document-scoped manager

`MediaSessionManager` owns every live session. Its lifetime is the Home
Assistant browser document, not the lifetime of a Lit element.

The manager is created by the eager WatchZone entry and obtained through one
idempotent accessor. Re-evaluating or accidentally loading the entry twice must
reuse the compatible existing manager rather than create a second pool.

The manager must not depend on a specific card, layout, editor, or module.

### 3.2 Session

A `MediaSession` owns one resolved live connection and its expensive resources,
which may include:

- WebSocket, WebRTC, HLS, or MSE transport state.
- Peer connections and data channels.
- Media streams, source buffers, object URLs, or session-owned media elements.
- Connection health and retry state.
- Playback and audio state.
- Adapter-specific cleanup callbacks.

A session never owns layout placement or module configuration.

### 3.3 Lease

A consumer does not own a session directly. It acquires a typed lease from the
manager and releases that lease when its need ends.

Lease purposes include:

- Visible playback.
- Editor preview.
- Pre-editor preview.
- Warm retention during a transition.
- Explicit user pinning where supported.

Releasing the last visible lease does not immediately close the session. It
moves the session into retention policy evaluation.

### 3.4 Presentation attachment

Presentation is separate from connection ownership. A session can be detached
from one live module and attached to another without renegotiating its source.

An adapter declares one supported attachment strategy:

- **Stream attachment:** A retained `MediaStream` is attached to a new media
  element.
- **Element attachment:** A session-owned media element is reparented into the
  active presentation host.
- **Adapter attachment:** The adapter provides another explicit attach/detach
  mechanism with equivalent retention behavior.

Adapters that cannot retain across attachment changes must declare that limit
and may not silently claim full retention support.

## 4. Identity and pooling

The manager pools by a canonical `MediaSessionKey`, not by camera display name,
DOM location, card ID, or layout node ID.

The key includes every value that changes the underlying connection identity,
such as:

- WatchZone camera ID.
- Resolved live source ID and connection type.
- Stream profile or quality selection.
- Authentication/session scope when relevant.
- Material adapter options.

Two consumers with the same key share one session. Consumers requiring
different source identities receive different sessions.

Session keys must not contain bearer tokens, signed URLs, or other secrets in
logs, diagnostics, DOM attributes, or persistent preference storage.

## 5. Session states

A session has one explicit state:

```text
new
  -> connecting
  -> live
  -> parked
  -> reconnecting
  -> failed
  -> closing
  -> closed
```

Required semantics:

- `new`: Allocated but no connection work has started.
- `connecting`: Initial adapter connection is in progress.
- `live`: Connection is healthy; it may be attached or temporarily detached.
- `parked`: Retained without a visible attachment. Adapter-specific work that
  can be paused without losing the connection may be paused.
- `reconnecting`: A bounded reconnect attempt is in progress.
- `failed`: Retry policy is exhausted or user action is required.
- `closing`: Cleanup is in progress and no new lease may attach.
- `closed`: All adapter resources are released; the session is removed from the
  pool.

Transitions are serialized by the manager. Late async completions from an old
generation must not revive a replaced or closed session.

## 6. Retention behavior

### 6.1 Layout and view changes

When a layout or view changes:

1. Existing sessions remain in the manager.
2. New presentation surfaces acquire their leases.
3. Matching session keys reuse the existing session.
4. Presentation attachment transfers to the new surface.
5. Old surfaces release their leases after handoff.
6. Sessions with no remaining lease enter retention policy evaluation.

The implementation must not close all sessions as an intermediate step.

### 6.2 Editor and preview

Entering pre-editor or editor mode must not create a second session for the
same key merely because the preview uses a different component tree.

- Saved-layout and draft previews share compatible sessions.
- A draft that selects a different camera or source acquires a distinct lease.
- Leaving the editor returns attachment to the rendered card before releasing
  the preview lease where possible.
- Cancelling a draft removes only resources introduced solely by that draft.
- For element-backed transports, releasing the editor lease republishes the
  existing live session snapshot to remaining pre-editor/card leases. The
  remaining presentation reclaims the same media element; this handoff must
  not invoke the connection factory or renegotiate the source.
- A retained session that reports failure while parked is not considered
  reusable. Its next visible lease starts one bounded reconnect rather than
  presenting the stale media object as live.

### 6.3 Home Assistant route navigation

When WatchZone card elements disconnect because the user navigates elsewhere
inside Home Assistant:

- Elements release presentation leases; they do not directly close sessions.
- The manager parks eligible sessions.
- The manager applies background audio safety policy immediately.
- Returning consumers reacquire sessions by key.
- Retention remains subject to resource limits and eviction.

No detached card element may be kept alive solely to preserve a connection.
The manager retains only the media resources it owns.

## 7. Resource budgets and eviction

Retention must be bounded by a policy containing at least:

- Maximum total retained sessions.
- Maximum simultaneously connected sessions.
- Maximum audible sessions.
- Adapter-specific decoder or bandwidth limits where measurable.
- Maximum idle retention duration unless explicitly pinned.

Exact defaults are implementation decisions that require measurement on
representative desktop and mobile Home Assistant clients. They are centralized
in one policy and are not scattered through modules.

Eviction priority is deterministic. Unless a future requirement overrides it,
the manager protects sessions in this order:

1. Visible and attached.
2. Audible and user-focused.
3. Explicitly pinned.
4. Editor/pre-editor preview.
5. Most recently visible.
6. Parked and least recently used.

Eviction calls the adapter's complete close path, revokes object URLs, removes
listeners, cancels retries, and clears session-owned media resources. A closed
session object is never returned to a new lease.

## 8. Connection adapter contract

Every connection adapter must provide equivalent operations for:

- Creating a session from a validated source descriptor.
- Connecting with cancellation and timeout support.
- Reporting health and state changes.
- Attaching to a presentation target.
- Detaching or parking without accidental closure.
- Updating quality or other supported mutable settings.
- Applying effective audio state.
- Reconnecting under manager policy.
- Closing idempotently and completely.

The manager owns policy. An adapter owns transport mechanics. Adapters must not
invent independent retention, audio-preference, retry, or eviction policies.

## 9. Audio model

### 9.1 Separate values

WatchZone tracks these values separately:

- **User preference:** `default`, `muted`, or `unmuted` for a camera.
- **Forced mute reasons:** A set of temporary safety or platform conditions.
- **Effective mute:** The state applied to the current media session.
- **Autoplay status:** Whether the browser allowed the desired audible state.

Conceptually:

```text
effective_muted =
  forced_mute_reasons is not empty
  OR user_preference == muted
  OR (user_preference == default AND automatic_default_is_muted)
```

An explicit `unmuted` preference does not defeat a forced safety mute. It is
restored when the final forced reason clears and browser policy permits.

### 9.2 Invariants

- Automatic behavior never changes `user_preference`.
- Automatic behavior never unmutes a camera whose user preference is `muted`.
- Muting because a session is hidden, parked, backgrounded, or loses audio
  focus adds a forced reason; it does not overwrite preference.
- Clearing one forced reason does not unmute while another remains.
- Browser autoplay rejection does not change preference to `muted`.
- UI state distinguishes user-muted, automatically muted, and autoplay-blocked
  conditions.
- A reconnect applies mute before audible media can play.

### 9.3 Scope and lifetime

User mute preference is keyed by stable WatchZone camera ID and scoped to:

- The current Home Assistant browser document and JavaScript realm.
- The authenticated user represented by that document.

It is held in memory by the document-scoped media-session manager. It survives
card replacement, editor transitions, Home Assistant route changes, browser
tab backgrounding, and window minimization while that document remains alive.
A hard refresh, discarded tab, new browser tab, or new document clears the
override and returns the camera to its configured startup default.

The configured default may independently request unmuted startup for phone or
tablet/desktop client form factors. Both defaults are muted unless explicitly
enabled. A configured default is not a user preference: the first explicit
mute or unmute action overrides it for that camera for the rest of the
document lifetime.

If the user or camera cannot be identified safely, preference defaults to
muted rather than borrowing another user's or camera's choice.

### 9.4 Audio focus

WatchZone defaults to one audible session per document unless a future explicit
feature permits more.

Granting audio focus to one session temporarily forces other sessions muted.
It does not rewrite their user preferences. When focus returns, the receiving
session restores its desired state subject to autoplay rules.

## 10. Visibility and background policy

Visibility changes affect presentation and forced mute, not user preference.

- A hidden or parked session is forced muted immediately.
- The manager may reduce quality or pause decoders when an adapter can do so
  without losing the retained connection.
- `document.visibilityState`, route state, module visibility, and intersection
  state are inputs to centralized policy, not independent competing handlers.
- Returning to visibility removes only the forced reasons that no longer
  apply.

## 11. Failure and reconnect behavior

- Reconnect attempts are bounded, cancellable, and use backoff with jitter.
- A new visible lease may request immediate retry without creating a duplicate
  session.
- Authentication failures return to backend source resolution before retrying
  stale credentials or signed URLs.
- Adapter failure is contained to that session and does not close unrelated
  cameras.
- If an alternate source descriptor exists, fallback creates or selects the
  appropriate session explicitly and preserves the camera's user mute
  preference.
- Failure UI reflects connection state without discarding the retained session
  until policy closes it.

## 12. Cleanup

Cleanup occurs when the manager evicts a session, the integration becomes
unavailable, the document unloads where callbacks are possible, or an explicit
stop closes the session.

Cleanup is idempotent and includes:

- Cancelling in-flight connection and reconnect work.
- Removing event listeners and observers.
- Stopping owned media tracks when they are not shared elsewhere.
- Closing peer connections, sockets, workers, and source buffers.
- Revoking object URLs.
- Detaching and clearing media elements.
- Removing the session from indexes and audio focus.

Element `disconnectedCallback` releases that element's lease and observers; it
does not unconditionally close the underlying media session.

## 13. Diagnostics

Development diagnostics may expose:

- Redacted session key.
- Adapter type.
- State and state-transition timestamps.
- Lease count and purposes.
- Attachment status.
- Retention and eviction reason.
- Effective mute, preference category, forced reasons, and autoplay status.
- Reconnect count and redacted error category.

Diagnostics never expose tokens, credentials, signed URLs, or provider-secret
parameters.

## 14. Required tests

The media-session implementation is incomplete without automated tests for:

- Concurrent acquisition deduplication.
- Lease transfer between components without reconnecting.
- Responsive reparenting or reattachment.
- Layout and internal view changes.
- Pre-editor and editor entry, save, cancel, and exit.
- Navigation away and return within the same Home Assistant document.
- Last-lease retention and deterministic eviction.
- Resource-budget enforcement.
- Close/reconnect races and stale async completion.
- Adapter cleanup idempotency.
- Per-camera mute preference retention within one document and reset in a new
  document.
- Explicit mute surviving automatic unmute conditions.
- Forced mute removal restoring desired state.
- Multiple simultaneous forced mute reasons.
- Audio-focus transfer.
- Browser autoplay rejection and later user-gesture recovery.
- Fallback between source descriptors without losing camera audio preference.

At least one browser-level test must count connection creation calls across a
route or editor transition and prove the count does not increase for an
unchanged session key.
