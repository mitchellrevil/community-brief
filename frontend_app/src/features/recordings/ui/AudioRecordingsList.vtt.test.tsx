import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AudioRecordingsList } from "./AudioRecordingsList";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
  }: {
    children: ReactNode;
    params: { id: string };
  }) => (
    <a href={`/audio-recordings/${encodeURIComponent(params.id)}?from=files`}>
      {children}
    </a>
  ),
}));

vi.mock("./AudioRecordingCard", () => ({
  AudioRecordingCard: ({
    recording,
    onPlay,
    primaryAction,
  }: {
    recording: { id: string };
    onPlay?: () => void;
    primaryAction?: ReactNode;
  }) => (
    <div data-testid={recording.id}>
      {onPlay ? "play available" : "no playback"}
      {primaryAction}
    </div>
  ),
}));

describe("uploaded Teams VTT in Files", () => {
  it("shows no audio playback action for a transcript", () => {
    render(
      <AudioRecordingsList
        entries={[
          {
            kind: "job",
            id: "vtt",
            recording: {
              id: "vtt",
              file_path: "https://example.com/teams.vtt",
            },
          },
          {
            kind: "job",
            id: "audio",
            recording: {
              id: "audio",
              file_path: "https://example.com/meeting.mp3",
            },
          },
        ]}
        isLoading={false}
        viewMode="card"
        onViewDetails={vi.fn()}
        onPlay={vi.fn()}
        onDownload={vi.fn()}
        onShare={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByTestId("vtt")).toHaveTextContent("no playback");
    expect(screen.getByTestId("audio")).toHaveTextContent("play available");
  });

  it("opens the Teams transcription preview from its card", () => {
    const onViewDetails = vi.fn();
    const teamsMeeting = {
      id: "event-1",
      subject: "Review",
      organizer: "Alex",
      startDateTime: "2026-09-24T10:00:00Z",
      endDateTime: "2026-09-24T11:00:00Z",
      joinUrl: "https://teams.microsoft.com/l/meetup-join/1",
      transcriptIds: ["vtt-1"],
    };
    const recording = {
      id: "teams:event-1",
      displayname: "Review",
      teamsMeeting,
    };
    render(
      <AudioRecordingsList
        entries={[
          {
            kind: "meeting",
            id: recording.id,
            recording,
            meeting: teamsMeeting,
          },
        ]}
        isLoading={false}
        viewMode="card"
        onViewDetails={onViewDetails}
        onPlay={vi.fn()}
        onDownload={vi.fn()}
        onShare={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("link", { name: "View transcription" }),
    ).toHaveAttribute("href", "/audio-recordings/teams%3Aevent-1?from=files");
  });
});
