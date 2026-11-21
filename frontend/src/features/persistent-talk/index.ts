import { PERSISTENT_TALK_TAG } from "../../core/constants";
import { PersistentTalkSession } from "./session";

const SESSION_KEY = Symbol.for("camera-optics.persistent-talk-session");

export function getPersistentTalkSession(): PersistentTalkSession {
  const runtime = window as unknown as Record<PropertyKey, unknown>;
  return (runtime[SESSION_KEY] ??=
    new PersistentTalkSession()) as PersistentTalkSession;
}

export async function ensurePersistentTalkTile(): Promise<void> {
  await import("./persistent-talk");
  if (document.querySelector(PERSISTENT_TALK_TAG)) return;
  document.body.append(document.createElement(PERSISTENT_TALK_TAG));
}

export type {
  PersistentTalkSnapshot,
  PersistentTalkSurface,
  PersistentTalkTarget,
} from "./session";
