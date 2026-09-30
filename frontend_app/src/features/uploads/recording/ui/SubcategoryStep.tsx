import { ArrowLeft, Folder as FolderIcon, Search, Star } from "lucide-react";
import type {
  PromptTemplate,
  Folder as TemplateFolder,
} from "@/shared/data/templates";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PromptMetadataBadge } from "@/components/ui/prompt-metadata-badge";

interface SubcategoryStepProps {
  selectedCategory: TemplateFolder;
  childCategories: Array<TemplateFolder>;
  subcategories: Array<PromptTemplate>;
  favouritePromptIds: Array<string>;
  updatingFavouritePromptId?: string;
  searchQuery: string;
  sampleSubcategory?: PromptTemplate;
  showSampleSubcategory: boolean;
  onSearchChange: (value: string) => void;
  onBack: () => void;
  onSelectCategory: (category: TemplateFolder) => void;
  onSelectSubcategory: (subcategory: PromptTemplate) => void;
  onToggleFavourite: (promptId: string) => void;
  onSelectSampleSubcategory: () => void;
  sentinelRef: Ref<HTMLDivElement>;
}

export function SubcategoryStep({
  selectedCategory,
  childCategories,
  subcategories,
  favouritePromptIds,
  updatingFavouritePromptId,
  searchQuery,
  sampleSubcategory,
  showSampleSubcategory,
  onSearchChange,
  onBack,
  onSelectCategory,
  onSelectSubcategory,
  onToggleFavourite,
  onSelectSampleSubcategory,
  sentinelRef,
}: SubcategoryStepProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6 duration-500">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="shrink-0 rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold sm:text-xl">
              <span className="truncate">Select Meeting Type</span>
            </h2>
            <p className="text-muted-foreground truncate text-xs sm:text-sm">
              Service Area:{" "}
              <span className="text-foreground font-medium">
                {selectedCategory.name}
              </span>
            </p>
          </div>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
          <Input
            placeholder="Search meeting types..."
            className="pl-9"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>

      {childCategories.length > 0 && (
        <div className="mb-6 sm:mb-8">
          <h3 className="text-muted-foreground mb-3 text-sm font-medium tracking-wider uppercase">
            Sub-Areas
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
            {childCategories.map((child) => (
              <button
                key={child.id}
                onClick={() => onSelectCategory(child)}
                className="bg-muted/30 hover:border-primary/30 hover:bg-muted flex min-w-0 items-center gap-3 rounded-lg border p-2.5 text-left transition-all sm:p-3"
              >
                <FolderIcon className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="truncate text-sm font-medium">
                  {child.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-muted-foreground mb-3 text-sm font-medium tracking-wider uppercase">
          Meeting Types
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {showSampleSubcategory && sampleSubcategory && (
            <SubcategoryCard
              subcategory={sampleSubcategory}
              description="Sample meeting type - Click to continue"
              highlighted
              dataTutorial="sample-subcategory"
              onSelect={onSelectSampleSubcategory}
            />
          )}

          {subcategories.map((subcategory) => (
            <SubcategoryCard
              key={subcategory.id}
              subcategory={subcategory}
              description="Click to select"
              isFavourite={favouritePromptIds.includes(subcategory.id)}
              isUpdating={updatingFavouritePromptId === subcategory.id}
              onSelect={() => onSelectSubcategory(subcategory)}
              onToggleFavourite={() => onToggleFavourite(subcategory.id)}
            />
          ))}

          {subcategories.length === 0 && (
            <div className="text-muted-foreground col-span-full rounded-xl border-2 border-dashed py-12 text-center">
              <p>No meeting types found.</p>
            </div>
          )}
        </div>
      </div>

      <div ref={sentinelRef} className="h-4" />
    </div>
  );
}

function SubcategoryCard({
  subcategory,
  description,
  highlighted = false,
  isFavourite = false,
  isUpdating = false,
  dataTutorial,
  onSelect,
  onToggleFavourite,
}: {
  subcategory: PromptTemplate;
  description: string;
  highlighted?: boolean;
  isFavourite?: boolean;
  isUpdating?: boolean;
  dataTutorial?: string;
  onSelect: () => void;
  onToggleFavourite?: () => void;
}) {
  return (
    <div
      data-tutorial={dataTutorial}
      className={`group bg-card hover:border-primary/50 relative min-h-20 overflow-hidden rounded-lg border text-left transition-colors hover:shadow-sm ${
        highlighted
          ? "border-primary ring-primary/20 hover:border-primary ring-2"
          : ""
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-20 w-full items-center gap-3 p-3 pr-11 text-left"
      >
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold">
            {subcategory.name}
          </h3>
          <p className="text-muted-foreground mt-1 truncate text-xs">
            {description}
          </p>
          <PromptMetadataBadge
            metadata={subcategory.prompt_metadata}
            className="mt-1"
          />
        </div>
      </button>
      {onToggleFavourite && (
        <button
          type="button"
          disabled={isUpdating}
          onClick={onToggleFavourite}
          aria-label={`${isFavourite ? "Remove" : "Add"} ${subcategory.name} ${isFavourite ? "from" : "to"} favourites`}
          title={isFavourite ? "Remove from favourites" : "Add to favourites"}
          className={`focus-visible:ring-ring absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 ${
            isFavourite
              ? "bg-yellow-500/15 text-yellow-600"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Star className={`h-4 w-4 ${isFavourite ? "fill-current" : ""}`} />
        </button>
      )}
    </div>
  );
}
