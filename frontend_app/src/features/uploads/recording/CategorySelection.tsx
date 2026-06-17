import { useEffect, useMemo, useState } from "react";
import { 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle2, 
  ChevronRight, 
  FileText, 
  Folder, 
  Info,
  Loader2,
  Search
} from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CategoryResponse, SubcategoryResponse } from "@/features/prompt-management/data/api";
import type { DraftRecording } from "@/lib/draft-storage";
import type { FormField, FormSection, FormsRecord } from "@/types/forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RetentionDisclaimer } from "@/components/ui/retention-disclaimer";
import {
  getPromptManagementCategoriesInfiniteQuery,
  getPromptManagementSubcategoriesInfiniteQuery,
} from "@/features/prompt-management/data/queries";
import { useInfiniteScroll } from "@/hooks/useInfinitePagination";
import { cn } from "@/lib/utils";
import { deleteDraftRecording, formatBytes, getAllDrafts } from "@/lib/draft-storage";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TUTORIAL_SAMPLE_CATEGORY, TUTORIAL_SAMPLE_SUBCATEGORY, useTutorialOptional } from "@/app/contexts/tutorial-context";
import {  FormFieldRenderer } from "@/components/shared/FormFieldRenderer";
import {  getMissingRequiredFields } from "@/components/shared/FormValidator";
import { useUserPermissions } from "@/hooks/usePermissions";
import { canAccessSubcategory } from "@/lib/prompt-visibility";

/* ----------------------------- Types & Helpers ----------------------------- */

interface CategorySelectionProps {
  onSelectionComplete: (
    categoryId: string,
    subcategoryId: string,
    categoryName: string,
    subcategoryName: string,
    preSessionData: Record<string, any>,
    selectedSubcategoryDetails?: SubcategoryResponse,
  ) => void;
}

