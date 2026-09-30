import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileText, X } from "lucide-react";
import { usePromptManagement } from "../state/context";
import { canEditPrompt, isEditor } from "../state/permissions";
import { PromptEditor } from "./editor";
import { PromptAgentPanel } from "./prompt-agent-panel";
import { Sidebar } from "./sidebar";
import { PromptBrowseView } from "./view";
import type { PromptAgentScope } from "./prompt-agent-panel";
import { MotionAside, MotionDiv, MotionMain } from "@/components/ui/motion";
import { PageHeading } from "@/components/ui/page-heading";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { useIsMobile } from "@/hooks/useMobile";
import { useUserPermissions } from "@/hooks/usePermissions";
import {
  AnimatePresence,
  fadeIn,
  slideInFromLeft,
  staggerContainer,
} from "@/lib/motion";
import { templatesKeys } from "@/shared/data/templates";

export function Layout() {
  const {
    selectedCategory,
    selectedPrompt,
    setSelectedCategory,
    setSelectedPrompt,
    refreshData,
  } = usePromptManagement();
  const { data: currentUser } = useUserPermissions();
  const [isEditing, setIsEditing] = useState(false);
  const [agentScope, setAgentScope] = useState<PromptAgentScope | null>(null);
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const queryClient = useQueryClient();
  const breadcrumbs = useBreadcrumbs();
  const isMobile = useIsMobile();
  const canManageTemplates = isEditor(currentUser);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    if (!selectedPrompt || !canEditPrompt(selectedPrompt, currentUser)) {
      setIsEditing(false);
    }
  }, [currentUser, isEditing, selectedPrompt]);

  useEffect(() => {
    if (!canManageTemplates) {
      setAgentScope(null);
      setIsAgentOpen(false);
    }
  }, [canManageTemplates]);

  useEffect(() => {
    if (selectedCategory && selectedPrompt && agentScope?.mode === "create") {
      setAgentScope({
        mode: "edit",
        category: selectedCategory,
        prompt: selectedPrompt,
      });
    }
  }, [agentScope?.mode, selectedCategory, selectedPrompt]);

  const activeAgentScope = useMemo<PromptAgentScope | null>(() => {
    if (agentScope?.mode === "create" && selectedCategory && selectedPrompt) {
      return {
        mode: "edit",
        category: selectedCategory,
        prompt: selectedPrompt,
      };
    }
    if (agentScope) {
      return agentScope;
    }
    if (selectedCategory && selectedPrompt) {
      return {
        mode: "edit",
        category: selectedCategory,
        prompt: selectedPrompt,
      };
    }
    if (selectedCategory) {
      return { mode: "create", category: selectedCategory };
    }
    return null;
  }, [agentScope, selectedCategory, selectedPrompt]);

  const handleEdit = () => {
    if (!selectedPrompt || !canEditPrompt(selectedPrompt, currentUser)) {
      return;
    }

    setIsEditing(true);
  };

  const handlePromptChanged = (prompt: typeof selectedPrompt) => {
    if (!prompt) {
      return;
    }
    setSelectedPrompt(prompt);
    void queryClient.invalidateQueries({
      queryKey: templatesKeys.template("management", prompt.id),
    });
    void refreshData();
  };

  return (
    <div className="xs:space-y-4 flex h-[calc(100vh-8rem)] flex-col space-y-3 sm:space-y-6">
      <PageHeading
        icon={!isMobile && <FileText className="h-5 w-5 sm:h-6 sm:w-6" />}
        title="Templates"
        breadcrumb={!isMobile && <SmartBreadcrumb items={breadcrumbs} />}
      />

      <MotionDiv
        className={
          !canManageTemplates
            ? "bg-background grid min-h-0 flex-1 gap-0 overflow-hidden rounded-lg border lg:grid-cols-[300px_minmax(0,1fr)]"
            : isAgentOpen
              ? "bg-background grid min-h-0 flex-1 gap-0 overflow-hidden rounded-lg border transition-[grid-template-columns] duration-300 ease-in-out lg:grid-cols-[300px_minmax(0,1fr)_340px]"
              : "bg-background grid min-h-0 flex-1 gap-0 overflow-hidden rounded-lg border transition-[grid-template-columns] duration-300 ease-in-out lg:grid-cols-[300px_minmax(0,1fr)_52px]"
        }
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {/* Mobile Sidebar Toggle Button */}
        {isMobile && (
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="bg-primary text-primary-foreground fixed right-4 bottom-20 z-50 rounded-full p-3 shadow-lg md:hidden"
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
                  className="bg-background/70 absolute inset-0 backdrop-blur-sm"
                  onClick={() => setShowSidebar(false)}
                />

                {/* Slide-in panel */}
                <MotionDiv
                  className="bg-background absolute top-0 bottom-0 left-0 flex w-80 max-w-full flex-col border-r shadow-lg"
                  initial={{ x: -320 }}
                  animate={{ x: 0 }}
                  exit={{ x: -320 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                >
                  <button
                    onClick={() => setShowSidebar(false)}
                    className="hover:bg-muted absolute top-4 right-4 z-50 rounded-md p-2"
                    aria-label="Close template sidebar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <Sidebar
                    onGeneratePrompt={
                      canManageTemplates
                        ? (category) => {
                            setSelectedCategory(category);
                            setSelectedPrompt(null);
                            setIsEditing(false);
                            setAgentScope({ mode: "create", category });
                            setIsAgentOpen(true);
                            setShowSidebar(false);
                          }
                        : undefined
                    }
                  />
                </MotionDiv>
              </MotionDiv>
            ) : null
          ) : (
            <MotionAside
              key="desktop-sidebar"
              className="bg-background relative hidden min-w-0 flex-col overflow-hidden border-r lg:flex"
              variants={slideInFromLeft}
            >
              <Sidebar
                onGeneratePrompt={
                  canManageTemplates
                    ? (category) => {
                        setSelectedCategory(category);
                        setSelectedPrompt(null);
                        setIsEditing(false);
                        setAgentScope({ mode: "create", category });
                        setIsAgentOpen(true);
                      }
                    : undefined
                }
              />
            </MotionAside>
          )}
        </AnimatePresence>

        <MotionMain
          className="bg-background flex min-w-0 flex-col overflow-hidden border-r"
          variants={fadeIn}
        >
          {canManageTemplates && isMobile && agentScope ? (
            <PromptAgentPanel
              scope={agentScope}
              onClose={() => setAgentScope(null)}
              onPromptChanged={handlePromptChanged}
            />
          ) : isEditing && selectedPrompt ? (
            <PromptEditor
              onCancel={() => setIsEditing(false)}
              onSave={() => setIsEditing(false)}
            />
          ) : (
            <PromptBrowseView onEdit={handleEdit} />
          )}
        </MotionMain>

        {canManageTemplates && (
          <MotionAside
            className="bg-background hidden min-w-0 overflow-hidden lg:flex"
            variants={fadeIn}
          >
            {isAgentOpen ? (
              <div className="relative h-full min-w-0 flex-1">
                <button
                  type="button"
                  className="bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground absolute top-3 right-3 z-10 flex h-7 w-7 items-center justify-center border transition-colors"
                  onClick={() => {
                    setIsAgentOpen(false);
                    setAgentScope(null);
                  }}
                  aria-label="Collapse assistant"
                  title="Collapse assistant"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <PromptAgentPanel
                  scope={activeAgentScope}
                  onClose={() => {
                    setIsAgentOpen(false);
                    setAgentScope(null);
                  }}
                  onPromptChanged={handlePromptChanged}
                  compact
                />
              </div>
            ) : (
              <button
                type="button"
                className="text-muted-foreground hover:bg-muted/40 hover:text-foreground flex h-full w-full flex-col items-center gap-2 px-2 py-4 transition-colors"
                onClick={() => setIsAgentOpen(true)}
                aria-label="Open assistant"
                title="Open assistant"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="rotate-180 text-xs font-medium tracking-wide [writing-mode:vertical-rl]">
                  Assistant
                </span>
              </button>
            )}
          </MotionAside>
        )}
      </MotionDiv>
    </div>
  );
}
