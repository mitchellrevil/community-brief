import { CategorySelection } from "../CategorySelection";
import { RecordingInterface } from "../RecordingInterface";
import { useSimpleUploadFlow } from "../hooks/useSimpleUploadFlow";
import { SimpleUploadShell } from "./SimpleUploadShell";
import { useUploadQueue } from "@/hooks/useUploadQueue";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";

export function SimpleUploadPage() {
  const uploadFlow = useSimpleUploadFlow();
  const { queuedCount } = useUploadQueue();
  const breadcrumbs = useBreadcrumbs();
  const { selection } = uploadFlow;

  return (
    <SimpleUploadShell
      queuedCount={queuedCount}
      breadcrumbs={breadcrumbs}
      isTransitioning={uploadFlow.isTransitioning}
      hideHeadingOnMobile={uploadFlow.currentStep === "recording"}
    >
      {uploadFlow.currentStep === "category-selection" ? (
        <CategorySelection onSelectionComplete={uploadFlow.completeSelection} />
      ) : (
        <RecordingInterface
          categoryId={selection.categoryId}
          subcategoryId={selection.subcategoryId}
          categoryName={selection.categoryName}
          subcategoryName={selection.subcategoryName}
          subcategoryDetails={selection.subcategoryDetails}
          preSessionData={selection.preSessionData}
          onBack={uploadFlow.backToSelection}
          onUploadComplete={uploadFlow.reset}
        />
      )}
    </SimpleUploadShell>
  );
}
