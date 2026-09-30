import type { FormField, FormSection } from "@/types/forms";
import { normalizeOptions } from "@/components/shared/FormValidator";

/** Legacy guidance can use title or name instead of a separate label. */
export function getFormFieldLabel(field: {
  label?: string;
  title?: string;
  name?: string;
}): string {
  return field.label ?? field.title ?? field.name ?? "";
}

export function getFormFieldName(field: {
  label?: string;
  title?: string;
  name?: string;
}): string {
  return field.name?.trim() || getFormFieldLabel(field).trim().slice(0, 64);
}

/** Validate definition defaults at save time, independently of required answers. */
export function validateDefaultValue(
  field: FormField,
  value: unknown,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (
    field.type === "number" &&
    (typeof value === "boolean" ||
      (typeof value !== "string" && typeof value !== "number") ||
      String(value).trim() === "" ||
      !Number.isFinite(Number(value)))
  )
    return `${field.label} must be a valid number`;
  if (field.type === "checkbox" && typeof value !== "boolean")
    return `${field.label} must be checked or unchecked`;
  if (field.type === "date") {
    const date =
      typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T00:00:00Z`)
        : null;
    if (
      !date ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      return `${field.label} must be a valid date`;
  }
  if (
    field.type === "select" &&
    !normalizeOptions(field.options).includes(String(value))
  )
    return `${field.label} must be one of the available choices`;

  return null;
}

export interface DefinitionIssue {
  section: number;
  field: number;
  property: "label" | "name" | "type" | "options" | "value";
  message: string;
}

export const formFieldTypes = [
  "text",
  "textarea",
  "markdown",
  "date",
  "checkbox",
  "number",
  "select",
] as const;

/** Validate writes without rewriting existing answer keys or legacy display labels. */
export function validateFormDefinition(
  sections: Array<FormSection>,
): Array<DefinitionIssue> {
  const issues: Array<DefinitionIssue> = [];
  const names = new Set<string>();
  sections.forEach((section, sectionIndex) => {
    const report = (
      field: number,
      property: DefinitionIssue["property"],
      message: string,
    ) => issues.push({ section: sectionIndex, field, property, message });
    if (!section.fields.length)
      report(0, "label", "Add a question or remove this empty section.");
    section.fields.forEach((field, fieldIndex) => {
      const label = getFormFieldLabel(field);
      const name = getFormFieldName(field);
      if (!label.trim())
        report(fieldIndex, "label", "Enter a question or guidance title.");
      if (!name) report(fieldIndex, "name", "Enter a field name.");
      else if (names.has(name))
        report(
          fieldIndex,
          "name",
          "Field names must be unique across sections.",
        );
      else names.add(name);
      if (!formFieldTypes.includes(field.type))
        report(fieldIndex, "type", "Choose a supported answer type.");
      if (field.type === "select") {
        const options = normalizeOptions(field.options).map(option => option.trim());
        if (
          !options.length ||
          options.some((option) => !option.trim()) ||
          new Set(options).size !== options.length
        )
          report(fieldIndex, "options", "Add non-empty, distinct choices.");
      }
      // Required describes participant answers, not an obligation to supply a default.
      const error = validateDefaultValue(
        { ...field, label: label || name || "Field" },
        field.value,
      );
      if (error) report(fieldIndex, "value", error);
    });
  });
  return issues;
}
