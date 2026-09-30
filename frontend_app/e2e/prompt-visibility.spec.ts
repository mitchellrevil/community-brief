
import { expect, test } from "./fixtures";
import { e2eAuthHeaders } from "./utils/auth-state";
import { backendApiV1Url, storageStatePath } from "./utils/config";
import { e2eName } from "./utils/ids";
import type { APIRequestContext } from "@playwright/test";

let adminContext: APIRequestContext;
let userContext: APIRequestContext;
let editorContext: APIRequestContext;
let folderId: string;
let editorsOnlyTemplateId: string;
let disabledTemplateId: string;
let allowlistedTemplateId: string;
let regularUserId: string;

test.beforeAll(async ({ playwright }) => {
  adminContext = await playwright.request.newContext({
    storageState: storageStatePath("admin"),
    extraHTTPHeaders: await e2eAuthHeaders("admin"),
  });
  userContext = await playwright.request.newContext({
    storageState: storageStatePath("user"),
    extraHTTPHeaders: await e2eAuthHeaders("user"),
  });
  editorContext = await playwright.request.newContext({
    storageState: storageStatePath("editor"),
    extraHTTPHeaders: await e2eAuthHeaders("editor"),
  });

  const meResponse = await userContext.get(
    backendApiV1Url("/auth/users/me/permissions"),
  );
  expect(
    meResponse.ok(),
    `Could not resolve user ID: ${meResponse.status()}`,
  ).toBeTruthy();
  regularUserId = (await meResponse.json()).data?.user_id;
  expect(regularUserId).toBeTruthy();

  const foldersResponse = await editorContext.get(
    backendApiV1Url("/folders?view=management&limit=100&offset=0"),
  );
  expect(
    foldersResponse.ok(),
    `Could not list folders: ${foldersResponse.status()}`,
  ).toBeTruthy();
  const folders = (await foldersResponse.json()).items as Array<{
    id: string;
    parent_id: string | null;
  }>;
  const chosenFolder =
    folders.find((folder) => folder.parent_id !== null) ?? folders[0];
  expect(
    chosenFolder,
    "No editor-accessible prompt folders exist",
  ).toBeTruthy();
  folderId = chosenFolder.id;

  const createTemplate = async (
    name: string,
    visibility: "all" | "only_editors" | "nobody",
    visibleToUserIds?: Array<string>,
  ) => {
    const response = await adminContext.post(backendApiV1Url("/templates"), {
      data: {
        name,
        folder_id: folderId,
        prompts: { main: `${name} content` },
        visibility,
        visible_to_user_ids: visibleToUserIds,
      },
    });
    expect(
      response.ok(),
      `Failed to create ${name}: ${response.status()}`,
    ).toBeTruthy();
    return (await response.json()).id as string;
  };

  editorsOnlyTemplateId = await createTemplate(
    e2eName("Editors Only"),
    "only_editors",
  );
  disabledTemplateId = await createTemplate(e2eName("Disabled"), "nobody");
  allowlistedTemplateId = await createTemplate(
    e2eName("Allowlist User"),
    "all",
    [regularUserId],
  );
});

test.afterAll(async () => {
  for (const id of [
    editorsOnlyTemplateId,
    disabledTemplateId,
    allowlistedTemplateId,
  ]) {
    if (id) {
      await adminContext
        .delete(backendApiV1Url(`/templates/${encodeURIComponent(id)}`))
        .catch(() => {});
    }
  }
  await adminContext.dispose();
  await userContext.dispose();
  await editorContext.dispose();
});

async function fetchTemplateIds(
  context: APIRequestContext,
  view: "runtime" | "management",
): Promise<Set<string>> {
  const params = new URLSearchParams({
    view,
    folder_id: folderId,
    limit: "100",
    offset: "0",
  });
  const response = await context.get(backendApiV1Url(`/templates?${params}`));
  expect(
    response.ok(),
    `Meeting-type list returned ${response.status()}`,
  ).toBeTruthy();
  const body = await response.json();
  return new Set<string>(
    (body.items as Array<{ id: string }>).map((template) => template.id),
  );
}

test.describe("runtime and management catalog views", () => {
  test("regular users cannot request management data", async () => {
    const response = await userContext.get(
      backendApiV1Url("/templates?view=management&limit=100&offset=0"),
    );
    expect(response.status()).toBe(403);
  });

  test("only-editors meeting types are hidden from regular runtime users", async () => {
    const ids = await fetchTemplateIds(userContext, "runtime");
    expect(ids.has(editorsOnlyTemplateId)).toBe(false);

    const response = await userContext.get(
      backendApiV1Url(
        `/templates/${encodeURIComponent(editorsOnlyTemplateId)}?view=runtime`,
      ),
    );
    expect(response.status()).toBe(404);
  });

  test("editors can use only-editors meeting types at runtime and manage them", async () => {
    expect(
      (await fetchTemplateIds(editorContext, "runtime")).has(
        editorsOnlyTemplateId,
      ),
    ).toBe(true);
    expect(
      (await fetchTemplateIds(editorContext, "management")).has(
        editorsOnlyTemplateId,
      ),
    ).toBe(true);
  });

  test("disabled meeting types are runtime-hidden but management-visible", async () => {
    expect(
      (await fetchTemplateIds(editorContext, "runtime")).has(
        disabledTemplateId,
      ),
    ).toBe(false);
    expect(
      (await fetchTemplateIds(editorContext, "management")).has(
        disabledTemplateId,
      ),
    ).toBe(true);
  });

  test("allowlists restrict runtime without hiding management data", async () => {
    expect(
      (await fetchTemplateIds(userContext, "runtime")).has(
        allowlistedTemplateId,
      ),
    ).toBe(true);
    expect(
      (await fetchTemplateIds(editorContext, "runtime")).has(
        allowlistedTemplateId,
      ),
    ).toBe(false);
    expect(
      (await fetchTemplateIds(editorContext, "management")).has(
        allowlistedTemplateId,
      ),
    ).toBe(true);
  });
});
