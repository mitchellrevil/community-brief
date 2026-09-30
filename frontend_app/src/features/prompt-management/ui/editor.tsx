import { useEffect, useState } from "react";
import {
  Eye,
  EyeClosed,
  EyeOff,
  FileText,
  Save,
  Settings,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { normalizePromptMetadata } from "../lib/prompt-metadata";
import { usePromptManagement } from "../state/context";
import { FormBuilderEditor } from "./form-builder";
import { InferenceSettings } from "./InferenceSettings";
import { UserAllowlistEditor } from "./UserAllowlistEditor";
import { VersionsControl } from "./versions-control";
import type { PromptMetadata, PromptVisibility } from "@/shared/data/templates";
import type { DefinitionIssue } from "@/shared/schema/form-definition.schema";
import type { FormSection } from "@/types/forms";
import type { InferenceFields } from "./InferenceSettings";
import { LazyMDEditor } from "@/components/lazy/LazyMDEditor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EditableDisplayName } from "@/components/ui/editable-display-name";
import { Label } from "@/components/ui/label";
import { MotionDiv } from "@/components/ui/motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AnimatePresence, fadeIn } from "@/lib/motion";
import {
  getPromptVisibilityLabel,
  normalizePromptVisibility,
} from "@/lib/prompt-visibility";
import { cn } from "@/lib/utils";
import { validateFormDefinition } from "@/shared/schema/form-definition.schema";


interface PromptEditorProps {
  onCancel: () => void;
  onSave: () => void;
}

const visibilityOptions = [
  {
    value: "all" as PromptVisibility,
    icon: Eye,
    label: "All Users",
    description: "Visible to everyone with access.",
  },
  {
    value: "only_editors" as PromptVisibility,
    icon: EyeOff,
    label: "Editors Only",
    description: "Only editors and admins can see this.",
  },
  {
    value: "nobody" as PromptVisibility,
    icon: EyeClosed,
    label: "Nobody",
    description: "Hidden from everyone.",
  },
];

export function PromptEditor({ onCancel, onSave }: PromptEditorProps) {
  const {
    selectedPrompt,
    selectedCategory,
    editSubcategory,
    setSelectedPrompt,
    refreshData,
  } = usePromptManagement();

  const [promptName, setPromptName] = useState("");
  const [promptContent, setPromptContent] = useState("");
  const [preSessionTalkingPoints, setPreSessionTalkingPoints] = useState<
    Array<FormSection>
  >([]);
  const [inSessionTalkingPoints, setInSessionTalkingPoints] = useState<
    Array<FormSection>
  >([]);
  const [inferenceSettings, setInferenceSettings] = useState<InferenceFields>({
    provider_parameters: {},
    analysis_workflow: "standard",
  });
  const [promptVisibility, setPromptVisibility] =
    useState<PromptVisibility>("all");
  const [visibleToUserIds, setVisibleToUserIds] =
    useState<Array<string> | null>(null);
  const [promptMetadata, setPromptMetadata] = useState<PromptMetadata>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isVisibilityOpen, setIsVisibilityOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("edit");
  const [definitionIssues, setDefinitionIssues] = useState<{
    pre: Array<DefinitionIssue>;
    live: Array<DefinitionIssue>;
  }>({ pre: [], live: [] });

  useEffect(() => {
    if (definitionIssues.pre.length || definitionIssues.live.length) {
      // Tabs mount their panel after selection; focus once the controls exist.
      const frame = requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(
            '[data-form-builders] [aria-invalid="true"], [data-form-builders] [data-definition-error]',
          )
          ?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [definitionIssues, activeTab]);

  useEffect(() => {
    if (!selectedPrompt) return;
    const promptSource = selectedPrompt;
    const prompts = promptSource.prompts;
    const firstPromptKey = Object.keys(prompts)[0];
    const promptNameValue = selectedPrompt.name;

    setPromptName(promptNameValue);
    setPromptContent(firstPromptKey ? prompts[firstPromptKey] : "");
    setPreSessionTalkingPoints(
      structuredClone(promptSource.pre_session_talking_points),
    );
    setInSessionTalkingPoints(
      structuredClone(promptSource.in_session_talking_points),
    );
    setDefinitionIssues({ pre: [], live: [] });
    setInferenceSettings({
      analysis_model: promptSource.analysis_model || undefined,
      analysis_provider: promptSource.analysis_provider || undefined,
      provider_parameters: promptSource.provider_parameters || {},
      analysis_workflow: promptSource.analysis_workflow,
      speaker_identification_enabled:
        promptSource.speaker_identification_enabled,
      recording_disclaimer_enabled: promptSource.recording_disclaimer_enabled,
      recording_disclaimer: promptSource.recording_disclaimer ?? "",
    });
    setPromptVisibility(normalizePromptVisibility(promptSource.visibility));
    setVisibleToUserIds(promptSource.visible_to_user_ids ?? null);
    setPromptMetadata(normalizePromptMetadata(promptSource.prompt_metadata));
  }, [selectedPrompt]);

  const handleSave = async () => {
    if (!selectedPrompt) return;

    const pre = validateFormDefinition(preSessionTalkingPoints);
    const live = validateFormDefinition(inSessionTalkingPoints);
    setDefinitionIssues({ pre, live });
    if (pre.length || live.length) {
      setActiveTab("forms");
      toast.error("Please fix the highlighted form fields before saving.");
      return;
    }

    setIsSaving(true);
    try {
      const cleanedInSessionTalkingPoints = inSessionTalkingPoints.map(
        (section) => ({
          ...section,
          fields: section.fields.map((field: any) => ({
            ...field,
            title: field.label || field.title || field.name || "",
            name: field.name || field.title || "",
            type: field.type || "markdown",
            value: field.value ?? "",
          })),
        }),
      );

      const cleanedPreSessionTalkingPoints = preSessionTalkingPoints.map(
        (section) => ({
          ...section,
          fields: section.fields.map((field) => ({ ...field })),
        }),
      );

      await editSubcategory(
        selectedPrompt.id,
        promptName,
        { [promptName]: promptContent },
        cleanedPreSessionTalkingPoints,
        cleanedInSessionTalkingPoints,
        inferenceSettings.analysis_model,
        inferenceSettings.analysis_provider,
        inferenceSettings.provider_parameters,
        inferenceSettings.analysis_workflow,
        promptVisibility,
        visibleToUserIds,
        inferenceSettings.speaker_identification_enabled,
        promptMetadata,
        inferenceSettings.recording_disclaimer_enabled,
        inferenceSettings.recording_disclaimer?.trim() || null,
      );

      toast.success("Template saved successfully!");
      onSave();
    } catch (error) {
      console.error("Failed to save:", error);
      toast.error("Failed to save template.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePromptMetadataChange = (
    kind: keyof PromptMetadata,
    checked: boolean | "indeterminate",
  ) => {
    setPromptMetadata((current) => ({
      ...current,
      [kind]: checked === true,
    }));
  };

  return (
    <AnimatePresence mode="wait">
      <MotionDiv
        key={selectedPrompt?.id || "editor"}
        className="bg-background flex h-full min-h-0 flex-col"
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <div className="bg-background border-b px-5 py-4">
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-3 sm:items-center">
                <div className="bg-muted/30 text-muted-foreground hidden rounded-lg border p-2 sm:flex">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <EditableDisplayName
                    displayName={promptName || "Untitled template"}
                    onSave={setPromptName}
                    className="max-w-full text-xl font-semibold tracking-tight"
                    inputClassName="text-xl font-semibold tracking-tight"
                  />
                  <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                    <span className="max-w-full truncate sm:max-w-[18rem]">
                      {selectedCategory?.name || "Unknown folder"}
                    </span>
                    <button
                      type="button"
                      className="text-foreground font-medium underline-offset-4 hover:underline"
                      onClick={() => setIsVisibilityOpen(true)}
                    >
                      {getPromptVisibilityLabel(promptVisibility)}
                    </button>
                    <span>
                      {promptContent.length.toLocaleString()} characters
                    </span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex shrink-0 items-center gap-1.5">
                            <Checkbox
                              id="development-prompt"
                              checked={Boolean(promptMetadata.development)}
                              onCheckedChange={(checked) =>
                                handlePromptMetadataChange(
                                  "development",
                                  checked,
                                )
                              }
                              disabled={isSaving}
                            />
                            <Label
                              htmlFor="development-prompt"
                              className="cursor-help text-xs font-normal"
                            >
                              Development
                            </Label>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                          Shows a development template disclaimer on record and
                          upload pages.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex shrink-0 items-center gap-1.5">
                            <Checkbox
                              id="test-prompt"
                              checked={Boolean(promptMetadata.test)}
                              onCheckedChange={(checked) =>
                                handlePromptMetadataChange("test", checked)
                              }
                              disabled={isSaving}
                            />
                            <Label
                              htmlFor="test-prompt"
                              className="cursor-help text-xs font-normal"
                            >
                              Test
                            </Label>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                          Shows a test template disclaimer on record and upload
                          pages.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between 2xl:w-auto 2xl:shrink-0 2xl:justify-end">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsVisibilityOpen(true)}
                  disabled={isSaving}
                >
                  <Settings className="h-4 w-4" />
                  Visibility
                </Button>
                <InferenceSettings
                  values={inferenceSettings}
                  onChange={setInferenceSettings}
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCancel}
                  disabled={isSaving}
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="min-w-[8.75rem]"
                  onClick={handleSave}
                  disabled={isSaving || !promptName.trim()}
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving..." : "Save and Publish"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b px-5">
            <TabsList className="text-muted-foreground h-11 justify-start gap-6 rounded-none bg-transparent p-0">
              <TabsTrigger
                value="edit"
                className="data-[state=active]:border-primary h-11 rounded-none border-b-2 border-transparent bg-transparent px-0 shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Edit
              </TabsTrigger>
              <TabsTrigger
                value="forms"
                className="data-[state=active]:border-primary h-11 rounded-none border-b-2 border-transparent bg-transparent px-0 shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Forms
              </TabsTrigger>
              <TabsTrigger
                value="versions"
                className="data-[state=active]:border-primary h-11 rounded-none border-b-2 border-transparent bg-transparent px-0 shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Versions
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="edit"
            className="bg-muted/20 mt-0 min-h-0 flex-1 overflow-y-auto p-5"
          >
            <div className="prompt-markdown-editor bg-background mx-auto max-w-4xl overflow-hidden rounded-lg border shadow-sm">
              <LazyMDEditor
                value={promptContent}
                onChange={(value) => setPromptContent(value || "")}
                height={620}
                preview="edit"
                hideToolbar={false}
                visibleDragbar={false}
              />
            </div>
          </TabsContent>

          <TabsContent
            value="forms"
            className="mt-0 min-h-0 flex-1 overflow-y-auto p-5"
          >
            <div className="mx-auto max-w-4xl divide-y" data-form-builders>
              <FormBuilderEditor
                points={preSessionTalkingPoints}
                setPoints={setPreSessionTalkingPoints}
                label="Before the session"
                isFormBuilder={true}
                issues={
                  definitionIssues.pre.length
                    ? validateFormDefinition(preSessionTalkingPoints)
                    : []
                }
              />
              <FormBuilderEditor
                points={inSessionTalkingPoints}
                setPoints={setInSessionTalkingPoints}
                label="During the session"
                isFormBuilder={false}
                issues={
                  definitionIssues.live.length
                    ? validateFormDefinition(inSessionTalkingPoints)
                    : []
                }
              />
            </div>
          </TabsContent>

          <TabsContent
            value="versions"
            className="mt-0 min-h-0 flex-1 overflow-y-auto p-5"
          >
            <div className="mx-auto max-w-4xl">
              <VersionsControl
                templateId={selectedPrompt?.id}
                onRestoreApplied={async (updatedSubcategory) => {
                  await refreshData();
                  setSelectedPrompt({
                    ...(selectedPrompt ?? {}),
                    ...updatedSubcategory,
                  } as any);
                }}
              />
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={isVisibilityOpen} onOpenChange={setIsVisibilityOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Visibility</DialogTitle>
              <DialogDescription>
                Control who can see and use this template.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                {visibilityOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = promptVisibility === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPromptVisibility(option.value)}
                      className={cn(
                        "hover:bg-muted/50 rounded-lg border p-4 text-left transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5 ring-primary ring-1"
                          : "border-border",
                      )}
                    >
                      <Icon
                        className={cn(
                          "mb-3 h-5 w-5",
                          isSelected ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      <p className="text-sm font-medium">{option.label}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">User allowlist</Label>
                <UserAllowlistEditor
                  value={visibleToUserIds}
                  onChange={setVisibleToUserIds}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsVisibilityOpen(false)}
              >
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </MotionDiv>
    </AnimatePresence>
  );
}
