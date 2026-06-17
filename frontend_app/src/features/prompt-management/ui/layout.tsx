import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { usePromptManagement } from "../state/context";
import { canEditPrompt } from "../state/permissions";
import { Sidebar } from "./sidebar";
import { PromptBrowseView } from "./view";
import { PromptEditor } from "./editor";
import { useUserPermissions } from "@/hooks/usePermissions";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import { PageHeading } from "@/components/ui/page-heading";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { MotionAside, MotionDiv, MotionMain } from "@/components/ui/motion";
import { AnimatePresence, fadeIn, slideInFromLeft, staggerContainer } from "@/lib/motion";

export function Layout() {
  const { selectedPrompt } = usePromptManagement();
  const { data: currentUser } = useUserPermissions();
  const [isEditing, setIsEditing] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const breadcrumbs = useBreadcrumbs();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    if (!selectedPrompt || !canEditPrompt(selectedPrompt, currentUser)) {
      setIsEditing(false);
    }
  }, [currentUser, isEditing, selectedPrompt]);

  const handleEdit = () => {
    if (!selectedPrompt || !canEditPrompt(selectedPrompt, currentUser)) {
      return;
    }

    setIsEditing(true);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-3 xs:space-y-4 sm:space-y-6">
      <PageHeading
        icon={!isMobile && <FileText className="h-5 w-5 sm:h-6 sm:w-6" />}
        title="Prompts"
        breadcrumb={!isMobile && <SmartBreadcrumb items={breadcrumbs} />}
      />

      <MotionDiv
        className="flex-1 flex overflow-hidden border rounded-xl shadow-sm bg-background mx-2 xs:mx-3 sm:mx-4 lg:mx-6"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {/* Mobile Sidebar Toggle Button */}
        {isMobile && (
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="md:hidden fixed bottom-20 right-4 z-50 rounded-full bg-primary text-primary-foreground p-3 shadow-lg"
          >
            <FileText className="h-5 w-5" />
          </button>
        )}

        {/* Sidebar - responsive width */}
        <AnimatePresence>
          {isMobile ? (
            showSidebar ? (
              <MotionDiv
                key="mobile-sidebar-overlay"
                className="fixed inset-0 z-40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* Backdrop */}
                <div
                  className="absolute inset-0 bg-background/70 backdrop-blur-sm"
                  onClick={() => setShowSidebar(false)}
                />

                {/* Slide-in panel */}
                <MotionDiv
                  className="absolute left-0 top-0 bottom-0 w-80 max-w-full bg-background border-r shadow-lg flex flex-col"
                  initial={{ x: -320 }}
                  animate={{ x: 0 }}
                  exit={{ x: -320 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                >
                  <button
                    onClick={() => setShowSidebar(false)}
                    className="absolute top-4 right-4 z-50 p-2 rounded-md hover:bg-muted"
                  >
                    ✕
                  </button>
                  <Sidebar />
                </MotionDiv>
              </MotionDiv>
            ) : null
          ) : (
            <MotionAside
              key="desktop-sidebar"
              className="relative w-80 max-w-full shrink-0 border-r bg-muted/10 flex flex-col"
              variants={slideInFromLeft}
            >
              <Sidebar />
            </MotionAside>
          )}
        </AnimatePresence>

        {/* Main content */}
        <MotionMain
          className="flex-1 flex flex-col overflow-hidden bg-background"
          variants={fadeIn}
        >
          {isEditing && selectedPrompt ? (
            <PromptEditor 
              onCancel={() => setIsEditing(false)} 
              onSave={() => setIsEditing(false)}
            />
          ) : (
            <PromptBrowseView 
              onEdit={handleEdit} 
            />
          )}
        </MotionMain>
      </MotionDiv>
    </div>
  );
}
