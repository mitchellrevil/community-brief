import { memo } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Loader2, Search, Upload } from "lucide-react";
import type { CategoryResponse, SubcategoryResponse } from "@/features/prompt-management/data/api";

export interface CategorySelectorProps {
  categories: Array<CategoryResponse>;
  subcategories: Array<SubcategoryResponse>;
  currentCategory: string | undefined;
  currentSubcategory: string | undefined;
  expandedCategories: Set<string>;
  categorySearch: string;
  setCategorySearch: (search: string) => void;
  isLoadingCategories: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  toggleCategory: (categoryId: string) => void;
  handleCategorySelect: (id: string) => void;
  handleSubcategorySelect: (id: string) => void;
  getSubcategoriesForCategory: (categoryId: string) => Array<SubcategoryResponse>;
  sentinelRef?: React.RefObject<HTMLDivElement | null>;
}

function CategorySelectorComponent({
  categories,
  subcategories,
  currentCategory,
  currentSubcategory,
  expandedCategories,
  categorySearch,
  setCategorySearch,
  isLoadingCategories,
  isFetchingNextPage,
  hasNextPage,
  toggleCategory,
  handleCategorySelect,
  handleSubcategorySelect,
  getSubcategoriesForCategory,
  sentinelRef,
}: CategorySelectorProps) {
  // Build children-by-parent map
  const childrenByParent: Partial<Record<string, Array<CategoryResponse>>> = {};
  categories.forEach(cat => {
    const pid = cat.parent_category_id;
    if (pid) {
      childrenByParent[pid] = childrenByParent[pid] ?? [];
      childrenByParent[pid].push(cat);
    }
  });

  // Sort children alphabetically
  Object.keys(childrenByParent).forEach(parentId => {
    if (!childrenByParent[parentId]) return;
    childrenByParent[parentId].sort((a, b) => a.name.localeCompare(b.name));
  });

  const rootCategories = categories
    .filter(cat => !cat.parent_category_id)
    .sort((a, b) => a.name.localeCompare(b.name));

  const normalizedSearch = categorySearch.trim().toLowerCase();
  const filteredRoots = normalizedSearch
    ? rootCategories.filter(r => 
        r.name.toLowerCase().includes(normalizedSearch) || 
        (childrenByParent[r.id] ?? []).some(ch => ch.name.toLowerCase().includes(normalizedSearch))
      )
    : rootCategories;

  return (
    <div className={`w-full lg:w-80 border rounded-xl bg-card/60 backdrop-blur-sm flex flex-col overflow-hidden`}>
      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <h4 className="font-semibold text-foreground text-sm sm:text-base">Categories & Meeting Types</h4>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
              }
            }}
            placeholder={isLoadingCategories ? 'Loading...' : 'Search categories...'}
            className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
            disabled={isLoadingCategories}
            aria-label="Search categories and meeting types"
          />
        </div>
      </div>

      {/* Tree View */}
      <div className="h-[40vh] lg:flex-1 overflow-y-auto p-2">
        {/* Screen reader loading announcement */}
        {(isLoadingCategories || isFetchingNextPage) && (
          <div className="sr-only" role="status" aria-live="polite">
            Loading categories...
          </div>
        )}

        {categories.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground text-center">
            <div className="space-y-2">
              <Upload className="h-6 w-6 sm:h-8 sm:w-8 mx-auto text-gray-400" />
              <p className="text-xs sm:text-sm">No service areas available.</p>
            </div>
          </div>
        )}

        <div className="space-y-0.5" role="tree" aria-label="Categories and meeting types">
            {filteredRoots.map((category) => {
              const categoryId = category.id;
              const isExpanded = expandedCategories.has(categoryId);
              const isSelected = currentCategory === categoryId;
              const subcats = getSubcategoriesForCategory(categoryId).sort((a, b) => a.name.localeCompare(b.name));
              const childCats = (childrenByParent[categoryId] ?? []).filter(child => 
                !normalizedSearch || child.name.toLowerCase().includes(normalizedSearch)
              );

              return (
                <div key={categoryId} className="select-none" role="treeitem" aria-expanded={isExpanded} aria-selected={isSelected}>
                  <div
                    className={`flex items-center px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 group ${
                      isSelected
                        ? "bg-gray-100 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300 shadow-sm"
                        : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <button
                      type="button"
                      className="mr-2 p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCategory(categoryId);
                      }}
                      aria-label={isExpanded ? `Collapse ${category.name}` : `Expand ${category.name}`}
                    >
                      {subcats.length + childCats.length > 0 ? (
                        isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                        )
                      ) : (
                        <div className="h-3.5 w-3.5" />
                      )}
                    </button>

                    <div 
                      className="flex items-center flex-1 min-w-0"
                      onClick={() => handleCategorySelect(categoryId)}
                    >
                      {isExpanded ? (
                        <FolderOpen className="h-4 w-4 mr-3 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      ) : (
                        <Folder className="h-4 w-4 mr-3 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                      )}

                      <span className="flex-1 font-medium text-sm truncate">{category.name}</span>

                      <span className="text-xs bg-gray-100 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-full ml-3 flex-shrink-0">
                        {subcats.length + childCats.length}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="ml-6 mt-2 space-y-1 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                      {/* Child categories (folders) */}
                      {childCats.map((child) => {
                        const childId = child.id;
                        const isChildSelected = currentCategory === childId;
                        const isChildExpanded = expandedCategories.has(childId);
                        const childSubcats = getSubcategoriesForCategory(childId).sort((a, b) => a.name.localeCompare(b.name));

                        return (
                          <div key={childId} className="select-none">
                            <div
                              className={`flex items-center px-3 py-1.5 rounded-md cursor-pointer transition-all duration-200 group ${
                                isChildSelected ? "bg-gray-50 dark:bg-gray-900/30 text-gray-600 dark:text-gray-400 shadow-sm" : "hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-600 dark:text-gray-400"
                              }`}
                            >
                              <button
                                type="button"
                                className="mr-2 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCategory(childId);
                                }}
                              >
                                {childSubcats.length > 0 ? (
                                  isChildExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                                  )
                                ) : (
                                  <div className="h-3.5 w-3.5" />
                                )}
                              </button>

                              <div 
                                className="flex items-center flex-1 min-w-0"
                                onClick={() => handleCategorySelect(childId)}
                              >
                                <Folder className="h-4 w-4 mr-3 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                                <span className="flex-1 text-sm truncate">{child.name}</span>
                                <span className="text-xs bg-gray-100 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-full ml-3 flex-shrink-0">
                                  {childSubcats.length}
                                </span>
                              </div>
                            </div>

                            {/* Meeting types under child category */}
                            {isChildExpanded && childSubcats.length > 0 && (
                              <div className="ml-4 mt-2 space-y-1">
                                {childSubcats.map((subcategory) => {
                                  const subId = subcategory.id;
                                  const isSubSelected = currentSubcategory === subId;

                                  return (
                                    <div
                                      key={subId}
                                      className={`flex items-center px-3 py-1.5 rounded-md cursor-pointer transition-all duration-200 ${
                                        isSubSelected ? 
                                          "bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary shadow-sm" : 
                                          "hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-600 dark:text-gray-400"
                                      }`}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleSubcategorySelect(subId);
                                      }}
                                    >
                                      <FileText className="h-4 w-4 mr-3 text-primary dark:text-primary flex-shrink-0" />
                                      <span className="flex-1 text-sm truncate">{subcategory.name}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Meeting types directly under root category */}
                      {subcats.length > 0 && (
                        <div className="space-y-1">
                          {subcats.map((subcategory) => {
                            const subId = subcategory.id;
                            const isSubSelected = currentSubcategory === subId;

                            return (
                              <div
                                key={subId}
                                className={`flex items-center px-3 py-1.5 rounded-md cursor-pointer transition-all duration-200 ${
                                  isSubSelected ? 
                                    "bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary shadow-sm" : 
                                    "hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-600 dark:text-gray-400"
                                }`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleSubcategorySelect(subId);
                                }}
                              >
                                <FileText className="h-4 w-4 mr-3 text-primary dark:text-primary flex-shrink-0" />
                                <span className="flex-1 text-sm truncate">{subcategory.name}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          
            {filteredRoots.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground text-center">
                No categories match "{categorySearch}"
              </div>
            )}
          
            {/* Infinite scroll sentinel */}
            {sentinelRef && <div ref={sentinelRef} className="h-1 w-full" />}
          
            {/* Loading indicator */}
            {isFetchingNextPage && (
              <div className="flex justify-center items-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="ml-2 text-xs text-muted-foreground">Loading more...</span>
              </div>
            )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 sm:p-4 border-t border-border">
        <div className="text-xs text-gray-600 dark:text-gray-400" aria-live="polite">
          {categories.length} folders{hasNextPage ? ' • scroll for more' : ''} • {subcategories.length} types
        </div>
      </div>
    </div>
  );
}

export const CategorySelector = memo(CategorySelectorComponent);
