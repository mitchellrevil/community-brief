import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TalkingPointsPanel } from "@/features/uploads/recording/TalkingPointsPanel";

const talkingPoints = [
  {
    name: "Welcome and introductions",
    type: "text",
    value: "Welcome everyone and explain what the meeting will cover.",
  },
  {
    name: "Actions and owners",
    type: "text",
    value: "Confirm each action and who owns it.",
  },
] as any;

describe("TalkingPointsPanel", () => {
  it("exposes dedicated mobile previous and next controls", async () => {
    const user = userEvent.setup();
    const onPrevious = vi.fn();
    const onNext = vi.fn();

    render(
      <TalkingPointsPanel
        talkingPoints={talkingPoints}
        currentIndex={0}
        onPrevious={onPrevious}
        onNext={onNext}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Previous talking point" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Next talking point" }),
    );

    expect(onPrevious).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("keeps the no-talking-points state readable", () => {
    render(
      <TalkingPointsPanel
        talkingPoints={[]}
        currentIndex={0}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    expect(
      screen.getByText("No talking points available for this meeting type."),
    ).toBeInTheDocument();
  });
});
