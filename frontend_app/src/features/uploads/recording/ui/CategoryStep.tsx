import { ChevronRight, Folder as FolderIcon, Search, Star } from "lucide-react";
import type {
  PromptTemplate,
  Folder as TemplateFolder,
} from "@/shared/data/templates";
import type { Ref } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export interface FavouritePromptOption {
  category: TemplateFolder;
  subcategory: PromptTemplate;
}

interface CategoryStepProps {
  categories: Array<TemplateFolder>;
  childrenByParent: Partial<Record<string, Array<TemplateFolder>>>;
  favouritePrompts: Array<FavouritePromptOption>;
  favouriteCount: number;
  isLoadingFavourites: boolean;
  updatingFavouritePromptId?: string;
  searchQuery: string;
  sampleCategory?: TemplateFolder;
  showSampleCategory: boolean;
  onSearchChange: (value: string) => void;
  onSelectCategory: (category: TemplateFolder) => void;
  onSelectFavourite: (favourite: FavouritePromptOption) => void;
  onToggleFavourite: (promptId: string) => void;
  onSelectSampleCategory: () => void;
  sentinelRef: Ref<HTMLDivElement>;
}

export function CategoryStep({
  categories,
  childrenByParent,
  favouritePrompts,
  favouriteCount,
  isLoadingFavourites,
  updatingFavouritePromptId,
  searchQuery,
  sampleCategory,
  showSampleCategory,
  onSearchChange,
  onSelectCategory,
  onSelectFavourite,
  onToggleFavourite,
  onSelectSampleCategory,
  sentinelRef,
}: CategoryStepProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-5 duration-500 sm:space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold sm:text-xl">
          <FolderIcon className="text-primary h-4 w-4 sm:h-5 sm:w-5" />
          Select Directorate Area
        </h2>
        <div className="relative w-full sm:w-64">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
          <Input
            placeholder="Search directorates..."
            className="pl-9"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>

      <section aria-labelledby="favourite-prompts-heading">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3
            id="favourite-prompts-heading"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-500" />
            Favourites
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {favouriteCount}
            </Badge>
          </h3>
        </div>

        {isLoadingFavourites ? (
          <div className="bg-muted/30 text-muted-foreground rounded-lg border px-3 py-2 text-xs">
            Loading favourites...
          </div>
        ) : favouritePrompts.length > 0 ? (
          <ScrollArea className="-mx-1 w-auto [&_[data-radix-scroll-area-scrollbar]]:bg-transparent">
            <div className="flex w-max min-w-full snap-x gap-2 px-1 pb-2">
              {favouritePrompts.map((favourite) => (
                <FavouritePromptCard
                  key={favourite.subcategory.id}
                  favourite={favourite}
                  isUpdating={
                    updatingFavouritePromptId === favourite.subcategory.id
                  }
                  onSelect={() => onSelectFavourite(favourite)}
                  onRemove={() => onToggleFavourite(favourite.subcategory.id)}
                />
              ))}
            </div>
            <ScrollBar
              orientation="horizontal"
              className="bg-muted/40 [&>div]:bg-primary/60 [&>div:hover]:bg-primary h-1 border-0 p-0 [&>div]:transition-colors"
            />
          </ScrollArea>
        ) : (
          <div className="bg-muted/20 text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs">
            <Star className="h-3.5 w-3.5 shrink-0" />
            Star a meeting type to keep it here.
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {showSampleCategory && sampleCategory && (
          <CategoryCard
            category={sampleCategory}
            description="Sample area for tutorial - Click to continue"
            highlighted
            onSelect={onSelectSampleCategory}
            dataTutorial="sample-category"
          />
        )}

        {categories.map((category) => {
          const childCount = childrenByParent[category.id]?.length ?? 0;

          return (
            <CategoryCard
              key={category.id}
              category={category}
              description={
                childCount > 0
                  ? `${childCount} sub-areas`
                  : "Select to view meeting types"
              }
              onSelect={() => onSelectCategory(category)}
            />
          );
        })}

        {categories.length === 0 && (
          <div className="text-muted-foreground col-span-full py-12 text-center">
            <p>No service areas found matching your search.</p>
          </div>
        )}
      </div>

      <div ref={sentinelRef} className="h-4" />
    </div>
  );
}

function FavouritePromptCard({
  favourite,
  isUpdating,
  onSelect,
  onRemove,
}: {
  favourite: FavouritePromptOption;
  isUpdating: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="hover:border-primary/40 relative min-w-[min(15rem,82vw)] snap-start rounded-lg border bg-yellow-500/5 transition-colors sm:min-w-60">
      <button onClick={onSelect} className="w-full p-3 pr-11 text-left">
        <span className="block truncate text-sm font-semibold">
          {favourite.subcategory.name}
        </span>
        <span className="text-muted-foreground mt-1 block truncate text-xs">
          {favourite.category.name}
        </span>
      </button>
      <button
        type="button"
        disabled={isUpdating}
        onClick={onRemove}
        aria-label={`Remove ${favourite.subcategory.name} from favourites`}
        title="Remove from favourites"
        className="focus-visible:ring-ring absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-md text-yellow-600 transition-colors hover:bg-yellow-500/15 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
      >
        <Star className="h-4 w-4 fill-current" />
      </button>
    </div>
  );
}

function CategoryCard({
  category,
  description,
  highlighted = false,
  dataTutorial,
  onSelect,
}: {
  category: TemplateFolder;
  description: string;
  highlighted?: boolean;
  dataTutorial?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-tutorial={dataTutorial}
      onClick={onSelect}
      className={`group bg-card hover:border-primary/50 focus-visible:ring-primary/30 hover:bg-muted/40 relative flex min-h-22 rounded-lg border p-3.5 text-left transition-all hover:shadow-sm focus-visible:ring-2 focus-visible:outline-none ${
        highlighted ? "border-primary ring-primary/20 ring-2" : ""
      }`}
    >
      <div className="min-w-0 flex-1 pr-7">
        <h3 className="line-clamp-2 text-sm leading-snug font-semibold">
          {category.name}
        </h3>
        <p className="text-muted-foreground mt-1 truncate text-xs">
          {description}
        </p>
      </div>
      <ChevronRight
        aria-hidden="true"
        className="text-muted-foreground absolute right-3.5 h-4 w-4 transition-transform group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5"
      />
    </button>
  );
}
