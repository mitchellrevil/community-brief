import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Settings, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { CatalogModel, CatalogParameter } from "@/config/inferenceConfig";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_MODEL,
  getInferenceCatalogQuery,
  parameterValueIsValid,
  sanitizeParameters,
} from "@/config/inferenceConfig";
import { DEFAULT_RECORDING_DISCLAIMER } from "@/config/recordingDisclaimer";

export interface InferenceFields {
  analysis_model?: string;
  analysis_provider?: string;
  provider_parameters?: Record<string, unknown>;
  analysis_workflow?: "standard" | "structured_review";
  speaker_identification_enabled?: boolean;
  recording_disclaimer_enabled?: boolean;
  recording_disclaimer?: string | null;
}

function lifecycleMessage(model: CatalogModel): string | null {
  const replacement = model.replacement_model_key
    ? ` Use ${model.replacement_model_key} instead.`
    : "";
  if (
    model.effective_status === "retired" ||
    model.effective_status === "disabled"
  )
    return `${model.display_name} is no longer available.${replacement}`;
  if (model.effective_status === "deprecated")
    return `${model.display_name} is deprecated${model.retires_at ? ` and retires ${new Date(model.retires_at).toLocaleDateString()}` : ""}.${replacement}`;
  const date = model.deprecates_at || model.retires_at;
  return date
    ? `${model.display_name} has a lifecycle change on ${new Date(date).toLocaleDateString()}.${replacement}`
    : null;
}

