import { useCallback, useMemo, useRef, useState } from "react";
import { Plus, Search, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { readPromptFile } from "../lib/prompt-file";
import { usePromptManagement } from "../state/context";
import { debugLogger } from "../state/debug";
import {
  canAccessCategory,
  canCreatePromptIn,
  canEditPrompt,
  canTogglePromptVisibility,
  isAdmin,
} from "../state/permissions";
import { filterTree, getExpandedIdsForSearch } from "../state/tree-utils";
import { ModelCatalogDialog } from "./ModelCatalogEditor";
import { TreeFolderWithState } from "./tree-folder-item";
import { TreePromptItem } from "./tree-prompt-item";
import type {
  Category,
  TreeFolder,
  TreeNode,
  TreePrompt,
} from "../state/types";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MotionList } from "@/components/ui/motion-list";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/useMobile";
import { useUserPermissions } from "@/hooks/usePermissions";
import {
  getNextPromptVisibility,
  getPromptVisibilityLabel,
} from "@/lib/prompt-visibility";
import { createTemplate } from "@/shared/data/templates";

type DialogType =
  | { type: "create-folder"; parent: TreeFolder | null }
  | { type: "create-prompt"; parent: TreeFolder }
  | { type: "rename-folder"; folder: TreeFolder }
  | { type: "delete-folder"; folder: TreeFolder }
  | { type: "delete-prompt"; prompt: TreePrompt }
  | null;

type PromptSortOption = "name-asc" | "name-desc";

function sortTreeNodes(
  nodes: Array<TreeNode>,
  sortBy: PromptSortOption,
): Array<TreeNode> {
  const direction = sortBy === "name-desc" ? -1 : 1;

  return [...nodes]
    .map((node) => {
      if (node.type === "folder") {
        return {
          ...node,
          children: sortTreeNodes(node.children, sortBy),
        };
      }

      return node;
    })
    .sort((leftNode, rightNode) => {
      if (leftNode.type !== rightNode.type) {
        return leftNode.type === "folder" ? -1 : 1;
      }

      return leftNode.name.localeCompare(rightNode.name) * direction;
    });
}

function findFolderNodeById(
  nodes: Array<TreeNode>,
  folderId: string,
): TreeFolder | null {
  for (const node of nodes) {
    if (node.type !== "folder") {
      continue;
    }

    if (node.id === folderId) {
      return node;
    }

    const match = findFolderNodeById(node.children, folderId);
    if (match) {
      return match;
    }
  }

  return null;
}

function findPromptNodeById(
  nodes: Array<TreeNode>,
  promptId: string,
): TreePrompt | null {
  for (const node of nodes) {
    if (node.type === "prompt") {
      if (node.id === promptId) {
        return node;
      }
      continue;
    }

    const match = findPromptNodeById(node.children, promptId);
    if (match) {
      return match;
    }
  }

  return null;
}

interface SidebarProps {
  onGeneratePrompt?: (category: Category) => void;
}

