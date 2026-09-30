import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthConfig } from "./msal";

describe("resolveAuthConfig", () => {
  afterEach(() => {
    delete window.__COMMUNITY_BRIEF_CONFIG__;
  });

  it("prefers deployment-time authentication values", () => {
    window.__COMMUNITY_BRIEF_CONFIG__ = {
      clientId: "dev-client-id",
      tenantId: "dev-tenant-id",
      apiScope: "api://dev-client-id/access_as_user",
    };

    expect(resolveAuthConfig()).toEqual({
      clientId: "dev-client-id",
      tenantId: "dev-tenant-id",
      apiScope: "api://dev-client-id/access_as_user",
    });
  });
});