function dedupeById<T extends { id: string }>(items: Array<T>): Array<T> {
  const byId = new Map<string, T>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

/* -------------------------------- Component -------------------------------- */

export function CategorySelection({ onSelectionComplete }: CategorySelectionProps) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryResponse | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<SubcategoryResponse | null>(null);
  const [preSessionFormData, setPreSessionFormData] = useState<FormsRecord>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [foundDrafts, setFoundDrafts] = useState<Array<DraftRecording> | null>(null);
  const [showDraftsDialog, setShowDraftsDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { data: currentUser } = useUserPermissions();

  // Tutorial mode handling
  const tutorialContext = useTutorialOptional();
  const isTutorialMode = tutorialContext?.isTutorialMode ?? false;
  const currentTutorialStep = tutorialContext?.tutorialState.currentStep;

  // Infinite scroll for categories
  const {
    data: categoriesData,
    isLoading: isCategoriesLoading,
    isFetchingNextPage: isFetchingNextCategoriesPage,
    hasNextPage: hasNextCategoriesPage,
    fetchNextPage: fetchNextCategoriesPage,
  } = useInfiniteQuery(getPromptManagementCategoriesInfiniteQuery(50));

  // Infinite scroll for subcategories
  const {
    data: subcategoriesData,
    isLoading: isSubcategoriesLoading,
    isFetchingNextPage: isFetchingNextSubcategoriesPage,
    hasNextPage: hasNextSubcategoriesPage,
    fetchNextPage: fetchNextSubcategoriesPage,
  } = useInfiniteQuery({
    ...getPromptManagementSubcategoriesInfiniteQuery(selectedCategory?.id, 50),
    enabled: Boolean(selectedCategory?.id),
  });

  const categoriesSentinelRef = useInfiniteScroll(
    hasNextCategoriesPage,
    isFetchingNextCategoriesPage,
    fetchNextCategoriesPage
  );

  const subcategoriesSentinelRef = useInfiniteScroll(
    hasNextSubcategoriesPage,
    isFetchingNextSubcategoriesPage,
    fetchNextSubcategoriesPage
  );

  const categories: Array<CategoryResponse> = useMemo(
    () => dedupeById(categoriesData?.pages.flatMap((p) => p.categories) ?? []),
    [categoriesData]
  );

  const subcategories: Array<SubcategoryResponse> = useMemo(
    () => dedupeById(subcategoriesData?.pages.flatMap((p) => p.subcategories) ?? []),
    [subcategoriesData]
  );

  // Build parent-child map for categories
  const { rootCategories, childrenByParent } = useMemo(() => {
    const map: Partial<Record<string, Array<CategoryResponse>>> = {};
    const roots: Array<CategoryResponse> = [];
    for (const cat of categories) {
      const parent = (cat as any).parent_category_id as string | undefined;
      if (parent) {
        if (!map[parent]) map[parent] = [];
        map[parent].push(cat);
      } else {
        roots.push(cat);
      }
    }
    roots.sort((a, b) => a.name.localeCompare(b.name));
    for (const parentId of Object.keys(map)) {
      if (map[parentId]) {
        map[parentId].sort((a, b) => a.name.localeCompare(b.name));
      }
    }
    return { rootCategories: roots, childrenByParent: map };
  }, [categories]);

  // Filtered categories based on search
  const filteredRootCategories = useMemo(() => {
    if (!searchQuery) return rootCategories;
    return rootCategories.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [rootCategories, searchQuery]);

  // Subcategories available for current selected category
  const availableSubcategories = useMemo(
    () =>
      subcategories
        .filter((subcategory) =>
          canAccessSubcategory(subcategory, currentUser?.permission, [currentUser?.user_id, currentUser?.email])
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [subcategories, currentUser?.permission, currentUser?.user_id, currentUser?.email]
  );

  const filteredSubcategories = useMemo(() => {
    if (!searchQuery) return availableSubcategories;
    return availableSubcategories.filter(s => 
      s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [availableSubcategories, searchQuery]);

  const preSessionSections: Array<FormSection> = useMemo(
    () => selectedSubcategory?.preSessionTalkingPoints ?? [],
    [selectedSubcategory]
  );

  const hasFormFields = useMemo(
    () =>
      preSessionSections.length > 0 &&
      preSessionSections.some((section) => section.fields.length > 0),
    [preSessionSections]
  );

  // Reset search when changing steps
  useEffect(() => {
    setSearchQuery("");
  }, [selectedCategory, selectedSubcategory]);

  // Check for unsaved drafts on mount and show dialog if present
  useEffect(() => {
    (async () => {
      try {
        const drafts = await getAllDrafts();
        const pending = drafts.filter(d => !d.uploaded);
        if (pending.length > 0) {
          setFoundDrafts(pending);
          setShowDraftsDialog(true);
        }
      } catch (err) {
        // ignore
      }
    })();
  }, []);

  /* --------------------------------- Handlers -------------------------------- */

  const handleInputChange = (fieldName: string, value: unknown) => {
    setPreSessionFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const validateForm = () => {
    if (!hasFormFields) return true;
    const allFields = preSessionSections.flatMap(section => section.fields);
    const missing = getMissingRequiredFields(allFields, preSessionFormData);

    if (missing.length > 0) {
      toast.error(`Please fill in required fields: ${missing.join(", ")}`);
      return false;
    }
    return true;
  };

  const handleContinue = async () => {
    if (!(selectedCategory && selectedSubcategory)) return;
    if (!validateForm()) return;
    
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
    } else if (selectedCategory) {
      // Check if we are in a sub-category of a category (nested)
      // For simplicity in this revamp, we treat category selection as one level for now, 
      // but if we want to support nested categories we might need a stack.
      // The original code had `expandedParentCategoryId` but selection was flat.
      // Let's just go back to root.
      setSelectedCategory(null);
    }
  };

  /* ---------------------------------- Render --------------------------------- */

  const step = !selectedCategory ? 1 : !selectedSubcategory ? 2 : 3;
  const isLoading = isCategoriesLoading || (Boolean(selectedCategory) && isSubcategoriesLoading);

  return (
    <div className="max-w-5xl mx-auto px-0 py-4 sm:py-8 space-y-6 sm:space-y-8 overflow-x-hidden">
      {/* Header Section */}
      <div className="flex flex-col gap-4">

          {/* Drafts helper dialog (non-intrusive) */}
          <Dialog open={showDraftsDialog} onOpenChange={setShowDraftsDialog}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Unsubmitted Drafts Found</DialogTitle>
                <DialogDescription>
                  We found one or more unsaved recordings. You can restore a draft to review and submit it, or discard it if you don't need it.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                {foundDrafts?.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-background">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{d.categoryName} • {d.subcategoryName}</div>
                      <div className="text-xs text-muted-foreground">Saved {new Date(d.timestamp).toLocaleString()} • {formatBytes(d.audioBlob.size)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setShowDraftsDialog(false);
                          onSelectionComplete(d.categoryId, d.subcategoryId, d.categoryName, d.subcategoryName, d.preSessionData || {});
                        }}
                      >
                        Review & Restore
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await deleteDraftRecording(d.id);
                          setFoundDrafts((prev) => (prev ? prev.filter(x => x.id !== d.id) : null));
                        }}
                      >
                        Discard
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowDraftsDialog(false)}>Later</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        
        {/* Progress Steps - Responsive */}
        <div data-tutorial="progress-stepper" className="flex flex-wrap items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium bg-muted/50 p-2 rounded-lg w-full overflow-x-auto">
          <div className={cn("flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-md transition-colors whitespace-nowrap", step === 1 ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs">1</span>
            <span className="hidden sm:inline">Service Area</span>
            <span className="sm:hidden">Area</span>
          </div>
          <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground/50 flex-shrink-0" />
          <div className={cn("flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-md transition-colors whitespace-nowrap", step === 2 ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs">2</span>
            <span className="hidden sm:inline">Meeting Type</span>
            <span className="sm:hidden">Type</span>
          </div>
          <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground/50 flex-shrink-0" />
          <div className={cn("flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-md transition-colors whitespace-nowrap", step === 3 ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs">3</span>
            Details
          </div>
        </div>
      </div>

      <RetentionDisclaimer />

      {isLoading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center p-6 sm:p-8 bg-card rounded-xl border shadow-sm">
          <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 text-primary animate-spin mb-3 sm:mb-4" />
          <h3 className="text-base sm:text-lg font-medium">Loading configuration...</h3>
          <p className="text-sm text-muted-foreground">Please wait while we prepare your options.</p>
        </div>
      ) : (
        /* Main Content Area */
        <Card className="border-none shadow-md bg-card">
          <CardContent className="p-4 sm:p-6">
            
            {/* Step 1: Category Selection */}
            {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
                  <Folder className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  Select Directorate Area
                </h2>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search directorates..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
                {/* Tutorial sample category - shown first during tutorial */}
                {isTutorialMode && currentTutorialStep === "category-selection" && (
                  <button
                    data-tutorial="sample-category"
                    onClick={() => {
                      setSelectedCategory(TUTORIAL_SAMPLE_CATEGORY);
                      tutorialContext?.nextStep();
                    }}
                    className="group flex flex-col p-6 rounded-xl border-2 border-primary bg-card hover:border-primary hover:shadow-lg transition-all text-left ring-2 ring-primary/20"
                  >
                    <div className="flex items-start justify-between mb-3 sm:mb-4">
                      <h3 className="font-semibold text-base sm:text-lg leading-snug flex-1 line-clamp-2">{TUTORIAL_SAMPLE_CATEGORY.name}</h3>
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-primary/15 flex items-center justify-center ml-3 shrink-0 group-hover:bg-primary/25 transition-colors">
                        <Folder className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Sample area for tutorial • Click to continue
                    </p>
                  </button>
                )}
                {filteredRootCategories.map((category) => {
                  const childList = childrenByParent[category.id] ?? [];
                  const hasChildren = childList.length > 0;

                  return (
                    <button
                      key={category.id}
                      onClick={() => {
                        setSelectedCategory(category);
                        setSelectedSubcategory(null);
                        setPreSessionFormData({});
                      }}
                      className="group flex flex-col p-4 sm:p-6 rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all text-left"
                    >
                      <div className="flex items-start justify-between mb-3 sm:mb-4">
                        <h3 className="font-semibold text-base sm:text-lg leading-snug flex-1 line-clamp-2">{category.name}</h3>
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-yellow-500/15 flex items-center justify-center ml-3 shrink-0 group-hover:bg-yellow-500/25 transition-colors">
                          <Folder className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600" />
                        </div>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {hasChildren ? `${childList.length} sub-areas` : "Select to view meeting types"}
                      </p>
                    </button>
                  );
                })}
                
                {filteredRootCategories.length === 0 && (
                  <div className="col-span-full py-12 text-center text-muted-foreground">
                    <p>No service areas found matching your search.</p>
                  </div>
                )}
              </div>
              
              {/* Sentinel for infinite scroll */}
              <div ref={categoriesSentinelRef} className="h-4" />
            </div>
          )}

          {/* Step 2: Subcategory Selection */}
          {step === 2 && selectedCategory && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Button variant="ghost" size="icon" onClick={handleBack} className="rounded-full flex-shrink-0">
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
                      <span className="truncate">Select Meeting Type</span>
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">
                      Service Area: <span className="font-medium text-foreground">{selectedCategory.name}</span>
                    </p>
                  </div>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search meeting types..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Nested Categories (if any) */}
              {(childrenByParent[selectedCategory.id] ?? []).length > 0 && (
                <div className="mb-6 sm:mb-8">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Sub-Areas</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                    {(childrenByParent[selectedCategory.id] ?? []).map((child) => (
                      <button
                        key={child.id}
                        onClick={() => {
                          setSelectedCategory(child);
                          setSelectedSubcategory(null);
                          setPreSessionFormData({});
                        }}
                        className="flex items-center gap-3 p-2.5 sm:p-3 rounded-lg border bg-muted/30 hover:bg-muted hover:border-primary/30 transition-all text-left min-w-0"
                      >
                        <Folder className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium text-sm truncate">{child.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Meeting Types</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
                  {/* Tutorial sample subcategory - shown first during tutorial */}
                  {isTutorialMode && currentTutorialStep === "subcategory-selection" && selectedCategory.id === TUTORIAL_SAMPLE_CATEGORY.id && (
                    <button
                      data-tutorial="sample-subcategory"
                      onClick={() => {
                        setSelectedSubcategory(TUTORIAL_SAMPLE_SUBCATEGORY);
                        tutorialContext?.nextStep();
                      }}
                      className="group flex items-start gap-4 p-4 sm:p-6 rounded-xl border-2 border-primary bg-card hover:border-primary hover:shadow-lg transition-all text-left ring-2 ring-primary/20"
                    >
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary/25 transition-colors">
                        <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-sm sm:text-base mb-1">{TUTORIAL_SAMPLE_SUBCATEGORY.name}</h3>
                        <p className="text-xs text-muted-foreground">Sample meeting type • Click to continue</p>
                      </div>
                    </button>
                  )}
                  {filteredSubcategories.map((subcategory) => (
                    <button
                      key={subcategory.id}
                      onClick={() => {
                        setSelectedSubcategory(subcategory);
                        setPreSessionFormData({});
                      }}
                      className="group flex items-start gap-4 p-4 sm:p-6 rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all text-left"
                    >
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-yellow-500/15 text-yellow-600 flex items-center justify-center shrink-0 group-hover:bg-yellow-500/25 transition-colors">
                        <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-sm sm:text-base mb-1">{subcategory.name}</h3>
                        <p className="text-xs text-muted-foreground">Click to select</p>
                      </div>
                    </button>
                  ))}

                  {filteredSubcategories.length === 0 && (
                    <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                      <p>No meeting types found.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Sentinel for infinite scroll */}
              <div ref={subcategoriesSentinelRef} className="h-4" />
            </div>
          )}

          {/* Step 3: Pre-Session Form */}
          {step === 3 && selectedCategory && selectedSubcategory && (
            <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-b pb-4 sm:pb-6">
                <Button variant="ghost" size="icon" onClick={handleBack} className="rounded-full self-start flex-shrink-0">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-semibold">Session Details</h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground mt-1">
                    <Badge variant="outline" className="font-normal truncate max-w-[150px]">{selectedCategory.name}</Badge>
                    <ChevronRight className="w-3 h-3 flex-shrink-0" />
                    <Badge variant="secondary" className="font-normal truncate max-w-[150px]">{selectedSubcategory.name}</Badge>
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-3 gap-6 sm:gap-8">
                {/* Form Area */}
                <div className="lg:col-span-2 space-y-6">
                  {hasFormFields ? (
                    <div className="space-y-8">
                      {preSessionSections.map((section, sectionIndex) => (
                        <div key={`section_${sectionIndex}`} className="space-y-4">
                          {section.fields.length > 0 && (
                            <div className="grid gap-6">
                              {section.fields.map((field) => (
                                <FormFieldRenderer
                                  key={field.name}
                                  field={field}
                                  value={preSessionFormData[field.name]}
                                  onChange={handleInputChange}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-muted/30 rounded-xl p-6 sm:p-8 text-center border-2 border-dashed">
                      <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-green-500 mx-auto mb-3 sm:mb-4" />
                      <h3 className="text-base sm:text-lg font-medium mb-2">All Set!</h3>
                      <p className="text-sm text-muted-foreground">
                        No additional information is required for this meeting type.
                        You can proceed to recording.
                      </p>
                    </div>
                  )}
                </div>

                {/* Sidebar Summary */}
                <div className="space-y-6">
                  <Card className="bg-muted/30 border-none">
                    <CardHeader>
                      <CardTitle className="text-base">Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      <div>
                        <span className="text-muted-foreground block mb-1">Service Area</span>
                        <span className="font-medium">{selectedCategory.name}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-1">Meeting Type</span>
                        <span className="font-medium">{selectedSubcategory.name}</span>
                      </div>
                      <div className="pt-4 border-t">
                        <div className="flex items-start gap-2 text-muted-foreground text-xs">
                          <Info className="w-4 h-4 shrink-0 mt-0.5" />
                          <p>Ensure all required fields are filled correctly before starting the session.</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Button 
                    data-tutorial="continue-button"
                    onClick={() => {
                      if (isTutorialMode && currentTutorialStep === "details-continue") {
                        tutorialContext?.nextStep();
                      }
                      handleContinue();
                    }} 
                    disabled={isSubmitting}
                    className="w-full h-11 sm:h-12 text-sm sm:text-base shadow-lg"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Preparing...
                      </>
                    ) : (
                      <>
                        Continue
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

        </CardContent>
      </Card>
      )}
    </div>
  );
}

