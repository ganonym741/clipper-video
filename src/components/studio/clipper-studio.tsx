"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExportPreset } from "@prisma/client";
import {
  Bot,
  Check,
  Clock3,
  Download,
  ExternalLink,
  FileVideo,
  Film,
  LinkIcon,
  Loader2,
  Plus,
  Play,
  Scissors,
  Send,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  XCircle
} from "lucide-react";
import { toast } from "sonner";
import { useDeviceToken } from "@/hooks/use-device-token";
import { studioApi } from "@/lib/api-client";
import { exportPresets } from "@/lib/exports";
import { secondsToTimecode } from "@/lib/utils";
import { workspaceCopy, workspaceKinds } from "@/lib/workspaces";
import { useStudioStore } from "@/store/studio-store";
import type {
  ClipRecord,
  JobRecord,
  PreviewRecord,
  SourceMediaRecord,
  StudioProject
} from "@/types/studio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

type ManualClipDraft = {
  title: string;
  hook: string;
  startSec: string;
  endSec: string;
};

const defaultManualClip: ManualClipDraft = {
  title: "",
  hook: "",
  startSec: "0",
  endSec: "30"
};

type LocalProgress = {
  label: string;
  detail: string;
  value: number;
};

type ReviewTarget = {
  kind: "source" | "export";
  id: string;
};

