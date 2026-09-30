import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ModelLifecyclePopover } from "@/features/inference/ModelLifecyclePopover";

describe("ModelLifecyclePopover", () => {
  it("shows the matching model warning on hover", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["inference-catalog"], {
      id: "inference_catalog",
      version: 1,
      default_model: "gpt-5.4",
      models: [],
      lifecycle_warnings: [
        {
          model_key: "gpt-4.1",
          display_name: "GPT-4.1",
          effective_status: "deprecated",
          replacement_model_key: "gpt-5.4",
        },
      ],
    });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <ModelLifecyclePopover modelKey="gpt-4.1" />
      </QueryClientProvider>,
    );

    await user.hover(
      screen.getByRole("button", {
        name: "GPT-4.1 model lifecycle warning",
      }),
    );

    expect(
      await screen.findByText("This template uses this model."),
    ).toBeVisible();
    expect(screen.getByText("Replacement: gpt-5.4")).toBeVisible();
  });
});
