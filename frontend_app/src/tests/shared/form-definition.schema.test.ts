import { describe, expect, it } from "vitest";
import type { FormField } from "@/types/forms";
import { validateFormSections } from "@/components/shared/FormValidator";
import { validateFormDefinition } from "@/shared/schema/form-definition.schema";

const field = (changes: Partial<FormField> = {}): FormField => ({
  name: "existing_key",
  label: "Question",
  type: "text",
  ...changes,
});
describe("Form definitions and answers", () => {
  it.each([
    { label: " " },
    { type: "select", options: [] },
    { type: "select", options: ["A", " A "] },
    { type: "select", options: ["A", ""] },
    { type: "number", value: "bad" },
    { type: "number", value: Infinity },
    { type: "date", value: "2026-02-30" },
    { type: "checkbox", value: "false" },
    { type: "select", options: ["A"], value: "B" },
  ] as Array<Partial<FormField>>)(
    "rejects invalid definition %j",
    (changes) => {
      expect(
        validateFormDefinition([{ fields: [field(changes)] }]),
      ).not.toHaveLength(0);
    },
  );
  it("detects collisions across sections without rewriting keys", () => {
    const sections = [
      { fields: [field()] },
      { fields: [field({ label: "Other" })] },
    ];
    expect(validateFormDefinition(sections)).toEqual([
      expect.objectContaining({ section: 1, property: "name" }),
    ]);
    expect(sections[0].fields[0].name).toBe("existing_key");
  });
  it("allows an absent form but not an empty section", () => {
    expect(validateFormDefinition([])).toEqual([]);
    expect(validateFormDefinition([{ fields: [] }])).toHaveLength(1);
  });
  it.each([
    { label: undefined },
    { type: "textarea" },
    { type: "number", value: 0 },
    { type: "number", value: "1e3" },
    { type: "checkbox", value: false },
    { type: "select", options: "A, B", value: "A" },
    { type: "select", options: ["A, with comma", "B"], value: "A, with comma" },
  ] as Array<Partial<FormField>>)(
    "preserves compatible definitions %j",
    (changes) => {
      expect(validateFormDefinition([{ fields: [field(changes)] }])).toEqual(
        [],
      );
    },
  );
  it.each([
    ["text", " ", true, true],
    ["checkbox", false, true, true],
    ["checkbox", false, false, false],
    ["number", 0, true, false],
    ["number", "", true, true],
    ["date", "", true, true],
    ["select", "", true, true],
  ] as const)(
    "validates %s answer consistently",
    (type, value, required, invalid) => {
      const errors = validateFormSections(
        [{ fields: [field({ type, required, options: "A, B" })] }],
        { existing_key: value },
      );
      expect(Object.keys(errors).length > 0).toBe(invalid);
    },
  );
});
