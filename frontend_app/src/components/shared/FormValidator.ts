/**
 * FormValidator - Centralized form validation utilities
 * 
 * Provides validation functions for form fields used across the application:
 * - CategorySelection pre-session forms
 * - PreSessionForm upload forms
 * - Other dynamic form rendering contexts
 */

import type { FieldType, FormField, FormSection, FormsRecord } from "@/types/forms";

// Re-export types to maintain existing import paths
export type { FieldType, FormField, FormSection };

/**
 * Normalize options from either array or comma-separated string
 */
export function normalizeOptions(options?: string | Array<string>): Array<string> {
  if (!options) return [];
  return Array.isArray(options)
    ? options
    : options.split(",").map((o) => o.trim()).filter(Boolean);
}

/**
 * Normalize checkbox checked state (handles indeterminate)
 */
export function normalizeChecked(checked: boolean | "indeterminate"): boolean {
  return checked === true;
}

/**
 * Check if a value is considered empty based on field type
 */
function isEmptyValue(value: unknown, type: FieldType): boolean {
  if (value === undefined || value === null) return true;

  if (type === "checkbox") {
    return value === false;
  }

  if (type === "number") {
    return value === "";
  }

  if (typeof value === "string") {
    return value.trim() === "";
  }

  return false;
}

/**
 * Validate a single form field
 * 
 * @param field - The field definition
 * @param value - The current value
 * @returns Error message or null if valid
 */
export function validateField(field: FormField, value: unknown): string | null {
  // Required field validation
  if (field.required && isEmptyValue(value, field.type)) {
    return `${field.label} is required`;
  }
  
  // Type-specific validation could be added here
  // For example: email format, min/max for numbers, etc.
  
  return null;
}

/**
 * Validate all fields in a form
 * 
 * @param fields - Array of field definitions
 * @param data - Form data object
 * @returns Object mapping field names to error messages
 */
export function validateFormData(
  fields: Array<FormField>,
  data: FormsRecord
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const value = data[field.name] ?? field.value ?? "";
    const error = validateField(field, value);
    if (error) {
      errors[field.name] = error;
    }
  }

  return errors;
}

/**
 * Get list of missing required field labels for error messaging
 * 
 * @param fields - Array of field definitions
 * @param data - Form data object
 * @returns Array of missing field labels
 */
export function getMissingRequiredFields(
  fields: Array<FormField>,
  data: FormsRecord
): Array<string> {
  const missing: Array<string> = [];

  for (const field of fields) {
    if (field.required) {
      const value = data[field.name] ?? field.value ?? "";
      if (isEmptyValue(value, field.type)) {
        missing.push(field.label || field.name);
      }
    }
  }

  return missing;
}

/**
 * Validate all sections of a form (flattens fields from all sections)
 * 
 * @param sections - Array of form sections
 * @param data - Form data object
 * @returns Object mapping field names to error messages
 */
export function validateFormSections(
  sections: Array<FormSection>,
  data: FormsRecord
): Record<string, string> {
  const allFields = sections.flatMap(section => section.fields);
  return validateFormData(allFields, data);
}

/**
 * Get missing required fields from all sections
 * 
 * @param sections - Array of form sections
 * @param data - Form data object
 * @returns Array of missing field labels
 */
export function getMissingRequiredFieldsFromSections(
  sections: Array<FormSection>,
  data: FormsRecord
): Array<string> {
  const allFields = sections.flatMap(section => section.fields);
  return getMissingRequiredFields(allFields, data);
}
