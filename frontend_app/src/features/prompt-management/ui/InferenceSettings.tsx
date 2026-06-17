import { Info, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_MODEL,
  MODELS_CONFIG,
  MODEL_PARAMETER_OVERRIDES,
  getCompatibleProviders,
  getDefaultProviderForModel,
  getProviderParameters,
} from "@/config/inferenceConfig";

export interface InferenceFields {
  analysis_model?: string;
  analysis_provider?: string;
  provider_parameters?: Record<string, any>;
  enhanced_reasoning_enabled?: boolean;
}

interface InferenceSettingsProps {
  values: InferenceFields;
  onChange: (values: InferenceFields) => void;
}

export function InferenceSettings({ values, onChange }: InferenceSettingsProps) {
  // Ensure we have defaults for display
  const currentModel = values.analysis_model || DEFAULT_MODEL;
  
  // If provider is not set, or is invalid for the current model, calculate the default
  const compatibleProviders = getCompatibleProviders(currentModel);
  const rawProvider = values.analysis_provider;
  const currentProvider = (rawProvider && compatibleProviders.includes(rawProvider))
    ? rawProvider
    : getDefaultProviderForModel(currentModel);

  // Derive active parameters - merge with defaults implicitly by just reading/writing to the map
  const currentParams = values.provider_parameters || {};

  // Handlers
  const handleModelChange = (model: string) => {
    // When model changes, check if provider is still valid
    const newCompatibleProviders = getCompatibleProviders(model);
    const newProvider = newCompatibleProviders.includes(currentProvider)
      ? currentProvider
      : getDefaultProviderForModel(model);

    // Reset params if provider changes, otherwise keep them
    let newParams = { ...currentParams };
    if (newProvider !== currentProvider) {
      newParams = {};
    }

    // Apply model-specific defaults for parameters that have a default defined
    const overrides = MODEL_PARAMETER_OVERRIDES[model] ?? {};
    Object.entries(overrides).forEach(([paramKey, paramConfig]: [string, any]) => {
      if (paramConfig.default !== undefined && newParams[paramKey] === undefined) {
        newParams[paramKey] = paramConfig.default;
      }
    });

    onChange({
      ...values,
      analysis_model: model,
      analysis_provider: newProvider,
      provider_parameters: newParams,
    });
  };

  const handleProviderChange = (provider: string) => {
    onChange({
      ...values,
      analysis_provider: provider,
      provider_parameters: {}, // Reset params on provider change
    });
  };

  const handleParamChange = (key: string, value: any) => {
    const newParams = {
      ...currentParams,
      [key]: value,
    };

    // Clear dependent parameters if their dependencies are no longer satisfied
    // For example, if reasoning_effort changes from "none", clear temperature
    Object.entries(providerParamsConfig).forEach(([paramKey, config]) => {
      const paramConfig = config as any;
      if (paramConfig.dependsOn && paramConfig.dependsOn.parameter === key) {
        // If the changed parameter is a dependency for another parameter
        if (value !== paramConfig.dependsOn.value) {
          // Dependency no longer satisfied, clear the dependent parameter
          delete newParams[paramKey];
        }
      }
    });

    onChange({
      ...values,
      provider_parameters: newParams,
    });
  };

  // Get config for rendering
  const providerParamsConfig = getProviderParameters(currentProvider, currentModel);

  // Enhanced reasoning availability
  const isEnhancedReasoningAvailable = currentProvider !== "chat_completions";
  const enhancedReasoningEnabled = values.enhanced_reasoning_enabled ?? false;

  const handleEnhancedReasoningChange = (checked: boolean) => {
    onChange({ ...values, enhanced_reasoning_enabled: checked });
  };

  // Count active non-default settings for the badge
  const activeSettingsCount = [
    values.analysis_model && values.analysis_model !== DEFAULT_MODEL,
    // For provider, we count it if it is explicitly set ONLY? 
    // Or if it differs from the default for that model?
    // Let's rely on explicit state presence often, but user might set it to default explicitly.
    // Let's check "is it different from standard default"?
    // The standard default is defined in config globally, but per model it might differ.
    // Let's just check if params are present or model is non-default.
    Object.keys(currentParams).length > 0,
    values.enhanced_reasoning_enabled === true,
  ].filter(Boolean).length;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          Inference Settings
          {activeSettingsCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {activeSettingsCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Inference Settings</DialogTitle>
          <DialogDescription>
            Configure the AI model, provider, and parameters for this specific prompt.
          </DialogDescription>
        </DialogHeader>

        <Alert className="mb-4 border-orange-500 bg-orange-50 text-orange-800">
          <Info className="h-4 w-4" />
          <AlertDescription>
            These settings are for advanced users. First, try editing your prompt to get the desired response. Only adjust these if you need specific tailored behavior.
          </AlertDescription>
        </Alert>

        <div className="grid gap-6 py-4">
          {/* Model Selection */}
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="model">Model</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <p>Select the AI model to use for analysis. Different models have different capabilities and providers.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select
              value={currentModel}
              onValueChange={handleModelChange}
            >
              <SelectTrigger id="model">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(MODELS_CONFIG).map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Provider Selection */}
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
                <Label htmlFor="provider">Provider</Label>
                 <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <p>The backend service used to run the model. Some providers support different features like reasoning and verbosity.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
            </div>
            <Select
              value={currentProvider}
              onValueChange={handleProviderChange}
              disabled={compatibleProviders.length <= 1}
            >
              <SelectTrigger id="provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {compatibleProviders.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
             {compatibleProviders.length === 0 && (
                <p className="text-sm text-destructive">No compatible providers found for this model.</p>
            )}
          </div>

          {/* Dynamic Parameters */}
          {Object.entries(providerParamsConfig).length > 0 && (
            <div className="space-y-4 border-t pt-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Parameters ({currentProvider})
              </h4>
              
              {Object.entries(providerParamsConfig).map(([paramKey, config]) => {
                const paramConfig = config as any; 
                const currentValue = currentParams[paramKey];
                const label = paramConfig.label || paramKey.replace(/_/g, " ");
                const description = paramConfig.description;
                const defaultValue = paramConfig.default;

                // Check if parameter has a dependency constraint
                const dependsOn = paramConfig.dependsOn;
                const isDependencySatisfied = dependsOn 
                  ? currentParams[dependsOn.parameter] === dependsOn.value
                  : true;
                const dependencyMessage = dependsOn && !isDependencySatisfied 
                  ? dependsOn.message 
                  : null;

                if (paramConfig.type === "list") {
                  // Default to first option if not set? Or allow unset?
                  // Select value must be string.
                  const val = currentValue?.toString() || "";
                  
                  return (
                    <div key={paramKey} className="grid gap-2">
                      <div className="flex items-center gap-2">
                        <Label className="capitalize" htmlFor={paramKey}>
                          {label}
                        </Label>
                        {description && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs">
                                <p>{description}</p>
                                {defaultValue && <p className="mt-1 text-xs opacity-70">Default: {defaultValue}</p>}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <Select
                        value={val}
                        onValueChange={(nextValue) => handleParamChange(paramKey, nextValue)}
                        disabled={!isDependencySatisfied}
                      >
                        <SelectTrigger id={paramKey}>
                             <SelectValue placeholder={defaultValue ? `Default (${defaultValue})` : `Select ${label}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {(paramConfig.options || []).map((opt: string) => (
                            <SelectItem key={opt} value={opt}>
                              {opt} {opt === defaultValue ? "(Default)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {dependencyMessage && (
                        <p className="text-xs text-muted-foreground italic">
                          {dependencyMessage}
                        </p>
                      )}
                    </div>
                  );
                }

                if (paramConfig.type === "int" || paramConfig.type === "float") {
                    const isInt = paramConfig.type === "int";
                    const min = paramConfig.min ?? 0;
                    const max = paramConfig.max ?? 100;
                    const step = isInt ? 1 : 0.1;
                    const val = currentValue !== undefined ? Number(currentValue) : undefined;
                    
                    // Use default for slider visual if value is unset
                    const effectiveSliderVal = val ?? defaultValue ?? min;
                    const sliderVal = [Math.min(Math.max(effectiveSliderVal, min), max)];
                    
                    const isError = val !== undefined && (val < min || val > max);

                    return (
                        <div key={paramKey} className="grid gap-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Label className="capitalize" htmlFor={paramKey}>
                                      {label}
                                  </Label>
                                  {description && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent side="right" className="max-w-xs">
                                          <p>{description}</p>
                                          {defaultValue !== undefined && <p className="mt-1 text-xs opacity-70">Default: {defaultValue}</p>}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>
                                <Input 
                                    type="number" 
                                    className={`h-7 w-24 text-right font-mono ${isError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                                    value={val ?? ''}
                                    min={min}
                                    max={max}
                                    step={step}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if (v === '') handleParamChange(paramKey, undefined);
                                        else handleParamChange(paramKey, isInt ? parseInt(v) : parseFloat(v));
                                    }}
                                    placeholder={defaultValue !== undefined ? `Default (${defaultValue})` : "Default"}
                                    disabled={!isDependencySatisfied}
                                />
                            </div>
                            <Slider
                                value={sliderVal} 
                                min={min} 
                                max={max} 
                                step={step}
                                onValueChange={(vals) => handleParamChange(paramKey, vals[0])}
                                disabled={!isDependencySatisfied}
                            />
                            <div className="flex justify-between text-xs text-muted-foreground px-1">
                                <span>{min}</span>
                                <span>{max}</span>
                            </div>
                            {isError && (
                                <p className="text-[10px] font-medium text-destructive mt-1">
                                    Value must be between {min} and {max}
                                </p>
                            )}
                            {dependencyMessage && (
                                <p className="text-xs text-muted-foreground italic mt-1">
                                    {dependencyMessage}
                                </p>
                            )}
                        </div>
                    );
                }

                return null;
              })}
            </div>
          )}

          {/* Enhanced Reasoning */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label htmlFor="enhanced-reasoning">Enhanced Reasoning</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <p>Runs a structured writing pipeline: Plan → Write → Critic Review → Refine. Each section is planned individually, written against its constraints, reviewed against a generated checklist, and corrected if it fails. Adds ~30–90s. Requires the responses provider.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Switch
                id="enhanced-reasoning"
                checked={enhancedReasoningEnabled}
                onCheckedChange={handleEnhancedReasoningChange}
                disabled={!isEnhancedReasoningAvailable}
              />
            </div>
            {!isEnhancedReasoningAvailable && (
              <p className="text-xs text-muted-foreground italic">
                Not available with the chat_completions provider.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
