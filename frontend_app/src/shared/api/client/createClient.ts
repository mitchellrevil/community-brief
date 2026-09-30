/**
 * HTTP Client Factory
 *
 * Creates configured axios instances with auth and error interceptors attached.
 */
import axios from "axios";


import { createAuthInterceptor } from "./interceptors/authInterceptor";
import type { AxiosInstance, CreateAxiosDefaults } from "axios";

export interface CreateClientOptions {
  baseURL?: string;
  timeout?: number;
  withCredentials?: boolean;
  headers?: Record<string, string>;
}

export function createClient(options: CreateClientOptions = {}): AxiosInstance {
  const axiosConfig: CreateAxiosDefaults = {
    baseURL: options.baseURL,
    timeout: options.timeout,
    withCredentials: options.withCredentials ?? true,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  const client = axios.create(axiosConfig);

  const authInterceptor = createAuthInterceptor({
    retryClient: client,
  });

  client.interceptors.request.use(authInterceptor.request);
  client.interceptors.response.use(
    (response) => response,
    authInterceptor.responseError,
  );

  return client;
}
