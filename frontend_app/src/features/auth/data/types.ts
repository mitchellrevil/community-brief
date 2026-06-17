import type { PermissionLevel } from "@/types/permissions";

export interface AuthSessionUser {
  user_id: string;
  email: string;
  permission: PermissionLevel;
  transcription_method?: "AZURE_AI_SPEECH" | "GPT4O_AUDIO";
  business_unit_id?: string | null;
  business_unit_ids?: Array<string>;
  business_unit_names?: Array<string>;
  auth_source?: "entra" | "password";
}

export type AuthSessionState = AuthSessionUser | null;

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

export interface RegisterResponse {
  status: number;
  message: string;
}

export interface AuthResponse {
  status: number;
  message: string;
  access_token: string;
  token_type: string;
  permission?: string;
  user?: {
    id?: string;
    email?: string;
    full_name?: string;
    permission?: string;
  };
}