function formatBytes(value: string | null) {
  if (!value) return "";
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getVideoMetadata(file: File) {
  return new Promise<{ durationSec?: number; width?: number; height?: number }>((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        durationSec: Number.isFinite(video.duration) ? video.duration : undefined,
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    video.src = url;
  });
}

function currentReadyMedia(project: StudioProject | undefined) {
  return project?.media.find((media) => media.status === "READY");
}

export function ClipperStudio() {
  const token = useDeviceToken();
  const queryClient = useQueryClient();
  const {
    workspace,
    selectedProjectId,
    selectedClipId,
    exportPreset,
    setWorkspace,
    setSelectedProjectId,
    setSelectedClipId,
    setExportPreset
  } = useStudioStore();
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [manualClip, setManualClip] = useState(defaultManualClip);
  const [uploadProgress, setUploadProgress] = useState<LocalProgress | null>(null);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["projects", token],
    queryFn: () => studioApi.projects(token!),
    enabled: Boolean(token),
    refetchInterval: 4_000
  });

  const projects = useMemo(() => projectsQuery.data?.projects ?? [], [projectsQuery.data?.projects]);
  const activeProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const readyMedia = currentReadyMedia(activeProject);
  const workspaceClips = useMemo(
    () => activeProject?.clips.filter((clip) => clip.workspace === workspace) ?? [],
    [activeProject?.clips, workspace]
  );
  const selectedClip =
    workspaceClips.find((clip) => clip.id === selectedClipId) ?? workspaceClips[0];
  const activeAnalysis = activeProject?.analyses.find(
    (analysis) => analysis.workspace === workspace
  );
  const activeJobs =
    activeProject?.jobs.filter((job) => job.status === "QUEUED" || job.status === "PROCESSING") ??
    [];
  const queuedJobs = activeJobs.filter((job) => job.status === "QUEUED");
  const exportIds = activeProject?.exports.map((asset) => asset.id).join(",") ?? "";

  const previewQuery = useQuery({
    queryKey: ["review-preview", token, reviewTarget?.kind, reviewTarget?.id],
    queryFn: async (): Promise<PreviewRecord> => {
      if (!reviewTarget) throw new Error("No review target selected");

      if (reviewTarget.kind === "source") {
        return studioApi.mediaPreview(token!, reviewTarget.id);
      }

      const asset = await studioApi.assetDownload(token!, reviewTarget.id);
      return {
        playable: true,
        url: asset.url,
        label: asset.fileName
      };
    },
    enabled: Boolean(token && reviewTarget)
  });

  useEffect(() => {
    if (!selectedProjectId && projects[0]) {
      setSelectedProjectId(projects[0].id);
      setWorkspace(projects[0].workspace);
    }
  }, [projects, selectedProjectId, setSelectedProjectId, setWorkspace]);

  useEffect(() => {
    if (activeProject && activeProject.workspace !== workspace && !selectedProjectId) {
      setWorkspace(activeProject.workspace);
    }
  }, [activeProject, selectedProjectId, setWorkspace, workspace]);

  useEffect(() => {
    if (workspaceClips[0] && !workspaceClips.some((clip) => clip.id === selectedClipId)) {
      setSelectedClipId(workspaceClips[0].id);
    }
  }, [selectedClipId, setSelectedClipId, workspaceClips]);

  useEffect(() => {
    if (!activeProject) {
      setReviewTarget(null);
      return;
    }

    const targetStillExists =
      reviewTarget?.kind === "source"
        ? activeProject.media.some((media) => media.id === reviewTarget.id)
        : reviewTarget?.kind === "export"
          ? activeProject.exports.some((asset) => asset.id === reviewTarget.id)
          : false;

    if (targetStillExists) {
      return;
    }

    if (readyMedia) {
      setReviewTarget({ kind: "source", id: readyMedia.id });
      return;
    }

    if (activeProject.exports[0]) {
      setReviewTarget({ kind: "export", id: activeProject.exports[0].id });
      return;
    }

    setReviewTarget(null);
  }, [activeProject, exportIds, readyMedia, reviewTarget]);

  const invalidateProjects = () =>
    queryClient.invalidateQueries({
      queryKey: ["projects", token]
    });

  const createProjectMutation = useMutation({
    mutationFn: (title: string) =>
      studioApi.createProject(token!, {
        title,
        workspace,
        description: workspaceCopy[workspace].description
      }),
    onSuccess: ({ project }) => {
      setNewProjectTitle("");
      setSelectedProjectId(project.id);
      void invalidateProjects();
      toast.success("Project created");
    },
    onError: (error) => toast.error(String(error))
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!activeProject) throw new Error("Create a project first");
      setUploadProgress({
        label: "Uploading source",
        detail: "Reading video metadata",
        value: 3
      });
      const metadata = await getVideoMetadata(file);
      setUploadProgress({
        label: "Uploading source",
        detail: "Sending video to RustFS through backend",
        value: 8
      });

      return studioApi.directUpload(token!, {
        projectId: activeProject.id,
        file,
        ...metadata,
        onProgress: (value) =>
          setUploadProgress({
            label: "Uploading source",
            detail: value >= 100 ? "Upload complete" : "Sending video to RustFS through backend",
            value
          })
      });
    },
    onSuccess: () => {
      void invalidateProjects();
      toast.success("Video uploaded");
      window.setTimeout(() => setUploadProgress(null), 1200);
    },
    onError: (error) => {
      setUploadProgress({
        label: "Upload failed",
        detail: String(error),
        value: 100
      });
      toast.error(String(error));
    }
  });

  const importMutation = useMutation({
    mutationFn: () => {
      if (!activeProject) throw new Error("Create a project first");
      return studioApi.importUrl(token!, {
        projectId: activeProject.id,
        url: importUrl
      });
    },
    onSuccess: () => {
      setImportUrl("");
      void invalidateProjects();
      toast.success("Source imported");
    },
    onError: (error) => toast.error(String(error))
  });

  const analyzeMutation = useMutation({
    mutationFn: () => {
      if (!activeProject || !readyMedia) throw new Error("Add a ready source first");
      return studioApi.analyze(token!, {
        projectId: activeProject.id,
        sourceMediaId: readyMedia.id,
        workspace
      });
    },
    onSuccess: () => {
      void invalidateProjects();
      toast.success("Gemini analysis queued");
    },
    onError: (error) => toast.error(String(error))
  });

  const smartAutoClipMutation = useMutation({
    mutationFn: () => {
      if (!activeProject || !readyMedia) throw new Error("Add a ready source first");
      return studioApi.smartAutoClip(token!, {
        projectId: activeProject.id,
        sourceMediaId: readyMedia.id,
        workspace
      });
    },
    onSuccess: () => {
      void invalidateProjects();
      toast.success("Smart auto clip queued");
    },
    onError: (error) => toast.error(String(error))
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: string) => studioApi.deleteProject(token!, projectId),
    onSuccess: (_result, projectId) => {
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null);
        setSelectedClipId(null);
      }

      void invalidateProjects();
      toast.success("Project deleted");
    },
    onError: (error) => toast.error(String(error))
  });

  const cancelJobMutation = useMutation({
    mutationFn: (jobId: string) => studioApi.cancelJob(token!, jobId),
    onSuccess: ({ queueState }) => {
      void invalidateProjects();
      toast.success(queueState === "active" ? "Stop requested" : "Job canceled");
    },
    onError: (error) => toast.error(String(error))
  });

  const manualClipMutation = useMutation({
    mutationFn: () => {
      if (!activeProject) throw new Error("Create a project first");
      return studioApi.createClip(token!, {
        projectId: activeProject.id,
        sourceMediaId: readyMedia?.id,
        workspace,
        title: manualClip.title || "Manual clip",
        hook: manualClip.hook || manualClip.title || "Manual timestamp selection",
        startSec: Number(manualClip.startSec),
        endSec: Number(manualClip.endSec)
      });
    },
    onSuccess: () => {
      setManualClip(defaultManualClip);
      void invalidateProjects();
      toast.success("Clip added");
    },
    onError: (error) => toast.error(String(error))
  });

  const renderMutation = useMutation({
    mutationFn: (clip: ClipRecord) => {
      if (!activeProject) throw new Error("Create a project first");
      return studioApi.render(token!, {
        projectId: activeProject.id,
        clipId: clip.id,
        preset: exportPreset
      });
    },
    onSuccess: () => {
      void invalidateProjects();
      toast.success("Render queued");
    },
    onError: (error) => toast.error(String(error))
  });

  const selectClipMutation = useMutation({
    mutationFn: (clip: ClipRecord) =>
      studioApi.updateClip(token!, clip.id, {
        projectId: activeProject!.id,
        status: clip.status === "SELECTED" ? "SUGGESTED" : "SELECTED"
      }),
    onSuccess: () => void invalidateProjects(),
    onError: (error) => toast.error(String(error))
  });

  const downloadMutation = useMutation({
    mutationFn: (assetId: string) => studioApi.assetDownload(token!, assetId),
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (error) => toast.error(String(error))
  });

  return (
    <main className="min-h-screen p-3 text-studio-ink sm:p-5">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1800px] flex-col overflow-hidden rounded-lg border bg-white/76 shadow-soft backdrop-blur xl:min-h-[calc(100vh-40px)]">
        <header className="flex flex-col gap-3 border-b bg-white px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-studio-ink text-white">
              <Scissors className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-normal sm:text-2xl">Clipper Studio</h1>
              <p className="text-sm text-muted-foreground">
                Short-form, podcast, and stream clipping in one workspace.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted p-1">
            {workspaceKinds.map((kind) => {
              const meta = workspaceCopy[kind];
              const Icon = meta.icon;
              const active = workspace === kind;

              return (
                <button
                  key={kind}
                  className={`flex h-10 items-center justify-center gap-2 rounded-sm px-3 text-sm font-bold transition ${
                    active ? meta.accent : "text-muted-foreground hover:bg-white"
                  }`}
                  onClick={() => setWorkspace(kind)}
                  title={meta.label}
                  type="button"
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">{meta.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </header>

        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="border-b bg-studio-panel p-4 lg:border-b-0 lg:border-r">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-normal">Projects</h2>
                {projectsQuery.isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
                ) : null}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  createProjectMutation.mutate(newProjectTitle || `${workspaceCopy[workspace].label} cut`);
                }}
              >
                <Input
                  value={newProjectTitle}
                  onChange={(event) => setNewProjectTitle(event.target.value)}
                  placeholder="New project title"
                  aria-label="New project title"
                />
                <Button
                  size="icon"
                  variant="accent"
                  disabled={!token || createProjectMutation.isPending}
                  title="Create project"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </Button>
              </form>

              <div className="studio-scrollbar flex max-h-60 gap-2 overflow-x-auto pb-1 lg:max-h-[42vh] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className={`min-w-64 rounded-md border bg-white p-3 transition hover:border-studio-ink lg:min-w-0 ${
                      activeProject?.id === project.id ? "border-studio-ink shadow-sm" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          setSelectedProjectId(project.id);
                          setWorkspace(project.workspace);
                        }}
                        type="button"
                      >
                        <p className="font-bold">{project.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {project.media.length} media · {project.clips.length} clips
                        </p>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline">{workspaceCopy[project.workspace].shortLabel}</Badge>
                        <button
                          className="flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                          disabled={deleteProjectMutation.isPending}
                          onClick={() => {
                            const ok = window.confirm(
                              `Delete "${project.title}" and all clips, jobs, transcripts, and exports from the database?`
                            );

                            if (ok) {
                              deleteProjectMutation.mutate(project.id);
                            }
                          }}
                          title="Delete project"
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {!projects.length && (
                  <div className="rounded-md border border-dashed bg-white p-4 text-sm text-muted-foreground">
                    Create a project to start clipping.
                  </div>
                )}
              </div>
            </section>

            <Separator className="my-5" />

            <section className="space-y-3">
              <h2 className="text-sm font-black uppercase tracking-normal">Source</h2>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed bg-white p-4 text-sm font-bold transition hover:border-studio-ink">
                {uploadMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden />
                )}
                <span>Upload video</span>
                <input
                  className="sr-only"
                  type="file"
                  accept="video/*"
                  disabled={!activeProject || uploadMutation.isPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadMutation.mutate(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {uploadProgress && <LocalProgressCard progress={uploadProgress} />}
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  importMutation.mutate();
                }}
              >
                <div className="flex gap-2">
                  <Input
                    value={importUrl}
                    onChange={(event) => setImportUrl(event.target.value)}
                    placeholder="YouTube or video URL"
                    aria-label="Video URL"
                  />
                  <Button
                    size="icon"
                    variant="secondary"
                    disabled={!activeProject || !importUrl || importMutation.isPending}
                    title="Import URL"
                  >
                    <LinkIcon className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </form>

              <div className="space-y-2">
                {activeProject?.media.map((media) => (
                  <MediaRow
                    key={media.id}
                    media={media}
                    active={reviewTarget?.kind === "source" && reviewTarget.id === media.id}
                    onReview={() => setReviewTarget({ kind: "source", id: media.id })}
                  />
                ))}
              </div>
            </section>
          </aside>

          <section className="grid min-h-0 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="min-w-0 space-y-4 p-4 sm:p-5">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
                <div className="rounded-md border bg-studio-ink p-3 text-white">
                  <ReviewPlayer
                    project={activeProject}
                    preview={previewQuery.data}
                    loading={previewQuery.isFetching}
                    error={previewQuery.error}
                    reviewTarget={reviewTarget}
                    onReviewSource={(mediaId) => setReviewTarget({ kind: "source", id: mediaId })}
                    onReviewExport={(assetId) => setReviewTarget({ kind: "export", id: assetId })}
                  />
                  <Timeline clip={selectedClip} media={readyMedia} />
                </div>

                <div className="rounded-md border bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-black">{workspaceCopy[workspace].label} AI</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {workspaceCopy[workspace].description}
                      </p>
                    </div>
                    <div className={`rounded-sm px-2 py-1 ${workspaceCopy[workspace].accent}`}>
                      <Sparkles className="h-4 w-4" aria-hidden />
                    </div>
                  </div>
                  <Button
                    className="mt-4 w-full"
                    variant="accent"
                    disabled={!readyMedia || analyzeMutation.isPending}
                    onClick={() => analyzeMutation.mutate()}
                  >
                    {analyzeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <WandSparkles className="h-4 w-4" aria-hidden />
                    )}
                    Run Gemini analysis
                  </Button>
                  <Button
                    className="mt-2 w-full"
                    variant="secondary"
                    disabled={!readyMedia || smartAutoClipMutation.isPending}
                    onClick={() => smartAutoClipMutation.mutate()}
                  >
                    {smartAutoClipMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Scissors className="h-4 w-4" aria-hidden />
                    )}
                    Smart auto clip
                  </Button>
                  {activeAnalysis && (
                    <div className="mt-4 rounded-md bg-muted p-3">
                      <p className="text-sm font-semibold">Latest summary</p>
                      <p className="mt-1 text-sm text-muted-foreground">{activeAnalysis.summary}</p>
                    </div>
                  )}
                  <div className="mt-4 space-y-2">
                    <ActionProgressPanel
                      uploadProgress={uploadProgress}
                      activeJobs={activeJobs}
                      onCancelJob={(jobId) => cancelJobMutation.mutate(jobId)}
                      canceling={cancelJobMutation.isPending}
                    />
                    {queuedJobs.length > 0 && (
                      <div className="rounded-md border border-studio-coral bg-studio-coral/10 p-3 text-sm">
                        <p className="font-bold">Worker waiting</p>
                        <p className="mt-1 text-muted-foreground">
                          Start `bun run dev:worker` in another terminal to process queued AI and render jobs.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <section className="rounded-md border bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="font-black">Clip Candidates</h2>
                      <p className="text-sm text-muted-foreground">
                        {workspaceClips.length} clips in {workspaceCopy[workspace].label}
                      </p>
                    </div>
                    <Select
                      className="w-full sm:w-52"
                      value={exportPreset}
                      onChange={(event) => setExportPreset(event.target.value as ExportPreset)}
                      aria-label="Export preset"
                    >
                      {Object.entries(exportPresets).map(([preset, meta]) => (
                        <option key={preset} value={preset}>
                          {meta.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="studio-scrollbar mt-4 grid max-h-[520px] gap-3 overflow-y-auto pr-1">
                    {workspaceClips.map((clip) => (
                      <ClipRow
                        key={clip.id}
                        clip={clip}
                        active={selectedClip?.id === clip.id}
                        onSelect={() => setSelectedClipId(clip.id)}
                        onToggle={() => selectClipMutation.mutate(clip)}
                        onRender={() => renderMutation.mutate(clip)}
                        rendering={renderMutation.isPending}
                      />
                    ))}
                    {!workspaceClips.length && (
                      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                        Add manual timestamps or run Gemini analysis.
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-md border bg-white p-4">
                  <h2 className="font-black">Manual Clip</h2>
                  <form
                    className="mt-3 space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      manualClipMutation.mutate();
                    }}
                  >
                    <Input
                      value={manualClip.title}
                      onChange={(event) =>
                        setManualClip((draft) => ({ ...draft, title: event.target.value }))
                      }
                      placeholder="Clip title"
                      aria-label="Clip title"
                    />
                    <Input
                      value={manualClip.hook}
                      onChange={(event) =>
                        setManualClip((draft) => ({ ...draft, hook: event.target.value }))
                      }
                      placeholder="Hook"
                      aria-label="Hook"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={manualClip.startSec}
                        onChange={(event) =>
                          setManualClip((draft) => ({
                            ...draft,
                            startSec: event.target.value
                          }))
                        }
                        type="number"
                        min="0"
                        aria-label="Start seconds"
                      />
                      <Input
                        value={manualClip.endSec}
                        onChange={(event) =>
                          setManualClip((draft) => ({
                            ...draft,
                            endSec: event.target.value
                          }))
                        }
                        type="number"
                        min="1"
                        aria-label="End seconds"
                      />
                    </div>
                    <Button
                      className="w-full"
                      disabled={!activeProject || manualClipMutation.isPending}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      Add clip
                    </Button>
                  </form>
                </section>
              </div>
            </div>

            <aside className="space-y-4 border-t bg-studio-panel p-4 sm:p-5 xl:border-l xl:border-t-0">
              <section className="rounded-md border bg-white p-4">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4" aria-hidden />
                  <h2 className="font-black">Transcript</h2>
                </div>
                <div className="studio-scrollbar mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
                  {activeProject?.transcripts.map((segment) => (
                    <div key={segment.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{secondsToTimecode(segment.startSec)}</Badge>
                        {segment.speaker && <span className="font-semibold">{segment.speaker}</span>}
                      </div>
                      <p className="mt-1 text-muted-foreground">{segment.text}</p>
                    </div>
                  ))}
                  {!activeProject?.transcripts.length && (
                    <p className="text-sm text-muted-foreground">
                      Gemini transcript segments will appear here.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-md border bg-white p-4">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4" aria-hidden />
                  <h2 className="font-black">Exports</h2>
                </div>
                <div className="mt-3 space-y-2">
                  {activeProject?.exports.map((asset) => (
                    <div
                      key={asset.id}
                      className={`rounded-md border p-3 transition ${
                        reviewTarget?.kind === "export" && reviewTarget.id === asset.id
                          ? "border-studio-ink bg-muted"
                          : "bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold">{asset.fileName}</span>
                          <span className="text-xs text-muted-foreground">
                          {exportPresets[asset.preset].label}
                          </span>
                        </span>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button
                          className="flex-1"
                          size="sm"
                          variant="outline"
                          onClick={() => setReviewTarget({ kind: "export", id: asset.id })}
                        >
                          <Play className="h-4 w-4" aria-hidden />
                          Review
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => downloadMutation.mutate(asset.id)}
                          disabled={downloadMutation.isPending}
                          title="Download export"
                        >
                          {downloadMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <Download className="h-4 w-4" aria-hidden />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!activeProject?.exports.length && (
                    <p className="text-sm text-muted-foreground">Rendered files will appear here.</p>
                  )}
                </div>
              </section>
            </aside>
          </section>
        </div>
      </div>
    </main>
  );
}

function MediaRow({
  media,
  active,
  onReview
}: {
  media: SourceMediaRecord;
  active: boolean;
  onReview: () => void;
}) {
  const statusVariant =
    media.status === "READY" ? "accent" : media.status === "FAILED" ? "destructive" : "muted";

  return (
    <div
      className={`rounded-md border bg-white p-3 transition ${
        active ? "border-studio-ink shadow-sm" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <FileVideo className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{media.fileName ?? media.originalUrl}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {[media.kind, media.durationSec ? secondsToTimecode(media.durationSec) : null, formatBytes(media.sizeBytes)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Badge variant={statusVariant}>{media.status.replace("_", " ")}</Badge>
      </div>
      <Button
        className="mt-3 w-full"
        size="sm"
        variant="outline"
        onClick={onReview}
        disabled={media.status !== "READY"}
      >
        <Play className="h-4 w-4" aria-hidden />
        Review source
      </Button>
      {media.error && <p className="mt-2 text-xs text-destructive">{media.error}</p>}
    </div>
  );
}

function Timeline({
  clip,
  media
}: {
  clip: ClipRecord | undefined;
  media: SourceMediaRecord | undefined;
}) {
  const duration = media?.durationSec ?? Math.max(clip?.endSec ?? 60, 60);
  const startPercent = clip ? Math.min(100, (clip.startSec / duration) * 100) : 0;
  const widthPercent = clip
    ? Math.max(4, ((clip.endSec - clip.startSec) / duration) * 100)
    : 0;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between text-xs text-white/70">
        <span>{clip ? secondsToTimecode(clip.startSec) : "0:00"}</span>
        <span>{secondsToTimecode(duration)}</span>
      </div>
      <div className="relative h-8 overflow-hidden rounded-sm bg-white/12">
        <div className="absolute inset-y-0 bg-studio-lime" style={{ left: `${startPercent}%`, width: `${widthPercent}%` }} />
      </div>
    </div>
  );
}

function ReviewPlayer({
  project,
  preview,
  loading,
  error,
  reviewTarget,
  onReviewSource,
  onReviewExport
}: {
  project: StudioProject | undefined;
  preview: PreviewRecord | undefined;
  loading: boolean;
  error: Error | null;
  reviewTarget: ReviewTarget | null;
  onReviewSource: (mediaId: string) => void;
  onReviewExport: (assetId: string) => void;
}) {
  const readySources = project?.media.filter((media) => media.status === "READY") ?? [];
  const exports = project?.exports ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-black">
            {preview?.label ?? project?.title ?? "Review player"}
          </p>
          <p className="text-xs text-white/60">
            {reviewTarget?.kind === "export" ? "Rendered export" : "Source media"}
          </p>
        </div>
        <div className="studio-scrollbar flex max-w-full gap-2 overflow-x-auto pb-1">
          {readySources.map((media) => (
            <button
              key={media.id}
              className={`flex h-8 shrink-0 items-center gap-2 rounded-sm px-3 text-xs font-bold transition ${
                reviewTarget?.kind === "source" && reviewTarget.id === media.id
                  ? "bg-studio-lime text-studio-ink"
                  : "bg-white/10 text-white hover:bg-white/18"
              }`}
              onClick={() => onReviewSource(media.id)}
              type="button"
              title={media.fileName ?? "Review source"}
            >
              <FileVideo className="h-3.5 w-3.5" aria-hidden />
              Source
            </button>
          ))}
          {exports.map((asset) => (
            <button
              key={asset.id}
              className={`flex h-8 shrink-0 items-center gap-2 rounded-sm px-3 text-xs font-bold transition ${
                reviewTarget?.kind === "export" && reviewTarget.id === asset.id
                  ? "bg-studio-cyan text-studio-ink"
                  : "bg-white/10 text-white hover:bg-white/18"
              }`}
              onClick={() => onReviewExport(asset.id)}
              type="button"
              title={asset.fileName}
            >
              <Play className="h-3.5 w-3.5" aria-hidden />
              {exportPresets[asset.preset].label}
            </button>
          ))}
        </div>
      </div>

      <div className="aspect-video overflow-hidden rounded-sm bg-black">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-studio-lime" aria-hidden />
            <p className="text-sm font-bold text-white/80">Preparing preview</p>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <FileVideo className="h-10 w-10 text-studio-coral" aria-hidden />
            <p className="max-w-md text-sm text-white/75">{error.message}</p>
          </div>
        ) : preview?.playable && preview.url ? (
          <video
            key={preview.url}
            className="h-full w-full bg-black object-contain"
            src={preview.url}
            controls
            preload="metadata"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <Film className="h-12 w-12 text-studio-lime" aria-hidden />
            <div>
              <p className="font-black">{project?.title ?? "No active project"}</p>
              <p className="mt-1 max-w-md text-sm text-white/70">
                {preview?.reason ??
                  "Upload a video or select a rendered export to review playback here."}
              </p>
              {preview?.url && (
                <Button
                  className="mt-4"
                  size="sm"
                  variant="secondary"
                  onClick={() => window.open(preview.url!, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Open source
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function jobProgressLabel(job: JobRecord) {
  if (job.status === "QUEUED") {
    return "Waiting for worker";
  }

  if (job.kind === "AI_ANALYSIS") {
    if (job.progress < 20) return "Preparing source";
    if (job.progress < 45) return "Loading video for Gemini";
    if (job.progress < 85) return "Waiting for Gemini response";
    return "Saving transcript and clips";
  }

  if (job.progress < 30) return "Preparing render";
  if (job.progress < 55) return "Loading source media";
  if (job.progress < 80) return "Rendering with FFmpeg";
  return "Uploading export";
}

function LocalProgressCard({ progress }: { progress: LocalProgress }) {
  return (
    <div className="rounded-md border bg-white p-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="min-w-0">
          <p className="font-bold">{progress.label}</p>
          <p className="truncate text-xs text-muted-foreground">{progress.detail}</p>
        </div>
        <Badge variant="muted">{progress.value}%</Badge>
      </div>
      <Progress className="mt-2" value={progress.value} />
    </div>
  );
}

function ActionProgressPanel({
  uploadProgress,
  activeJobs,
  onCancelJob,
  canceling
}: {
  uploadProgress: LocalProgress | null;
  activeJobs: JobRecord[];
  onCancelJob: (jobId: string) => void;
  canceling: boolean;
}) {
  if (!uploadProgress && activeJobs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {uploadProgress && <LocalProgressCard progress={uploadProgress} />}
      {activeJobs.map((job) => (
        <div key={job.id} className="rounded-md border p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-bold">
                {job.kind === "AI_ANALYSIS" ? "AI analysis" : "Render"}
              </p>
              <p className="truncate text-xs text-muted-foreground">{jobProgressLabel(job)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="muted">{job.progress}%</Badge>
              <Badge variant="outline">{job.status}</Badge>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                disabled={canceling}
                onClick={() => onCancelJob(job.id)}
                title="Stop processing"
                type="button"
              >
                {canceling ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <XCircle className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
          </div>
          <Progress className="mt-2" value={job.progress} />
        </div>
      ))}
    </div>
  );
}

function ClipRow({
  clip,
  active,
  onSelect,
  onToggle,
  onRender,
  rendering
}: {
  clip: ClipRecord;
  active: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onRender: () => void;
  rendering: boolean;
}) {
  return (
    <article
      className={`rounded-md border p-3 transition ${active ? "border-studio-ink bg-muted" : "bg-white"}`}
    >
      <button className="w-full text-left" onClick={onSelect} type="button">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-black">{clip.title}</h3>
              <Badge variant="accent">{clip.score}</Badge>
              <Badge variant="outline">{clip.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{clip.hook}</p>
          </div>
          <div className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
            {secondsToTimecode(clip.startSec)} - {secondsToTimecode(clip.endSec)}
          </div>
        </div>
        <p className="mt-2 text-sm">{clip.reason}</p>
        <div className="mt-3 flex flex-wrap gap-1">
          {clip.tags.slice(0, 5).map((tag) => (
            <Badge key={tag} variant="muted">
              {tag}
            </Badge>
          ))}
        </div>
      </button>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onToggle}>
          <Check className="h-4 w-4" aria-hidden />
          {clip.status === "SELECTED" ? "Selected" : "Select"}
        </Button>
        <Button size="sm" onClick={onRender} disabled={rendering}>
          {rendering ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          Render
        </Button>
      </div>
    </article>
  );
}
