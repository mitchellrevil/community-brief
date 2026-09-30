import type { PromptTemplate } from "@/shared/data/templates";

export type SimpleUploadStep = "category-selection" | "recording";

export interface SimpleUploadSelection {
  categoryId: string;
  subcategoryId: string;
  categoryName: string;
  subcategoryName: string;
  subcategoryDetails: PromptTemplate | null;
  preSessionData: Record<string, any>;
}
