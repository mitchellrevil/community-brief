import { describe, expect, it } from 'vitest';
import { 
  getMissingRequiredFields, 
  validateField, 
  validateFormData 
} from '../components/shared/FormValidator';
import type { FormField } from '@/types/forms';

/**
 * Unit tests for FormValidator utility functions.
 * 
 * TDD tests covering:
 * - validateField: required text/number/checkbox validation
 * - validateFormData: mixed field array error mapping
 * - getMissingRequiredFields: label collection for required missing fields
 * - Edge cases: checkbox boolean, number "", string trimming
 */

describe('FormValidator', () => {
  describe('validateField', () => {
    describe('required text fields', () => {
      const textField: FormField = { 
        name: 'title', 
        type: 'text', 
        label: 'Title', 
        required: true 
      };

      it('returns error for empty string', () => {
        const error = validateField(textField, '');
        expect(error).not.toBeNull();
        expect(error).toContain('Title');
        expect(error).toContain('required');
      });

      it('returns error for whitespace-only string', () => {
        const error = validateField(textField, '   ');
        expect(error).not.toBeNull();
        expect(error).toContain('required');
      });

      it('returns null for non-empty string', () => {
        const error = validateField(textField, 'Valid Title');
        expect(error).toBeNull();
      });

      it('returns null for string with leading/trailing whitespace but content', () => {
        const error = validateField(textField, '  content  ');
        expect(error).toBeNull();
      });
    });

    describe('required number fields', () => {
      const numberField: FormField = { 
        name: 'count', 
        type: 'number', 
        label: 'Count', 
        required: true 
      };

      it('returns error for empty string value', () => {
        const error = validateField(numberField, '');
        expect(error).not.toBeNull();
        expect(error).toContain('Count');
        expect(error).toContain('required');
      });

      it('returns error for undefined value', () => {
        const error = validateField(numberField, undefined);
        expect(error).not.toBeNull();
        expect(error).toContain('required');
      });

      it('returns error for null value', () => {
        const error = validateField(numberField, null);
        expect(error).not.toBeNull();
        expect(error).toContain('required');
      });

      it('returns null for zero (valid number)', () => {
        const error = validateField(numberField, 0);
        expect(error).toBeNull();
      });

      it('returns null for positive number', () => {
        const error = validateField(numberField, 42);
        expect(error).toBeNull();
      });

      it('returns null for negative number', () => {
        const error = validateField(numberField, -5);
        expect(error).toBeNull();
      });
    });

    describe('required checkbox fields', () => {
      const checkboxField: FormField = { 
        name: 'agree', 
        type: 'checkbox', 
        label: 'Agree to Terms', 
        required: true 
      };

      it('returns error for false (unchecked)', () => {
        const error = validateField(checkboxField, false);
        expect(error).not.toBeNull();
        expect(error).toContain('Agree to Terms');
        expect(error).toContain('required');
      });

      it('returns null for true (checked)', () => {
        const error = validateField(checkboxField, true);
        expect(error).toBeNull();
      });
    });

    describe('optional fields', () => {
      it('returns null for empty optional text field', () => {
        const field: FormField = { 
          name: 'notes', 
          type: 'text', 
          label: 'Notes', 
          required: false 
        };
        const error = validateField(field, '');
        expect(error).toBeNull();
      });

      it('returns null for undefined optional number field', () => {
        const field: FormField = { 
          name: 'amount', 
          type: 'number', 
          label: 'Amount', 
          required: false 
        };
        const error = validateField(field, undefined);
        expect(error).toBeNull();
      });

      it('returns null for unchecked optional checkbox', () => {
        const field: FormField = { 
          name: 'subscribe', 
          type: 'checkbox', 
          label: 'Subscribe', 
          required: false 
        };
        const error = validateField(field, false);
        expect(error).toBeNull();
      });

      it('returns null for empty optional textarea', () => {
        const field: FormField = { 
          name: 'bio', 
          type: 'textarea', 
          label: 'Bio' 
        };
        const error = validateField(field, '');
        expect(error).toBeNull();
      });
    });

    describe('select fields', () => {
      const selectField: FormField = {
        name: 'category',
        type: 'select',
        label: 'Category',
        required: true,
        options: ['Option A', 'Option B'],
      };

      it('returns error for empty selection', () => {
        const error = validateField(selectField, '');
        expect(error).not.toBeNull();
        expect(error).toContain('required');
      });

      it('returns null for valid selection', () => {
        const error = validateField(selectField, 'Option A');
        expect(error).toBeNull();
      });
    });

    describe('date fields', () => {
      const dateField: FormField = {
        name: 'meetingDate',
        type: 'date',
        label: 'Meeting Date',
        required: true,
      };

      it('returns error for empty date string', () => {
        const error = validateField(dateField, '');
        expect(error).not.toBeNull();
        expect(error).toContain('required');
      });

      it('returns null for valid date string', () => {
        const error = validateField(dateField, '2024-01-15');
        expect(error).toBeNull();
      });
    });
  });

  describe('validateFormData', () => {
    it('returns empty object for valid form data', () => {
      const fields: Array<FormField> = [
        { name: 'name', type: 'text', label: 'Name', required: true },
        { name: 'email', type: 'text', label: 'Email', required: false },
      ];
      const data = { name: 'John Doe', email: '' };

      const errors = validateFormData(fields, data);
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('returns errors for all missing required fields', () => {
      const fields: Array<FormField> = [
        { name: 'title', type: 'text', label: 'Title', required: true },
        { name: 'count', type: 'number', label: 'Count', required: true },
        { name: 'agree', type: 'checkbox', label: 'Agreement', required: true },
      ];
      const data = { title: '', count: '', agree: false };

      const errors = validateFormData(fields, data);
      expect(Object.keys(errors)).toHaveLength(3);
      expect(errors.title).toContain('required');
      expect(errors.count).toContain('required');
      expect(errors.agree).toContain('required');
    });

    it('returns errors only for invalid fields in mixed data', () => {
      const fields: Array<FormField> = [
        { name: 'name', type: 'text', label: 'Name', required: true },
        { name: 'age', type: 'number', label: 'Age', required: true },
        { name: 'notes', type: 'textarea', label: 'Notes', required: false },
      ];
      const data = { name: 'Jane', age: '', notes: '' };

      const errors = validateFormData(fields, data);
      expect(Object.keys(errors)).toHaveLength(1);
      expect(errors.age).toBeDefined();
      expect(errors.name).toBeUndefined();
      expect(errors.notes).toBeUndefined();
    });

    it('uses field default value when data key is missing', () => {
      const fields: Array<FormField> = [
        { name: 'quantity', type: 'number', label: 'Quantity', required: true, value: 10 },
      ];
      const data = {}; // missing 'quantity' key

      const errors = validateFormData(fields, data);
      // Should use default value of 10, which is valid
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('handles undefined data values as empty', () => {
      const fields: Array<FormField> = [
        { name: 'description', type: 'text', label: 'Description', required: true },
      ];
      const data = { description: undefined };

      const errors = validateFormData(fields, data);
      expect(errors.description).toBeDefined();
    });
  });

  describe('getMissingRequiredFields', () => {
    it('returns empty array when all required fields are filled', () => {
      const fields: Array<FormField> = [
        { name: 'name', type: 'text', label: 'Name', required: true },
        { name: 'count', type: 'number', label: 'Count', required: true },
      ];
      const data = { name: 'Test', count: 5 };

      const missing = getMissingRequiredFields(fields, data);
      expect(missing).toHaveLength(0);
    });

    it('returns labels of missing required fields', () => {
      const fields: Array<FormField> = [
        { name: 'title', type: 'text', label: 'Document Title', required: true },
        { name: 'date', type: 'date', label: 'Meeting Date', required: true },
        { name: 'optional', type: 'text', label: 'Optional Field', required: false },
      ];
      const data = { title: '', date: '', optional: '' };

      const missing = getMissingRequiredFields(fields, data);
      expect(missing).toHaveLength(2);
      expect(missing).toContain('Document Title');
      expect(missing).toContain('Meeting Date');
      expect(missing).not.toContain('Optional Field');
    });

    it('returns field name when label is missing', () => {
      const fields: Array<FormField> = [
        { name: 'unlabeled_field', type: 'text', label: '', required: true },
      ];
      const data = { unlabeled_field: '' };

      const missing = getMissingRequiredFields(fields, data);
      expect(missing).toHaveLength(1);
      expect(missing).toContain('unlabeled_field');
    });

    it('includes checkbox fields that are false', () => {
      const fields: Array<FormField> = [
        { name: 'consent', type: 'checkbox', label: 'Consent', required: true },
      ];
      const data = { consent: false };

      const missing = getMissingRequiredFields(fields, data);
      expect(missing).toContain('Consent');
    });

    it('includes number fields with empty string value', () => {
      const fields: Array<FormField> = [
        { name: 'participants', type: 'number', label: 'Participants', required: true },
      ];
      const data = { participants: '' };

      const missing = getMissingRequiredFields(fields, data);
      expect(missing).toContain('Participants');
    });

    it('excludes number fields with zero value', () => {
      const fields: Array<FormField> = [
        { name: 'score', type: 'number', label: 'Score', required: true },
      ];
      const data = { score: 0 };

      const missing = getMissingRequiredFields(fields, data);
      expect(missing).not.toContain('Score');
    });
  });

  describe('edge cases', () => {
    it('handles empty fields array', () => {
      const errors = validateFormData([], { someKey: 'value' });
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('handles empty data object', () => {
      const fields: Array<FormField> = [
        { name: 'required', type: 'text', label: 'Required', required: true },
      ];
      const errors = validateFormData(fields, {});
      expect(errors.required).toBeDefined();
    });

    it('trims whitespace when checking text field emptiness', () => {
      const field: FormField = { 
        name: 'text', 
        type: 'text', 
        label: 'Text', 
        required: true 
      };
      
      // Whitespace-only should be treated as empty
      const error = validateField(field, '   \t\n   ');
      expect(error).not.toBeNull();
    });
  });
});
