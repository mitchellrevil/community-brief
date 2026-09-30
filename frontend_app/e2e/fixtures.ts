import { test as baseTest, expect } from "@playwright/test";

import { addE2EAuthInitScript } from "./utils/auth-state";

export const test = baseTest.extend({
  context: async ({ context }, use) => {
    await addE2EAuthInitScript(context);
    await use(context);
  },
});

export { expect };
