import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Clock,
  GitCommit,
  Maximize2,
  RotateCcw,
  User,
} from "lucide-react";
import { toast } from "sonner";
import type { PromptVersionMetadata } from "@/shared/data/templates";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUserPermissions } from "@/hooks/usePermissions";
import { formatDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import {
  compareTemplateVersions,
  listTemplateVersions,
  restoreTemplateVersion,
  templatesKeys,
} from "@/shared/data/templates";
import { PermissionLevel, hasPermissionLevel } from "@/types/permissions";

const ReactDiffViewer = React.lazy(() => import("react-diff-viewer-continued"));

interface VersionsControlProps {
  templateId?: string;
  onRestoreApplied: (
    updatedTemplate: Record<string, any>,
  ) => Promise<void> | void;
}

const CURRENT_REF = "current";
const CHANGE_AREAS = [
  { heading: "Template", label: "Template" },
  { heading: "Visibility", label: "Visibility" },
  { heading: "Inference Settings", label: "Inference" },
  { heading: "Pre-session Form", label: "Pre-session" },
  { heading: "In-session Form", label: "In-session" },
];

function getSectionText(text: string, heading: string): string {
  const marker = `${heading}:`;
  const start = text.indexOf(marker);
  if (start === -1) return "";

  const nextStart = CHANGE_AREAS.reduce((end, area) => {
    const index = text.indexOf(`\n${area.heading}:`, start + marker.length);
    return index !== -1 && index < end ? index : end;
  }, text.length);

  return text.slice(start, nextStart).trim();
}

function getVersionLabel(version: PromptVersionMetadata): string {
  const actor =
    version.created_by_display_name ||
    version.created_by_user_id ||
    "Unknown author";
  const timestamp = version.created_at
    ? formatDate(version.created_at)
    : "Unknown time";
  const action = version.source_action || "update";
  return `${actor} • ${timestamp} • ${action}`;
}

function getActionBadgeVariant(action: string) {
  if (action.includes("pre")) return "secondary"; // Snapshot before change
  if (action === "create") return "default";
  return "outline";
}

function getActionLabel(action: string) {
  if (action === "update_pre") return "Pre-Update Snapshot";
  if (action === "move_pre") return "Pre-Move Snapshot";
  if (action === "update") return "Update";
  if (action === "create") return "Initial Create";
  return action;
}

export function VersionsControl({
  templateId,
  onRestoreApplied,
}: VersionsControlProps) {
  const queryClient = useQueryClient();
  const { data: currentUser } = useUserPermissions();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [leftVersion, setLeftVersion] = useState<string>(CURRENT_REF);
  const [rightVersion, setRightVersion] = useState<string>(CURRENT_REF);
  const [restoreTarget, setRestoreTarget] =
    useState<PromptVersionMetadata | null>(null);
  const [restoreReason, setRestoreReason] = useState<string>("");

  const canRestore = hasPermissionLevel(
    currentUser?.permission as PermissionLevel,
    PermissionLevel.EDITOR,
  );

  const versionsQuery = useQuery({
    queryKey: templatesKeys.versions(templateId ?? "", 100, 0),
    queryFn: () => listTemplateVersions(templateId as string, 100, 0),
    enabled: Boolean(templateId),
  });

  const versions = versionsQuery.data?.items ?? [];

  // Initialize diff selection when versions load or modal opens
  useEffect(() => {
    if (!templateId) {
      setLeftVersion(CURRENT_REF);
      setRightVersion(CURRENT_REF);
      return;
    }

    // If we have at least one version, set the most recent one as Left (Older) and Current as Right (Newer)
    // This allows immediate comparison of "what changed recently" vs "now"
    // Only do this if left is accidentally "current" (initial state)
    if (versions.length > 0 && leftVersion === CURRENT_REF) {
      setLeftVersion(versions[0].id);
      setRightVersion(CURRENT_REF);
    }
  }, [templateId, versions, isModalOpen]);

  const diffQuery = useQuery({
    queryKey: templatesKeys.versionDiff(
      templateId ?? "",
      leftVersion,
      rightVersion,
    ),
    queryFn: () =>
      compareTemplateVersions(templateId as string, leftVersion, rightVersion),
    enabled: Boolean(
      templateId &&
      leftVersion &&
      rightVersion &&
      leftVersion !== rightVersion &&
      isModalOpen,
    ),
  });

  const changedAreas = useMemo(() => {
    const diff = diffQuery.data;
    if (!diff) return [];

    return CHANGE_AREAS.filter(
      (area) =>
        getSectionText(diff.left_text, area.heading) !==
        getSectionText(diff.right_text, area.heading),
    );
  }, [diffQuery.data]);

  const restoreMutation = useMutation({
    mutationFn: ({
      versionId,
      reason,
    }: {
      versionId: string;
      reason?: string;
    }) => restoreTemplateVersion(templateId as string, versionId, reason),
    onSuccess: async (updatedSubcategory) => {
      toast.success("Version restored");
      await queryClient.invalidateQueries({ queryKey: templatesKeys.root });
      await versionsQuery.refetch();
      await diffQuery.refetch();
      await onRestoreApplied(updatedSubcategory);
      setRestoreTarget(null);
      setRestoreReason("");
      setIsModalOpen(false); // Close modal on successful rollback
    },
    onError: (error) => {
      console.error("Restore failed:", error);
      toast.error("Failed to restore version");
    },
  });

  const comparisonOptions = useMemo(() => {
    const options: Array<{ id: string; label: string }> = [
      { id: CURRENT_REF, label: "Current (live template)" },
    ];

    versions.forEach((version) => {
      options.push({
        id: version.id,
        label: getVersionLabel(version),
      });
    });

    return options;
  }, [versions]);

  if (!templateId) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
        Select a template to view version history.
      </div>
    );
  }

  const renderVersionList = (limit?: number) => {
    const displayVersions = limit ? versions.slice(0, limit) : versions;

    if (versionsQuery.isLoading)
      return (
        <div className="text-muted-foreground p-4 text-sm">
          Loading versions...
        </div>
      );
    if (versions.length === 0)
      return (
        <div className="text-muted-foreground p-4 text-sm">
          No version history available.
        </div>
      );

    return (
      <div className="space-y-3">
        {displayVersions.map((version) => (
          <div
            key={version.id}
            className={cn(
              "group relative flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-colors",
              leftVersion === version.id
                ? "bg-accent border-primary/50"
                : "hover:bg-accent/50",
            )}
            onClick={() => setLeftVersion(version.id)}
          >
            <div className="flex items-center justify-between">
              <Badge
                variant={getActionBadgeVariant(
                  version.source_action || "update",
                )}
                className="h-5 px-1.5 py-0 text-[10px] font-normal"
              >
                {getActionLabel(version.source_action || "update")}
              </Badge>
              <div className="text-muted-foreground flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {version.created_at
                  ? formatDate(version.created_at)
                  : "Unknown"}
              </div>
            </div>

            <div className="mt-1 flex items-center gap-2 text-sm">
              <User className="text-muted-foreground h-3 w-3 shrink-0" />
              <span className="truncate text-xs font-medium">
                {version.created_by_display_name ||
                  version.created_by_user_id ||
                  "Unknown"}
              </span>
            </div>

            {version.change_reason && (
              <div className="text-muted-foreground mt-1 ml-1 line-clamp-2 border-l-2 pl-3 text-xs italic">
                "{version.change_reason}"
              </div>
            )}

            {canRestore && (
              <div
                className={cn(
                  "mt-2 flex justify-end transition-opacity md:opacity-0 md:group-hover:opacity-100",
                  leftVersion === version.id ? "opacity-100" : "",
                )}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:bg-destructive/10 hover:text-destructive h-6 px-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRestoreTarget(version);
                  }}
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Restore
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary View (In Tab) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <CardDescription>
                Latest changes to this template.
              </CardDescription>
            </div>
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Maximize2 className="mr-2 h-4 w-4" />
                  Open Version History
                </Button>
              </DialogTrigger>
              <DialogContent className="flex h-[90vh] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:h-[90vh] sm:max-w-[95vw]">
                <DialogHeader className="bg-background/95 z-10 shrink-0 flex-row items-center justify-between space-y-0 border-b px-6 py-4 backdrop-blur">
                  <div className="flex items-center gap-2">
                    <div className="bg-primary/10 rounded-full p-2">
                      <GitCommit className="text-primary h-5 w-5" />
                    </div>
                    <div>
                      <DialogTitle>Version History</DialogTitle>
                      <DialogDescription className="mt-1">
                        Compare saved versions with the live template before
                        restoring anything.
                      </DialogDescription>
                    </div>
                  </div>
                  {/* Close button is automatically added by DialogContent */}
                </DialogHeader>

                <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
                  {/* Left Sidebar: Version List */}
                  <div className="bg-muted/10 flex h-[30%] w-full shrink-0 flex-col border-b md:h-full md:w-[350px] md:border-r md:border-b-0">
                    <div className="bg-background/50 sticky top-0 z-10 flex items-center justify-between border-b p-3 backdrop-blur-sm">
                      <h3 className="text-sm font-medium">Saved Versions</h3>
                      <Badge variant="outline" className="text-[10px]">
                        {versions.length}
                      </Badge>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="p-4">{renderVersionList()}</div>
                    </ScrollArea>
                  </div>

                  {/* Right Content: Diff Viewer */}
                  <div className="bg-background flex h-[70%] flex-1 flex-col overflow-hidden md:h-full">
                    {/* Controls Toolbar */}
                    <div className="bg-muted/5 flex shrink-0 items-center justify-between gap-4 border-b p-3">
                      <div className="flex w-full flex-1 flex-col items-center gap-2 md:flex-row md:gap-4">
                        <div className="flex w-full items-center gap-2 md:w-auto">
                          <div className="grid flex-1 gap-1 md:w-[250px]">
                            <Label className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                              Compare from
                            </Label>
                            <Select
                              value={leftVersion}
                              onValueChange={setLeftVersion}
                            >
                              <SelectTrigger className="bg-background h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {comparisonOptions.map((opt) => (
                                  <SelectItem
                                    key={`l-${opt.id}`}
                                    value={opt.id}
                                    className="text-xs"
                                  >
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="hidden items-center justify-center pt-4 md:flex">
                          <ArrowLeftRight className="text-muted-foreground/50 h-4 w-4" />
                        </div>

                        <div className="flex w-full items-center gap-2 md:w-auto">
                          <div className="grid flex-1 gap-1 md:w-[250px]">
                            <Label className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                              Compare to
                            </Label>
                            <Select
                              value={rightVersion}
                              onValueChange={setRightVersion}
                            >
                              <SelectTrigger className="bg-background h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {comparisonOptions.map((opt) => (
                                  <SelectItem
                                    key={`r-${opt.id}`}
                                    value={opt.id}
                                    className="text-xs"
                                  >
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      <div className="ml-auto flex items-center gap-2 border-l pl-4">
                        {canRestore && leftVersion !== CURRENT_REF && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 text-xs shadow-sm"
                            onClick={() => {
                              const selectedVersion = versions.find(
                                (versionItem) => versionItem.id === leftVersion,
                              );
                              if (selectedVersion)
                                setRestoreTarget(selectedVersion);
                            }}
                          >
                            <RotateCcw className="mr-2 h-3.5 w-3.5" />
                            Restore this version
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Diff Area */}
                    <div className="relative flex-1 overflow-auto bg-slate-50 dark:bg-slate-950/50">
                      {leftVersion === rightVersion ? (
                        <div className="text-muted-foreground animate-in fade-in zoom-in-95 absolute inset-0 flex flex-col items-center justify-center gap-2 p-8 text-center text-sm duration-300">
                          <div className="bg-background rounded-full border p-4 shadow-sm">
                            <ArrowLeftRight className="text-muted-foreground/30 h-8 w-8" />
                          </div>
                          <span className="font-medium">
                            Identical versions selected
                          </span>
                          <span className="text-muted-foreground max-w-xs text-xs">
                            Select a different version from the history list on
                            the left to see changes.
                          </span>
                        </div>
                      ) : diffQuery.isLoading ? (
                        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center gap-2">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          <span>Calculating differences...</span>
                        </div>
                      ) : diffQuery.isError ? (
                        <div className="text-destructive absolute inset-0 flex flex-col items-center justify-center gap-2">
                          <span className="font-medium">
                            Failed to load comparison
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => diffQuery.refetch()}
                          >
                            Retry
                          </Button>
                        </div>
                      ) : (
                        <div className="min-w-[800px] p-4">
                          <div className="bg-background mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 shadow-sm">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-muted-foreground font-medium">
                                Changed areas
                              </span>
                              {changedAreas.length > 0 ? (
                                changedAreas.map((area) => (
                                  <Badge
                                    key={area.heading}
                                    variant="secondary"
                                    className="font-normal"
                                  >
                                    {area.label}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-muted-foreground">
                                  No section changes detected
                                </span>
                              )}
                            </div>
                            <div className="flex gap-4 px-2 text-xs font-medium">
                              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                <span className="h-2 w-2 rounded-full bg-green-500"></span>
                                {diffQuery.data?.summary.added ?? 0} additions
                              </span>
                              <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                <span className="h-2 w-2 rounded-full bg-red-500"></span>
                                {diffQuery.data?.summary.removed ?? 0} removals
                              </span>
                            </div>
                          </div>
                          <div className="overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-black">
                            <Suspense
                              fallback={
                                <div className="p-4">Loading comparison...</div>
                              }
                            >
                              <ReactDiffViewer
                                oldValue={diffQuery.data?.left_text ?? ""}
                                newValue={diffQuery.data?.right_text ?? ""}
                                splitView={true}
                                showDiffOnly={false}
                                leftTitle={
                                  comparisonOptions.find(
                                    (o) => o.id === leftVersion,
                                  )?.label
                                }
                                rightTitle={
                                  comparisonOptions.find(
                                    (o) => o.id === rightVersion,
                                  )?.label
                                }
                                useDarkTheme={false}
                                styles={{
                                  variables: {
                                    light: {
                                      diffViewerBackground: "#ffffff",
                                      gutterBackground: "#f8f9fa",
                                      addedBackground: "#e6ffec",
                                      addedGutterBackground: "#cdffd8",
                                      removedBackground: "#ffebe9",
                                      removedGutterBackground: "#ffd7d5",
                                    },
                                  },
                                  line: {
                                    padding: "2px 0",
                                    fontSize: "12px",
                                    lineHeight: "1.5",
                                    fontFamily:
                                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                  },
                                }}
                              />
                            </Suspense>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>{renderVersionList(3)}</CardContent>
      </Card>

      <AlertDialog
        open={Boolean(restoreTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRestoreTarget(null);
            setRestoreReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this version?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore version{" "}
              <span className="text-foreground font-mono font-bold">
                {restoreTarget?.id.substring(0, 8)}...
              </span>
              ?
              <br />
              <br />
              This will overwrite the current live template content. A new
              snapshot of the <em>current</em> state will be created before the
              restore is applied.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="restore-reason">
              Reason for restore (optional)
            </Label>
            <Textarea
              id="restore-reason"
              value={restoreReason}
              onChange={(event) => setRestoreReason(event.target.value)}
              placeholder="e.g., Previous version performed better on edge cases..."
              rows={3}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (!restoreTarget) {
                  return;
                }
                restoreMutation.mutate({
                  versionId: restoreTarget.id,
                  reason: restoreReason || undefined,
                });
              }}
              disabled={restoreMutation.isPending || !restoreTarget}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {restoreMutation.isPending ? "Restoring..." : "Confirm Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
