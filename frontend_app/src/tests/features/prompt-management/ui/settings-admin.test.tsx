import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InferenceCatalog } from "@/config/inferenceConfig";
import { InferenceSettings } from "@/features/prompt-management/ui/InferenceSettings";
import { ModelCatalogEditor } from "@/features/prompt-management/ui/ModelCatalogEditor";
import { httpClient } from "@/shared/api/client/httpClient";

vi.mock("@/shared/api/client/httpClient", () => ({
  httpClient: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const catalog: InferenceCatalog = {
  id: "inference_catalog",
  version: 4,
  default_model: "custom-model",
  etag: '"revision-4"',
  lifecycle_warnings: [],
  models: [
    {
      key: "custom-model",
      display_name: "Custom model",
      deployment: "deployment-blue",
      provider: "responses",
      status: "active",
      effective_status: "active",
      request_defaults: {},
      parameters: {
        max_output_tokens: {
          kind: "integer",
          label: "Output limit",
          description: "Maximum output tokens",
          min: 1,
          max: 32000,
          conflicts_with: [],
        },
        reasoning: {
          kind: "object",
          label: "Reasoning arguments",
          description: "Nested reasoning options",
          conflicts_with: [],
        },
      },
    },
  ],
};

function wrapper(initialCatalog: InferenceCatalog = catalog) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["inference-catalog"], structuredClone(initialCatalog));
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(httpClient.get).mockResolvedValue({
    data: structuredClone(catalog),
    headers: { etag: catalog.etag },
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Settings dialog", () => {
  it("tests the draft deployment without saving and clears stale results after editing", async () => {
    vi.mocked(httpClient.post).mockResolvedValue({
      data: { status: "success", message: "Connection successful." },
    });
    const user = userEvent.setup();
    render(<ModelCatalogEditor />, { wrapper: wrapper() });
    fireEvent.change(screen.getByLabelText("Azure deployment name"), {
      target: { value: "draft-deployment" },
    });
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    expect(
      await screen.findByText("Connection successful."),
    ).toBeInTheDocument();
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.stringContaining("/admin/inference/test-connection"),
      { deployment: "draft-deployment", provider: "responses" },
      { timeout: 25000 },
    );
    expect(httpClient.put).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Azure deployment name"), {
      target: { value: "another-deployment" },
    });
    expect(
      screen.queryByText("Connection successful."),
    ).not.toBeInTheDocument();
  });

  it("shows a recoverable connection failure", async () => {
    vi.mocked(httpClient.post).mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    render(<ModelCatalogEditor />, { wrapper: wrapper() });
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    expect(
      await screen.findByText(/Could not test this deployment/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Test connection" }),
    ).toBeEnabled();
  });

  it("uses the catalogue default and applies changes only after Apply settings", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<InferenceSettings values={{}} onChange={onChange} />, {
      wrapper: wrapper(),
    });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      screen.getByRole("dialog", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Custom model")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Structured review" }));
    const input = screen.getByLabelText("Output limit");
    await user.type(input, "1234");
    expect(input).toHaveValue(1234);
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Apply settings" }));
    expect(onChange).toHaveBeenCalledWith({
      analysis_workflow: "structured_review",
      provider_parameters: { max_output_tokens: 1234 },
    });
  });

  it("discards settings when cancelled", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<InferenceSettings values={{}} onChange={onChange} />, {
      wrapper: wrapper(),
    });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("switch", { name: "Structured review" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      screen.getByRole("switch", { name: "Structured review" }),
    ).not.toBeChecked();
  });

  it("keeps invalid JSON visible across tabs and blocks applying until corrected", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<InferenceSettings values={{}} onChange={onChange} />, {
      wrapper: wrapper(),
    });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(screen.getByLabelText("Reasoning arguments"), {
      target: { value: "{" },
    });
    expect(
      screen.getByRole("button", { name: "Apply settings" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("tab", { name: "Recording" }));
    await user.click(screen.getByRole("tab", { name: "Analysis" }));
    expect(screen.getByLabelText("Reasoning arguments")).toHaveValue("{");
    fireEvent.change(screen.getByLabelText("Reasoning arguments"), {
      target: { value: '{"effort":"high","summary":"auto"}' },
    });
    await user.click(screen.getByRole("button", { name: "Apply settings" }));
    expect(onChange).toHaveBeenCalledWith({
      provider_parameters: { reasoning: { effort: "high", summary: "auto" } },
    });
  });
});

