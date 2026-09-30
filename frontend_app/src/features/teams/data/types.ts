export interface TeamsMeeting {
  id: string;
  subject: string;
  organizer: string;
  startDateTime: string;
  endDateTime: string;
  joinUrl: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  organizerEmail?: string;
  onlineMeetingId?: string;
  transcriptIds?: Array<string>;
  recordingIds?: Array<string>;
  transcriptAccessDenied?: boolean;
}

export interface TeamsTranscript {
  id: string;
  meetingId: string;
  createdDateTime: string;
}

export interface TeamsTranscriptBundle {
  file: File;
  transcriptCount: number;
  hasSpeakerAttribution: boolean;
  source: "transcript" | "recording";
}
