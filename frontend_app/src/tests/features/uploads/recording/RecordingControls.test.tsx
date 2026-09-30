import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RecordingControls } from "@/features/uploads/recording/ui/RecordingControls";

function createProps() {
  return {
    isRecording: false,
    isPaused: false,
    hasAudio: false,
    isUploading: false,
    isConverting: false,
    isPreparing: false,
    onStart: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onStop: vi.fn(),
    onReset: vi.fn(),
    onContinue: vi.fn(),
    onUpload: vi.fn(),
  };
}

describe("RecordingControls", () => {
  it("portals the mobile action dock outside transformed page content", async () => {
    const user = userEvent.setup();
    const props = createProps();

    render(<RecordingControls {...props} />);

    const dock = screen.getByTestId("mobile-recording-dock");
    expect(dock.parentElement).toBe(document.body);

    await user.click(
      within(dock).getByRole("button", { name: "Start recording" }),
    );
    expect(props.onStart).toHaveBeenCalledTimes(1);
  });

  it("keeps pause and stop as separate full-size mobile actions", async () => {
    const user = userEvent.setup();
    const props = createProps();

    render(<RecordingControls {...props} isRecording />);

    const dock = screen.getByTestId("mobile-recording-dock");
    await user.click(
      within(dock).getByRole("button", { name: "Pause recording" }),
    );
    await user.click(
      within(dock).getByRole("button", { name: "Stop recording" }),
    );

    expect(props.onPause).toHaveBeenCalledTimes(1);
    expect(props.onStop).toHaveBeenCalledTimes(1);
  });

  it("keeps continue, redo, and submit available after capture", async () => {
    const user = userEvent.setup();
    const props = createProps();

    render(<RecordingControls {...props} hasAudio />);

    const dock = screen.getByTestId("mobile-recording-dock");
    await user.click(
      within(dock).getByRole("button", { name: "Continue recording" }),
    );
    await user.click(
      within(dock).getByRole("button", { name: "Redo recording" }),
    );
    await user.click(
      within(dock).getByRole("button", { name: "Submit recording" }),
    );

    expect(props.onContinue).toHaveBeenCalledTimes(1);
    expect(props.onReset).toHaveBeenCalledTimes(1);
    expect(props.onUpload).toHaveBeenCalledTimes(1);
  });
});