export function InferenceSettings({
  values: savedValues,
  onChange,
}: {
  values: InferenceFields;
  onChange: (values: InferenceFields) => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(savedValues);
  const [resetVersion, setResetVersion] = useState(0);
  const [invalidJson, setInvalidJson] = useState<Set<string>>(() => new Set());
  const {
    data: catalog,
    isLoading,
    isError,
    refetch,
  } = useQuery(getInferenceCatalogQuery());
  const currentModelKey =
    values.analysis_model || catalog?.default_model || DEFAULT_MODEL;
  const currentModel = catalog?.models.find(
    (model) => model.key === currentModelKey,
  );
  const currentParams = values.provider_parameters || {};
  const blocked =
    !currentModel ||
    ["retired", "disabled"].includes(currentModel.effective_status);
  const invalidValue =
    currentModel &&
    Object.entries(currentParams).some(([name, value]) => {
      const definition = currentModel.parameters[name];
      return !definition || !parameterValueIsValid(value, definition);
    });

  const handleModelChange = (modelKey: string) => {
    const model = catalog?.models.find((item) => item.key === modelKey);
    if (!model) return;
    const sanitized = sanitizeParameters(currentParams, model);
    setValues({
      ...values,
      analysis_model: model.key,
      analysis_provider: model.provider,
      provider_parameters: sanitized.parameters,
    });
    setInvalidJson(new Set());
    if (sanitized.removed)
      toast.info(
        `${sanitized.removed} incompatible setting${sanitized.removed === 1 ? " was" : "s were"} reset`,
      );
  };
  const handleParamChange = (key: string, value: unknown) => {
    if (!currentModel) return;
    const next = { ...currentParams };
    const resetNames = new Set<string>();
    if (value === undefined) delete next[key];
    else next[key] = value;
    for (const [name, definition] of Object.entries(currentModel.parameters)) {
      if (!definition) continue;
      const dependency = definition.depends_on;
      if (
        dependency &&
        (next[dependency.parameter] ??
          currentModel.request_defaults?.[dependency.parameter] ??
          currentModel.parameters[dependency.parameter]?.default) !==
          dependency.value
      ) {
        delete next[name];
        resetNames.add(name);
      }
      if (name === key)
        for (const conflict of definition.conflicts_with) {
          delete next[conflict];
          resetNames.add(conflict);
        }
    }
    if (resetNames.size) setInvalidJson((current) => new Set([...current].filter((name) => !resetNames.has(name))));
    setValues({ ...values, provider_parameters: next });
  };
  const warning = currentModel ? lifecycleMessage(currentModel) : null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setValues(structuredClone(savedValues));
          setInvalidJson(new Set());
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="size-8 p-0"
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-5 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Choose how this template analyses and records meetings.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="analysis" className="min-w-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="recording">Recording</TabsTrigger>
          </TabsList>
        <TabsContent forceMount value="analysis" className="space-y-5 pt-4 data-[state=inactive]:hidden">
            <div className="space-y-2">
              <Label htmlFor="settings-model">Model</Label>
              <Select
                value={currentModelKey}
                onValueChange={handleModelChange}
                disabled={isLoading || isError}
              >
                <SelectTrigger id="settings-model">
                  <SelectValue
                    placeholder={isLoading ? "Loading models…" : "Select model"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {catalog?.models.map((model) => (
                    <SelectItem
                      key={model.key}
                      value={model.key}
                      disabled={model.effective_status !== "active"}
                    >
                      {model.display_name}
                      {model.effective_status !== "active"
                        ? ` (${model.effective_status})`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Models and available controls are managed by your
                administrators.
              </p>
              {isError && (
                <div
                  role="alert"
                  className="text-destructive flex items-center justify-between gap-3 text-sm"
                >
                  Model catalogue unavailable.
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void refetch()}
                  >
                    Retry
                  </Button>
                </div>
              )}
              {!isLoading && !isError && !currentModel && (
                <p role="alert" className="text-destructive text-sm">
                  This template’s model is unavailable. Select an active model.
                </p>
              )}
            </div>
            {warning && (
              <Alert variant={blocked ? "destructive" : "default"}>
                <TriangleAlert className="size-4" />
                <AlertDescription>{warning}</AlertDescription>
              </Alert>
            )}
            <div className="bg-muted/20 flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor="analysis-workflow">Structured review</Label>
                <p className="text-muted-foreground text-xs">
                  Check the evidence, write the summary, then review its
                  quality.
                </p>
              </div>
              <Switch
                className="no-min shrink-0"
                id="analysis-workflow"
                checked={values.analysis_workflow === "structured_review"}
                onCheckedChange={(checked) =>
                  setValues({
                    ...values,
                    analysis_workflow: checked
                      ? "structured_review"
                      : "standard",
                  })
                }
              />
            </div>
            {currentModel && (
              <section className="space-y-4 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">Model options</h3>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Leave a control empty to use the model’s configured
                      default.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={
                      !Object.keys(currentParams).length && !invalidJson.size
                    }
                    onClick={() => {
                      setValues({ ...values, provider_parameters: {} });
                      setInvalidJson(new Set());
                      setResetVersion((value) => value + 1);
                    }}
                  >
                    Reset overrides
                  </Button>
                </div>
                <div
                  key={`${currentModel.key}-${resetVersion}`}
                  className="grid gap-5 sm:grid-cols-2"
                >
                  {Object.entries(currentModel.parameters).map(
                    ([key, definition]) =>
                      definition ? (
                        <ParameterControl
                          key={key}
                          name={key}
                          definition={definition}
                          value={currentParams[key]}
                          parameters={{
                            ...currentModel.request_defaults,
                            ...currentParams,
                          }}
                          definitions={currentModel.parameters}
                          defaultValue={
                            currentModel.request_defaults?.[key] ??
                            definition.default
                          }
                          onChange={handleParamChange}
                          onValidityChange={(valid) =>
                            setInvalidJson((current) => {
                              const next = new Set(current);
                              if (valid) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                        />
                      ) : null,
                  )}
                </div>
                {!Object.keys(currentModel.parameters).length && (
                  <p className="text-muted-foreground text-sm">
                    This model uses the administrator’s default arguments.
                  </p>
                )}
                {invalidValue && (
                  <p role="alert" className="text-destructive text-sm">
                    Check the types and limits of your model options before
                    applying.
                  </p>
                )}
              </section>
            )}
          </TabsContent>
          <TabsContent value="recording" className="space-y-5 pt-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor="speaker-identification">
                  Speaker identification
                </Label>
                <p className="text-muted-foreground text-xs">
                  Identify speakers in the meeting transcript.
                </p>
              </div>
              <Switch
                className="no-min shrink-0"
                id="speaker-identification"
                checked={values.speaker_identification_enabled ?? false}
                onCheckedChange={(checked) =>
                  setValues({
                    ...values,
                    speaker_identification_enabled: checked,
                  })
                }
              />
            </div>
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="recording-disclaimer-enabled">
                    Recording disclaimer
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    Give recorders a message to share with meeting participants.
                  </p>
                </div>
                <Switch
                  className="no-min shrink-0"
                  id="recording-disclaimer-enabled"
                  checked={values.recording_disclaimer_enabled ?? false}
                  onCheckedChange={(checked) =>
                    setValues({
                      ...values,
                      recording_disclaimer_enabled: checked,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recording-disclaimer">Disclaimer message</Label>
                <Textarea
                  id="recording-disclaimer"
                  value={values.recording_disclaimer ?? ""}
                  onChange={(event) =>
                    setValues({
                      ...values,
                      recording_disclaimer: event.target.value,
                    })
                  }
                  maxLength={2000}
                  rows={5}
                  disabled={!values.recording_disclaimer_enabled}
                  placeholder={DEFAULT_RECORDING_DISCLAIMER}
                />
                <p className="text-muted-foreground text-xs">
                  Leave blank to use the standard recording disclaimer.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter className="items-center gap-3 border-t pt-4 sm:justify-between sm:pt-4">
          <p className="text-muted-foreground text-xs">
            Applied settings are saved when you save the template.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                isLoading ||
                isError ||
                blocked ||
                invalidValue ||
                invalidJson.size > 0
              }
              onClick={() => {
                onChange(values);
                setOpen(false);
              }}
            >
              Apply settings
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ParameterControl({
  name,
  definition,
  value,
  parameters,
  definitions,
  defaultValue,
  onChange,
  onValidityChange,
}: {
  name: string;
  definition: CatalogParameter;
  value: unknown;
  parameters: Record<string, unknown>;
  defaultValue: unknown;
  definitions: Partial<Record<string, CatalogParameter>>;
  onChange: (name: string, value: unknown) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const dependency = definition.depends_on;
  const enabled =
    !dependency ||
    (parameters[dependency.parameter] ??
      definitions[dependency.parameter]?.default) === dependency.value;
  const [jsonDraft, setJsonDraft] = useState<{ source: unknown; text: string; error: string | null }>(() => ({
    source: value, text: value === undefined ? "" : JSON.stringify(value, null, 2), error: null,
  }));
  if (jsonDraft.source !== value) {
    setJsonDraft({ source: value, text: value === undefined ? "" : JSON.stringify(value, null, 2), error: null });
  }
  const { text: jsonText, error: jsonError } = jsonDraft;
  const id = `settings-param-${name}`;
  const placeholder =
    defaultValue == null
      ? "Model default"
      : `Default: ${typeof defaultValue === "object" ? JSON.stringify(defaultValue) : String(defaultValue)}`;
  return (
    <div
      className={`space-y-2 ${definition.kind === "object" || definition.kind === "array" ? "sm:col-span-2" : ""}`}
    >
      <Label htmlFor={id}>{definition.label}</Label>
      <p id={`${id}-help`} className="text-muted-foreground text-xs">
        {definition.description}
      </p>
      {definition.kind === "enum" || definition.kind === "boolean" ? (
        <Select
          value={
            value === undefined
              ? "__default"
              : String(
                  (definition.kind === "boolean"
                    ? [true, false]
                    : definition.values
                  )?.findIndex((option) => option === value),
                )
          }
          onValueChange={(next) =>
            onChange(
              name,
              next === "__default"
                ? undefined
                : (definition.kind === "boolean"
                    ? [true, false]
                    : definition.values)?.[Number(next)],
            )
          }
          disabled={!enabled}
        >
          <SelectTrigger id={id} aria-describedby={`${id}-help`}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default">{placeholder}</SelectItem>
            {(definition.kind === "boolean"
              ? [true, false]
              : definition.values
            )?.map((option, index) => (
              <SelectItem key={index} value={String(index)}>
                {String(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : definition.kind === "object" || definition.kind === "array" ? (
        <>
          <Textarea
            id={id}
            aria-describedby={`${id}-help`}
            aria-invalid={Boolean(jsonError)}
            disabled={!enabled}
            spellCheck={false}
            className="font-mono text-xs"
            rows={4}
            placeholder={placeholder}
            value={jsonText}
            onChange={(event) => {
              const text = event.target.value;
              try {
                const parsed: unknown = text.trim()
                  ? JSON.parse(text)
                  : undefined;
                if (
                  parsed !== undefined &&
                  !parameterValueIsValid(parsed, definition)
                )
                  throw new Error(`Enter a JSON ${definition.kind}.`);
                setJsonDraft({ source: parsed, text, error: null });
                onValidityChange(true);
                onChange(name, parsed);
              } catch {
                setJsonDraft({ source: value, text, error: `Enter a valid JSON ${definition.kind}, or leave empty for the default.` });
                onValidityChange(false);
              }
            }}
          />
          {jsonError && (
            <p role="alert" className="text-destructive text-xs">
              {jsonError}
            </p>
          )}
        </>
      ) : (
        <Input
          id={id}
          aria-describedby={`${id}-help`}
          type={definition.kind === "string" ? "text" : "number"}
          value={value === undefined ? "" : String(value)}
          min={definition.min}
          max={definition.max}
          step={definition.kind === "integer" ? 1 : "any"}
          placeholder={placeholder}
          disabled={!enabled}
          onChange={(event) =>
            onChange(
              name,
              event.target.value === ""
                ? undefined
                : definition.kind === "string"
                  ? event.target.value
                  : Number(event.target.value),
            )
          }
        />
      )}
      {!enabled && (
        <p className="text-muted-foreground text-xs">
          {dependency.message ||
            `Requires ${dependency.parameter} = ${String(dependency.value)}`}
        </p>
      )}
    </div>
  );
}
