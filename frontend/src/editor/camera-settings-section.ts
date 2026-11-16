import { html } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import { cameraPresentationItems } from "../core/camera-groups";
import type { CameraConfig, CardConfig } from "../core/config";
import {
  MAX_CAMERAS,
  SORTABLE_LIST_TAG,
  SORTABLE_TILE_TAG,
} from "../core/constants";
import type { LocalizeFunction } from "../core/localization";
import { renderIcon } from "../ui/icons";

interface CameraSettingsOptions {
  readonly cameraName: (entityId: string) => string;
  readonly cameraDisplayName: (camera: CameraConfig) => string;
  readonly cameraSummary: (camera: CameraConfig) => string;
  readonly config?: CardConfig;
  readonly localize: LocalizeFunction;
  readonly onAddCamera: () => void;
  readonly onEditAdditionalCamera: (event: Event) => void;
  readonly onEditCamera: (event: Event) => void;
  readonly onRequestRemoveCamera: (event: Event) => void;
}

const sortableListTag = unsafeStatic(SORTABLE_LIST_TAG);
const sortableTileTag = unsafeStatic(SORTABLE_TILE_TAG);

export function renderCameraSettings(options: CameraSettingsOptions) {
  const { config, localize } = options;
  const cameras = config?.cameras ?? [];
  const presentationItems = cameraPresentationItems(cameras);
  const secondaryCameras = cameras.flatMap((camera) => {
    const owner = cameras.find(
      ({ additional_camera: group }) => group?.entity_id === camera.entity_id,
    );
    return owner ? [{ camera, owner }] : [];
  });
  return staticHtml`${config?.stage_type === "minimal_camera_only" ? html`<p class="editor-guidance">${localize("editor.minimal_camera_first_only")}</p>` : null}<div class="camera-list-heading">
      <strong>${localize("editor.cameras")}</strong>
      <span>${localize("editor.camera_count", {
        count: cameras.length,
        maximum: MAX_CAMERAS,
      })}</span>
    </div>
    <${sortableListTag}
      data-sortable-scope="cameras"
      aria-label=${localize("editor.configured_cameras")}
    >
      ${repeat(
        presentationItems,
        (item) => item.id,
        (item) => {
          const camera = item.cameras[0];
          const index = cameras.indexOf(camera);
          const displayName = options.cameraDisplayName(camera);
          return staticHtml`<${sortableTileTag}
          item-key=${camera.entity_id}
          .localize=${localize}
        >
          <div class="camera-tile-copy">
            <span>${displayName}</span>
            <small>${options.cameraSummary(camera)}</small>
          </div>
          <button
            slot="actions"
            class="tile-action"
            type="button"
            title=${localize("editor.edit_camera")}
            aria-label=${localize("editor.edit_camera_named", {
              name: displayName,
            })}
            data-camera-index=${String(index)}
            @click=${options.onEditCamera}
          >
            ${renderIcon("edit")}
          </button>
          <button
            slot="actions"
            class="tile-action"
            type="button"
            title=${localize("editor.remove_camera")}
            aria-label=${localize("editor.remove_camera_named", {
              name: displayName,
            })}
            data-camera-index=${String(index)}
            @click=${options.onRequestRemoveCamera}
          >
            ${renderIcon("remove")}
          </button>
        </${sortableTileTag}>`;
        },
      )}
    </${sortableListTag}>
    <div class="secondary-camera-list">
      ${secondaryCameras.map(({ camera, owner }) => {
        const name = camera.title || options.cameraName(camera.entity_id);
        const group = owner.group_name || options.cameraName(owner.entity_id);
        const ownerIndex = cameras.indexOf(owner);
        return html`<div class="secondary-camera-tile">
          <span class="secondary-camera-copy">
            ${name} · ${localize("editor.grouped_with", { group })}
          </span>
          <button
            class="tile-action"
            type="button"
            title=${localize("editor.edit_camera")}
            aria-label=${localize("editor.edit_camera_named", { name })}
            data-camera-index=${String(ownerIndex)}
            @click=${options.onEditAdditionalCamera}
          >
            ${renderIcon("edit")}
          </button>
        </div>`;
      })}
    </div>
    <button
      class="add-camera"
      type="button"
      ?disabled=${cameras.length >= MAX_CAMERAS}
      @click=${options.onAddCamera}
    >
      ${localize("editor.add_camera")}
    </button>`;
}