export function Sidebar({ onGeneratePrompt }: SidebarProps) {
  const {
    tree,
    loading,
    error,
    selectedCategory,
    selectedPrompt,
    expandedIds,
    setSelectedCategory,
    setSelectedPrompt,
    toggleExpanded,
    createCategory,
    createPrompt,
    renameCategory,
    deleteCategory,
    deletePrompt,
    movePrompt,
    editSubcategory,
    refreshData,
  } = usePromptManagement();

  const { data: currentUser } = useUserPermissions();
  const isMobile = useIsMobile();

  // Local state
  const [searchQuery, setSearchQuery] = useState("");
  // Removed A-Z sort filter
  const [dialog, setDialog] = useState<DialogType>(null);
  const [inputValue, setInputValue] = useState("");
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [draggingPrompt, setDraggingPrompt] = useState<TreePrompt | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const draggingPromptRef = useRef<TreePrompt | null>(null);

  // Filter tree based on search and minimal list controls.
  const displayTree = useMemo(() => {
    const searchedTree = searchQuery.trim()
      ? filterTree(tree, searchQuery)
      : tree;
    return searchedTree;
  }, [tree, searchQuery]);

  // Auto-expand folders when searching
  const effectiveExpandedIds = useMemo(() => {
    if (searchQuery.trim()) {
      const searchExpanded = getExpandedIdsForSearch(tree, searchQuery);
      return new Set([...expandedIds, ...searchExpanded]);
    }
    return expandedIds;
  }, [expandedIds, tree, searchQuery]);

  // Handlers
  const handleSelectCategory = useCallback(
    (node: TreeFolder) => {
      debugLogger.info("Sidebar", "selectCategory", {
        id: node.id,
        name: node.category.name,
      });
      setSelectedCategory(node.category);
      setSelectedPrompt(null);
    },
    [setSelectedCategory, setSelectedPrompt],
  );

  const handleSelectPrompt = useCallback(
    (node: TreePrompt) => {
      debugLogger.info("Sidebar", "selectPrompt", {
        id: node.id,
        name: node.prompt.name,
        categoryId: node.categoryId,
      });
      setSelectedPrompt(node.prompt);
      // Also select parent category
      const parent = findFolderNodeById(tree, node.categoryId);
      if (parent) {
        setSelectedCategory(parent.category);
      }
    },
    [setSelectedCategory, setSelectedPrompt, tree],
  );

  const handleCreateSubfolder = useCallback((parent: TreeFolder) => {
    setDialog({ type: "create-folder", parent });
    setInputValue("");
  }, []);

  const handleCreatePrompt = useCallback((parent: TreeFolder) => {
    setDialog({ type: "create-prompt", parent });
    setInputValue("");
  }, []);

  const handleRenameFolder = useCallback((node: TreeFolder) => {
    setDialog({ type: "rename-folder", folder: node });
    setInputValue(node.name);
  }, []);

  const handleDeleteFolder = useCallback((node: TreeFolder) => {
    setDialog({ type: "delete-folder", folder: node });
  }, []);

  const handleDeletePromptDialog = useCallback((node: TreePrompt) => {
    setDialog({ type: "delete-prompt", prompt: node });
  }, []);

  const handleCyclePromptVisibility = useCallback(
    async (node: TreePrompt) => {
      if (!canTogglePromptVisibility(node.prompt, currentUser)) {
        toast.error(
          "You can only change visibility for templates in your business unit.",
        );
        return;
      }

      const nextVisibility = getNextPromptVisibility(node.prompt.visibility);

      try {
        await editSubcategory(
          node.prompt.id,
          node.prompt.name,
          node.prompt.prompts,
          node.prompt.pre_session_talking_points,
          node.prompt.in_session_talking_points,
          node.prompt.analysis_model ?? undefined,
          node.prompt.analysis_provider ?? undefined,
          node.prompt.provider_parameters ?? undefined,
          node.prompt.analysis_workflow,
          nextVisibility,
        );
        toast.success(
          `Visibility set to ${getPromptVisibilityLabel(nextVisibility)}`,
        );
      } catch (err: any) {
        toast.error(err?.message || "Failed to update template visibility");
      }
    },
    [editSubcategory],
  );

  const handleCreateRootFolder = useCallback(() => {
    setDialog({ type: "create-folder", parent: null });
    setInputValue("");
  }, []);

  const handleImportPrompt = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (
        !file ||
        !selectedCategory ||
        !canCreatePromptIn(selectedCategory, currentUser)
      ) {
        return;
      }

      setIsImporting(true);
      try {
        const imported = await readPromptFile(file);
        const created = await createTemplate({
          ...imported.template,
          folder_id: selectedCategory.id,
        });
        await refreshData();
        setSelectedPrompt(created);
        if (!expandedIds.has(selectedCategory.id)) {
          toggleExpanded(selectedCategory.id);
        }
        toast.success(
          imported.userAllowlistOmitted
            ? "Template imported as Editors Only. Reconfigure user access before publishing."
            : "Template imported",
        );
      } catch (importError) {
        toast.error(
          importError instanceof Error
            ? importError.message
            : "Failed to import template.",
        );
      } finally {
        setIsImporting(false);
      }
    },
    [
      currentUser,
      expandedIds,
      refreshData,
      selectedCategory,
      setSelectedPrompt,
      toggleExpanded,
    ],
  );

  // Dialog actions
  const handleDialogConfirm = async () => {
    if (!dialog) return;

    try {
      switch (dialog.type) {
        case "create-folder":
          await createCategory(inputValue.trim(), dialog.parent?.id ?? null);
          toast.success("Folder created");
          break;
        case "create-prompt":
          await createPrompt(inputValue.trim(), dialog.parent.id);
          toast.success("Template created");
          // Expand parent folder
          if (!expandedIds.has(dialog.parent.id)) {
            toggleExpanded(dialog.parent.id);
          }
          break;
        case "rename-folder":
          await renameCategory(dialog.folder.id, inputValue.trim());
          toast.success("Folder renamed");
          break;
        case "delete-folder":
          await deleteCategory(dialog.folder.id);
          toast.success("Folder deleted");
          break;
        case "delete-prompt":
          await deletePrompt(dialog.prompt.id);
          toast.success("Template deleted");
          break;
      }
      setDialog(null);
      setInputValue("");
    } catch (err: any) {
      toast.error(err?.message || "Action failed");
    }
  };

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, node: TreePrompt) => {
    draggingPromptRef.current = node;
    setDraggingPrompt(node);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", node.id);
    e.dataTransfer.setData("application/x-communitybrief-prompt-id", node.id);
  }, []);

  const handleDragEnd = useCallback(() => {
    draggingPromptRef.current = null;
    setDraggingPrompt(null);
    setDragOverId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, folderId: string) => {
    if (!draggingPromptRef.current) return;
    e.dataTransfer.dropEffect = "move";
    setDragOverId(folderId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      setDragOverId(null);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, folderId: string) => {
    const dragged = draggingPromptRef.current ?? draggingPrompt;
    const draggedPromptId =
      dragged?.id ||
      e.dataTransfer.getData("application/x-communitybrief-prompt-id") ||
      e.dataTransfer.getData("text/plain");

      if (!draggedPromptId) {
        handleDragEnd();
        return;
      }

      const draggedNode = dragged ?? findPromptNodeById(tree, draggedPromptId);
      const targetFolder = findFolderNodeById(tree, folderId);

      if (
        !draggedNode ||
        !targetFolder ||
        !canEditPrompt(draggedNode.prompt, currentUser) ||
        !canAccessCategory(targetFolder.category, currentUser)
      ) {
        toast.error("You can only move templates within your business unit.");
        handleDragEnd();
        return;
      }

      // If we have the full node, avoid no-op moves within the same folder.
      if (draggedNode.categoryId === folderId) {
        handleDragEnd();
        return;
      }

      try {
        await movePrompt(draggedPromptId, folderId);
        toast.success(
          dragged?.name ? `Moved "${dragged.name}"` : "Template moved",
        );
      } catch (err) {
        toast.error("Failed to move template");
      } finally {
        handleDragEnd();
      }
    },
    [currentUser, draggingPrompt, movePrompt, handleDragEnd, tree],
  );

  // Render tree
  const renderTree = (nodes: Array<TreeNode>) => {
    debugLogger.debug("Sidebar", "renderTree", {
      nodeCount: nodes.length,
      expandedCount: effectiveExpandedIds.size,
    });
    return nodes.map((node) => {
      if (node.type === "folder") {
        return (
          <TreeFolderWithState
            key={node.id}
            node={node}
            expandedIds={effectiveExpandedIds}
            selectedCategoryId={selectedCategory?.id ?? null}
            selectedPromptId={selectedPrompt?.id ?? null}
            user={currentUser}
            isMobile={isMobile}
            dragOverId={dragOverId}
            draggingPromptId={draggingPrompt?.id ?? null}
            onToggleExpand={toggleExpanded}
            onSelectCategory={handleSelectCategory}
            onSelectPrompt={handleSelectPrompt}
            onCreateSubfolder={handleCreateSubfolder}
            onCreatePrompt={handleCreatePrompt}
            onRename={handleRenameFolder}
            onDelete={handleDeleteFolder}
            onDeletePrompt={handleDeletePromptDialog}
            onCyclePromptVisibility={handleCyclePromptVisibility}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onPromptDragStart={handleDragStart}
            onPromptDragEnd={handleDragEnd}
          />
        );
      } else {
        return (
          <TreePromptItem
            key={node.id}
            node={node}
            isSelected={selectedPrompt?.id === node.id}
            user={currentUser}
            isMobile={isMobile}
            onSelect={handleSelectPrompt}
            onDelete={handleDeletePromptDialog}
            onCycleVisibility={handleCyclePromptVisibility}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            isDragging={draggingPrompt?.id === node.id}
          />
        );
      }
    });
  };

  const dialogNeedsInput =
    dialog?.type === "create-folder" ||
    dialog?.type === "create-prompt" ||
    dialog?.type === "rename-folder";
  const dialogIsDelete =
    dialog?.type === "delete-folder" || dialog?.type === "delete-prompt";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="space-y-4 border-b p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">
            Library
          </h2>
          <div className="flex items-center">
            {selectedCategory &&
              canCreatePromptIn(selectedCategory, currentUser) && (
                <>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".prompt,application/json"
                    className="hidden"
                    onChange={handleImportPrompt}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => importInputRef.current?.click()}
                    disabled={isImporting}
                    title={`Import template into ${selectedCategory.name}`}
                    aria-label="Import template"
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </>
              )}
            {isAdmin(currentUser) && (
              <>
                <ModelCatalogDialog />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleCreateRootFolder}
                  title="New folder"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
          <Input
            placeholder="Search templates..."
            className="h-9 pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tree */}
      <ScrollArea className="prompt-library-scroll min-w-0 flex-1 overflow-hidden">
        <div className="box-border w-full max-w-full min-w-0 overflow-hidden p-2">
          {loading ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : error ? (
            <div className="text-destructive p-4 text-sm">{error}</div>
          ) : displayTree.length === 0 ? (
            <div className="text-muted-foreground p-4 text-center text-sm">
              {searchQuery ? "No results found" : "No items yet"}
            </div>
          ) : (
            <MotionList
              role="tree"
              className="w-full max-w-full min-w-0 overflow-hidden"
            >
              {renderTree(displayTree)}
            </MotionList>
          )}
        </div>
      </ScrollArea>

      {/* Input Dialog */}
      <Dialog
        open={dialogNeedsInput}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.type === "create-folder" && "New Folder"}
              {dialog?.type === "create-prompt" && "New Template"}
              {dialog?.type === "rename-folder" && "Rename Folder"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter name..."
              onKeyDown={(e) =>
                e.key === "Enter" && inputValue.trim() && handleDialogConfirm()
              }
              autoFocus
            />
          </div>
          <DialogFooter>
            {dialog?.type === "create-prompt" && onGeneratePrompt && (
              <Button
                variant="secondary"
                onClick={() => {
                  onGeneratePrompt(dialog.parent.category);
                  setDialog(null);
                  setInputValue("");
                }}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Generate template
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleDialogConfirm} disabled={!inputValue.trim()}>
              {dialog?.type === "rename-folder" ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog
        open={dialogIsDelete}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {dialog?.type === "delete-folder"
                ? "This removes the folder, its subfolders, and their templates from the library. Existing recording history and analytics are kept."
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDialogConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
