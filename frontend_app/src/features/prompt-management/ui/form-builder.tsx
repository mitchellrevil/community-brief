import { useId, useRef, useState } from "react";
import type { DefinitionIssue } from "@/shared/schema/form-definition.schema";
import type { FormField, FormSection } from "@/types/forms";
import { FormFieldRenderer } from "@/components/shared/FormFieldRenderer";
import { normalizeOptions } from "@/components/shared/FormValidator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  formFieldTypes,
  getFormFieldLabel,
} from "@/shared/schema/form-definition.schema";

const typeLabels: Record<string, string> = {
  text: "Short answer",
  textarea: "Long answer",
  markdown: "Formatted text",
  date: "Date",
  checkbox: "Checkbox",
  number: "Number",
  select: "Dropdown",
};

export function FormBuilderEditor({
  points,
  setPoints,
  label,
  isFormBuilder = false,
  issues = [],
}: {
  points: Array<FormSection>;
  setPoints: (sections: Array<FormSection>) => void;
  label: string;
  isFormBuilder?: boolean;
  issues?: Array<DefinitionIssue>;
}) {
  const prefix = useId();
  const identities = useRef(new WeakMap<object, string>());
  const nextIdentity = useRef(0);
  const identity = (item: object) => {
    let key = identities.current.get(item);
    if (!key) {
      key = prefix + "-" + nextIdentity.current++;
      identities.current.set(item, key);
    }
    return key;
  };
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const noun = isFormBuilder ? "question" : "guidance";
  const replaceSection = (index: number, fields: Array<FormField>) => {
    const replacement = { ...points[index], fields };
    identities.current.set(replacement, identity(points[index]));
    setPoints(
      points.map((section, i) => (i === index ? replacement : section)),
    );
  };
  const updateField = (s: number, f: number, changes: Partial<FormField>) => {
    const old = points[s].fields[f];
    setExpanded(identity(old));
    const updated = { ...old, ...changes };
    identities.current.set(updated, identity(old));
    replaceSection(
      s,
      points[s].fields.map((field, i) => (i === f ? updated : field)),
    );
  };
  const newField = (): FormField => ({
    name: "field_" + crypto.randomUUID().replaceAll("-", ""),
    label: "",
    type: isFormBuilder ? "text" : "markdown",
    required: false,
  });
  const addField = (section?: number) => {
    const field = newField();
    setExpanded(identity(field));
    if (section === undefined) setPoints([...points, { fields: [field] }]);
    else replaceSection(section, [...points[section].fields, field]);
    requestAnimationFrame(() =>
      document.getElementById(identity(field) + "-label")?.focus(),
    );
  };
  const moveField = (s: number, f: number, offset: number) => {
    const fields = [...points[s].fields];
    [fields[f], fields[f + offset]] = [fields[f + offset], fields[f]];
    replaceSection(s, fields);
  };
  return (
    <section aria-label={label} className="py-6 first:pt-0 last:pb-0">
      <div className="max-w-2xl">
        <h3 className="text-base font-semibold">{label}</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          {isFormBuilder
            ? "Questions people answer before recording or uploading."
            : "Prompts and reminders to guide the conversation during recording."}
        </p>
      </div>
      <div className="mt-5 space-y-6">
        {!points.length && (
          <div className="border-muted-foreground/30 border-y border-dashed py-6 text-center">
            <p className="text-muted-foreground text-sm">
              No {isFormBuilder ? "questions" : "guidance"} yet.
            </p>
            <Button
              type="button"
              variant="ghost"
              className="mt-2"
              onClick={() => addField()}
            >
              Add {noun}
            </Button>
          </div>
        )}
        {points.map((section, s) => (
          <div key={identity(section)} className="space-y-3">
            <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
              <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {points.length > 1
                  ? `Group ${s + 1}`
                  : `${section.fields.length} ${noun}${section.fields.length === 1 ? "" : "s"}`}
              </div>
              {(points.length > 1 || section.fields.length === 0) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive h-8"
                  aria-label={`Remove section ${s + 1}`}
                  onClick={() =>
                    section.fields.length
                      ? setPendingRemoval(identity(section))
                      : setPoints(points.filter((item) => item !== section))
                  }
                >
                  Remove group
                </Button>
              )}
            </div>
            {!section.fields.length && (
              <p
                role="alert"
                tabIndex={-1}
                data-definition-error
                className="text-destructive text-sm"
              >
                Add a {noun} or remove this empty section.
              </p>
            )}
            <div className="divide-y border-y">
              {section.fields.map((field, f) => {
                const key = identity(field);
                const errors = issues.filter(
                  (issue) => issue.section === s && issue.field === f,
                );
                const open = expanded === key || errors.length > 0;
                const title = getFormFieldLabel(field);
                const errorFor = (property: DefinitionIssue["property"]) =>
                  errors.find((issue) => issue.property === property)?.message;
                const attributes = (property: DefinitionIssue["property"]) => ({
                  id: key + "-" + property,
                  "aria-invalid": !!errorFor(property),
                  "aria-describedby": errorFor(property)
                    ? key + "-" + property + "-error"
                    : undefined,
                });
                const errorMessage = (property: DefinitionIssue["property"]) =>
                  errorFor(property) && (
                    <p
                      id={key + "-" + property + "-error"}
                      className="text-destructive text-sm"
                      role="alert"
                    >
                      {errorFor(property)}
                    </p>
                  );
                const choices = Array.isArray(field.options)
                  ? field.options
                  : field.options
                    ? field.options.split(",").map((value) => value.trim())
                    : [];
                return (
                  <div key={key} className="py-2">
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground w-7 shrink-0 text-center text-xs tabular-nums">
                        {f + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto min-w-0 flex-1 justify-start px-2 py-2 text-left whitespace-normal"
                        aria-label={`${title || `Untitled ${noun}`} · ${typeLabels[field.type] || field.type}${field.required ? " · Required" : ""}`}
                        aria-expanded={open}
                        aria-controls={key + "-settings"}
                        onClick={() => setExpanded(open ? null : key)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {title || "Untitled " + noun}
                          </span>
                          <span className="text-muted-foreground block text-xs font-normal">
                            {typeLabels[field.type] || field.type}
                            {field.required ? " · Required" : ""}
                          </span>
                        </span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        aria-label={"Move " + noun + " " + (f + 1) + " up"}
                        disabled={f === 0}
                        onClick={() => moveField(s, f, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        aria-label={"Move " + noun + " " + (f + 1) + " down"}
                        disabled={f === section.fields.length - 1}
                        onClick={() => moveField(s, f, 1)}
                      >
                        ↓
                      </Button>
                    </div>
                    {open && (
                      <div
                        id={key + "-settings"}
                        className="border-primary/30 ml-9 space-y-4 border-l-2 py-3 pr-2 pl-4"
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label htmlFor={key + "-label"}>
                              {isFormBuilder ? "Question" : "Guidance title"}
                            </label>
                            <Input
                              {...attributes("label")}
                              value={title || ""}
                              onChange={(event) =>
                                updateField(
                                  s,
                                  f,
                                  isFormBuilder
                                    ? { label: event.target.value }
                                    : {
                                        name: event.target.value,
                                        label: event.target.value,
                                      },
                                )
                              }
                            />
                            {errorMessage("label")}
                          </div>
                          <div>
                            <label htmlFor={key + "-type"}>
                              {isFormBuilder ? "Answer type" : "Content type"}
                            </label>
                            <select
                              {...attributes("type")}
                              className="bg-background w-full rounded-md border p-2"
                              value={field.type}
                              onChange={(event) =>
                                updateField(s, f, {
                                  type: event.target.value as FormField["type"],
                                  value: undefined,
                                })
                              }
                            >
                              {formFieldTypes.map((type) => (
                                <option key={type} value={type}>
                                  {typeLabels[type]}
                                </option>
                              ))}
                            </select>
                            {errorMessage("type")}
                          </div>
                        </div>
                        {isFormBuilder && (
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={!!field.required}
                              onChange={(event) =>
                                updateField(s, f, {
                                  required: event.target.checked,
                                })
                              }
                            />
                            Required answer
                            {field.type === "checkbox"
                              ? " (must be checked)"
                              : ""}
                          </label>
                        )}
                        {field.type === "select" && (
                          <fieldset>
                            <legend>Choices</legend>
                            {choices.map((choice, c) => (
                              <div key={c} className="my-2 flex gap-2">
                                <Input
                                  aria-label={"Choice " + (c + 1)}
                                  {...(c === 0 ? attributes("options") : {})}
                                  value={choice}
                                  onChange={(event) =>
                                    updateField(s, f, {
                                      options: choices.map((value, i) =>
                                        i === c ? event.target.value : value,
                                      ),
                                    })
                                  }
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  aria-label={"Remove choice " + (c + 1)}
                                  onClick={() =>
                                    updateField(s, f, {
                                      options: choices.filter(
                                        (_, i) => i !== c,
                                      ),
                                    })
                                  }
                                >
                                  Remove
                                </Button>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              {...(!choices.length
                                ? attributes("options")
                                : {})}
                              onClick={() =>
                                updateField(s, f, { options: [...choices, ""] })
                              }
                            >
                              Add choice
                            </Button>
                            {errorMessage("options")}
                          </fieldset>
                        )}
                        {!isFormBuilder && (
                          <FormFieldRenderer
                            field={{ ...field, label: "Guidance content" }}
                            value={field.value}
                            error={errorFor("value")}
                            onChange={(_, value) =>
                              updateField(s, f, { value })
                            }
                          />
                        )}
                        <details
                          open={!!errorFor("name") || !!errorFor("value")}
                        >
                          <summary className="cursor-pointer text-sm">
                            Additional settings
                          </summary>
                          <div className="space-y-3 pt-3">
                            <label className="block" htmlFor={key + "-hint"}>
                              Placeholder
                              <Input
                                id={key + "-hint"}
                                value={field.placeholder || ""}
                                onChange={(event) =>
                                  updateField(s, f, {
                                    placeholder: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="block" htmlFor={key + "-help"}>
                              Help text
                              <Textarea
                                id={key + "-help"}
                                value={field.description || ""}
                                onChange={(event) =>
                                  updateField(s, f, {
                                    description: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="block" htmlFor={key + "-name"}>
                              Field variable
                              <Input
                                {...attributes("name")}
                                value={field.name || ""}
                                readOnly
                              />
                            </label>
                            <p className="text-muted-foreground text-xs">
                              Kept unchanged when the question is renamed, so
                              existing answers stay connected.
                            </p>
                            {errorMessage("name")}
                            {errorFor("name") && (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  updateField(s, f, { name: newField().name })
                                }
                              >
                                Assign a unique variable to this field
                              </Button>
                            )}
                            {isFormBuilder && (
                              <FormFieldRenderer
                                field={{
                                  ...field,
                                  required: false,
                                  label: "Default answer",
                                  options: normalizeOptions(
                                    field.options,
                                  ).filter(Boolean),
                                }}
                                value={field.value}
                                error={errorFor("value")}
                                onChange={(_, value) =>
                                  updateField(s, f, { value })
                                }
                              />
                            )}
                          </div>
                        </details>
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-destructive hover:text-destructive px-0"
                          onClick={() =>
                            replaceSection(
                              s,
                              section.fields.filter((_, i) => i !== f),
                            )
                          }
                        >
                          Remove {noun}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <Button
              type="button"
              variant="ghost"
              className="px-2"
              onClick={() => addField(s)}
            >
              Add {noun}
            </Button>
          </div>
        ))}
        {!!points.length && (
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground px-2"
            onClick={() => addField()}
          >
            Add another group
          </Button>
        )}
      </div>
      <AlertDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Remove group?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove this group and all its fields? Save the template to apply the
            removal.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setPoints(
                  points.filter(
                    (section) => identity(section) !== pendingRemoval,
                  ),
                );
                setPendingRemoval(null);
              }}
            >
              Confirm removal
            </AlertDialogAction>
            <AlertDialogCancel onClick={() => setPendingRemoval(null)}>
              Keep section
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
