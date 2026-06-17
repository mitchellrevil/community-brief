import { setPasswordAuthToken } from "../lib/auth-token";
import type { PermissionLevel } from "@/types/permissions";
import type { AuthResponse, RegisterResponse } from "./types";
import { getStorageItem, setStorageItem } from "@/lib/storage";
import { httpClient } from "@/shared/api/client/httpClient";
import {
  AUTH_LOGOUT_API,
  AUTH_ME_API,
  LOGIN_API,
  REGISTER_API,
} from "@/shared/api/constants";


export async function registerUser(
  email: string,
  password: string,
  permission?: PermissionLevel,
): Promise<RegisterResponse> {
  const body: {
    email: string;
    password: string;
    permission?: PermissionLevel;
  } = {
    email,
    password,
  };

  if (permission) {
    body.permission = permission;
  }

  const response = await httpClient.post(REGISTER_API, body);
  return response.data;
}

export async function loginWithCredentials(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const response = await httpClient.post(LOGIN_API, {
    email,
    password,
  });

  const data = response.data as AuthResponse;
  if (data.access_token) {
    setPasswordAuthToken(data.access_token);
  }
  return data;
}

export async function logoutSession(): Promise<void> {
  await httpClient.post(AUTH_LOGOUT_API);
}

export async function getCurrentAuthUser(): Promise<unknown> {
  const response = await httpClient.get(AUTH_ME_API);
  return response.data;
}

export async function fetchMicrosoftProfileImage(
  accessToken: string,
): Promise<string | null> {
  const cached = getStorageItem("ms_profile_image", "");
  if (cached) {
    if (cached.startsWith("data:image")) {
      return cached;
    }

    if (cached.startsWith("blob:")) {
      setStorageItem("ms_profile_image", "");
    } else {
      return cached;
    }
  }

  try {
    const response = await fetch(
      "https://graph.microsoft.com/v1.0/me/photo/$value",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(reader.error ?? new Error("Failed to read image"));
      reader.readAsDataURL(blob);
    });

    setStorageItem("ms_profile_image", dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}
