/**
 * FormFieldRenderer - Reusable form field rendering component
 * 
 * Renders form fields based on field type configuration. This is a presentational
 * component that handles rendering all supported field types:
 * - text: Standard text input
 * - date: Date picker input
 * - number: Numeric input with value conversion
 * - markdown: Rich text editor (uses LazyMDEditor)
 * - checkbox: Boolean checkbox with label
 * - select: Dropdown select with options
 * - textarea: Multi-line text area
 * 
 * Used by:
 * - CategorySelection (record-upload flow)
 * - PreSessionForm (media-upload flow)
 */

import { memo } from "react";
import {   normalizeChecked, normalizeOptions } from "./FormValidator";
import type {FieldType, FormField} from "./FormValidator";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LazyMDEditor } from "@/components/lazy/LazyMDEditor";

// Re-export types for consumers
export type { FieldType, FormField } from "./FormValidator";

export interface FormFieldRendererProps {
  /** Field configuration */
  field: FormField;
  /** Current field value */
  value: unknown;
  /** Handler for value changes */
  onChange: (fieldName: string, value: unknown) => void;
  /** Optional error message to display */
  error?: string | null;
  /** Additional class name for the container */
  className?: string;
}

/**
 * Render a form field based on its type configuration
 */
function FormFieldRendererComponent({
  field,
  value,
  onChange,
  error,
  className = "",
}: FormFieldRendererProps) {
  const fieldKey = field.name;
  const fieldValue = (value ?? field.value ?? "") as any;
  const label = field.label;
  const placeholder = field.placeholder ?? "";
  const description = field.description ?? "";
  const required = !!field.required;
  const options = normalizeOptions(field.options);

  const handleChange = (newValue: any) => {
    onChange(fieldKey, newValue);
  };

  return (
    <div key={fieldKey} className={`space-y-2 ${className}`}>
      {/* Label (not shown for checkbox - it has inline label) */}
      {field.type !== "checkbox" && (
        <div className="flex items-center justify-between">
          <Label htmlFor={fieldKey} className="text-sm font-medium flex items-center gap-1">
            {label}
            {required && <span className="text-red-500">*</span>}
          </Label>
        </div>
      )}
      
      {/* Description */}
      {description && (
        <p className="text-xs text-muted-foreground mb-2">{description}</p>
      )}

      {/* Text Input */}
      {field.type === "text" && (
        <Input
          id={fieldKey}
          value={fieldValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className="bg-background"
        />
      )}

      {/* Date Input */}
      {field.type === "date" && (
        <Input
          id={fieldKey}
          type="date"
          value={fieldValue}
          onChange={(e) => handleChange(e.target.value)}
          required={required}
          className="bg-background"
        />
      )}

      {/* Number Input */}
      {field.type === "number" && (
        <Input
          id={fieldKey}
          type="number"
          value={fieldValue}
          onChange={(e) => {
            const v = e.target.value;
            handleChange(v === "" ? "" : Number.isNaN(Number(v)) ? "" : Number(v));
          }}
          placeholder={placeholder}
          required={required}
          className="bg-background"
        />
      )}

      {/* Markdown Editor */}
      {field.type === "markdown" && (
        <div className="border rounded-md overflow-hidden bg-background">
          <LazyMDEditor
            value={fieldValue}
            onChange={(val) => handleChange(val || "")}
            data-color-mode="light"
            height={200}
            preview="edit"
            hideToolbar={false}
            visibleDragbar={false}
          />
        </div>
      )}

      {/* Checkbox */}
      {field.type === "checkbox" && (
        <div className="flex items-center space-x-2 p-2 border rounded-md bg-background">
          <Checkbox
            id={fieldKey}
            checked={!!fieldValue}
            onCheckedChange={(checked) => handleChange(normalizeChecked(checked))}
          />
          <Label htmlFor={fieldKey} className="cursor-pointer font-normal text-sm flex items-center gap-1">
            {label}
            {required && <span className="text-red-500">*</span>}
          </Label>
        </div>
      )}

      {/* Select Dropdown */}
      {field.type === "select" && (
        <Select
          value={typeof fieldValue === "string" ? fieldValue : undefined}
          onValueChange={(selectedValue) => handleChange(selectedValue)}
        >
          <SelectTrigger className="bg-background">
            <SelectValue placeholder={placeholder || "Select an option"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt, idx) => (
              <SelectItem key={`${fieldKey}_${idx}_${opt}`} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Textarea */}
      {field.type === "textarea" && (
        <Textarea
          id={fieldKey}
          value={fieldValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          rows={4}
          className="bg-background resize-none"
        />
      )}

      {/* Error Message */}
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}

export const FormFieldRenderer = memo(FormFieldRendererComponent);
