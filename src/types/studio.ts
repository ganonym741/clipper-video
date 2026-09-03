import type {
  ClipStatus,
  ExportPreset,
  JobKind,
  JobStatus,
  MediaStatus,
  SourceKind,
  WorkspaceKind
} from "@prisma/client";

export type StudioProject = {
  id: string;
  title: string;
  workspace: WorkspaceKind;
  description: string | null;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
  media: SourceMediaRecord[];
  transcripts: TranscriptRecord[];
  clips: ClipRecord[];
  analyses: AnalysisRecord[];
  jobs: JobRecord[];
  exports: ExportRecord[];
};

export type SourceMediaRecord = {
  id: string;
  kind: SourceKind;
  status: MediaStatus;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  objectKey: string | null;
  originalUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TranscriptRecord = {
  id: string;
  speaker: string | null;
  startSec: number;
  endSec: number;
  text: string;
};

export type ClipRecord = {
  id: string;
  status: ClipStatus;
  workspace: WorkspaceKind;
  title: string;
  hook: string;
  startSec: number;
  endSec: number;
  score: number;
  reason: string;
  captionStyle: string | null;
  cropSuggestion: unknown;
  platformCopy: unknown;
  tags: string[];
};

export type AnalysisRecord = {
  id: string;
  workspace: WorkspaceKind;
  model: string;
  summary: string;
  raw: unknown;
  createdAt: string;
};

export type JobRecord = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  preset: ExportPreset | null;
  progress: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExportRecord = {
  id: string;
  clipId: string | null;
  preset: ExportPreset;
  fileName: string;
  mimeType: string;
  sizeBytes: string | null;
  durationSec: number | null;
  createdAt: string;
};

export type PreviewRecord = {
  playable: boolean;
  url: string | null;
  label: string;
  reason?: string;
};
