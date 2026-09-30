import { describe, expect, it } from "vitest";
import type { CatalogModel } from "@/config/inferenceConfig";
import { DEFAULT_MODEL, sanitizeParameters } from "@/config/inferenceConfig";

const model: CatalogModel = {
  key: "gpt-5.4",
  display_name: "GPT-5.4",
  deployment: "gpt-5.4",
  provider: "responses",
  status: "active",
  effective_status: "active",
  parameters: {
    reasoning_effort: {
      kind: "enum",
      label: "Thinking",
      description: "",
      default: "none",
      values: ["none", "low"],
      conflicts_with: [],
    },
    temperature: {
      kind: "number",
      label: "Temperature",
      description: "",
      conflicts_with: ["top_p"],
      depends_on: { parameter: "reasoning_effort", value: "none" },
    },
    top_p: {
      kind: "number",
      label: "Top P",
      description: "",
      conflicts_with: ["temperature"],
      depends_on: { parameter: "reasoning_effort", value: "none" },
    },
  },
};

describe("sanitizeParameters", () => {
  it("uses GPT-5.4 as the missing-catalog fallback", () => {
    expect(DEFAULT_MODEL).toBe("gpt-5.4");
  });
  it("removes unsupported, invalid, dependent, and conflicting values", () => {
    expect(
      sanitizeParameters(
        { reasoning_effort: "low", temperature: 1, old: true },
        model,
      ),
    ).toEqual({
      parameters: { reasoning_effort: "low" },
      removed: 2,
    });
    expect(
      sanitizeParameters(
        { reasoning_effort: "none", temperature: 1, top_p: 0.9 },
        model,
      ).parameters,
    ).toEqual({
      reasoning_effort: "none",
      temperature: 1,
    });
    expect(sanitizeParameters({ temperature: 0.4 }, model).parameters).toEqual({
      temperature: 0.4,
    });
  });
});

describe("dynamic inference UI source contract", () => {
  it("renders catalog parameters and lifecycle state", async () => {
    const source =
      await import("@/features/prompt-management/ui/InferenceSettings?raw").then(
        (module) => module.default,
      );

    expect(source).toContain("Object.entries(currentModel.parameters)");
    expect(source).toContain('model.effective_status !== "active"');
    expect(source).toContain("lifecycleMessage(currentModel)");
    expect(source).toContain("sanitizeParameters(currentParams, model)");
  });

  it("provides an accessible lifecycle warning icon in the prompt library", async () => {
    const popover =
      await import("@/features/inference/ModelLifecyclePopover?raw").then(
        (module) => module.default,
      );
    const hoverCard = await import("@/components/ui/hover-card?raw").then(
      (module) => module.default,
    );
    const appSidebar = await import("@/components/app-sidebar?raw").then(
      (module) => module.default,
    );
    const promptSidebar =
      await import("@/features/prompt-management/ui/sidebar?raw").then(
        (module) => module.default,
      );
    const promptItem =
      await import("@/features/prompt-management/ui/tree-prompt-item?raw").then(
        (module) => module.default,
      );

    expect(popover).toContain("TriangleAlert");
    expect(popover).toContain("<HoverCard openDelay={100} closeDelay={100}>");
    expect(popover).toContain("<HoverCardTrigger asChild>");
    expect(hoverCard).toContain("<HoverCardPrimitive.Portal>");
    expect(popover).toContain("item.model_key === modelKey");
    expect(popover).toContain('className="h-3.5 w-3.5"');
    expect(popover).toContain('className="w-64 space-y-2 p-3 text-xs"');
    expect(popover).toContain("if (!warning) return null");
    expect(appSidebar).not.toContain("ModelLifecyclePopover");
    expect(promptSidebar).not.toContain("ModelLifecyclePopover");
    expect(promptItem).toContain("<ModelLifecyclePopover");
    expect(promptItem).toContain(
      "modelKey={node.prompt.analysis_model ?? undefined}",
    );
  });
});
