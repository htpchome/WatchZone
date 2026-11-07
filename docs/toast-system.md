# Shared Toast System

`ToastManager` owns notice identity, keyed replacement, finite timing, fade
transitions, and lifecycle cleanup. `wzc-toast-region` owns presentation for
both media overlays and inline application surfaces.

Notices use success, warning, or error severity. Ordinary notices expire on the
centralized timer. A persistent notice is allowed for current application
state, such as the editor's clean/unsaved indicator, and must still use a keyed
notice so state changes replace rather than stack messages.

All toast surfaces consume the same semantic `--wzc-toast-*` tokens. The
glass-like appearance uses translucent severity fills, a border, shadow, and
an inset highlight. It must not use `backdrop-filter`, blur, or a separate
feature-specific toast style. Inline regions stretch to their container;
overlay regions remain width-bounded and safe-area aware.

Runtime warnings and errors are presented only through a shared toast region.
The card-level overlay owns layout, Stage, module, and component preparation
failures; feature overlays own failures from an already-running feature. Stage
content must not render inline warning/error text or retry controls over camera
media.
