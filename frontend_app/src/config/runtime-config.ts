type RuntimeConfig = {
  clientId?: string;
  tenantId?: string;
  apiScope?: string;
  features?: {
    teamsRecordings?: boolean;
  };
};

declare global {
  interface Window {
    __COMMUNITY_BRIEF_CONFIG__?: RuntimeConfig;
  }
}

export function getRuntimeConfig() {
  return typeof window !== "undefined"
    ? window.__COMMUNITY_BRIEF_CONFIG__
    : undefined;
}

export function isTeamsRecordingsEnabled(): boolean {
  return (
    getRuntimeConfig()?.features?.teamsRecordings ??
    import.meta.env.VITE_ENABLE_TEAMS_RECORDINGS === "true"
  );
}
