import type { ReactiveController, ReactiveControllerHost } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  HomeAssistantApi,
  HomeAssistantConnection,
  HomeAssistantConnectionEvent,
  HomeAssistantConnectionEventListener,
  HomeAssistantMessage,
} from "../src/core/home-assistant";
import type { CameraRuntimeSnapshot } from "../src/api/camera-runtime";
import { CameraRuntimeController } from "../src/stage/modules/camera/runtime.controller";
import { CAMERA_RUNTIME_RESUBSCRIBE_DELAYS_MS } from "../src/stage/modules/camera/constants";

class TestHost implements ReactiveControllerHost {
  public readonly requestUpdate = vi.fn<() => void>();
  public readonly updateComplete = Promise.resolve(true);

  public addController(controller: ReactiveController): void {
    void controller;
  }

  public removeController(controller: ReactiveController): void {
    void controller;
  }
}

class TestConnection implements HomeAssistantConnection {
  public connected = true;
  public subscriptions = 0;
  public resubscribeOptions: Array<boolean | undefined> = [];
  public subscriptionFailures = 0;
  private readonly _listeners = new Map<
    HomeAssistantConnectionEvent,
    Set<HomeAssistantConnectionEventListener>
  >();

  public addEventListener(
    event: HomeAssistantConnectionEvent,
    listener: HomeAssistantConnectionEventListener,
  ): void {
    const listeners = this._listeners.get(event) ?? new Set();
    listeners.add(listener);
    this._listeners.set(event, listeners);
  }

  public removeEventListener(
    event: HomeAssistantConnectionEvent,
    listener: HomeAssistantConnectionEventListener,
  ): void {
    this._listeners.get(event)?.delete(listener);
  }

  public async subscribeMessage<T>(
    callback: (message: T) => void,
    message: HomeAssistantMessage,
    options?: { readonly resubscribe?: boolean },
  ): Promise<() => void> {
    this.subscriptions += 1;
    this.resubscribeOptions.push(options?.resubscribe);
    if (this.subscriptionFailures > 0) {
      this.subscriptionFailures -= 1;
      throw new Error("Command not registered yet");
    }
    callback({
      available: true,
      entity_id: message.entity_id,
      provider: "frigate",
      resume_at: null,
      supported: true,
      suspended: false,
    } as T);
    return () => undefined;
  }

  public emit(event: HomeAssistantConnectionEvent): void {
    for (const listener of this._listeners.get(event) ?? []) {
      listener(this);
    }
  }
}

describe("CameraRuntimeController", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("preserves capability state and resubscribes after HA reconnects", async () => {
    const host = new TestHost();
    const connection = new TestConnection();
    const api: HomeAssistantApi = {
      identity: connection,
      callWS: async <T>() => undefined as T,
      resolveUrl: (path) => path,
      subscribeMessage: (callback, message, options) =>
        connection.subscribeMessage(callback, message, options),
    };
    const controller = new CameraRuntimeController(host);
    controller.hostConnected();
    controller.configure(api, "camera.front");
    await Promise.resolve();

    expect(controller.snapshot?.supported).toBe(true);
    expect(connection.subscriptions).toBe(1);
    expect(connection.resubscribeOptions).toEqual([false]);

    connection.connected = false;
    connection.emit("disconnected");
    expect(controller.snapshot?.supported).toBe(true);

    connection.connected = true;
    connection.emit("ready");
    await Promise.resolve();

    expect(connection.subscriptions).toBe(2);
    expect(connection.resubscribeOptions).toEqual([false, false]);
    expect(controller.snapshot?.supported).toBe(true);
  });

  it("preserves capability state and retries a registration race after HA restarts", async () => {
    vi.useFakeTimers();
    const host = new TestHost();
    const connection = new TestConnection();
    const api: HomeAssistantApi = {
      identity: connection,
      callWS: async <T>() => undefined as T,
      resolveUrl: (path) => path,
      subscribeMessage: (callback, message, options) =>
        connection.subscribeMessage(callback, message, options),
    };
    const controller = new CameraRuntimeController(host);
    controller.hostConnected();
    controller.configure(api, "camera.front");
    await Promise.resolve();

    expect(controller.snapshot?.supported).toBe(true);
    connection.emit("disconnected");
    connection.subscriptionFailures = 1;
    connection.emit("ready");
    await Promise.resolve();

    expect(connection.subscriptions).toBe(2);
    expect(controller.snapshot?.supported).toBe(true);

    await vi.advanceTimersByTimeAsync(CAMERA_RUNTIME_RESUBSCRIBE_DELAYS_MS[0]);

    expect(connection.subscriptions).toBe(3);
    expect(controller.snapshot?.supported).toBe(true);
    expect(connection.resubscribeOptions).toEqual([false, false, false]);
  });

  it("clears a pending command when the HA connection is interrupted", async () => {
    const host = new TestHost();
    const connection = new TestConnection();
    let resolveCommand: ((snapshot: CameraRuntimeSnapshot) => void) | undefined;
    const api: HomeAssistantApi = {
      identity: connection,
      callWS: <T>() =>
        new Promise<T>((resolve) => {
          resolveCommand = resolve as (snapshot: CameraRuntimeSnapshot) => void;
        }),
      resolveUrl: (path) => path,
      subscribeMessage: (callback, message, options) =>
        connection.subscribeMessage(callback, message, options),
    };
    const controller = new CameraRuntimeController(host);
    controller.hostConnected();
    controller.configure(api, "camera.front");
    await Promise.resolve();

    const command = controller.setSuspended(true);
    expect(controller.pending).toBe(true);
    connection.emit("disconnected");
    expect(controller.pending).toBe(false);
    resolveCommand?.({
      available: true,
      entity_id: "camera.front",
      provider: "frigate",
      resume_at: null,
      supported: true,
      suspended: true,
    });
    await command;

    expect(controller.pending).toBe(false);
    expect(controller.snapshot?.suspended).toBe(false);
  });
});
