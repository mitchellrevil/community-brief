import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportUsersCSV } from "@/features/users/data/api";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("@/shared/api/client/httpClient", () => ({
  httpClient: { post },
}));

describe("exportUsersCSV", () => {
  beforeEach(() => {
    post.mockReset();
  });

  it("delegates filtered exports to the server instead of browser-loaded pages", async () => {
    const expectedBlob = new Blob(["ID,Email\\nu12,late@example.com\\n"], { type: "text/csv" });
    post.mockResolvedValue({ data: expectedBlob });

    const result = await exportUsersCSV({
      query: "late",
      permission: "Editor",
    });

    expect(result).toBe(expectedBlob);
    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/analytics\/export\/users\/csv$/),
      { filters: { query: "late", permission: "Editor" } },
      { responseType: "blob" },
    );
  });
});
