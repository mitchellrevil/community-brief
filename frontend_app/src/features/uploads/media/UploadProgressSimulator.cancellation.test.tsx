import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UploadProgressSimulator } from "./UploadProgressSimulator";

describe("UploadProgressSimulator cancellation", () => {
  it("offers cancellation during transfer and displays a terminal cancelled state", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { rerender } = render(
      <UploadProgressSimulator
        canCancel
        fileName="recording.wav"
        isActive
        onCancel={onCancel}
        progress={{ loaded: 1024, total: 2048, percentage: 50 }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel Upload" }));
    expect(onCancel).toHaveBeenCalledOnce();

    rerender(
      <UploadProgressSimulator
        fileName="recording.wav"
        isCancelled
        isActive={false}
      />,
    );

    expect(screen.getByRole("heading", { name: "Upload Cancelled" })).toBeInTheDocument();
    expect(screen.getByText(/No recording was submitted for processing\./)).toBeInTheDocument();
    expect(screen.queryByText("File uploaded successfully. Processing will begin shortly.")).not.toBeInTheDocument();
  });
});
