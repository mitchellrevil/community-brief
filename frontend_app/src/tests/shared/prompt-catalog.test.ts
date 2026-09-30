import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listAllTemplates,
  patchTemplate,
  templatesKeys,
} from "@/shared/data/templates";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
}));

vi.mock("@/shared/api/client/httpClient", () => ({
  httpClient: {
    get: mocks.get,
    patch: mocks.patch,
  },
}));

const template = (index: number) => ({
  id: `template-${index}`,
  name: `Meeting ${index}`,
  folder_id: "folder-1",
  prompts: {},
  pre_session_talking_points: [],
  in_session_talking_points: [],
  analysis_workflow: "standard" as const,
  visibility: "all" as const,
  speaker_identification_enabled: false,
  recording_disclaimer_enabled: false,
  created_at: index,
  updated_at: index,
});

describe("shared prompt catalog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("isolates runtime and management cache identities", () => {
    const runtime = templatesKeys.templates({
      view: "runtime",
      folderId: "folder-1",
      limit: 100,
      offset: 0,
    });
    const management = templatesKeys.templates({
      view: "management",
      folderId: "folder-1",
      limit: 100,
      offset: 0,
    });

    expect(runtime).not.toEqual(management);
    expect(runtime).toContain("runtime");
    expect(management).toContain("management");
  });

  it("includes folder, item, and pagination in query identity", () => {
    expect(
      templatesKeys.templates({
        view: "runtime",
        folderId: "folder-2",
        limit: 25,
        offset: 50,
      }),
    ).toContainEqual({ folderId: "folder-2", limit: 25, offset: 50 });
    expect(templatesKeys.template("runtime", "template-7")).toContain(
      "template-7",
    );
  });

  it("collects every runtime page without duplicates or a 100-item ceiling", async () => {
    const items = Array.from({ length: 107 }, (_, index) => template(index));
    items[105].name = "Standard Meeting";
    items[106].name = "Ward Surgery";
    mocks.get.mockImplementation((_url, config) => {
      const offset = config.params.offset as number;
      const page = items.slice(offset, offset + 100);
      return Promise.resolve({
        data: {
          items: page,
          total: 107,
          limit: 100,
          offset,
          has_more: offset + page.length < 107,
        },
      });
    });

    const result = await listAllTemplates("runtime");

    expect(result).toHaveLength(107);
    expect(new Set(result.map((item) => item.id)).size).toBe(107);
    expect(result.map((item) => item.name)).toEqual(
      expect.arrayContaining(["Standard Meeting", "Ward Surgery"]),
    );
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.get.mock.calls.map(([, config]) => config.params)).toEqual([
      { view: "runtime", folder_id: undefined, limit: 100, offset: 0 },
      { view: "runtime", folder_id: undefined, limit: 100, offset: 100 },
    ]);
  });

  it("keeps runtime callers runtime-scoped on every page", async () => {
    mocks.get.mockResolvedValue({
      data: {
        items: [],
        total: 0,
        limit: 100,
        offset: 0,
        has_more: false,
      },
    });

    await listAllTemplates("runtime", "folder-1");

    expect(mocks.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: expect.objectContaining({
          view: "runtime",
          folder_id: "folder-1",
        }),
      }),
    );
    expect(JSON.stringify(mocks.get.mock.calls)).not.toContain("management");
  });

  it("moves a template through the normal partial PATCH", async () => {
    mocks.patch.mockResolvedValue({ data: template(1) });

    await patchTemplate("template/1", { folder_id: "folder-2" });

    expect(mocks.patch).toHaveBeenCalledWith(
      expect.stringContaining("template%2F1"),
      { folder_id: "folder-2" },
    );
  });
});
