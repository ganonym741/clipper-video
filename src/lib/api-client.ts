"use client";

import type { ClipStatus, ExportPreset, WorkspaceKind } from "@prisma/client";

async function requestJson<T>(
  path: string,
  token: string,
  init: RequestInit = {}
) {
  const isFormData = init.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    headers: {
      "x-clipper-device": token,
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...init.headers
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

export const studioApi = {
  projects(token: string) {
    return requestJson<{ projects: import("@/types/studio").StudioProject[] }>(
      "/api/projects",
      token
    );
  },
  createProject(
    token: string,
    input: { title: string; workspace: WorkspaceKind; description?: string }
  ) {
    return requestJson<{ project: import("@/types/studio").StudioProject }>(
      "/api/projects",
      token,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
  },
  deleteProject(token: string, projectId: string) {
    return requestJson<{ ok: true }>(`/api/projects/${projectId}`, token, {
      method: "DELETE"
    });
  },
  uploadIntent(
    token: string,
    input: { projectId: string; fileName: string; mimeType: string; sizeBytes: number }
  ) {
    return requestJson<{
      sourceMedia: import("@/types/studio").SourceMediaRecord;
      uploadUrl: string;
    }>("/api/media/uploads", token, {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  completeUpload(
    token: string,
    input: {
      projectId: string;
      sourceMediaId: string;
      durationSec?: number;
      width?: number;
      height?: number;
    }
  ) {
    return requestJson<{ sourceMedia: import("@/types/studio").SourceMediaRecord }>(
      "/api/media/complete",
      token,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
  },
  directUpload(
    token: string,
    input: {
      projectId: string;
      file: File;
      durationSec?: number;
      width?: number;
      height?: number;
      onProgress?: (progress: number) => void;
    }
  ) {
    const formData = new FormData();
    formData.append("projectId", input.projectId);
    formData.append("file", input.file);

    if (input.durationSec) formData.append("durationSec", String(input.durationSec));
    if (input.width) formData.append("width", String(input.width));
    if (input.height) formData.append("height", String(input.height));

    return new Promise<{ sourceMedia: import("@/types/studio").SourceMediaRecord }>(
      (resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/media/direct-upload");
        xhr.setRequestHeader("x-clipper-device", token);

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) {
            input.onProgress?.(15);
            return;
          }

          const progress = Math.round((event.loaded / event.total) * 88) + 5;
          input.onProgress?.(Math.min(progress, 95));
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            input.onProgress?.(100);
            resolve(JSON.parse(xhr.responseText));
            return;
          }

          reject(new Error(xhr.responseText || `Upload failed with ${xhr.status}`));
        };

        xhr.onerror = () => reject(new Error("Upload failed before the server responded"));
        xhr.onabort = () => reject(new Error("Upload canceled"));
        xhr.send(formData);
      }
    );
  },
  importUrl(token: string, input: { projectId: string; url: string; title?: string }) {
    return requestJson<{ sourceMedia: import("@/types/studio").SourceMediaRecord }>(
      "/api/media/import-url",
      token,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
  },
  analyze(
    token: string,
    input: { projectId: string; sourceMediaId: string; workspace: WorkspaceKind }
  ) {
    return requestJson<{ job: import("@/types/studio").JobRecord }>(
      "/api/ai/analyze",
      token,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
  },
  smartAutoClip(
    token: string,
    input: { projectId: string; sourceMediaId: string; workspace: WorkspaceKind }
  ) {
    return requestJson<{ job: import("@/types/studio").JobRecord }>(
      "/api/ai/smart-auto-clip",
      token,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
  },
  updateClip(
    token: string,
    clipId: string,
    input: { projectId: string; status?: ClipStatus }
  ) {
    return requestJson<{ clip: import("@/types/studio").ClipRecord }>(
      `/api/clips/${clipId}`,
      token,
      {
        method: "PATCH",
        body: JSON.stringify(input)
      }
    );
  },
  createClip(
    token: string,
    input: {
      projectId: string;
      sourceMediaId?: string;
      workspace: WorkspaceKind;
      title: string;
      hook: string;
      startSec: number;
      endSec: number;
      reason?: string;
    }
  ) {
    return requestJson<{ clip: import("@/types/studio").ClipRecord }>("/api/clips", token, {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  render(
    token: string,
    input: { projectId: string; clipId: string; preset: ExportPreset }
  ) {
    return requestJson<{ job: import("@/types/studio").JobRecord }>(
      "/api/renders",
      token,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
  },
  cancelJob(token: string, jobId: string) {
    return requestJson<{
      job: import("@/types/studio").JobRecord;
      queueState: "removed" | "active" | "not-found" | "unchanged";
    }>(`/api/jobs/${jobId}/cancel`, token, {
      method: "POST"
    });
  },
  assetDownload(token: string, assetId: string) {
    return requestJson<{ url: string; fileName: string }>(
      `/api/assets/${assetId}/download`,
      token
    );
  }
};
