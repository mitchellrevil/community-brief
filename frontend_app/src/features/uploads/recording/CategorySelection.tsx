import { useEffect, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CategoryStep } from "./ui/CategoryStep";
import { DetailsStep } from "./ui/DetailsStep";
import { DraftsDialog } from "./ui/DraftsDialog";
import { SelectionProgress } from "./ui/SelectionProgress";
import { SubcategoryStep } from "./ui/SubcategoryStep";
import type { AuthSessionState } from "@/features/auth/data/types";
import type { DraftRecording } from "@/lib/draft-storage";
import type { Folder, PromptTemplate } from "@/shared/data/templates";
import type { FormSection, FormsRecord } from "@/types/forms";
import type { FavouritePromptOption } from "./ui/CategoryStep";
import {
  TUTORIAL_SAMPLE_CATEGORY,
  TUTORIAL_SAMPLE_SUBCATEGORY,
  useTutorialOptional,
} from "@/app/contexts/tutorial-context";
import { getMissingRequiredFields } from "@/components/shared/FormValidator";
import { Card, CardContent } from "@/components/ui/card";
import { RetentionDisclaimer } from "@/components/ui/retention-disclaimer";
import { updateFavouritePrompt } from "@/features/auth/data/api";
import { authSessionQueryKey } from "@/features/auth/data/queries";
import { useInfiniteScroll } from "@/hooks/useInfinitePagination";
import { useUserPermissions } from "@/hooks/usePermissions";
import { deleteDraftRecording, getAllDrafts } from "@/lib/draft-storage";
import {
  foldersInfiniteQuery,
  getFolder,
  getTemplate,
  templatesInfiniteQuery,
  templatesKeys,
} from "@/shared/data/templates";


interface CategorySelectionProps {
  onSelectionComplete: (
    categoryId: string,
    subcategoryId: string,
    categoryName: string,
    subcategoryName: string,
    preSessionData: Record<string, any>,
    selectedSubcategoryDetails?: PromptTemplate,
  ) => void;
}

