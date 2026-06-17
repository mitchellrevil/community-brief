import { memo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  canAccessCategory,
  canCreatePromptIn,
  canCreateSubfolder,
  canDeleteCategory,
  canEditCategory,
} from "../state/permissions";
import { TreePromptItem } from "./tree-prompt-item";
import type { TreeFolder, TreePrompt } from "../state/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AnimatePresence, listItemFadeInUp, motion } from "@/lib/motion";

interface TreeFolderItemProps {
  node: TreeFolder;
  isExpanded: boolean;
  isSelected: boolean;
  selectedPromptId: string | null;
  user: any;
  isMobile: boolean;
  dragOverId: string | null;
  draggingPromptId: string | null;
  expandedIds?: Set<string>;
  selectedCategoryId?: string | null;
  onToggleExpand: (id: string) => void;
  onSelectCategory: (node: TreeFolder) => void;
  onSelectPrompt: (node: TreePrompt) => void;
  onCreateSubfolder: (parent: TreeFolder) => void;
  onCreatePrompt: (parent: TreeFolder) => void;
  onRename: (node: TreeFolder) => void;
  onDelete: (node: TreeFolder) => void;
  onDeletePrompt: (node: TreePrompt) => void;
  onCyclePromptVisibility: (node: TreePrompt) => void;
  onDragOver: (e: React.DragEvent, folderId: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, folderId: string) => void;
  onPromptDragStart: (e: React.DragEvent, node: TreePrompt) => void;
  onPromptDragEnd: () => void;
}

const accordionVariants = {
  hidden: { height: 0, opacity: 0 },
  visible: { 
    height: "auto", 
    opacity: 1,
    transition: { 
      duration: 0.2, 
      ease: [0.4, 0, 0.2, 1] as const,
    }
  },
  exit: { 
    height: 0, 
    opacity: 0,
    transition: { 
      duration: 0.2, 
      ease: [0.4, 0, 0.2, 1] as const,
    }
  }
};

