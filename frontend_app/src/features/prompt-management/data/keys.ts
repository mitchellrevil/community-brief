export const promptManagementKeys = {
  all: ["community-brief", "prompt-management"] as const,
  categories: () => [...promptManagementKeys.all, "categories"] as const,
  subcategories: () => [...promptManagementKeys.all, "subcategories"] as const,
  versions: (subcategoryId?: string) =>
    [...promptManagementKeys.all, "versions", subcategoryId] as const,
  versionsDiff: (
    subcategoryId: string | undefined,
    leftVersion: string,
    rightVersion: string,
  ) =>
    [
      ...promptManagementKeys.all,
      "versions-diff",
      subcategoryId,
      leftVersion,
      rightVersion,
    ] as const,
  categoriesInfinite: (pageSize: number = 50) =>
    [...promptManagementKeys.categories(), "infinite", pageSize] as const,
  subcategoriesInfinite: (categoryId?: string, pageSize: number = 50) =>
    [...promptManagementKeys.subcategories(), "infinite", categoryId, pageSize] as const,
};
