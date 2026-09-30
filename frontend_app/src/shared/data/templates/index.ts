import { useCallback, useMemo } from "react";
import {
  infiniteQueryOptions,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";
import { offlinePage, readOfflineTemplates } from "@/lib/offline-templates";
import { httpClient } from "@/shared/api/client/httpClient";
import {
  FOLDERS_API,
  FOLDER_BY_ID,
  TEMPLATES_API,
  TEMPLATE_BY_ID,
  TEMPLATE_RESTORATIONS_API,
  TEMPLATE_VERSIONS_API,
  TEMPLATE_VERSION_BY_ID_API,
  TEMPLATE_VERSION_DIFF_API,
} from "@/shared/api/constants";

export type TemplateView = "runtime" | "management";
export type PromptVisibility = "all" | "only_editors" | "nobody";
export type PromptMetadata = { development?: boolean; test?: boolean };

export interface Folder {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  parent_id?: string | null;
  business_unit_id?: string | null;
  is_business_unit: boolean;
}

export interface PromptTemplate {
  id: string;
  name: string;
  folder_id: string;
  prompts: Record<string, string>;
  pre_session_talking_points: Array<any>;
  in_session_talking_points: Array<any>;
  created_at: number;
  updated_at: number;
  updated_by_user_id?: string | null;
  updated_by_display_name?: string | null;
  business_unit_id?: string | null;
  analysis_model?: string | null;
  analysis_reasoning?: string | null;
  analysis_verbosity?: string | null;
  analysis_provider?: string | null;
  provider_parameters?: Record<string, any> | null;
  analysis_workflow: "standard" | "structured_review";
  visibility: PromptVisibility;
  visible_to_user_ids?: Array<string> | null;
  speaker_identification_enabled: boolean;
  prompt_metadata?: PromptMetadata | null;
  recording_disclaimer_enabled: boolean;
  recording_disclaimer?: string | null;
}

export interface Page<T> {
  items: Array<T>;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface PromptVersionMetadata {
  id: string;
  created_at?: number | null;
  created_by_user_id?: string | null;
  created_by_display_name?: string | null;
  source_action?: string | null;
  change_reason?: string | null;
}

export interface PromptVersionDetail extends PromptVersionMetadata {
  template_id: string;
  snapshot: Record<string, any>;
}

export interface PromptVersionDiff {
  left: PromptVersionMetadata;
  right: PromptVersionMetadata;
  left_text: string;
  right_text: string;
  summary: { added: number; removed: number };
}

export type CreateFolder = Pick<Folder, "name"> & {
  parent_id?: string | null;
};
export type PatchFolder = Partial<CreateFolder>;
export type CreatePromptTemplate = Omit<
  PromptTemplate,
  | "id"
  | "created_at"
  | "updated_at"
  | "updated_by_user_id"
  | "updated_by_display_name"
  | "business_unit_id"
>;
export type PatchPromptTemplate = Partial<CreatePromptTemplate>;

type ListFoldersArgs = {
  view: TemplateView;
  limit?: number;
  offset?: number;
};
type ListTemplatesArgs = ListFoldersArgs & { folderId?: string };

const MAX_PAGES = 500;

export const templatesKeys = {
  root: ["community-brief", "templates"] as const,
  foldersRoot: () => [...templatesKeys.root, "folders"] as const,
  folders: ({ view, limit = 100, offset = 0 }: ListFoldersArgs) =>
    [...templatesKeys.foldersRoot(), view, { limit, offset }] as const,
  folder: (view: TemplateView, folderId: string) =>
    [...templatesKeys.foldersRoot(), view, "item", folderId] as const,
  templatesRoot: () => [...templatesKeys.root, "templates"] as const,
  templates: ({ view, folderId, limit = 100, offset = 0 }: ListTemplatesArgs) =>
    [
      ...templatesKeys.templatesRoot(),
      view,
      { folderId: folderId ?? null, limit, offset },
    ] as const,
  template: (view: TemplateView, templateId: string) =>
    [...templatesKeys.templatesRoot(), view, "item", templateId] as const,
  versions: (templateId: string, limit = 25, offset = 0) =>
    [
      ...templatesKeys.template("management", templateId),
      "versions",
      { limit, offset },
    ] as const,
  version: (templateId: string, versionId: string) =>
    [
      ...templatesKeys.template("management", templateId),
      "versions",
      versionId,
    ] as const,
  versionDiff: (templateId: string, left: string, right: string) =>
    [
      ...templatesKeys.template("management", templateId),
      "versions",
      "compare",
      left,
      right,
    ] as const,
};

export async function listFolders({
  view,
  limit = 100,
  offset = 0,
}: ListFoldersArgs): Promise<Page<Folder>> {
  if (view === "runtime" && !navigator.onLine) return offlinePage((await readOfflineTemplates()).folders, limit, offset);
  return (
    await httpClient.get<Page<Folder>>(FOLDERS_API, {
      params: { view, limit, offset },
    })
  ).data;
}

export async function listTemplates({
  view,
  folderId,
  limit = 100,
  offset = 0,
}: ListTemplatesArgs): Promise<Page<PromptTemplate>> {
  if (view === "runtime" && !navigator.onLine) {
    const { templates } = await readOfflineTemplates();
    return offlinePage(templates.filter((item) => !folderId || item.folder_id === folderId), limit, offset);
  }
  return (
    await httpClient.get<Page<PromptTemplate>>(TEMPLATES_API, {
      params: { view, folder_id: folderId, limit, offset },
    })
  ).data;
}

async function collectAll<T>(
  fetchPage: (offset: number) => Promise<Page<T>>,
): Promise<Array<T>> {
  const items: Array<T> = [];
  let offset = 0;
  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
    const page = await fetchPage(offset);
    items.push(...page.items);
    if (!page.has_more) return items;
    const step = page.items.length || page.limit;
    if (step <= 0) return items;
    offset = page.offset + step;
  }
  throw new Error("Template pagination exceeded the safety limit");
}

export function listAllFolders(view: TemplateView): Promise<Array<Folder>> {
  return collectAll((offset) => listFolders({ view, limit: 100, offset }));
}

export function listAllTemplates(
  view: TemplateView,
  folderId?: string,
): Promise<Array<PromptTemplate>> {
  return collectAll((offset) =>
    listTemplates({ view, folderId, limit: 100, offset }),
  );
}

export async function getFolder(
  folderId: string,
  view: TemplateView,
): Promise<Folder> {
  if (view === "runtime" && !navigator.onLine) {
    const item = (await readOfflineTemplates()).folders.find((value) => value.id === folderId);
    if (!item) throw new Error("This template or folder is unavailable offline. Connect to refresh your templates.");
    return item;
  }
  return (
    await httpClient.get<Folder>(FOLDER_BY_ID(encodeURIComponent(folderId)), {
      params: { view },
    })
  ).data;
}

export async function createFolder(input: CreateFolder): Promise<Folder> {
  return (await httpClient.post<Folder>(FOLDERS_API, input)).data;
}

export async function patchFolder(
  folderId: string,
  patch: PatchFolder,
): Promise<Folder> {
  return (
    await httpClient.patch<Folder>(
      FOLDER_BY_ID(encodeURIComponent(folderId)),
      patch,
    )
  ).data;
}

export async function deleteFolder(folderId: string): Promise<void> {
  await httpClient.delete(FOLDER_BY_ID(encodeURIComponent(folderId)));
}

export async function getTemplate(
  templateId: string,
  view: TemplateView,
): Promise<PromptTemplate> {
  if (view === "runtime" && !navigator.onLine) {
    const item = (await readOfflineTemplates()).templates.find((value) => value.id === templateId);
    if (!item) throw new Error("This template or folder is unavailable offline. Connect to refresh your templates.");
    return item;
  }
  return (
    await httpClient.get<PromptTemplate>(
      TEMPLATE_BY_ID(encodeURIComponent(templateId)),
      { params: { view } },
    )
  ).data;
}

export async function createTemplate(
  input: CreatePromptTemplate,
): Promise<PromptTemplate> {
  return (await httpClient.post<PromptTemplate>(TEMPLATES_API, input)).data;
}

export async function patchTemplate(
  templateId: string,
  patch: PatchPromptTemplate,
): Promise<PromptTemplate> {
  return (
    await httpClient.patch<PromptTemplate>(
      TEMPLATE_BY_ID(encodeURIComponent(templateId)),
      patch,
    )
  ).data;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await httpClient.delete(TEMPLATE_BY_ID(encodeURIComponent(templateId)));
}

export async function listTemplateVersions(
  templateId: string,
  limit = 25,
  offset = 0,
): Promise<Page<PromptVersionMetadata>> {
  return (
    await httpClient.get<Page<PromptVersionMetadata>>(
      TEMPLATE_VERSIONS_API(encodeURIComponent(templateId)),
      { params: { limit, offset } },
    )
  ).data;
}

export async function getTemplateVersion(
  templateId: string,
  versionId: string,
): Promise<PromptVersionDetail> {
  return (
    await httpClient.get<PromptVersionDetail>(
      TEMPLATE_VERSION_BY_ID_API(
        encodeURIComponent(templateId),
        encodeURIComponent(versionId),
      ),
    )
  ).data;
}

export async function compareTemplateVersions(
  templateId: string,
  left: string,
  right: string,
): Promise<PromptVersionDiff> {
  return (
    await httpClient.get<PromptVersionDiff>(
      TEMPLATE_VERSION_DIFF_API(encodeURIComponent(templateId)),
      { params: { left, right } },
    )
  ).data;
}

export async function restoreTemplateVersion(
  templateId: string,
  versionId: string,
  reason?: string,
): Promise<PromptTemplate> {
  return (
    await httpClient.post<PromptTemplate>(
      TEMPLATE_RESTORATIONS_API(encodeURIComponent(templateId)),
      {
        version_id: versionId,
        ...(reason ? { reason } : {}),
      },
    )
  ).data;
}

function nextOffset<T>(page: Page<T>): number | undefined {
  if (!page.has_more) return undefined;
  const step = page.items.length || page.limit;
  return step > 0 ? page.offset + step : undefined;
}

export const foldersQuery = (args: ListFoldersArgs) =>
  queryOptions({
    queryKey: templatesKeys.folders(args),
    queryFn: () => listFolders(args),
    staleTime: 10 * 60 * 1000,
  });

export const allFoldersQuery = (view: TemplateView) =>
  queryOptions({
    queryKey: [...templatesKeys.foldersRoot(), view, "all"] as const,
    networkMode: view === "runtime" ? "always" : "online",
    queryFn: () => listAllFolders(view),
    staleTime: 10 * 60 * 1000,
  });

export const templatesQuery = (args: ListTemplatesArgs) =>
  queryOptions({
    queryKey: templatesKeys.templates(args),
    queryFn: () => listTemplates(args),
    staleTime: 10 * 60 * 1000,
  });

export const allTemplatesQuery = (view: TemplateView, folderId?: string) =>
  queryOptions({
    queryKey: [
      ...templatesKeys.templatesRoot(),
      view,
      { folderId: folderId ?? null },
      "all",
    ] as const,
    networkMode: view === "runtime" ? "always" : "online",
    queryFn: () => listAllTemplates(view, folderId),
    staleTime: 10 * 60 * 1000,
  });

export const foldersInfiniteQuery = (args: Omit<ListFoldersArgs, "offset">) =>
  infiniteQueryOptions({
    queryKey: [
      ...templatesKeys.folders({ ...args, offset: 0 }),
      "infinite",
    ] as const,
    queryFn: ({ pageParam = 0 }) => listFolders({ ...args, offset: pageParam }),
    networkMode: args.view === "runtime" ? "always" : "online",
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  });

export const templatesInfiniteQuery = (
  args: Omit<ListTemplatesArgs, "offset">,
) =>
  infiniteQueryOptions({
    queryKey: [
      ...templatesKeys.templates({ ...args, offset: 0 }),
      "infinite",
    ] as const,
    queryFn: ({ pageParam = 0 }) =>
      listTemplates({ ...args, offset: pageParam }),
    networkMode: args.view === "runtime" ? "always" : "online",
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  });

export function useTemplates(view: TemplateView) {
  const foldersQueryResult = useQuery(allFoldersQuery(view));
  const templatesQueryResult = useQuery(allTemplatesQuery(view));
  const folders = useMemo(
    () => foldersQueryResult.data ?? [],
    [foldersQueryResult.data],
  );
  const templates = useMemo(
    () => templatesQueryResult.data ?? [],
    [templatesQueryResult.data],
  );
  const getTemplatesForFolder = useCallback(
    (folderId: string) =>
      templates.filter((template) => template.folder_id === folderId),
    [templates],
  );
  const getTemplateById = useCallback(
    (templateId: string) =>
      templates.find((template) => template.id === templateId),
    [templates],
  );
  const getFolderById = useCallback(
    (folderId: string) => folders.find((folder) => folder.id === folderId),
    [folders],
  );
  const refresh = useCallback(async () => {
    await Promise.all([
      foldersQueryResult.refetch(),
      templatesQueryResult.refetch(),
    ]);
  }, [foldersQueryResult.refetch, templatesQueryResult.refetch]);

  return {
    folders,
    templates,
    isLoading: foldersQueryResult.isLoading || templatesQueryResult.isLoading,
    foldersError: foldersQueryResult.error,
    templatesError: templatesQueryResult.error,
    getTemplatesForFolder,
    getTemplateById,
    getFolderById,
    refresh,
  };
}
