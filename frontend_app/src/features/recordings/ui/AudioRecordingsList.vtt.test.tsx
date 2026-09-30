import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AudioRecordingsList } from './AudioRecordingsList';
import type { ReactNode } from 'react';

vi.mock('./AudioRecordingCard', () => ({
  AudioRecordingCard: ({ recording, onPlay, primaryAction }: {
    recording: { id: string };
    onPlay?: () => void;
    primaryAction?: ReactNode;
  }) => <div data-testid={recording.id}>{onPlay ? 'play available' : 'no playback'}{primaryAction}</div>,
}));

describe('uploaded Teams VTT in Files', () => {
  it('shows no audio playback action for a transcript', () => {
    render(<AudioRecordingsList
      recordings={[
        { id: 'vtt', file_path: 'https://example.com/teams.vtt' },
        { id: 'audio', file_path: 'https://example.com/meeting.mp3' },
      ]}
      isLoading={false}
      viewMode="card"
      onViewModeChange={vi.fn()}
      onViewDetails={vi.fn()}
      onPlay={vi.fn()}
      onDownload={vi.fn()}
      onRetryProcessing={vi.fn()}
      onShare={vi.fn()}
      onDelete={vi.fn()}
    />);

    expect(screen.getByTestId('vtt')).toHaveTextContent('no playback');
    expect(screen.getByTestId('audio')).toHaveTextContent('play available');
  });

  it('opens the Teams transcription preview from its card', () => {
    const onViewDetails = vi.fn();
    const teamsMeeting = {
      id: 'event-1', subject: 'Review', organizer: 'Alex',
      startDateTime: '2026-09-24T10:00:00Z', endDateTime: '2026-09-24T11:00:00Z',
      joinUrl: 'https://teams.microsoft.com/l/meetup-join/1', transcriptIds: ['vtt-1'],
    };
    const recording = {
      id: 'teams:event-1', source: 'teams', displayname: 'Review', teamsMeeting,
    };
    render(<AudioRecordingsList
      recordings={[recording]}
      isLoading={false}
      viewMode="card"
      onViewModeChange={vi.fn()}
      onViewDetails={onViewDetails}
      onPlay={vi.fn()}
      onDownload={vi.fn()}
      onRetryProcessing={vi.fn()}
      onShare={vi.fn()}
      onDelete={vi.fn()}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'View transcription' }));
    expect(onViewDetails).toHaveBeenCalledWith(recording);
  });
});
