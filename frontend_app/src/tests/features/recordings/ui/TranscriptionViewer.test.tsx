import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranscriptionViewer } from "@/features/recordings/ui/TranscriptionViewer";

vi.mock("@/features/recordings/data/queries", () => ({
  useUpdateTranscriptionSpeakerNamesMutation: () => ({
    mutateAsync: vi.fn(),
  }),
}));

describe("TranscriptionViewer", () => {
  it("shows unattributed Teams captions without inventing Speaker 1", () => {
    render(
      <TranscriptionViewer
        canEdit={false}
        transcriptionText={[
          "WEBVTT", "",
          "00:00:01.000 --> 00:00:02.000", "Good morning", "",
          "00:00:03.000 --> 00:00:04.000", "Hello",
        ].join("\n")}
      />,
    );

    expect(screen.getByText(/no speaker labels/i)).toBeInTheDocument();
    expect(screen.queryByText("Speaker 1")).not.toBeInTheDocument();
    expect(screen.getByText("Good morning")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
