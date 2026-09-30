import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Circle, LoaderCircle, Plus, Settings } from "lucide-react";
import { toast } from "sonner";
import type { CatalogModel, InferenceCatalog } from "@/config/inferenceConfig";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  getInferenceCatalogQuery,
  saveInferenceCatalog,
  testModelConnection,
} from "@/config/inferenceConfig";

const selectClass =
  "border-input bg-background h-11 w-full min-w-0 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-10";

type JsonField = "defaults" | "parameters";

function ModelStatusBadge({ status }: { status: CatalogModel["effective_status"] }) {
  const tone =
    status === "active"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      : status === "deprecated"
        ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : "bg-muted text-muted-foreground";
  return (
    <Badge
      variant="secondary"
      className={`${tone} gap-1.5 rounded-full border-0 capitalize`}
    >
      <Circle className="size-1.5 fill-current" aria-hidden="true" />
      {status}
    </Badge>
  );
}

function formatLifecycleDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function lifecycleSummary(model: CatalogModel): string {
  const lifecycleDate = [model.deprecates_at, model.retires_at]
    .filter((value): value is string => Boolean(value))
    .sort()[0];
  const configuredStatus =
    model.status !== model.effective_status
      ? ` Configured status is ${model.status}; lifecycle dates make it ${model.effective_status}.`
      : "";
  const date = lifecycleDate
    ? ` Lifecycle date: ${formatLifecycleDate(lifecycleDate)} (UTC).`
    : "";
  const replacement = model.replacement_model_key
    ? ` Replacement: ${model.replacement_model_key}.`
    : "";
  return `Effective status: ${model.effective_status}.${configuredStatus}${date}${replacement}`;
}

class CatalogJsonError extends Error {
  constructor(
    message: string,
    readonly field: JsonField,
  ) {
    super(message);
  }
}

function parseObject(
  text: string,
  label: string,
  field: JsonField,
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new CatalogJsonError(`${label} must be valid JSON.`, field);
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CatalogJsonError(`${label} must be a JSON object.`, field);
  return value as Record<string, unknown>;
}

function errorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    if (error.response?.status === 412)
      return "Someone changed the model catalogue. Reload it before saving again. Your draft is still here.";
    const detail: unknown = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
      return detail
        .map(
          (item: { loc?: Array<string | number>; msg?: string }) =>
            `${item.loc?.slice(1).join(" · ")}: ${item.msg}`,
        )
        .join(". ");
  }
  return error instanceof Error
    ? error.message
    : "Could not save the model catalogue.";
}

export function ModelCatalogDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:bg-muted/60 hover:text-foreground h-8 gap-1.5 rounded-lg px-2.5 font-normal"
          title="Manage models"
        >
          <Settings className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Models
        </Button>
      </DialogTrigger>
      <DialogContent className="h-[96dvh] max-h-[96dvh] gap-0 overflow-hidden p-0 pt-0 pb-0 sm:m-0 sm:h-[min(780px,90dvh)] sm:max-h-[90dvh] sm:max-w-[1040px] sm:p-0 sm:pt-0 sm:pb-0 [&>div[aria-hidden]]:hidden">
        <DialogHeader className="static mx-0 shrink-0 border-b px-4 py-4 pr-14 text-left sm:px-6 sm:py-5 sm:pr-14">
          <DialogTitle>Manage models</DialogTitle>
          <DialogDescription>
            Choose the default for new prompts and manage available models.
          </DialogDescription>
        </DialogHeader>
        <ModelCatalogEditor />
      </DialogContent>
    </Dialog>
  );
}

