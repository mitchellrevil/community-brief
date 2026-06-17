import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { LazyMDEditor } from "@/components/lazy/LazyMDEditor";

const PRE_SESSION_FORM_FIELD_TYPES = [
  { label: 'Short Text', value: 'text', description: 'Single-line text field' },
  { label: 'Date', value: 'date', description: 'Date selection field' },
  { label: 'Long Text (Markdown)', value: 'markdown', description: 'Multi-line text area with formatting' },
  { label: 'Checkbox', value: 'checkbox', description: 'Yes/No checkbox' },
  { label: 'Number', value: 'number', description: 'Numeric input field' },
  { label: 'Dropdown', value: 'select', description: 'Dropdown with predefined options' },
];

const IN_SESSION_TALKING_POINT_TYPES = [
  { label: 'Long Text (Markdown)', value: 'markdown', description: 'Rich text talking point (recommended)' },
  { label: 'Short Text', value: 'text', description: 'Simple text note' },
  { label: 'Date', value: 'date', description: 'Date-based reminder' },
  { label: 'Checkbox', value: 'checkbox', description: 'Yes/No reminder' },
];

export function FormBuilderEditor({
  points,
  setPoints,
  label,
  isFormBuilder = false,
}: {
  points: Array<any>;
  setPoints: (arr: Array<any>) => void;
  label: string;
  isFormBuilder?: boolean;
}) {
  const fieldTypes = isFormBuilder ? PRE_SESSION_FORM_FIELD_TYPES : IN_SESSION_TALKING_POINT_TYPES;

  const generateNameFromLabel = (labelText: string) =>
    labelText
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');

  const addPoint = () => {
    const defaultField = isFormBuilder
      ? { label: '', type: 'text', placeholder: '', required: false, description: '' }
      : { name: '', type: 'markdown', value: '' };
    setPoints([
      ...points,
      {
        fields: [defaultField],
      },
    ]);
  };

  const addField = (idx: number) => {
    const arr = [...points];
    const defaultField = isFormBuilder
      ? { label: '', type: 'text', placeholder: '', required: false, description: '' }
      : { name: '', type: 'markdown', value: '' };
    arr[idx].fields.push(defaultField);
    setPoints(arr);
  };

  const updateField = (pointIdx: number, fieldIdx: number, field: Partial<any>) => {
    const arr = [...points];
    const updatedField = { ...arr[pointIdx].fields[fieldIdx], ...field };
    if (isFormBuilder && 'label' in field) {
      updatedField.name = generateNameFromLabel(field.label || '');
    }
    arr[pointIdx].fields[fieldIdx] = updatedField;
    setPoints(arr);
  };

  const removeField = (pointIdx: number, fieldIdx: number) => {
    const arr = [...points];
    arr[pointIdx].fields.splice(fieldIdx, 1);
    setPoints(arr);
  };

  const removePoint = (idx: number) => {
    const arr = [...points];
    arr.splice(idx, 1);
    setPoints(arr);
  };

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="font-medium mb-4">{label}</h3>
        <div className="space-y-6">
          {points.map((tp, idx) => (
            <div key={idx} className="border rounded-lg p-4 mb-2 bg-muted/30">
              <h4 className="font-medium mb-3">
                {isFormBuilder ? `Form Section ${idx + 1}` : `Talking Point Section ${idx + 1}`}
              </h4>
              {tp.fields.map((field: any, fIdx: number) => (
                <div key={fIdx} className="mb-4 border-l-2 border-primary/20 pl-4">
                  {isFormBuilder ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Field Label</label>
                          <Input
                            value={field.label || ''}
                            onChange={e => updateField(idx, fIdx, { label: e.target.value })}
                            placeholder="What users will see"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Field Type</label>
                          <select
                            value={field.type || 'text'}
                            onChange={e => updateField(idx, fIdx, { type: e.target.value })}
                            className="mt-1 w-full border rounded px-2 py-1 bg-background"
                          >
                            {fieldTypes.map((opt: any) => (
                              <option key={opt.value} value={opt.value} title={opt.description}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Placeholder Text</label>
                        <Input
                          value={field.placeholder || ''}
                          onChange={e => updateField(idx, fIdx, { placeholder: e.target.value })}
                          placeholder="Hint text for users"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Description</label>
                        <Input
                          value={field.description || ''}
                          onChange={e => updateField(idx, fIdx, { description: e.target.value })}
                          placeholder="Help text to explain this field"
                          className="mt-1"
                        />
                      </div>
                      {field.type === 'select' && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Options (comma-separated)</label>
                          <Input
                            value={field.options || ''}
                            onChange={e => updateField(idx, fIdx, { options: e.target.value })}
                            placeholder="Option 1, Option 2, Option 3"
                            className="mt-1"
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={field.required || false}
                          onChange={e => updateField(idx, fIdx, { required: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <label className="text-xs font-medium text-muted-foreground">Required field</label>
                      </div>
                      {field.label && (
                        <div className="text-xs text-muted-foreground mt-1">Field variable: <span className="font-mono">{generateNameFromLabel(field.label)}</span></div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="mb-2">
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
                        <Input
                          value={field.name || ''}
                          onChange={e => updateField(idx, fIdx, { name: e.target.value })}
                          placeholder="Enter a title for this talking point"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <select
                          value={field.type || 'markdown'}
                          onChange={e => updateField(idx, fIdx, { type: e.target.value })}
                          className="border rounded px-2 py-1 bg-background"
                        >
                          {fieldTypes.map((opt: any) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        {field.type === 'date' && (
                          <Input
                            type="date"
                            value={field.value || ''}
                            onChange={e => updateField(idx, fIdx, { value: e.target.value })}
                          />
                        )}
                        {field.type === 'checkbox' && (
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={!!field.value}
                              onChange={e => updateField(idx, fIdx, { value: e.target.checked })}
                              className="w-5 h-5"
                            />
                            <span>Checked?</span>
                          </div>
                        )}
                      </div>
                      {(!field.type || field.type === 'markdown') && (
                        <div className="w-full">
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Rich Text</label>
                          <LazyMDEditor
                            value={field.value || ''}
                            onChange={val => updateField(idx, fIdx, { value: val || '' })}
                            height={120}
                            preview="edit"
                            hideToolbar={false}
                            visibleDragbar={false}
                          />
                        </div>
                      )}
                      {field.type === 'text' && (
                        <Input
                          value={field.value || ''}
                          onChange={e => updateField(idx, fIdx, { value: e.target.value })}
                          placeholder="Quick note (plain text)"
                        />
                      )}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeField(idx, fIdx)}
                    className="mt-2"
                  >
                    Remove {isFormBuilder ? 'Field' : 'Talking Point'}
                  </Button>
                </div>
              ))}
              <div className="flex gap-2 mt-3 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={() => addField(idx)}>
                  + Add {isFormBuilder ? 'Form Field' : 'Talking Point'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => removePoint(idx)}>
                  Remove Section
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={addPoint}>
            + Add {isFormBuilder ? 'Form Section' : 'Talking Point Section'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
