/**
 * useFormValidation - Hook for form state management and validation
 * 
 * Provides centralized form state management with:
 * - Form data state
 * - Validation error tracking
 * - Change handlers
 * - Form reset functionality
 * - Validation execution
 */

import { useCallback, useState } from "react";
import type { FormField, FormSection, FormsRecord } from "@/types/forms";
import { 
   
  
  getMissingRequiredFields,
  validateFormData 
} from "@/components/shared/FormValidator";

export interface UseFormValidationOptions {
  /** Initial form data */
  initialData?: FormsRecord;
  /** Field definitions for validation */
  fields?: Array<FormField>;
  /** Section definitions (alternative to fields) */
  sections?: Array<FormSection>;
}

export interface UseFormValidationResult {
  /** Current form data */
  formData: FormsRecord;
  /** Current validation errors (field name -> error message) */
  errors: Record<string, string>;
  /** Update a single field value */
  handleChange: (fieldName: string, value: unknown) => void;
  /** Set multiple field values at once */
  setFormData: React.Dispatch<React.SetStateAction<FormsRecord>>;
  /** Validate all fields, returns true if valid */
  validate: () => boolean;
  /** Get list of missing required field labels */
  getMissingFields: () => Array<string>;
  /** Clear all errors */
  clearErrors: () => void;
  /** Reset form to initial state */
  resetForm: () => void;
  /** Check if a specific field has an error */
  hasError: (fieldName: string) => boolean;
  /** Get error message for a specific field */
  getError: (fieldName: string) => string | null;
}

/**
 * Hook for managing form state and validation
 * 
 * @example
 * ```tsx
 * const { formData, handleChange, validate, errors } = useFormValidation({
 *   initialData: { name: '', email: '' },
 *   fields: [
 *     { name: 'name', type: 'text', label: 'Name', required: true },
 *     { name: 'email', type: 'text', label: 'Email', required: true },
 *   ]
 * });
 * 
 * // In form:
 * <FormFieldRenderer
 *   field={fields[0]}
 *   value={formData.name}
 *   onChange={handleChange}
 *   error={errors.name}
 * />
 * ```
 */
export function useFormValidation({
  initialData = {},
  fields = [],
  sections = [],
}: UseFormValidationOptions = {}): UseFormValidationResult {
  const [formData, setFormData] = useState<FormsRecord>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get all fields from either fields array or sections
  const allFields = sections.length > 0 
    ? sections.flatMap(section => section.fields)
    : fields;

  const handleChange = useCallback((fieldName: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value,
    }));
    
    // Clear error for this field when user makes a change
    setErrors(prev => {
      if (prev[fieldName]) {
        const { [fieldName]: removed, ...rest } = prev;
        return rest;
      }
      return prev;
    });
  }, []);

  const validate = useCallback((): boolean => {
    const validationErrors = validateFormData(allFields, formData);
    setErrors(validationErrors);
    return Object.keys(validationErrors).length === 0;
  }, [allFields, formData]);

  const getMissingFields = useCallback((): Array<string> => {
    return getMissingRequiredFields(allFields, formData);
  }, [allFields, formData]);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  const resetForm = useCallback(() => {
    setFormData(initialData);
    setErrors({});
  }, [initialData]);

  const hasError = useCallback((fieldName: string): boolean => {
    return !!errors[fieldName];
  }, [errors]);

  const getError = useCallback((fieldName: string): string | null => {
    return errors[fieldName] || null;
  }, [errors]);

  return {
    formData,
    errors,
    handleChange,
    setFormData,
    validate,
    getMissingFields,
    clearErrors,
    resetForm,
    hasError,
    getError,
  };
}
