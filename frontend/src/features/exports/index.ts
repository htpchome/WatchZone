import {
  createExport,
  listExports,
  type ExportItem,
  type ExportRange,
} from "../../api/exports";
import type { HomeAssistantApi } from "../../core/home-assistant";

const EXPORT_POLL_INTERVAL_MS = 3_000;
const EXPORT_MISSING_LIMIT = 3;
const EXPORT_JOB_TIMEOUT_MS = 30 * 60 * 1_000;
const EXPORT_RESULT_VISIBLE_MS = 3_500;

export type ExportJobStatus =
  "submitting" | "processing" | "success" | "failed";

export interface ExportJob {
  readonly camera: string;
  readonly completedItem?: ExportItem;
  readonly createdTime: number;
  readonly entityId: string;
  readonly exportId?: string;
  readonly name: string;
  readonly requestId: string;
  readonly reviewId: string;
  readonly status: ExportJobStatus;
}

export interface StartExportJob {
  readonly camera: string;
  readonly name: string;
  readonly range: ExportRange;
  readonly reviewId: string;
}

export type ExportLibraryItem = ExportItem | ExportJob;

export function isExportJob(item: ExportLibraryItem): item is ExportJob {
  return "requestId" in item;
}

type ExportJobsListener = (jobs: readonly ExportJob[]) => void;

const managers = new WeakMap<HomeAssistantApi, ExportJobManager>();
let nextRequestId = 0;

/** Begin one provider-neutral export and track it through provider completion. */
export function startExportJob(
  api: HomeAssistantApi,
  input: StartExportJob,
): ExportJob {
  return manager(api).start(input);
}

/** Observe card-scoped export jobs without coupling Stage modules together. */
export function subscribeExportJobs(
  api: HomeAssistantApi,
  listener: ExportJobsListener,
): () => void {
  return manager(api).subscribe(listener);
}

function manager(api: HomeAssistantApi): ExportJobManager {
  let value = managers.get(api);
  if (!value) {
    value = new ExportJobManager(api);
    managers.set(api, value);
  }
  return value;
}

class ExportJobManager {
  private readonly _jobs = new Map<string, ExportJob>();
  private readonly _listeners = new Set<ExportJobsListener>();

  public constructor(private readonly _api: HomeAssistantApi) {}

  public start(input: StartExportJob): ExportJob {
    const active = [...this._jobs.values()].find(
      (job) =>
        job.entityId === input.range.entity_id &&
        job.reviewId === input.reviewId &&
        job.status !== "success" &&
        job.status !== "failed",
    );
    if (active) return active;

    const job: ExportJob = {
      camera: input.camera,
      createdTime: Date.now() / 1_000,
      entityId: input.range.entity_id,
      name: input.name,
      requestId: `export-${++nextRequestId}`,
      reviewId: input.reviewId,
      status: "submitting",
    };
    this._jobs.set(job.requestId, job);
    this._publish();
    void this._run(job, input.range);
    return job;
  }

  public subscribe(listener: ExportJobsListener): () => void {
    this._listeners.add(listener);
    listener(this._snapshot());
    return () => this._listeners.delete(listener);
  }

  private async _run(job: ExportJob, range: ExportRange): Promise<void> {
    let exportId: string;
    try {
      exportId = await createExport(this._api, range, job.name);
    } catch {
      this._finish(job, "failed");
      return;
    }

    let current = this._replace(job, { exportId, status: "processing" });
    const deadline = Date.now() + EXPORT_JOB_TIMEOUT_MS;
    let missingCount = 0;
    let errorCount = 0;
    while (Date.now() < deadline) {
      try {
        const items = await listExports(this._api, [job.entityId]);
        const item = items.find((candidate) => candidate.id === exportId);
        errorCount = 0;
        if (item) {
          missingCount = 0;
          if (!item.in_progress) {
            this._finish(current, "success", item);
            return;
          }
        } else if (++missingCount >= EXPORT_MISSING_LIMIT) {
          this._finish(current, "failed");
          return;
        }
      } catch {
        if (++errorCount >= EXPORT_MISSING_LIMIT) {
          this._finish(current, "failed");
          return;
        }
      }
      await wait(EXPORT_POLL_INTERVAL_MS);
      current = this._jobs.get(job.requestId) ?? current;
    }
    this._finish(current, "failed");
  }

  private _finish(
    job: ExportJob,
    status: "success" | "failed",
    completedItem?: ExportItem,
  ): void {
    const terminal = this._replace(job, {
      ...(completedItem ? { completedItem } : {}),
      status,
    });
    window.setTimeout(() => {
      if (this._jobs.get(terminal.requestId) !== terminal) return;
      this._jobs.delete(terminal.requestId);
      this._publish();
    }, EXPORT_RESULT_VISIBLE_MS);
  }

  private _replace(job: ExportJob, change: Partial<ExportJob>): ExportJob {
    const next = { ...job, ...change };
    this._jobs.set(job.requestId, next);
    this._publish();
    return next;
  }

  private _snapshot(): readonly ExportJob[] {
    return [...this._jobs.values()].sort(
      (left, right) => right.createdTime - left.createdTime,
    );
  }

  private _publish(): void {
    const jobs = this._snapshot();
    for (const listener of this._listeners) listener(jobs);
  }
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}
