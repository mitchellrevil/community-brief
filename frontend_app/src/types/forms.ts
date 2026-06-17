/**
 * Form-related TypeScript types
 *
 * These types provide a small, typed surface for dynamic form rendering
 * and validation utilities used across the frontend.
 */

export type FieldType = "text" | "date" | "number" | "markdown" | "checkbox" | "select" | "textarea";

/**
 * Value type mapping for field types. Use `unknown` for complex fields
 * and narrow at the call site where appropriate.
 */
export type FieldValueFor<T extends FieldType> = T extends "checkbox"
  ? boolean
  : T extends "number"
  ? number | ""
  : string;

export interface FormField<T = unknown> {
  name: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  options?: string | Array<string>;
  value?: T;
}

export interface FormSection<T = unknown> {
  fields: Array<FormField<T>>;
}

export type FormsRecord = Record<string, unknown>;
