import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeClosed, EyeOff, FileText, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { usePromptManagement } from "../state/context";
import { PresetSelector } from "./preset-selector";
import { FormBuilderEditor } from "./form-builder";
import { InferenceSettings } from "./InferenceSettings";
import { VersionsControl } from "./versions-control";
import { UserAllowlistEditor } from "./UserAllowlistEditor";
import type { InferenceFields } from "./InferenceSettings";
import type { PromptConstraints } from "../types/promptConstraints";
import type { PromptVisibility } from "../data/api";
import { normalizePromptVisibility } from "@/lib/prompt-visibility";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCategoryData } from "@/features/prompt-management/data/queries";
import { LazyMDEditor } from "@/components/lazy/LazyMDEditor";
import { MotionDiv } from "@/components/ui/motion";
import { AnimatePresence, fadeIn } from "@/lib/motion";

interface PromptEditorProps {
  onCancel: () => void;
  onSave: () => void;
}

export function PromptEditor({ onCancel, onSave }: PromptEditorProps) {
  const { selectedPrompt, editSubcategory, setSelectedPrompt, refreshData } = usePromptManagement();
  
  const [promptName, setPromptName] = useState("");
  const [promptContent, setPromptContent] = useState("");
  const [preSessionTalkingPoints, setPreSessionTalkingPoints] = useState<Array<any>>([]);
  const [inSessionTalkingPoints, setInSessionTalkingPoints] = useState<Array<any>>([]);
  const [inferenceSettings, setInferenceSettings] = useState<InferenceFields>({
    analysis_model: "gpt-5.1",
    analysis_provider: "responses",
    provider_parameters: {},
  });
  const [promptVisibility, setPromptVisibility] = useState<PromptVisibility>("all");
  const [visibleToUserIds, setVisibleToUserIds] = useState<Array<string> | null>(null);
  const [promptConstraints, setPromptConstraints] = useState<PromptConstraints>({});
  const [constraintsExpanded, setConstraintsExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPresets, setSelectedPresets] = useState<Array<string>>([]);

  // Use shared category data hook for subcategory details
  const { subcategories, isLoadingSubcategories } = useCategoryData();

  useEffect(() => {
    if (!selectedPrompt || isLoadingSubcategories) return;

    // Find the subcategory from shared cache
    const getId = (obj: any) => obj?.id ?? obj?.subcategory_id ?? obj?.subcategoryId ?? null;
    const selectedId = getId(selectedPrompt as any);
    const foundSubcategory = subcategories.find(sub => {
      const candidateId = getId(sub as any);
      return candidateId === selectedId;
    });
    
    if (foundSubcategory) {
      const promptNameValue = (foundSubcategory as any).subcategory_name ?? selectedPrompt.name;
      setPromptName(promptNameValue);
      const prompts = foundSubcategory.prompts;
      const firstPromptKey = Object.keys(prompts)[0];
      setPromptContent(firstPromptKey ? prompts[firstPromptKey] : "");
      setPreSessionTalkingPoints((foundSubcategory as any).preSessionTalkingPoints || []);
      setInSessionTalkingPoints((foundSubcategory as any).inSessionTalkingPoints || []);
      setInferenceSettings({
        analysis_model: foundSubcategory.analysis_model || "gpt-5.1",
        analysis_provider: foundSubcategory.analysis_provider || "responses",
        provider_parameters: foundSubcategory.provider_parameters || {},
        enhanced_reasoning_enabled: (foundSubcategory as any).enhanced_reasoning_enabled ?? false,
      });
      // Load constraints for the first prompt key
      const pcMap = (foundSubcategory as any).prompt_constraints || {};
      const firstKey = Object.keys(foundSubcategory.prompts)[0];
      setPromptConstraints(firstKey && pcMap[firstKey] ? pcMap[firstKey] : {});
      setPromptVisibility(normalizePromptVisibility(foundSubcategory.prompt_visibility));
      setVisibleToUserIds(foundSubcategory.visible_to_user_ids ?? null);
    } else {
      setPromptName(selectedPrompt.name);
      const prompts = selectedPrompt.prompts;
      const firstPromptKey = Object.keys(prompts)[0];
      setPromptContent(firstPromptKey ? prompts[firstPromptKey] : "");
      setPreSessionTalkingPoints([]);
      setInSessionTalkingPoints([]);
      setInferenceSettings({
        analysis_model: selectedPrompt.analysis_model || "gpt-5.1",
        analysis_provider: (selectedPrompt as any).analysis_provider || "responses",
        provider_parameters: (selectedPrompt as any).provider_parameters || {},
        enhanced_reasoning_enabled: (selectedPrompt as any).enhanced_reasoning_enabled ?? false,
      });
      const pcMap = (selectedPrompt as any).prompt_constraints || {};
      const firstKey = Object.keys(selectedPrompt.prompts)[0];
      setPromptConstraints(firstKey && pcMap[firstKey] ? pcMap[firstKey] : {});
      setPromptVisibility(normalizePromptVisibility((selectedPrompt as any).prompt_visibility));
      setVisibleToUserIds((selectedPrompt as any).visible_to_user_ids ?? null);
    }
  }, [selectedPrompt, subcategories, isLoadingSubcategories]);

  const handleSave = async () => {
    if (!selectedPrompt) return;
    
    setIsSaving(true);
    try {
      const cleanedInSessionTalkingPoints = inSessionTalkingPoints.map(section => ({
        ...section,
        fields: (section.fields || []).map((f: any) => ({
          title: f.title || f.name || '',
          name: f.name || f.title || '',
          type: f.type || 'markdown',
          value: f.value || '',
        }))
      }));
      
      const cleanedPreSessionTalkingPoints = preSessionTalkingPoints.map(section => ({
        ...section,
        fields: (section.fields || []).map((f: any) => ({
          ...f
        }))
      }));

      await editSubcategory(
        selectedPrompt.id,
        promptName,
        { [promptName]: promptContent },
        cleanedPreSessionTalkingPoints,
        cleanedInSessionTalkingPoints,
        inferenceSettings.analysis_model,
        inferenceSettings.analysis_provider,
        inferenceSettings.provider_parameters,
        promptVisibility,
        visibleToUserIds,
        inferenceSettings.enhanced_reasoning_enabled,
        // Build prompt_constraints map keyed by prompt name, only if non-empty
        Object.keys(promptConstraints).length > 0
          ? { [promptName]: promptConstraints }
          : null,
      );
      
      toast.success("Prompt saved successfully!");
      onSave();
    } catch (error) {
      console.error("Failed to save:", error);
      toast.error("Failed to save prompt.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      <MotionDiv
        key={selectedPrompt?.id || "editor"}
        className="flex flex-col h-full bg-background"
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-1 rounded-md bg-primary/10 text-primary hidden sm:flex">
            <FileText className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Edit Prompt</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="content" className="h-full flex flex-col">
          <div className="px-6 pt-4">
            <TabsList className="grid w-full max-w-2xl grid-cols-4">
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="talking-points">Form & Talking Points</TabsTrigger>
              <TabsTrigger value="visibility">Visibility</TabsTrigger>
              <TabsTrigger value="versions-control">Version Control</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="content" className="flex-1 overflow-y-auto p-6 space-y-6 mt-0">
            <div className="space-y-2">
              <Label htmlFor="prompt-name">Prompt Name</Label>
              <Input
                id="prompt-name"
                value={promptName}
                onChange={(e) => setPromptName(e.target.value)}
                placeholder="Enter prompt name"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Prompt Content</Label>
              <div className="border rounded-md overflow-hidden">
                <LazyMDEditor
                  value={promptContent}
                  onChange={(val) => setPromptContent(val || "")}
                  height={500}
                  preview="edit"
                  hideToolbar={false}
                  visibleDragbar={false}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <PresetSelector
                onAppendPreset={(instruction) => {
                  setPromptContent(prev => prev + instruction);
                }}
                selectedPresets={selectedPresets}
                onPresetsChange={setSelectedPresets}
              />
            </div>

            <div className="space-y-2">
               <InferenceSettings values={inferenceSettings} onChange={setInferenceSettings} />
            </div>

            {/* Constraints Panel */}
            <div className="border rounded-lg">
              <button
                type="button"
                className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                onClick={() => setConstraintsExpanded(!constraintsExpanded)}
              >
                <div className="flex items-center gap-2">
                  {constraintsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="text-sm font-medium">Constraints (optional)</span>
                  {Object.values(promptConstraints).some(v => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-xs">Active</Badge>
                  )}
                </div>
              </button>
              {constraintsExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t pt-4">
                  <div className="grid gap-2">
                    <Label htmlFor="constraint-format">Format</Label>
                    <Select
                      value={promptConstraints.format || ""}
                      onValueChange={(v) => setPromptConstraints(prev => ({ ...prev, format: v as any || undefined }))}
                    >
                      <SelectTrigger id="constraint-format">
                        <SelectValue placeholder="No preference" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bullets">Bullets</SelectItem>
                        <SelectItem value="prose">Prose</SelectItem>
                        <SelectItem value="table">Table</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="constraint-max-items">Max items</Label>
                      <Input
                        id="constraint-max-items"
                        type="number"
                        min={1}
                        value={promptConstraints.max_items ?? ""}
                        onChange={(e) => setPromptConstraints(prev => ({
                          ...prev,
                          max_items: e.target.value ? parseInt(e.target.value) : undefined,
                        }))}
                        placeholder="—"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="constraint-max-words">Max words</Label>
                      <Input
                        id="constraint-max-words"
                        type="number"
                        min={1}
                        value={promptConstraints.max_words ?? ""}
                        onChange={(e) => setPromptConstraints(prev => ({
                          ...prev,
                          max_words: e.target.value ? parseInt(e.target.value) : undefined,
                        }))}
                        placeholder="—"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="constraint-max-words-per-item">Max words/item</Label>
                      <Input
                        id="constraint-max-words-per-item"
                        type="number"
                        min={1}
                        value={promptConstraints.max_words_per_item ?? ""}
                        onChange={(e) => setPromptConstraints(prev => ({
                          ...prev,
                          max_words_per_item: e.target.value ? parseInt(e.target.value) : undefined,
                        }))}
                        placeholder="—"
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="constraint-tone">Tone</Label>
                    <Input
                      id="constraint-tone"
                      value={promptConstraints.tone ?? ""}
                      onChange={(e) => setPromptConstraints(prev => ({
                        ...prev,
                        tone: e.target.value || undefined,
                      }))}
                      placeholder="e.g. formal, neutral"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Required elements</Label>
                    <div className="space-y-2">
                      {(promptConstraints.required_elements || []).map((el, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input
                            value={el}
                            onChange={(e) => {
                              const updated = [...(promptConstraints.required_elements || [])];
                              updated[idx] = e.target.value;
                              setPromptConstraints(prev => ({ ...prev, required_elements: updated }));
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const updated = (promptConstraints.required_elements || []).filter((_, i) => i !== idx);
                              setPromptConstraints(prev => ({
                                ...prev,
                                required_elements: updated.length > 0 ? updated : undefined,
                              }));
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPromptConstraints(prev => ({
                            ...prev,
                            required_elements: [...(prev.required_elements || []), ""],
                          }));
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Add
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="talking-points" className="flex-1 overflow-y-auto p-6 space-y-8 mt-0">
            <div className="space-y-6">
              <div>
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">Pre-Session Form Builder</h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Design form fields that users will fill out before starting a session.
                  </p>
                </div>
                <FormBuilderEditor
                  points={preSessionTalkingPoints}
                  setPoints={setPreSessionTalkingPoints}
                  label="Pre-Session Form Fields"
                  isFormBuilder={true}
                />
              </div>
              
              <div>
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
                  <h3 className="font-semibold text-green-900 dark:text-green-100 mb-1">In-Session Talking Points</h3>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Create talking points and reminders to guide conversations.
                  </p>
                </div>
                <FormBuilderEditor
                  points={inSessionTalkingPoints}
                  setPoints={setInSessionTalkingPoints}
                  label="In-Session Talking Points"
                  isFormBuilder={false}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="visibility" className="flex-1 overflow-y-auto p-6 space-y-8 mt-0">
            <div className="space-y-3">
              <div>
                <Label className="text-base font-semibold">Role Visibility</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Control which user roles can see and use this meeting type.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {([
                  {
                    value: "all" as PromptVisibility,
                    icon: <Eye className="h-5 w-5" />,
                    label: "All Users",
                    description: "Visible to everyone with access.",
                  },
                  {
                    value: "only_editors" as PromptVisibility,
                    icon: <EyeOff className="h-5 w-5" />,
                    label: "Editors Only",
                    description: "Only editors and admins can see this.",
                  },
                  {
                    value: "nobody" as PromptVisibility,
                    icon: <EyeClosed className="h-5 w-5" />,
                    label: "Nobody",
                    description: "Hidden from everyone.",
                  },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPromptVisibility(option.value)}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50",
                      promptVisibility === option.value
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border",
                    )}
                  >
                    <span className={cn(
                      "p-2 rounded-md",
                      promptVisibility === option.value ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                    )}>
                      {option.icon}
                    </span>
                    <div>
                      <p className="font-medium text-sm">{option.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-base font-semibold">User Allowlist</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Optionally grant access to specific users. When set, only listed users can access this meeting type, even if role visibility is Editors Only. Nobody remains hidden from everyone.
                </p>
              </div>
              <UserAllowlistEditor value={visibleToUserIds} onChange={setVisibleToUserIds} />
            </div>
          </TabsContent>

          <TabsContent value="versions-control" className="flex-1 overflow-y-auto p-6 space-y-8 mt-0">
            <VersionsControl
              subcategoryId={selectedPrompt?.id}
              onRollbackApplied={async (updatedSubcategory) => {
                await refreshData();
                setSelectedPrompt({
                  ...(selectedPrompt ?? {}),
                  ...updatedSubcategory,
                } as any);
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </MotionDiv>
    </AnimatePresence>
  );
}