export const TreeFolderItem = memo(function TreeFolderItemView({
  node,
  isExpanded,
  isSelected,
  selectedPromptId,
  user,
  isMobile,
  dragOverId,
  draggingPromptId,
  expandedIds,
  selectedCategoryId,
  onToggleExpand,
  onSelectCategory,
  onSelectPrompt,
  onCreateSubfolder,
  onCreatePrompt,
  onRename,
  onDelete,
  onDeletePrompt,
  onCyclePromptVisibility,
  onDragOver,
  onDragLeave,
  onDrop,
  onPromptDragStart,
  onPromptDragEnd,
}: TreeFolderItemProps) {
  const hasAccess = canAccessCategory(node.category, user);
  const canAddSubfolder = canCreateSubfolder(node.category, node.depth, user);
  const canAddPrompt = canCreatePromptIn(node.category, user);
  const canEdit = canEditCategory(node.category, user);
  const canDelete = canDeleteCategory(node.category, user);

  const hasChildren = node.children.length > 0;
  const isDragOver = dragOverId === node.id;
  const indentSize = isMobile ? 12 : 20;
  const indent = node.depth * indentSize;

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(node.id);
  };

  const handleRowClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectCategory(node);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragOver(e, node.id);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    onDragLeave(e);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDrop(e, node.id);
  };

  return (
    <motion.div
      role="treeitem"
      aria-expanded={isExpanded}
      className="w-full min-w-0 max-w-[320px]"
      variants={listItemFadeInUp}
    >
      <div
        className={cn(
          "group flex items-center gap-1.5 py-1 px-2 rounded-md text-sm cursor-pointer transition-all w-full min-w-0 max-w-[320px] overflow-hidden",
          "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
          isSelected && "bg-accent text-accent-foreground font-medium",
          isDragOver && "bg-blue-100 dark:bg-blue-900/50 ring-2 ring-blue-500 ring-inset"
        )}
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={handleRowClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <button
          type="button"
          onClick={handleChevronClick}
          className={cn(
            "p-0.5 rounded-sm hover:bg-background/50 flex-shrink-0",
            !hasChildren && "invisible"
          )}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        {isExpanded ? (
          <FolderOpen className="h-4 w-4 flex-shrink-0 text-blue-500" />
        ) : (
          <Folder className="h-4 w-4 flex-shrink-0 text-blue-500" />
        )}

        <span className="truncate flex-1 min-w-0">{node.name}</span>

        {hasAccess && (canAddSubfolder || canAddPrompt || canEdit || canDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
                  (isSelected || isExpanded) && "opacity-100"
                )}
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canAddSubfolder && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateSubfolder(node);
                  }}
                >
                  <Folder className="h-4 w-4 mr-2" />
                  New Subfolder
                </DropdownMenuItem>
              )}
              {canAddPrompt && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreatePrompt(node);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Prompt
                </DropdownMenuItem>
              )}
              {(canAddSubfolder || canAddPrompt) && (canEdit || canDelete) && (
                <DropdownMenuSeparator />
              )}
              {canEdit && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onRename(node);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Rename
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(node);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && hasChildren && (
          <motion.div
            key={`children-${node.id}`}
            role="group"
            className="w-full min-w-0 overflow-hidden"
            variants={accordionVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {node.children.map((child) => {
              if (child.type === "folder") {
                return (
                  <TreeFolderItem
                    key={child.id}
                    node={child}
                    isExpanded={expandedIds?.has(child.id) || false}
                    isSelected={selectedCategoryId === child.id}
                    selectedPromptId={selectedPromptId}
                    user={user}
                    isMobile={isMobile}
                    dragOverId={dragOverId}
                    draggingPromptId={draggingPromptId}
                    expandedIds={expandedIds}
                    selectedCategoryId={selectedCategoryId}
                    onToggleExpand={onToggleExpand}
                    onSelectCategory={onSelectCategory}
                    onSelectPrompt={onSelectPrompt}
                    onCreateSubfolder={onCreateSubfolder}
                    onCreatePrompt={onCreatePrompt}
                    onRename={onRename}
                    onDelete={onDelete}
                    onDeletePrompt={onDeletePrompt}
                    onCyclePromptVisibility={onCyclePromptVisibility}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onPromptDragStart={onPromptDragStart}
                    onPromptDragEnd={onPromptDragEnd}
                  />
                );
              } else {
                return (
                  <TreePromptItem
                    key={child.id}
                    node={child}
                    isSelected={selectedPromptId === child.id}
                    user={user}
                    isMobile={isMobile}
                    onSelect={onSelectPrompt}
                    onDelete={onDeletePrompt}
                    onCycleVisibility={onCyclePromptVisibility}
                    onDragStart={onPromptDragStart}
                    onDragEnd={onPromptDragEnd}
                    isDragging={draggingPromptId === child.id}
                  />
                );
              }
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

interface TreeFolderWithStateProps {
  node: TreeFolder;
  expandedIds: Set<string>;
  selectedCategoryId: string | null;
  selectedPromptId: string | null;
  user: any;
  isMobile: boolean;
  dragOverId: string | null;
  draggingPromptId: string | null;
  onToggleExpand: (id: string) => void;
  onSelectCategory: (node: TreeFolder) => void;
  onSelectPrompt: (node: TreePrompt) => void;
  onCreateSubfolder: (parent: TreeFolder) => void;
  onCreatePrompt: (parent: TreeFolder) => void;
  onRename: (node: TreeFolder) => void;
  onDelete: (node: TreeFolder) => void;
  onDeletePrompt: (node: TreePrompt) => void;
  onCyclePromptVisibility: (node: TreePrompt) => void;
  onDragOver: (e: React.DragEvent, folderId: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, folderId: string) => void;
  onPromptDragStart: (e: React.DragEvent, node: TreePrompt) => void;
  onPromptDragEnd: () => void;
}

export const TreeFolderWithState = memo(function TreeFolderWithStateView({
  node,
  expandedIds,
  selectedCategoryId,
  selectedPromptId,
  ...props
}: TreeFolderWithStateProps) {
  return (
    <TreeFolderItem
      node={node}
      isExpanded={expandedIds.has(node.id)}
      isSelected={selectedCategoryId === node.id}
      selectedPromptId={selectedPromptId}
      expandedIds={expandedIds}
      selectedCategoryId={selectedCategoryId}
      {...props}
    />
  );
});
