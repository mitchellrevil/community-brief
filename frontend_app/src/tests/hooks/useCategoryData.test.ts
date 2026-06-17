import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { CATEGORY_STALE_TIME, categoryQueryKeys, useCategoryData } from "@/hooks/useCategoryData";
import { createQueryClient, createQueryClientWrapper } from "@/tests/test-utils";
import * as promptManagementApi from "@/shared/data/taxonomy/api";

// Import after mocking

// Mock the API module
vi.mock("@/shared/data/taxonomy/api", () => ({
  fetchSubcategories: vi.fn(),
  fetchCategories: vi.fn(),
  fetchSubcategoriesPaginated: vi.fn(),
  fetchCategoriesPaginated: vi.fn(),
}));

describe("Query Consolidation - useCategoryData Hook", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
    
    // Default mock implementations
    vi.mocked(promptManagementApi.fetchSubcategories).mockResolvedValue([
      {
        id: "sub-1",
        name: "Meeting Type A",
        category_id: "cat-1",
        prompts: { default: "Test prompt" },
        created_at: Date.now(),
        updated_at: Date.now(),
      },
      {
        id: "sub-2",
        name: "Meeting Type B",
        category_id: "cat-1",
        prompts: { default: "Another prompt" },
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    ]);
    
    vi.mocked(promptManagementApi.fetchCategories).mockResolvedValue([
      {
        id: "cat-1",
        name: "Service Area A",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe("API Deduplication", () => {
    it("should call subcategories API exactly once when multiple components use the hook", async () => {
      const wrapper = createQueryClientWrapper(queryClient);

      // First component mounts
      const { result: result1 } = renderHook(
        () => useCategoryData(),
        { wrapper }
      );

      // Wait for first hook to load
      await waitFor(() => {
        expect(result1.current.isLoadingSubcategories).toBe(false);
      });

      // Second component mounts (simulating another component using same hook)
      const { result: result2 } = renderHook(
        () => useCategoryData(),
        { wrapper }
      );

      // Wait for second hook
      await waitFor(() => {
        expect(result2.current.isLoadingSubcategories).toBe(false);
      });

      // Third component mounts
      const { result: result3 } = renderHook(
        () => useCategoryData(),
        { wrapper }
      );

      await waitFor(() => {
        expect(result3.current.isLoadingSubcategories).toBe(false);
      });

      // API should be called exactly once due to cache sharing
      expect(promptManagementApi.fetchSubcategories).toHaveBeenCalledTimes(1);
    });

    it("should call categories API exactly once when multiple components use the hook", async () => {
      const wrapper = createQueryClientWrapper(queryClient);

      const { result: result1 } = renderHook(
        () => useCategoryData(),
        { wrapper }
      );

      await waitFor(() => {
        expect(result1.current.isLoadingCategories).toBe(false);
      });

      const { result: result2 } = renderHook(
        () => useCategoryData(),
        { wrapper }
      );

      await waitFor(() => {
        expect(result2.current.isLoadingCategories).toBe(false);
      });

      // API should be called exactly once
      expect(promptManagementApi.fetchCategories).toHaveBeenCalledTimes(1);
    });
  });

  describe("Cache Sharing", () => {
    it("should share subcategory data between all consumers", async () => {
      const wrapper = createQueryClientWrapper(queryClient);

      const { result: result1 } = renderHook(
        () => useCategoryData(),
        { wrapper }
      );

      await waitFor(() => {
        expect(result1.current.subcategories).toHaveLength(2);
      });

      const { result: result2 } = renderHook(
        () => useCategoryData(),
        { wrapper }
      );

      // Both hooks should return the same data immediately (from cache)
      expect(result2.current.subcategories).toEqual(result1.current.subcategories);
      expect(result2.current.subcategories).toHaveLength(2);
    });

    it("should allow reading cached data directly via queryClient", async () => {
      const wrapper = createQueryClientWrapper(queryClient);

      const { result } = renderHook(
        () => useCategoryData(),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingSubcategories).toBe(false);
      });

      // Verify cache data is accessible via query keys
      const cachedSubcategories = queryClient.getQueryData(
        categoryQueryKeys.subcategories()
      );
      expect(cachedSubcategories).toBeDefined();
      expect(cachedSubcategories).toHaveLength(2);
    });

    it("should use consistent query keys across all usage points", () => {
      // Verify query key factory produces consistent keys
      const key1 = categoryQueryKeys.subcategories();
      const key2 = categoryQueryKeys.subcategories();
      
      expect(key1).toEqual(key2);
      expect(key1).toEqual(["community-brief", "categories", "subcategories"]);
      
      const catKey1 = categoryQueryKeys.categories();
      const catKey2 = categoryQueryKeys.categories();
      
      expect(catKey1).toEqual(catKey2);
      expect(catKey1).toEqual(["community-brief", "categories", "all"]);
    });
  });

  describe("staleTime Configuration", () => {
    it("should have staleTime configured to prevent unnecessary refetches", () => {
      // staleTime should be at least 5 minutes (300000ms)
      expect(CATEGORY_STALE_TIME).toBeGreaterThanOrEqual(5 * 60 * 1000);
    });

    it("should not refetch within staleTime window", async () => {
      const wrapper = createQueryClientWrapper(queryClient);

      // First hook
      const { result: result1, unmount: unmount1 } = renderHook(
        () => useCategoryData(),
        { wrapper }
      );

      await waitFor(() => {
        expect(result1.current.isLoadingSubcategories).toBe(false);
      });

      expect(promptManagementApi.fetchSubcategories).toHaveBeenCalledTimes(1);

      // Unmount first component
      unmount1();

      // Mount a new component (simulating navigation)
      const { result: result2 } = renderHook(
        () => useCategoryData(),
        { wrapper }
      );

      await waitFor(() => {
        expect(result2.current.isLoadingSubcategories).toBe(false);
      });

      // Should still be 1 call because data is still fresh (within staleTime)
      expect(promptManagementApi.fetchSubcategories).toHaveBeenCalledTimes(1);
    });
  });

  describe("Data Access", () => {
    it("should return subcategories data correctly", async () => {
      const wrapper = createQueryClientWrapper(queryClient);

      const { result } = renderHook(
        () => useCategoryData(),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingSubcategories).toBe(false);
      });

      expect(result.current.subcategories).toHaveLength(2);
      expect(result.current.subcategories[0]).toMatchObject({
        id: "sub-1",
        name: "Meeting Type A",
        category_id: "cat-1",
      });
    });

    it("should return categories data correctly", async () => {
      const wrapper = createQueryClientWrapper(queryClient);

      const { result } = renderHook(
        () => useCategoryData(),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingCategories).toBe(false);
      });

      expect(result.current.categories).toHaveLength(1);
      expect(result.current.categories[0]).toMatchObject({
        id: "cat-1",
        name: "Service Area A",
      });
    });

    it("should provide getSubcategoriesForCategory helper", async () => {
      const wrapper = createQueryClientWrapper(queryClient);

      const { result } = renderHook(
        () => useCategoryData(),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingSubcategories).toBe(false);
      });

      const subcategoriesForCat1 = result.current.getSubcategoriesForCategory("cat-1");
      expect(subcategoriesForCat1).toHaveLength(2);
      
      const subcategoriesForNonExistent = result.current.getSubcategoriesForCategory("non-existent");
      expect(subcategoriesForNonExistent).toHaveLength(0);
    });

    it("should provide getSubcategoryById helper", async () => {
      const wrapper = createQueryClientWrapper(queryClient);

      const { result } = renderHook(
        () => useCategoryData(),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingSubcategories).toBe(false);
      });

      const subcategory = result.current.getSubcategoryById("sub-1");
      expect(subcategory).toMatchObject({
        id: "sub-1",
        name: "Meeting Type A",
      });
      
      const nonExistent = result.current.getSubcategoryById("non-existent");
      expect(nonExistent).toBeUndefined();
    });
  });

  describe("Error Handling", () => {
    it("should handle subcategories API errors gracefully", async () => {
      vi.mocked(promptManagementApi.fetchSubcategories).mockRejectedValue(
        new Error("Network error")
      );

      const wrapper = createQueryClientWrapper(queryClient);

      const { result } = renderHook(
        () => useCategoryData(),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingSubcategories).toBe(false);
      });

      expect(result.current.subcategoriesError).toBeDefined();
      expect(result.current.subcategories).toEqual([]);
    });

    it("should handle categories API errors gracefully", async () => {
      vi.mocked(promptManagementApi.fetchCategories).mockRejectedValue(
        new Error("Network error")
      );

      const wrapper = createQueryClientWrapper(queryClient);

      const { result } = renderHook(
        () => useCategoryData(),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoadingCategories).toBe(false);
      });

      expect(result.current.categoriesError).toBeDefined();
      expect(result.current.categories).toEqual([]);
    });
  });

  describe("Loading States", () => {
    it("should correctly report loading states", async () => {
      const wrapper = createQueryClientWrapper(queryClient);

      const { result } = renderHook(
        () => useCategoryData(),
        { wrapper }
      );

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoadingCategories).toBe(false);
      expect(result.current.isLoadingSubcategories).toBe(false);
    });
  });
});