describe("Model catalogue administration", () => {
  it("registers a deployment and detailed JSON arguments with the captured ETag", async () => {
    vi.mocked(httpClient.put).mockImplementation((_url, body) =>
      Promise.resolve({
        data: body,
        headers: { etag: '"revision-5"' },
      }),
    );
    const user = userEvent.setup();
    render(<ModelCatalogEditor />, { wrapper: wrapper() });
    await user.click(screen.getByRole("button", { name: "Add model" }));
    await user.type(screen.getByLabelText("Display name"), "Future model");
    await user.type(screen.getByLabelText("Model key"), "future-model");
    await user.type(
      screen.getByLabelText("Azure deployment name"),
      "future-deployment",
    );
    await user.selectOptions(
      screen.getByLabelText("Default model for new prompts"),
      "future-model",
    );
    await user.click(screen.getByRole("tab", { name: "Advanced" }));
    fireEvent.change(screen.getByLabelText("Default arguments (JSON)"), {
      target: { value: '{"new_option":{"flags":[true,false]},"seed":12}' },
    });
    fireEvent.change(screen.getByLabelText("Editable parameters (JSON)"), {
      target: {
        value:
          '{"seed":{"kind":"integer","label":"Seed","description":"Repeatable output","conflicts_with":[]}}',
      },
    });
    await user.click(
      screen.getByRole("button", { name: "Save model catalogue" }),
    );
    await waitFor(() => expect(httpClient.put).toHaveBeenCalledOnce());
    const [url, rawBody, options] = vi.mocked(httpClient.put).mock.calls[0];
    const body = rawBody as InferenceCatalog;
    expect(url).toContain("/admin/inference/catalog");
    expect(options?.headers).toEqual({ "If-Match": '"revision-4"' });
    expect(body.version).toBe(5);
    expect(body.default_model).toBe("future-model");
    expect(body.models[1].deployment).toBe("future-deployment");
    expect(body.models[1].request_defaults).toEqual({
      new_option: { flags: [true, false] },
      seed: 12,
    });
    expect(body.models[1]).not.toHaveProperty("effective_status");
  });

  it("keeps a conflicted draft and never silently retries with a newer revision", async () => {
    vi.mocked(httpClient.put).mockRejectedValue({
      isAxiosError: true,
      response: { status: 412 },
    });
    const user = userEvent.setup();
    render(<ModelCatalogEditor />, { wrapper: wrapper() });
    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "My draft");
    await user.click(
      screen.getByRole("button", { name: "Save model catalogue" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Someone changed the model catalogue",
    );
    expect(screen.getByLabelText("Display name")).toHaveValue("My draft");
    expect(httpClient.put).toHaveBeenCalledOnce();
  });

  it("opens the current default and saves a default-only change without opening advanced settings", async () => {
    const secondModel = {
      ...structuredClone(catalog.models[0]),
      key: "second-model",
      display_name: "Second model",
      deployment: "deployment-green",
      request_defaults: { reasoning: { effort: "high" } },
    };
    const initialCatalog = {
      ...structuredClone(catalog),
      default_model: secondModel.key,
      models: [...structuredClone(catalog.models), secondModel],
    };
    vi.mocked(httpClient.put).mockImplementation((_url, body) =>
      Promise.resolve({ data: body, headers: { etag: '"revision-5"' } }),
    );
    const user = userEvent.setup();
    render(<ModelCatalogEditor />, { wrapper: wrapper(initialCatalog) });
    expect(screen.getByLabelText("Display name")).toHaveValue("Second model");
    expect(
      screen.queryByLabelText("Default arguments (JSON)"),
    ).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Default model for new prompts"),
      "custom-model",
    );
    await user.click(
      screen.getByRole("button", { name: "Save model catalogue" }),
    );
    await waitFor(() => expect(httpClient.put).toHaveBeenCalledOnce());
    const [, body, options] = vi.mocked(httpClient.put).mock.calls[0];
    expect(body).toMatchObject({
      default_model: "custom-model",
      models: initialCatalog.models.map(
        ({ effective_status: _status, ...model }) => model,
      ),
    });
    expect(options?.headers).toEqual({ "If-Match": '"revision-4"' });
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("uses effective lifecycle status and excludes scheduled retired models from new defaults", async () => {
    const retiredModel = {
      ...structuredClone(catalog.models[0]),
      key: "retired-model",
      display_name: "Retired model",
      deployment: "deployment-retired",
      status: "active" as const,
      effective_status: "retired" as const,
      retires_at: "2026-08-01T00:00:00Z",
      replacement_model_key: "custom-model",
    };
    const initialCatalog = {
      ...structuredClone(catalog),
      models: [...structuredClone(catalog.models), retiredModel],
    };
    const user = userEvent.setup();
    render(<ModelCatalogEditor />, { wrapper: wrapper(initialCatalog) });

    const defaultSelect = screen.getByLabelText("Default model for new prompts");
    expect(
      within(defaultSelect).queryByRole("option", { name: /Retired model/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("retired")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Retired model/ }));
    await user.click(screen.getByRole("tab", { name: "Availability" }));

    expect(screen.getByLabelText("Configured status")).toHaveValue("active");
    expect(screen.getByText(/Effective status: retired\./)).toBeInTheDocument();
    expect(
      screen.getByText(/Lifecycle date: 1 Aug 2026 \(UTC\)\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Replacement: custom-model\./)).toBeInTheDocument();
  });

  it("renders every effective lifecycle status in the model list", () => {
    const statuses = ["active", "deprecated", "disabled", "retired"] as const;
    const initialCatalog = {
      ...structuredClone(catalog),
      default_model: "active-model",
      models: statuses.map((status) => ({
        ...structuredClone(catalog.models[0]),
        key: `${status}-model`,
        display_name: `${status} model`,
        status,
        effective_status: status,
      })),
    };
    render(<ModelCatalogEditor />, { wrapper: wrapper(initialCatalog) });

    const modelList = screen.getByRole("navigation", { name: "Models" });
    for (const status of statuses)
      expect(within(modelList).getByText(status, { exact: true })).toBeInTheDocument();
  });

  it.each(["Default arguments (JSON)", "Editable parameters (JSON)"])(
    "reveals and focuses invalid %s when saving from another tab without issuing a write",
    async (label) => {
      const user = userEvent.setup();
      render(<ModelCatalogEditor />, { wrapper: wrapper() });
      await user.click(screen.getByRole("tab", { name: "Advanced" }));
      fireEvent.change(screen.getByLabelText(label), {
        target: { value: "[1,2]" },
      });
      await user.click(screen.getByRole("tab", { name: "General" }));
      await user.click(
        screen.getByRole("button", { name: "Save model catalogue" }),
      );
      expect(screen.getByRole("tab", { name: "Advanced" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByLabelText(label)).toHaveValue("[1,2]");
      await waitFor(() => expect(screen.getByLabelText(label)).toHaveFocus());
      expect(screen.getByRole("alert")).toHaveTextContent(
        "must be a JSON object",
      );
      expect(httpClient.put).not.toHaveBeenCalled();
    },
  );
});