function dedupeById<T extends { id: string }>(items: Array<T>): Array<T> {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

export function CategorySelection({
  onSelectionComplete,
}: CategorySelectionProps) {
  const [selectedCategory, setSelectedCategory] = useState<Folder | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] =
    useState<PromptTemplate | null>(null);
  const [preSessionFormData, setPreSessionFormData] = useState<FormsRecord>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [foundDrafts, setFoundDrafts] = useState<Array<DraftRecording> | null>(
    null,
  );
  const [showDraftsDialog, setShowDraftsDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { data: currentUser } = useUserPermissions();
  const queryClient = useQueryClient();
  const favouritePromptIds = currentUser?.favourite_prompt_ids ?? [];

  const favouriteQueries = useQueries({
    queries: favouritePromptIds.map((promptId) => ({
      queryKey: templatesKeys.template("runtime", promptId),
      queryFn: async (): Promise<FavouritePromptOption> => {
        const subcategory = await getTemplate(promptId, "runtime");
        const category = await getFolder(subcategory.folder_id, "runtime");
        return { category, subcategory };
      },
      networkMode: "always" as const,
      staleTime: 10 * 60 * 1000,
      retry: false,
      meta: { suppressGlobalErrorToast: true },
    })),
  });

  const favouritePrompts = favouriteQueries.flatMap((query) =>
    query.data ? [query.data] : [],
  );
  const isLoadingFavourites =
    favouritePromptIds.length > 0 &&
    favouriteQueries.some((query) => query.isPending);
  const favouriteMutation = useMutation({
    mutationFn: ({
      promptId,
      favourite,
    }: {
      promptId: string;
      favourite: boolean;
    }) => updateFavouritePrompt(promptId, favourite),
    onSuccess: (ids) => {
      queryClient.setQueryData<AuthSessionState>(authSessionQueryKey, (user) =>
        user ? { ...user, favourite_prompt_ids: ids } : user,
      );
    },
    onError: () => toast.error("Failed to update favourites"),
  });

  const tutorialContext = useTutorialOptional();
  const isTutorialMode = tutorialContext?.isTutorialMode ?? false;
  const currentTutorialStep = tutorialContext?.tutorialState.currentStep;

  const {
    data: categoriesData,
    isLoading: isCategoriesLoading,
    isFetchingNextPage: isFetchingNextCategoriesPage,
    hasNextPage: hasNextCategoriesPage,
    fetchNextPage: fetchNextCategoriesPage,
  } = useInfiniteQuery(foldersInfiniteQuery({ view: "runtime", limit: 50 }));

  const {
    data: subcategoriesData,
    isLoading: isSubcategoriesLoading,
    isFetchingNextPage: isFetchingNextSubcategoriesPage,
    hasNextPage: hasNextSubcategoriesPage,
    fetchNextPage: fetchNextSubcategoriesPage,
  } = useInfiniteQuery({
    ...templatesInfiniteQuery({
      view: "runtime",
      folderId: selectedCategory?.id,
      limit: 50,
    }),
    enabled: Boolean(selectedCategory?.id),
  });

  const categoriesSentinelRef = useInfiniteScroll(
    hasNextCategoriesPage,
    isFetchingNextCategoriesPage,
    fetchNextCategoriesPage,
  );

  const subcategoriesSentinelRef = useInfiniteScroll(
    hasNextSubcategoriesPage,
    isFetchingNextSubcategoriesPage,
    fetchNextSubcategoriesPage,
  );

  const categories = useMemo(
    () => dedupeById(categoriesData?.pages.flatMap((page) => page.items) ?? []),
    [categoriesData],
  );

  const subcategories = useMemo(
    () =>
      dedupeById(subcategoriesData?.pages.flatMap((page) => page.items) ?? []),
    [subcategoriesData],
  );

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const { rootCategories, childrenByParent } = useMemo(() => {
    const children: Partial<Record<string, Array<Folder>>> = {};
    const roots: Array<Folder> = [];

    for (const category of categories) {
      const parentId = category.parent_id;
      if (parentId) {
        children[parentId] = [...(children[parentId] ?? []), category];
      } else {
        roots.push(category);
      }
    }

    roots.sort((a, b) => a.name.localeCompare(b.name));
    Object.values(children).forEach((items) =>
      items?.sort((a, b) => a.name.localeCompare(b.name)),
    );

    return { rootCategories: roots, childrenByParent: children };
  }, [categories]);

  const filteredRootCategories = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return query
      ? rootCategories.filter((category) =>
          category.name.toLowerCase().includes(query),
        )
      : rootCategories;
  }, [rootCategories, searchQuery]);

  const visibleSubcategories = useMemo(
    () => [...subcategories].sort((a, b) => a.name.localeCompare(b.name)),
    [subcategories],
  );

  const filteredSubcategories = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return query
      ? visibleSubcategories.filter((subcategory) =>
          subcategory.name.toLowerCase().includes(query),
        )
      : visibleSubcategories;
  }, [visibleSubcategories, searchQuery]);

  const preSessionSections: Array<FormSection> = useMemo(
    () => selectedSubcategory?.pre_session_talking_points ?? [],
    [selectedSubcategory],
  );

  const hasFormFields = useMemo(
    () => preSessionSections.some((section) => section.fields.length > 0),
    [preSessionSections],
  );

  useEffect(() => {
    setSearchQuery("");
  }, [selectedCategory, selectedSubcategory]);

  useEffect(() => {
    (async () => {
      try {
        const pending = (await getAllDrafts()).filter(
          (draft) => !draft.uploaded,
        );
        if (pending.length > 0) {
          setFoundDrafts(pending);
          setShowDraftsDialog(true);
        }
      } catch {
        // Draft recovery is helpful, not required for page load.
      }
    })();
  }, []);

  const step: 1 | 2 | 3 = !selectedCategory ? 1 : !selectedSubcategory ? 2 : 3;
  const isLoading =
    isCategoriesLoading ||
    (Boolean(selectedCategory) && isSubcategoriesLoading);

  const handleInputChange = (fieldName: string, value: unknown) => {
    setPreSessionFormData((current) => ({
      ...current,
      [fieldName]: value,
    }));
  };

  const validateForm = () => {
    if (!hasFormFields) return true;
    const missing = getMissingRequiredFields(
      preSessionSections.flatMap((section) => section.fields),
      preSessionFormData,
    );

    if (missing.length > 0) {
      toast.error(`Please fill in required fields: ${missing.join(", ")}`);
      return false;
    }

    return true;
  };

  const handleContinue = async () => {
    if (!(selectedCategory && selectedSubcategory) || !validateForm()) return;

    setIsSubmitting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (hasFormFields) toast.success("Pre-session form completed");
      onSelectionComplete(
        selectedCategory.id,
        selectedSubcategory.id,
        selectedCategory.name,
        selectedSubcategory.name,
        preSessionFormData,
        selectedSubcategory,
      );
    } catch {
      toast.error("Failed to process form data");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    if (selectedSubcategory) {
      setSelectedSubcategory(null);
      return;
    }

    if (selectedCategory) {
      const parentId = selectedCategory.parent_id;
      setSelectedCategory(
        parentId ? (categoryById.get(parentId) ?? null) : null,
      );
    }
  };

  const selectCategory = (category: Folder) => {
    setSelectedCategory(category);
    setSelectedSubcategory(null);
    setPreSessionFormData({});
  };

  const selectSubcategory = (subcategory: PromptTemplate) => {
    setSelectedSubcategory(subcategory);
    setPreSessionFormData({});
  };

  const selectFavourite = ({
    category,
    subcategory,
  }: FavouritePromptOption) => {
    setSelectedCategory(category);
    selectSubcategory(subcategory);
  };

  const toggleFavourite = (promptId: string) => {
    if (favouriteMutation.isPending) return;
    favouriteMutation.mutate({
      promptId,
      favourite: !favouritePromptIds.includes(promptId),
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 overflow-x-hidden px-0 py-4 sm:space-y-8 sm:py-8">
      <DraftsDialog
        open={showDraftsDialog}
        drafts={foundDrafts}
        onOpenChange={setShowDraftsDialog}
        onRestore={(draft) => {
          setShowDraftsDialog(false);
          onSelectionComplete(
            draft.categoryId,
            draft.subcategoryId,
            draft.categoryName,
            draft.subcategoryName,
            draft.preSessionData || {},
          );
        }}
        onDiscard={async (draft) => {
          await deleteDraftRecording(draft.id);
          setFoundDrafts((current) =>
            current ? current.filter((item) => item.id !== draft.id) : null,
          );
        }}
      />

      <div className="flex flex-col gap-4">
        <SelectionProgress step={step} />
      </div>

      <RetentionDisclaimer />

      {isLoading ? (
        <div className="bg-card flex min-h-[40vh] flex-col items-center justify-center rounded-xl border p-6 shadow-sm sm:p-8">
          <Loader2 className="text-primary mb-3 h-10 w-10 animate-spin sm:mb-4 sm:h-12 sm:w-12" />
          <h3 className="text-base font-medium sm:text-lg">
            Loading configuration...
          </h3>
          <p className="text-muted-foreground text-sm">
            Please wait while we prepare your options.
          </p>
        </div>
      ) : (
        <Card className="bg-card border-none shadow-md">
          <CardContent className="p-4 sm:p-6">
            {step === 1 && (
              <CategoryStep
                categories={filteredRootCategories}
                childrenByParent={childrenByParent}
                favouritePrompts={favouritePrompts}
                favouriteCount={
                  isLoadingFavourites
                    ? favouritePromptIds.length
                    : favouritePrompts.length
                }
                isLoadingFavourites={isLoadingFavourites}
                updatingFavouritePromptId={
                  favouriteMutation.isPending
                    ? favouriteMutation.variables.promptId
                    : undefined
                }
                searchQuery={searchQuery}
                sampleCategory={TUTORIAL_SAMPLE_CATEGORY}
                showSampleCategory={
                  isTutorialMode && currentTutorialStep === "category-selection"
                }
                onSearchChange={setSearchQuery}
                onSelectCategory={selectCategory}
                onSelectFavourite={selectFavourite}
                onToggleFavourite={toggleFavourite}
                onSelectSampleCategory={() => {
                  selectCategory(TUTORIAL_SAMPLE_CATEGORY);
                  tutorialContext?.nextStep();
                }}
                sentinelRef={categoriesSentinelRef}
              />
            )}

            {step === 2 && selectedCategory && (
              <SubcategoryStep
                selectedCategory={selectedCategory}
                childCategories={childrenByParent[selectedCategory.id] ?? []}
                subcategories={filteredSubcategories}
                favouritePromptIds={favouritePromptIds}
                updatingFavouritePromptId={
                  favouriteMutation.isPending
                    ? favouriteMutation.variables.promptId
                    : undefined
                }
                searchQuery={searchQuery}
                sampleSubcategory={TUTORIAL_SAMPLE_SUBCATEGORY}
                showSampleSubcategory={
                  isTutorialMode &&
                  currentTutorialStep === "subcategory-selection" &&
                  selectedCategory.id === TUTORIAL_SAMPLE_CATEGORY.id
                }
                onSearchChange={setSearchQuery}
                onBack={handleBack}
                onSelectCategory={selectCategory}
                onSelectSubcategory={selectSubcategory}
                onToggleFavourite={toggleFavourite}
                onSelectSampleSubcategory={() => {
                  selectSubcategory(TUTORIAL_SAMPLE_SUBCATEGORY);
                  tutorialContext?.nextStep();
                }}
                sentinelRef={subcategoriesSentinelRef}
              />
            )}

            {step === 3 && selectedCategory && selectedSubcategory && (
              <DetailsStep
                selectedCategory={selectedCategory}
                selectedSubcategory={selectedSubcategory}
                preSessionSections={preSessionSections}
                preSessionFormData={preSessionFormData}
                hasFormFields={hasFormFields}
                isSubmitting={isSubmitting}
                onBack={handleBack}
                onInputChange={handleInputChange}
                onContinue={() => {
                  if (
                    isTutorialMode &&
                    currentTutorialStep === "details-continue"
                  ) {
                    tutorialContext?.nextStep();
                  }
                  handleContinue();
                }}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
