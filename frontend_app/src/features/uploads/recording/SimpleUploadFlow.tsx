import { useState } from "react";
import { FileAudio } from "lucide-react";
import { CategorySelection } from "./CategorySelection";
import { RecordingInterface } from "./RecordingInterface";
import type { SubcategoryResponse } from "@/features/prompt-management/data/api";
import { useUploadQueue } from "@/hooks/useUploadQueue";
import { Badge } from "@/components/ui/badge";
import { PageHeading } from "@/components/ui/page-heading";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";

type UIStep = "category-selection" | "recording";

export function SimpleUploadFlow() {
  const [currentStep, setCurrentStep] = useState<UIStep>("category-selection");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string>("");
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>("");
  const [selectedSubcategoryName, setSelectedSubcategoryName] = useState<string>("");
  const [selectedSubcategoryDetails, setSelectedSubcategoryDetails] = useState<SubcategoryResponse | null>(null);
  const [preSessionData, setPreSessionData] = useState<Record<string, any>>({});
  const [isTransitioning, setIsTransitioning] = useState(false);

  const { queuedCount } = useUploadQueue();
  const breadcrumbs = useBreadcrumbs();

  const handleSelectionComplete = (
    categoryId: string,
    subcategoryId: string,
    categoryName: string,
    subcategoryName: string,
    formData: Record<string, any>,
    subcategoryDetails?: SubcategoryResponse,
  ) => {
    setIsTransitioning(true);
    
    // Simulate transition delay for smooth UX
    setTimeout(() => {
      setSelectedCategoryId(categoryId);
      setSelectedSubcategoryId(subcategoryId);
      setSelectedCategoryName(categoryName);
      setSelectedSubcategoryName(subcategoryName);
      setSelectedSubcategoryDetails(subcategoryDetails ?? null);
      setPreSessionData(formData);
      setCurrentStep("recording");
      setIsTransitioning(false);
    }, 200);
  };

  const handleBackToSelection = () => {
    setIsTransitioning(true);
    
    setTimeout(() => {
      setCurrentStep("category-selection");
      setSelectedSubcategoryDetails(null);
      setPreSessionData({});
      setIsTransitioning(false);
    }, 200);
  };

  const handleUploadComplete = () => {
    setIsTransitioning(true);
    
    setTimeout(() => {
      // Reset the flow to start over
      setSelectedCategoryId("");
      setSelectedSubcategoryId("");
      setSelectedCategoryName("");
      setSelectedSubcategoryName("");
      setSelectedSubcategoryDetails(null);
      setPreSessionData({});
      setCurrentStep("category-selection");
      setIsTransitioning(false);
    }, 200);
  };

  return (
    <div className="relative min-h-screen bg-background/50 pb-24 md:pb-0 overflow-x-hidden">
      <PageHeading
        icon={<FileAudio className="h-5 w-5 sm:h-6 sm:w-6" />}
        title="New Recording"
        breadcrumb={<SmartBreadcrumb items={breadcrumbs} />}
      />

      {/* Queue Status Badge - Floating */}
      {queuedCount > 0 && (
        <div className="fixed top-5 right-4 z-40 animate-in fade-in slide-in-from-top-2">
          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 shadow-sm py-1 sm:py-1.5 px-2 sm:px-3 text-xs sm:text-sm">
            {queuedCount} queued
          </Badge>
        </div>
      )}
      
      <div 
        className={`w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 transition-all duration-500 ease-in-out ${
          isTransitioning 
            ? "opacity-0 scale-95 blur-sm" 
            : "opacity-100 scale-100 blur-0"
        }`}
      >
        {currentStep === "category-selection" ? (
          <CategorySelection onSelectionComplete={handleSelectionComplete} />
        ) : (
          <RecordingInterface
            categoryId={selectedCategoryId}
            subcategoryId={selectedSubcategoryId}
            categoryName={selectedCategoryName}
            subcategoryName={selectedSubcategoryName}
            subcategoryDetails={selectedSubcategoryDetails}
            preSessionData={preSessionData}
            onBack={handleBackToSelection}
            onUploadComplete={handleUploadComplete}
          />
        )}
      </div>
      
    </div>
  );
}
