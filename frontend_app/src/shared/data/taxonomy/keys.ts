export const CATEGORY_STALE_TIME = 10 * 60 * 1000;

export const taxonomyQueryKeys = {
  all: ["community-brief", "categories"] as const,
  categories: () => [...taxonomyQueryKeys.all, "all"] as const,
  subcategories: () => [...taxonomyQueryKeys.all, "subcategories"] as const,
  subcategoryById: (id: string) => [...taxonomyQueryKeys.subcategories(), id] as const,
  subcategoriesByCategory: (categoryId: string) =>
    [...taxonomyQueryKeys.subcategories(), "category", categoryId] as const,
};
