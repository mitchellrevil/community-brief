import { memo } from "react";
import {
  Eye,
  FileText,
  GripVertical,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import {
  canAccessPrompt,
  canDeletePrompt,
  canDragPrompt,
  canTogglePromptVisibility,
} from "../state/permissions";
import type { TreePrompt } from "../state/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PromptMetadataBadge } from "@/components/ui/prompt-metadata-badge";
import { ModelLifecyclePopover } from "@/features/inference/ModelLifecyclePopover";
import { listItemFadeInUp, motion } from "@/lib/motion";
import { getPromptVisibilityLabel } from "@/lib/prompt-visibility";
import { cn } from "@/lib/utils";


interface TreePromptItemProps {
  node: TreePrompt;
  isSelected: boolean;
  user: any;
  isMobile: boolean;
  onSelect: (node: TreePrompt) => void;
  onDelete: (node: TreePrompt) => void;
  onCycleVisibility?: (node: TreePrompt) => void;
  onDragStart: (e: React.DragEvent, node: TreePrompt) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

export const TreePromptItem = memo(function TreePromptItemView({
  node,
  isSelected,
  user,
  isMobile,
  onSelect,
  onDelete,
  onCycleVisibility,
  onDragStart,
  onDragEnd,
  isDragging,
}: TreePromptItemProps) {
  const hasAccess = canAccessPrompt(node.prompt, user);
  const canDelete = canDeletePrompt(node.prompt, user);
  const canDrag = canDragPrompt(node.prompt, user) && !isMobile;
  const canCycleVisibility =
    Boolean(onCycleVisibility) && canTogglePromptVisibility(node.prompt, user);
  const visibilityLabel = getPromptVisibilityLabel(node.prompt.visibility);

  const indentSize = isMobile ? 12 : 20;
  const indent = node.depth * indentSize;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(node);
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!canDrag) {
      e.preventDefault();
      return;
    }
    onDragStart(e, node);
  };

  return (
    <motion.div
      role="treeitem"
      aria-selected={isSelected}
      className="box-border w-full max-w-full min-w-0 overflow-hidden"
      variants={listItemFadeInUp}
    >
      <div
        draggable={canDrag}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onClick={handleClick}
      >
        <motion.div
          className={cn(
            "group box-border flex w-full max-w-full min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-sm transition-colors",
            "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
            isSelected && "bg-accent text-accent-foreground font-medium",
            canDrag && "cursor-grab active:cursor-grabbing",
            isDragging && "opacity-50",
          )}
          style={{ paddingLeft: `${indent + 8}px` }}
          whileHover={{ x: 2, scale: 1.005 }}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.15 }}
        >
          {canDrag && (
            <GripVertical className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-50" />
          )}
          <FileText className="h-4 w-4 flex-shrink-0" />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <ModelLifecyclePopover
            modelKey={node.prompt.analysis_model ?? undefined}
          />
          <PromptMetadataBadge metadata={node.prompt.prompt_metadata} />

          {hasAccess && canCycleVisibility && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Visibility ${visibilityLabel}. Click to cycle.`}
              title={`Visibility ${visibilityLabel}`}
              className="h-6 w-6 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onCycleVisibility?.(node);
              }}
            >
              <Eye className="h-3 w-3" />
            </Button>
          )}

          {hasAccess && canDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Template actions"
                  title="Template actions"
                  className={cn(
                    "h-6 w-6 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
                    isSelected && "opacity-100",
                  )}
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(node);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
});
