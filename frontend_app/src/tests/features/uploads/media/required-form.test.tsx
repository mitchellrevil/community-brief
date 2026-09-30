import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMediaUpload } from "@/features/uploads/media/hooks/useMediaUpload";
import {
  createQueryClient,
  createQueryClientWrapper,
} from "@/tests/test-utils";

const fixture = vi.hoisted(() => ({
  upload: vi.fn().mockResolvedValue({ job_id: "job" }),
  templates: [
    {
      id: "template",
      folder_id: "folder",
      name: "Meeting",
      prompts: {},
      pre_session_talking_points: [
        {
          fields: [
            { name: "name", label: "Name", type: "text", required: true },
            {
              name: "confirmed",
              label: "Confirmed",
              type: "checkbox",
              required: true,
            },
            { name: "count", label: "Count", type: "number", required: true },
          ],
        },
      ],
    },
  ],
}));
vi.mock("@/shared/data/templates", () => ({
  useTemplates: () => ({
    folders: [],
    templates: fixture.templates,
    isLoading: false,
    getTemplatesForFolder: () => fixture.templates,
  }),
}));
vi.mock("@/features/recordings/data/api", () => ({
  uploadFile: fixture.upload,
  isUploadCancelledError: () => false,
}));
afterEach(cleanup);
beforeEach(() => fixture.upload.mockClear());

it.each([
  [" ", true, 0, false],
  ["Name", false, 0, false],
  ["Name", true, "", false],
  ["Name", true, 0, true],
] as const)(
  "uses shared required-answer behavior for %j / %j / %j",
  async (name, confirmed, count, accepted) => {
    const { result } = renderHook(() => useMediaUpload(), {
      wrapper: createQueryClientWrapper(createQueryClient()),
    });
    await act(async () => result.current.handleSubcategorySelect("template"));
    act(() => {
      result.current.handlePreSessionInputChange("name", name);
      result.current.handlePreSessionInputChange("confirmed", confirmed);
      result.current.handlePreSessionInputChange("count", count);
    });
    await act(async () =>
      result.current.onSubmit({
        mediaFile: new File(["Meeting notes"], "meeting.txt", {
          type: "text/plain",
        }),
        promptCategory: "folder",
        promptSubcategory: "template",
      }),
    );
    expect(fixture.upload).toHaveBeenCalledTimes(accepted ? 1 : 0);
  },
);
