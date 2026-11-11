import { describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";
import {
  startExportJob,
  subscribeExportJobs,
  type ExportJob,
} from "../src/features/exports";

describe("export job workflow", () => {
  it("publishes failure when provider creation is rejected", async () => {
    const api = {
      callWS: vi.fn().mockRejectedValue(new Error("export rejected")),
      identity: {},
    } as unknown as HomeAssistantApi;
    let jobs: readonly ExportJob[] = [];
    const unsubscribe = subscribeExportJobs(api, (next) => {
      jobs = next;
    });

    startExportJob(api, {
      camera: "Front",
      name: "Visitor",
      range: { entity_id: "camera.front", start_time: 100, end_time: 120 },
      reviewId: "review-1",
    });

    await vi.waitFor(() => expect(jobs[0]?.status).toBe("failed"));
    unsubscribe();
  });
});
