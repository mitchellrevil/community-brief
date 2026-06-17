import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Clock, GitCommit, Maximize2, RotateCcw, User } from "lucide-react";
import { toast } from "sonner";
import type {PromptVersionMetadataResponse} from "@/features/prompt-management/data/api";
import {
  
  fetchSubcategoryVersionDiff,
  fetchSubcategoryVersions,
  rollbackSubcategoryVersion
} from "@/features/prompt-management/data/api";
import { promptManagementKeys } from "@/features/prompt-management/data/keys";
import { formatDate } from "@/lib/date-utils";
import { useUserPermissions } from "@/hooks/usePermissions";
import { PermissionLevel, hasPermissionLevel } from "@/types/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import { taxonomyQueryKeys } from "@/shared/data/taxonomy/keys";

const ReactDiffViewer = React.lazy(() => import("react-diff-viewer-continued"));

interface VersionsControlProps {
  subcategoryId?: string;
  onRollbackApplied: (updatedSubcategory: Record<string, any>) => Promise<void> | void;
}

const CURRENT_REF = "current";

function getVersionLabel(version: PromptVersionMetadataResponse): string {
  const actor = version.created_by_display_name || version.created_by_user_id || "Unknown author";
  const timestamp = version.created_at ? formatDate(version.created_at) : "Unknown time";
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

export function VersionsControl({ subcategoryId, onRollbackApplied }: VersionsControlProps) {
  const queryClient = useQueryClient();
  const { data: currentUser } = useUserPermissions();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [leftVersion, setLeftVersion] = useState<string>(CURRENT_REF);
  const [rightVersion, setRightVersion] = useState<string>(CURRENT_REF);
  const [rollbackTarget, setRollbackTarget] = useState<PromptVersionMetadataResponse | null>(null);
  const [rollbackReason, setRollbackReason] = useState<string>("");

  const canRollback = hasPermissionLevel(
    currentUser?.permission as PermissionLevel,
    PermissionLevel.EDITOR,
  );

  const versionsQuery = useQuery({
    queryKey: promptManagementKeys.versions(subcategoryId),
    queryFn: () => fetchSubcategoryVersions(subcategoryId as string, 100, 0),
    enabled: Boolean(subcategoryId),
  });

  const versions = versionsQuery.data?.versions ?? [];

  // Initialize diff selection when versions load or modal opens
  useEffect(() => {
    if (!subcategoryId) {
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
  }, [subcategoryId, versions, isModalOpen]);

  const diffQuery = useQuery({
    queryKey: promptManagementKeys.versionsDiff(subcategoryId, leftVersion, rightVersion),
    queryFn: () => fetchSubcategoryVersionDiff(subcategoryId as string, leftVersion, rightVersion),
    enabled: Boolean(subcategoryId && leftVersion && rightVersion && leftVersion !== rightVersion && isModalOpen),
  });

  const rollbackMutation = useMutation({
    mutationFn: ({ versionId, reason }: { versionId: string; reason?: string }) =>
      rollbackSubcategoryVersion(subcategoryId as string, versionId, reason),
    onSuccess: async (updatedSubcategory) => {
      toast.success("Rollback completed");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: promptManagementKeys.all }),
        queryClient.invalidateQueries({ queryKey: taxonomyQueryKeys.all }),
      ]);
      await versionsQuery.refetch();
      await diffQuery.refetch();
      await onRollbackApplied(updatedSubcategory);
      setRollbackTarget(null);
      setRollbackReason("");
      setIsModalOpen(false); // Close modal on successful rollback
    },
    onError: (error) => {
      console.error("Rollback failed:", error);
      toast.error("Failed to rollback version");
    },
  });

  const comparisonOptions = useMemo(() => {
    const options: Array<{ id: string; label: string }> = [
      { id: CURRENT_REF, label: "Current (live prompt)" },
    ];

    versions.forEach((version) => {
      options.push({
        id: version.id,
        label: getVersionLabel(version),
      });
    });

    return options;
  }, [versions]);

  if (!subcategoryId) {
    return (
      <div className="text-sm text-muted-foreground p-4 text-center border rounded-md border-dashed">
        Select a prompt to view version history.
      </div>
    );
  }

  const renderVersionList = (limit?: number) => {
    const displayVersions = limit ? versions.slice(0, limit) : versions;
    
    if (versionsQuery.isLoading) return <div className="text-sm text-muted-foreground p-4">Loading versions...</div>;
    if (versions.length === 0) return <div className="text-sm text-muted-foreground p-4">No version history available.</div>;

    return (
      <div className="space-y-3">
        {displayVersions.map((version) => (
          <div
            key={version.id}
            className={cn(
                "group flex flex-col gap-2 rounded-lg border p-3 transition-colors cursor-pointer relative",
                leftVersion === version.id ? "bg-accent border-primary/50" : "hover:bg-accent/50"
            )}
            onClick={() => setLeftVersion(version.id)}
          >
            <div className="flex items-center justify-between">
                <Badge variant={getActionBadgeVariant(version.source_action || "update")} className="text-[10px] font-normal px-1.5 py-0 h-5">
                    {getActionLabel(version.source_action || "update")}
                </Badge>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {version.created_at ? formatDate(version.created_at) : "Unknown"}
                </div>
            </div>
            
            <div className="flex items-center gap-2 text-sm mt-1">
                <User className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="font-medium text-xs truncate">
                    {version.created_by_display_name || version.created_by_user_id || "Unknown"}
                </span>
            </div>

            {version.change_reason && (
                <div className="text-xs text-muted-foreground italic pl-3 border-l-2 ml-1 mt-1 line-clamp-2">
                    "{version.change_reason}"
                </div>
            )}
            
            {/* Contextual Rollback Hint - Visible on Hover (desktop) or always if selected (mobile?) */}
            {canRollback && (
                <div className={cn(
                    "flex justify-end mt-2 transition-opacity md:opacity-0 md:group-hover:opacity-100",
                    leftVersion === version.id ? "opacity-100" : ""
                )}>
                     <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 text-xs px-2 hover:bg-destructive/10 hover:text-destructive"
                         onClick={(e) => {
                             e.stopPropagation();
                             setRollbackTarget(version);
                         }}
                     >
                        <RotateCcw className="h-3 w-3 mr-1" />
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
                    Latest changes to this prompt.
                </CardDescription>
            </div>
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                        <Maximize2 className="mr-2 h-4 w-4" />
                        Full History & Compare
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[95vw] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden sm:max-w-[95vw] sm:h-[90vh]">
                     <DialogHeader className="px-6 py-4 border-b shrink-0 bg-background/95 backdrop-blur z-10 flex-row items-center justify-between space-y-0">
                        <div className="flex items-center gap-2">
                             <div className="p-2 bg-primary/10 rounded-full">
                                <GitCommit className="h-5 w-5 text-primary" />
                             </div>
                             <div>
                                <DialogTitle>Version Control</DialogTitle>
                                <DialogDescription className="mt-1">
                                    Compare historical versions against the live prompt and rollback if needed.
                                </DialogDescription>
                             </div>
                        </div>
                        {/* Close button is automatically added by DialogContent */}
                    </DialogHeader>

                    <div className="flex-1 flex overflow-hidden flex-col md:flex-row">
                        {/* Left Sidebar: Version List */}
                        <div className="w-full md:w-[350px] border-b md:border-b-0 md:border-r flex flex-col bg-muted/10 shrink-0 h-[30%] md:h-full">
                            <div className="p-3 border-b bg-background/50 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
                                <h3 className="text-sm font-medium">History Timeline</h3>
                                <Badge variant="outline" className="text-[10px]">{versions.length}</Badge>
                            </div>
                            <ScrollArea className="flex-1">
                                <div className="p-4">
                                    {renderVersionList()}
                                </div>
                            </ScrollArea>
                        </div>

                        {/* Right Content: Diff Viewer */}
                        <div className="flex-1 flex flex-col bg-background overflow-hidden h-[70%] md:h-full">
                            {/* Controls Toolbar */}
                            <div className="p-3 border-b flex items-center justify-between gap-4 bg-muted/5 shrink-0">
                                <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 flex-1 w-full">
                                    <div className="flex items-center gap-2 w-full md:w-auto">
                                        <div className="grid gap-1 flex-1 md:w-[250px]">
                                            <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Source (Left)</Label>
                                            <Select value={leftVersion} onValueChange={setLeftVersion}>
                                                <SelectTrigger className="h-8 text-xs bg-background">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {comparisonOptions.map((opt) => (
                                                        <SelectItem key={`l-${opt.id}`} value={opt.id} className="text-xs">
                                                            {opt.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    
                                    <div className="hidden md:flex items-center justify-center pt-4">
                                         <ArrowLeftRight className="h-4 w-4 text-muted-foreground/50" />
                                    </div>

                                    <div className="flex items-center gap-2 w-full md:w-auto">
                                        <div className="grid gap-1 flex-1 md:w-[250px]">
                                            <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Target (Right)</Label>
                                            <Select value={rightVersion} onValueChange={setRightVersion}>
                                                <SelectTrigger className="h-8 text-xs bg-background">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {comparisonOptions.map((opt) => (
                                                        <SelectItem key={`r-${opt.id}`} value={opt.id} className="text-xs">
                                                            {opt.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-2 border-l pl-4 ml-auto">
                                     {canRollback && leftVersion !== CURRENT_REF && (
                                         <Button 
                                            variant="destructive" 
                                            size="sm"
                                            className="h-8 text-xs shadow-sm"
                                            onClick={() => {
                                                const selectedVersion = versions.find((versionItem) => versionItem.id === leftVersion);
                                                if (selectedVersion) setRollbackTarget(selectedVersion);
                                            }}
                                         >
                                             <RotateCcw className="mr-2 h-3.5 w-3.5" />
                                             Restore Left
                                         </Button>
                                     )}
                                </div>
                            </div>
                            
                            {/* Diff Area */}
                            <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950/50 relative">
                                {leftVersion === rightVersion ? (
                                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm flex-col gap-2 p-8 text-center animate-in fade-in zoom-in-95 duration-300">
                                        <div className="p-4 bg-background rounded-full border shadow-sm">
                                             <ArrowLeftRight className="h-8 w-8 text-muted-foreground/30" />
                                        </div>
                                        <span className="font-medium">Identical versions selected</span>
                                        <span className="text-xs text-muted-foreground max-w-xs">Select a different version from the history list on the left to see changes.</span>
                                    </div>
                                ) : diffQuery.isLoading ? (
                                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground gap-2">
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                        <span>Calculating differences...</span>
                                    </div>
                                ) : diffQuery.isError ? (
                                    <div className="absolute inset-0 flex items-center justify-center text-destructive flex-col gap-2">
                                        <span className="font-medium">Failed to load comparison</span>
                                        <Button variant="outline" size="sm" onClick={() => diffQuery.refetch()}>Retry</Button>
                                    </div>
                                ) : (
                                    <div className="p-4 min-w-[800px]">
                                        <div className="mb-4 flex items-center justify-between bg-background p-2 rounded-md border shadow-sm">
                                            <div className="flex gap-4 text-xs font-medium px-2">
                                                <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                                                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                                    {diffQuery.data?.summary.added ?? 0} additions
                                                </span>
                                                <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                                                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                                    {diffQuery.data?.summary.removed ?? 0} removals
                                                </span>
                                            </div>
                                        </div>
                                        <div className="rounded-lg border overflow-hidden shadow-sm bg-white dark:bg-black">
                                            <Suspense fallback={<div className="p-4">Loading comparison...</div>}>
                                              <ReactDiffViewer
                                                oldValue={diffQuery.data?.left_text ?? ""}
                                                newValue={diffQuery.data?.right_text ?? ""}
                                                splitView={true}
                                                showDiffOnly={false}
                                                leftTitle={comparisonOptions.find(o => o.id === leftVersion)?.label}
                                                rightTitle={comparisonOptions.find(o => o.id === rightVersion)?.label}
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
                                                    }
                                                  },
                                                  line: {
                                                    padding: '2px 0',
                                                    fontSize: '12px',
                                                    lineHeight: '1.5',
                                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                                  }
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
        <CardContent>
            {renderVersionList(3)}
        </CardContent>
      </Card>

      {/* Confirmation Dialog for Rollback */}
      <AlertDialog
        open={Boolean(rollbackTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRollbackTarget(null);
            setRollbackReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Destructive Action: Rollback</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore version{" "}
              <span className="font-mono font-bold text-foreground">{rollbackTarget?.id.substring(0, 8)}...</span>?
              <br/><br/>
              This will overwrite the current live prompt content. A new snapshot of the <em>current</em> state will be created before the rollback is applied.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="rollback-reason">Reason for rollback (optional)</Label>
            <Textarea
              id="rollback-reason"
              value={rollbackReason}
              onChange={(event) => setRollbackReason(event.target.value)}
              placeholder="e.g., Previous version performed better on edge cases..."
              rows={3}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={rollbackMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (!rollbackTarget) {
                  return;
                }
                rollbackMutation.mutate({
                  versionId: rollbackTarget.id,
                  reason: rollbackReason || undefined,
                });
              }}
              disabled={rollbackMutation.isPending || !rollbackTarget}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {rollbackMutation.isPending ? "Restoring..." : "Confirm Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