export function ModelCatalogEditor() {
  const query = useQuery(getInferenceCatalogQuery());
  if (query.isPending)
    return (
      <p
        role="status"
        className="text-muted-foreground p-8 text-center text-sm"
      >
        Loading model catalogue…
      </p>
    );
  if (query.isError)
    return (
      <div role="alert" className="space-y-3 p-6">
        <p>Could not load the model catalogue.</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  return <CatalogForm initial={query.data} />;
}

function CatalogForm({ initial }: { initial: InferenceCatalog }) {
  const queryClient = useQueryClient();
  // Capture the revision with the draft; background refreshes must not change its ETag.
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const [selected, setSelected] = useState(() =>
    Math.max(
      0,
      initial.models.findIndex((item) => item.key === initial.default_model),
    ),
  );
  const [activeTab, setActiveTab] = useState("general");
  const [focusField, setFocusField] = useState<JsonField | null>(null);
  const defaultsRef = useRef<HTMLTextAreaElement>(null);
  const parametersRef = useRef<HTMLTextAreaElement>(null);
  const [defaultsJson, setDefaultsJson] = useState(() =>
    JSON.stringify(
      initial.models.at(selected)?.request_defaults || {},
      null,
      2,
    ),
  );
  const [parametersJson, setParametersJson] = useState(() =>
    JSON.stringify(initial.models.at(selected)?.parameters || {}, null, 2),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [persistedKeys, setPersistedKeys] = useState(
    () => new Set(initial.models.map((model) => model.key)),
  );
  const model = draft.models.at(selected);
  const [testing, setTesting] = useState(false);
  const [connection, setConnection] = useState<{
    deployment: string;
    provider: string;
    status: "success" | "error";
    message: string;
  } | null>(null);

  async function checkConnection() {
    if (!model || testing) return;
    const { deployment, provider } = model;
    setTesting(true);
    setConnection(null);
    try {
      const result = await testModelConnection({ deployment, provider });
      setConnection({ ...result, deployment, provider });
    } catch {
      setConnection({
        deployment,
        provider,
        status: "error",
        message:
          "Could not test this deployment. Check your connection and try again.",
      });
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    if (!focusField || activeTab !== "advanced" || saving) return;
    // Radix mounts the newly active panel after its presence update.
    const frame = requestAnimationFrame(() => {
      const input = focusField === "defaults" ? defaultsRef : parametersRef;
      input.current?.focus();
      setFocusField(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusField, activeTab, saving]);

  function showError(cause: unknown) {
    setError(errorMessage(cause));
    if (cause instanceof CatalogJsonError) {
      setActiveTab("advanced");
      setFocusField(cause.field);
    }
  }

  function updateModel(change: Partial<CatalogModel>) {
    setDraft((current) => ({
      ...current,
      models: current.models.map((item, index) =>
        index === selected ? { ...item, ...change } : item,
      ),
    }));
    setDirty(true);
    setError(null);
  }

  function applyJson(): InferenceCatalog {
    const requestDefaults = parseObject(
      defaultsJson,
      "Default arguments",
      "defaults",
    );
    const parameters = parseObject(
      parametersJson,
      "Editable parameters",
      "parameters",
    ) as CatalogModel["parameters"];
    return {
      ...draft,
      models: draft.models.map((item, index) =>
        index === selected
          ? { ...item, request_defaults: requestDefaults, parameters }
          : item,
      ),
    };
  }

  function selectModel(index: number) {
    try {
      const next = applyJson();
      setDraft(next);
      setSelected(index);
      setDefaultsJson(
        JSON.stringify(next.models.at(index)?.request_defaults || {}, null, 2),
      );
      setParametersJson(
        JSON.stringify(next.models.at(index)?.parameters || {}, null, 2),
      );
      setError(null);
    } catch (cause) {
      showError(cause);
    }
  }

  function addModel() {
    try {
      const next = applyJson();
      setDraft({
        ...next,
        models: [
          ...next.models,
          {
            key: "",
            display_name: "",
            deployment: "",
            provider: "responses",
            status: "active",
            effective_status: "active",
            parameters: {},
            request_defaults: {},
          },
        ],
      });
      setSelected(next.models.length);
      setActiveTab("general");
      setDefaultsJson("{}");
      setParametersJson("{}");
      setDirty(true);
      setError(null);
    } catch (cause) {
      showError(cause);
    }
  }

  async function reload() {
    setSaving(true);
    try {
      const latest = await queryClient.fetchQuery({
        ...getInferenceCatalogQuery(),
        staleTime: 0,
      });
      setDraft(structuredClone(latest));
      setPersistedKeys(new Set(latest.models.map((item) => item.key)));
      const defaultIndex = Math.max(
        0,
        latest.models.findIndex((item) => item.key === latest.default_model),
      );
      setSelected(defaultIndex);
      setActiveTab("general");
      setDefaultsJson(
        JSON.stringify(
          latest.models.at(defaultIndex)?.request_defaults || {},
          null,
          2,
        ),
      );
      setParametersJson(
        JSON.stringify(
          latest.models.at(defaultIndex)?.parameters || {},
          null,
          2,
        ),
      );
      setDirty(false);
      setError(null);
    } catch (cause) {
      showError(cause);
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const next = applyJson();
      if (
        next.models.some(
          (item) =>
            !item.key.trim() ||
            !item.display_name.trim() ||
            !item.deployment.trim(),
        )
      )
        throw new Error(
          "Give every model a key, display name and deployment name.",
        );
      if (
        new Set(next.models.map((item) => item.key)).size !== next.models.length
      )
        throw new Error("Model keys must be unique.");
      const saved = await saveInferenceCatalog(next);
      queryClient.setQueryData(getInferenceCatalogQuery().queryKey, saved);
      setDraft(saved);
      setPersistedKeys(new Set(saved.models.map((item) => item.key)));
      setDirty(false);
      toast.success("Model catalogue saved");
    } catch (cause) {
      showError(cause);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <fieldset
        disabled={saving}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <legend className="sr-only">Model catalogue settings</legend>
        <div className="bg-muted/30 shrink-0 border-b px-4 py-3 sm:px-6 sm:py-4">
          <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(200px,300px)] sm:gap-6">
            <div className="relative space-y-1 pl-9">
              <Settings
                className="absolute top-0.5 left-0 size-5"
                aria-hidden="true"
              />
              <Label htmlFor="catalog-default" className="font-semibold">
                Default model for new prompts
              </Label>
              <p
                id="catalog-default-help"
                className="text-muted-foreground text-xs"
              >
                Applied automatically when a prompt is created.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                id="catalog-default"
                aria-describedby="catalog-default-help"
                className={selectClass}
                value={draft.default_model}
                onChange={(event) => {
                  setDraft({ ...draft, default_model: event.target.value });
                  setDirty(true);
                  setError(null);
                }}
              >
                {draft.models
                  .filter(
                    (item) =>
                      item.key &&
                      (item.effective_status === "active" ||
                        item.key === draft.default_model),
                  )
                  .map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.display_name || item.key}
                      {item.effective_status !== "active"
                        ? ` (${item.effective_status})`
                        : ""}
                    </option>
                  ))}
              </select>
              {draft.default_model !== initial.default_model && dirty && (
                <Badge variant="outline" className="shrink-0">
                  Unsaved
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden md:grid-cols-[224px_minmax(0,1fr)] md:grid-rows-1">
          <div className="bg-muted/10 flex min-h-0 flex-col border-b md:border-r md:border-b-0">
            <div className="flex shrink-0 items-end gap-3 p-3 md:items-center md:justify-between">
              <h3 className="hidden text-sm font-semibold md:block">
                Models{" "}
                <span className="text-muted-foreground font-normal">
                  ({draft.models.length})
                </span>
              </h3>
              <div className="min-w-0 flex-1 space-y-1 md:hidden">
                <Label htmlFor="catalog-selected" className="text-xs">
                  Model to edit
                </Label>
                <select
                  id="catalog-selected"
                  className={selectClass}
                  value={selected}
                  onChange={(event) => selectModel(Number(event.target.value))}
                >
                  {draft.models.map((item, index) => (
                    <option key={index} value={index}>
                      {item.display_name || "New model"}
                      {item.key === draft.default_model ? " · Default" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-11 shrink-0 md:h-9"
                onClick={addModel}
              >
                <Plus className="mr-1.5 size-4" aria-hidden="true" />
                Add model
              </Button>
            </div>
            <nav
              className="hidden min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 pb-3 md:block"
              aria-label="Models"
            >
              {draft.models.map((item, index) => (
                <button
                  type="button"
                  key={index}
                  aria-pressed={selected === index}
                  onClick={() => selectModel(index)}
                  className={`focus-visible:ring-ring flex w-full gap-3 rounded-md border px-3 py-3 text-left text-sm focus-visible:ring-2 focus-visible:outline-none ${selected === index ? "bg-primary/5 border-primary/20 shadow-sm" : "hover:bg-muted border-transparent"}`}
                >
                  <img
                    src="/openai-symbol.svg"
                    alt=""
                    className="mt-0.5 size-6 shrink-0 dark:invert"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium break-words">
                      {item.display_name || "New model"}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-2">
                      <ModelStatusBadge status={item.effective_status} />
                      {item.key === draft.default_model && (
                        <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-medium">
                          Default
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              ))}
            </nav>
          </div>
          {model && (
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex min-h-0 min-w-0 flex-col overflow-hidden"
            >
              <div className="shrink-0 border-b px-4 pt-3 pb-2 sm:px-6 sm:pt-5 sm:pb-3">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span className="bg-muted/30 flex size-11 shrink-0 items-center justify-center rounded-full border">
                    <img
                      src="/openai-symbol.svg"
                      alt="OpenAI"
                      className="size-6 dark:invert"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="min-w-0 text-lg font-semibold break-words">
                      {model.display_name || "New model"}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground text-xs">
                        Azure OpenAI
                      </span>
                      <ModelStatusBadge status={model.effective_status} />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={testing || !model.deployment.trim()}
                    onClick={() => void checkConnection()}
                  >
                    {testing && (
                      <LoaderCircle
                        className="mr-2 size-4 animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    {testing ? "Testing…" : "Test connection"}
                  </Button>
                </div>
                {connection &&
                  connection.deployment === model.deployment &&
                  connection.provider === model.provider && (
                    <p
                      role="status"
                      className={`mb-3 text-sm ${connection.status === "success" ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}
                    >
                      {connection.message}
                    </p>
                  )}
                <TabsList
                  aria-label="Model configuration"
                  className="[&>button[data-state=active]]:border-foreground grid h-auto w-full grid-cols-3 rounded-none bg-transparent p-0 md:w-fit [&>button]:rounded-none [&>button]:border-b-2 [&>button]:border-transparent [&>button]:bg-transparent [&>button]:px-4 [&>button]:shadow-none"
                >
                  <TabsTrigger value="general" className="min-h-10 md:min-h-8">
                    General
                  </TabsTrigger>
                  <TabsTrigger
                    value="availability"
                    className="min-h-10 md:min-h-8"
                  >
                    Availability
                  </TabsTrigger>
                  <TabsTrigger value="advanced" className="min-h-10 md:min-h-8">
                    Advanced
                  </TabsTrigger>
                </TabsList>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
                <TabsContent value="general" className="mt-0 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="catalog-name">Display name</Label>
                      <Input
                        id="catalog-name"
                        value={model.display_name}
                        onChange={(event) =>
                          updateModel({ display_name: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="catalog-key">Model key</Label>
                      <Input
                        id="catalog-key"
                        disabled={selected < persistedKeys.size}
                        value={model.key}
                        onChange={(event) =>
                          updateModel({ key: event.target.value })
                        }
                      />
                      <p className="text-muted-foreground text-xs">
                        Permanent identifier used by templates.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="catalog-deployment">
                        Azure deployment name
                      </Label>
                      <Input
                        id="catalog-deployment"
                        value={model.deployment}
                        onChange={(event) =>
                          updateModel({ deployment: event.target.value })
                        }
                      />
                      <p className="text-muted-foreground text-xs">
                        Use an existing deployment on the configured endpoint.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="catalog-provider">Request format</Label>
                      <select
                        id="catalog-provider"
                        className={selectClass}
                        value={model.provider}
                        onChange={(event) =>
                          updateModel({
                            provider: event.target
                              .value as CatalogModel["provider"],
                          })
                        }
                      >
                        <option value="responses">Responses</option>
                        <option value="chat_completions">
                          Chat completions
                        </option>
                      </select>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="availability" className="mt-0 space-y-5">
                  <div>
                    <h4 className="text-sm font-semibold">Availability</h4>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Control when templates can use this model.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="catalog-status">Configured status</Label>
                      <select
                        id="catalog-status"
                        className={selectClass}
                        value={model.status}
                        onChange={(event) =>
                          updateModel({
                            status: event.target
                              .value as CatalogModel["status"],
                          })
                        }
                      >
                        <option value="active">Active</option>
                        <option value="deprecated">Deprecated</option>
                        <option value="disabled">Disabled</option>
                        <option value="retired">Retired</option>
                      </select>
                      <p
                        role="status"
                        className="text-muted-foreground text-xs"
                      >
                        {lifecycleSummary(model)}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="catalog-replacement">
                        Replacement model
                      </Label>
                      <select
                        id="catalog-replacement"
                        className={selectClass}
                        value={model.replacement_model_key || ""}
                        onChange={(event) =>
                          updateModel({
                            replacement_model_key: event.target.value || null,
                          })
                        }
                      >
                        <option value="">No replacement</option>
                        {draft.models
                          .filter((item) => item.key && item.key !== model.key)
                          .map((item) => (
                            <option key={item.key} value={item.key}>
                              {item.display_name || item.key}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="catalog-deprecation">
                        Deprecation date (UTC)
                      </Label>
                      <Input
                        id="catalog-deprecation"
                        type="date"
                        value={model.deprecates_at?.slice(0, 10) || ""}
                        onChange={(event) =>
                          updateModel({
                            deprecates_at: event.target.value
                              ? `${event.target.value}T00:00:00Z`
                              : null,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="catalog-retirement">
                        Retirement date (UTC)
                      </Label>
                      <Input
                        id="catalog-retirement"
                        type="date"
                        value={model.retires_at?.slice(0, 10) || ""}
                        onChange={(event) =>
                          updateModel({
                            retires_at: event.target.value
                              ? `${event.target.value}T00:00:00Z`
                              : null,
                          })
                        }
                      />
                    </div>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Deprecated models remain usable by existing templates.
                    Disabled and retired models cannot start new analysis or
                    reprocessing. Work already running can finish. Choose
                    another default before retiring the default model.
                  </p>
                </TabsContent>
                <TabsContent value="advanced" className="mt-0 space-y-6">
                  <p className="bg-muted/30 text-muted-foreground rounded-md border p-3 text-sm">
                    Models use the existing Azure endpoint and its configured
                    credentials. Changes apply to all templates after saving.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-defaults">
                      Default arguments (JSON)
                    </Label>
                    <p
                      id="catalog-defaults-help"
                      className="text-muted-foreground text-xs"
                    >
                      Full model request arguments, including nested objects and
                      arrays. Template overrides merge into these defaults.
                      Content, credentials, tools and streaming are managed by
                      Community Brief.
                    </p>
                    <Textarea
                      ref={defaultsRef}
                      id="catalog-defaults"
                      aria-describedby="catalog-defaults-help"
                      rows={7}
                      spellCheck={false}
                      className="min-h-40 resize-y overscroll-contain font-mono text-xs"
                      value={defaultsJson}
                      onChange={(event) => {
                        setDefaultsJson(event.target.value);
                        setDirty(true);
                      }}
                      placeholder={
                        '{\n  "reasoning": { "effort": "high" },\n  "max_output_tokens": 8000\n}'
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-parameters">
                      Editable parameters (JSON)
                    </Label>
                    <p
                      id="catalog-parameters-help"
                      className="text-muted-foreground text-xs"
                    >
                      Define the controls template editors can override.
                      Supported kinds: enum, number, integer, boolean, string,
                      object and array. Leave empty to use only the default
                      arguments.
                    </p>
                    <Textarea
                      ref={parametersRef}
                      id="catalog-parameters"
                      aria-describedby="catalog-parameters-help"
                      rows={9}
                      spellCheck={false}
                      className="min-h-40 resize-y overscroll-contain font-mono text-xs"
                      value={parametersJson}
                      onChange={(event) => {
                        setParametersJson(event.target.value);
                        setDirty(true);
                      }}
                    />
                    <details className="text-muted-foreground text-xs">
                      <summary className="cursor-pointer py-1 font-medium">
                        Parameter definition example
                      </summary>
                      <pre className="bg-muted mt-2 overflow-x-auto rounded-md p-3">
                        {JSON.stringify(
                          {
                            max_output_tokens: {
                              kind: "integer",
                              label: "Output limit",
                              description: "Maximum output tokens.",
                              default: 8000,
                              min: 1,
                              max: 32000,
                              conflicts_with: [],
                            },
                            reasoning: {
                              kind: "object",
                              label: "Reasoning",
                              description: "Detailed reasoning arguments.",
                              default: { effort: "high" },
                              conflicts_with: [],
                            },
                          },
                          null,
                          2,
                        )}
                      </pre>
                      <p className="mt-2">
                        Use values for enums, min and max for numbers,
                        depends_on for a required parameter value, and
                        conflicts_with for mutually exclusive parameters.
                        Parameter defaults describe the model default; Default
                        arguments are actually sent.
                      </p>
                    </details>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>
      </fieldset>
      <div className="bg-background shrink-0 space-y-3 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
        {error && (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/5 text-destructive max-h-24 overflow-y-auto overscroll-contain rounded-md border p-3 text-sm"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <span role="status" className="text-muted-foreground text-xs">
            {dirty
              ? "Unsaved catalogue changes"
              : `Catalogue version ${draft.version}`}
          </span>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              variant="outline"
              className="h-11 flex-1 sm:h-10 sm:flex-none"
              disabled={saving}
              onClick={() => void reload()}
            >
              {dirty ? "Discard and reload" : "Reload"}
            </Button>
            <Button
              className="h-11 flex-1 sm:h-10 sm:flex-none"
              disabled={saving || !dirty}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save model catalogue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
