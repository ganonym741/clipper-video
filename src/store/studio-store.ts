"use client";

import type { ExportPreset, WorkspaceKind } from "@prisma/client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type StudioState = {
  workspace: WorkspaceKind;
  selectedProjectId: string | null;
  selectedClipId: string | null;
  exportPreset: ExportPreset;
  setWorkspace: (workspace: WorkspaceKind) => void;
  setSelectedProjectId: (projectId: string | null) => void;
  setSelectedClipId: (clipId: string | null) => void;
  setExportPreset: (preset: ExportPreset) => void;
};

export const useStudioStore = create<StudioState>()(
  persist(
    (set) => ({
      workspace: "SHORT_FORM",
      selectedProjectId: null,
      selectedClipId: null,
      exportPreset: "SHORTS_9_16",
      setWorkspace: (workspace) => set({ workspace }),
      setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
      setSelectedClipId: (selectedClipId) => set({ selectedClipId }),
      setExportPreset: (exportPreset) => set({ exportPreset })
    }),
    {
      name: "clipper-studio-state",
      partialize: (state) => ({
        workspace: state.workspace,
        selectedProjectId: state.selectedProjectId,
        selectedClipId: state.selectedClipId,
        exportPreset: state.exportPreset
      })
    }
  )
);
