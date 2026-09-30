import { queryOptions } from "@tanstack/react-query";
import { httpClient } from "@/shared/api/client/httpClient";
import { API_V1_BASE } from "@/shared/api/constants";

export const DEFAULT_MODEL = "gpt-5.4";

export async function testModelConnection(
  model: Pick<CatalogModel, "deployment" | "provider">,
) {
  const response = await httpClient.post<{
    status: "success" | "error";
    message: string;
  }>(
    `${API_V1_BASE}/admin/inference/test-connection`,
    { deployment: model.deployment, provider: model.provider },
    { timeout: 25000 },
  );
  return response.data;
}

export interface CatalogParameter {
  kind:
    | "enum"
    | "number"
    | "integer"
    | "boolean"
    | "string"
    | "object"
    | "array";
  label: string;
  description: string;
  default?: unknown;
  values?: Array<string | number | boolean>;
  min?: number;
  max?: number;
  depends_on?: { parameter: string; value: unknown; message?: string };
  conflicts_with: Array<string>;
}

export interface CatalogModel {
  key: string;
  display_name: string;
  deployment: string;
  provider: "responses" | "chat_completions";
  status: "active" | "deprecated" | "disabled" | "retired";
  effective_status: "active" | "deprecated" | "disabled" | "retired";
  deprecates_at?: string | null;
  retires_at?: string | null;
  replacement_model_key?: string | null;
  parameters: Partial<Record<string, CatalogParameter>>;
  request_defaults?: Record<string, unknown>;
}

export interface LifecycleWarning {
  model_key: string;
  display_name: string;
  effective_status: CatalogModel["effective_status"];
  deprecates_at?: string | null;
  retires_at?: string | null;
  replacement_model_key?: string | null;
}

export interface InferenceCatalog {
  id: "inference_catalog";
  version: number;
  default_model: string;
  models: Array<CatalogModel>;
  lifecycle_warnings: Array<LifecycleWarning>;
  etag?: string;
}

export async function fetchInferenceCatalog(): Promise<InferenceCatalog> {
  const response = await httpClient.get<InferenceCatalog>(
    `${API_V1_BASE}/inference/catalog`,
  );
  return {
    ...response.data,
    etag: response.headers.etag as string | undefined,
  };
}

export async function saveInferenceCatalog(
  catalog: InferenceCatalog,
): Promise<InferenceCatalog> {
  const response = await httpClient.put<InferenceCatalog>(
    `${API_V1_BASE}/admin/inference/catalog`,
    {
      id: catalog.id,
      type: "inference_catalog",
      version: catalog.version + 1,
      default_model: catalog.default_model,
      models: catalog.models.map(
        ({ effective_status: _status, ...model }) => model,
      ),
    },
    { headers: { "If-Match": catalog.etag || "*" } },
  );
  return {
    ...response.data,
    etag: response.headers.etag as string | undefined,
  };
}

export function parameterValueIsValid(
  value: unknown,
  definition: CatalogParameter,
): boolean {
  switch (definition.kind) {
    case "enum":
      return Boolean(definition.values?.some((option) => option === value));
    case "number":
    case "integer":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        (definition.kind !== "integer" || Number.isInteger(value)) &&
        (definition.min == null || value >= definition.min) &&
        (definition.max == null || value <= definition.max)
      );
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return typeof value === "string";
    case "array":
      return Array.isArray(value);
    case "object":
      return (
        typeof value === "object" && value !== null && !Array.isArray(value)
      );
  }
}

export function getInferenceCatalogQuery() {
  return queryOptions({
    queryKey: ["inference-catalog"],
    queryFn: fetchInferenceCatalog,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function sanitizeParameters(
  parameters: Record<string, unknown>,
  model: CatalogModel,
): { parameters: Record<string, unknown>; removed: number } {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameters)) {
    const definition = model.parameters[key];
    if (!definition) continue;
    if (!parameterValueIsValid(value, definition)) continue;
    next[key] = value;
  }
  for (const [key, definition] of Object.entries(model.parameters)) {
    if (!definition) continue;
    const dependency = definition.depends_on;
    if (
      dependency &&
      (next[dependency.parameter] ??
        model.request_defaults?.[dependency.parameter] ??
        model.parameters[dependency.parameter]?.default) !== dependency.value
    )
      delete next[key];
    if (key in next)
      for (const conflict of definition.conflicts_with) delete next[conflict];
  }
  return {
    parameters: next,
    removed: Object.keys(parameters).length - Object.keys(next).length,
  };
}
