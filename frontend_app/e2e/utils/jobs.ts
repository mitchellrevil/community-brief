import { apiV1Path, backendApiV1Url } from './config';
import type { APIRequestContext, APIResponse } from '@playwright/test';


export interface CreatedJob {
  id: string;
  file_name?: string;
  displayname?: string;
  status?: string;
}

export async function createJobViaUpload(request: APIRequestContext, opts: {
  filename: string;
  content?: string;
}): Promise<CreatedJob> {
  const content = opts.content ?? `e2e upload ${Date.now()}`;

  const res = await request.post(backendApiV1Url('/upload/job'), {
    multipart: {
      file: {
        name: opts.filename,
        mimeType: 'text/plain',
        buffer: Buffer.from(content, 'utf8'),
      },
    },
    timeout: 60_000,
  });

  if (!res.ok()) {
    throw new Error(`Failed to create job via ${apiV1Path('/upload/job')}: HTTP ${res.status()} ${await safeText(res)}`);
  }

  const json: any = await res.json();
  if (!json?.id) {
    throw new Error(`Unexpected create job response (missing id): ${JSON.stringify(json).slice(0, 200)}`);
  }

  return json as CreatedJob;
}

export async function shareJobApi(
  request: APIRequestContext,
  jobId: string,
  args: {
    shared_user_email: string;
    permission_level: 'view' | 'edit' | 'admin';
    message?: string;
  },
) {
  const res = await request.post(backendApiV1Url(`/jobs/${encodeURIComponent(jobId)}/share`), {
    data: args,
    timeout: 30_000,
  });

  if (!res.ok()) {
    throw new Error(`Failed to share job: HTTP ${res.status()} ${await safeText(res)}`);
  }

  return res.json();
}

export async function unshareJobApi(request: APIRequestContext, jobId: string, targetUserEmail: string) {
  const res = await request.delete(backendApiV1Url(`/jobs/${encodeURIComponent(jobId)}/share/${encodeURIComponent(targetUserEmail)}`), {
    timeout: 30_000,
  });

  if (!res.ok()) {
    throw new Error(`Failed to unshare job: HTTP ${res.status()} ${await safeText(res)}`);
  }

  return res.json();
}

export async function patchJobDisplayNameApi(request: APIRequestContext, jobId: string, displayname: string): Promise<APIResponse> {
  return request.patch(backendApiV1Url(`/jobs/${encodeURIComponent(jobId)}`), {
    data: { displayname },
    timeout: 30_000,
  });
}

export async function softDeleteJobApi(request: APIRequestContext, jobId: string): Promise<APIResponse> {
  return request.delete(backendApiV1Url(`/jobs/${encodeURIComponent(jobId)}`), {
    timeout: 30_000,
  });
}

async function safeText(res: APIResponse): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 300);
  } catch {
    return '';
  }
}
