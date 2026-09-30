import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FormSection } from "@/types/forms";
import { validateFormDefinition } from "@/shared/schema/form-definition.schema";
import { FormBuilderEditor } from "@/features/prompt-management/ui/form-builder";

vi.mock("@/components/lazy/LazyMDEditor", () => ({
  LazyMDEditor: ({
    value,
    onChange,
    textareaProps,
  }: {
    value: string;
    onChange: (value: string) => void;
    textareaProps: object;
  }) => (
    <textarea
      {...textareaProps}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
afterEach(cleanup);

function Builder({ initial = [] }: { initial?: Array<FormSection> }) {
  const [sections, setSections] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  return (
    <>
      <FormBuilderEditor
        label="Before the session"
        isFormBuilder
        points={sections}
        setPoints={setSections}
        issues={attempted ? validateFormDefinition(sections) : []}
      />
      <button onClick={() => setAttempted(true)}>Validate</button>
      <output data-testid="saved">{JSON.stringify(sections)}</output>
    </>
  );
}
const saved = (): Array<FormSection> =>
  JSON.parse(screen.getByTestId("saved").textContent || "[]");

describe("Form builder", () => {
  it("creates a question, edits without losing focus, and preserves its key", async () => {
    const user = userEvent.setup();
    render(<Builder />);
    await user.click(screen.getByRole("button", { name: "Add question" }));
    await user.type(
      screen.getByRole("textbox", { name: "Question" }),
      "Person name",
    );
    const key = saved()[0].fields[0].name;
    await user.clear(screen.getByRole("textbox", { name: "Question" }));
    await user.type(
      screen.getByRole("textbox", { name: "Question" }),
      "Full name",
    );
    expect(saved()[0].fields[0]).toMatchObject({
      name: key,
      label: "Full name",
    });
    expect(screen.getByRole("textbox", { name: "Question" })).toHaveFocus();
  });
  it("renames and reorders existing questions without mutating the source", async () => {
    const user = userEvent.setup();
    const initial: Array<FormSection> = [
      {
        fields: [
          { name: "legacy_key", label: "First", type: "text" },
          { name: "other", label: "Second", type: "text" },
        ],
      },
    ];
    render(<Builder initial={initial} />);
    await user.click(screen.getByRole("button", { name: /First ·/ }));
    await user.clear(screen.getByRole("textbox", { name: "Question" }));
    await user.type(
      screen.getByRole("textbox", { name: "Question" }),
      "Renamed",
    );
    await user.click(
      screen.getByRole("button", { name: "Move question 1 down" }),
    );
    expect(saved()[0].fields.map((field) => field.name)).toEqual([
      "other",
      "legacy_key",
    ]);
    expect(initial[0].fields[0].label).toBe("First");
    expect(screen.getByRole("textbox", { name: "Question" })).toHaveValue(
      "Renamed",
    );
  });
  it("edits legacy comma choices as rows and preserves commas inside new choices", async () => {
    const user = userEvent.setup();
    render(
      <Builder
        initial={[
          {
            fields: [
              {
                name: "choice",
                label: "Choose",
                type: "select",
                options: "A, B",
              },
            ],
          },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Choose ·/ }));
    await user.clear(screen.getByRole("textbox", { name: "Choice 1" }));
    await user.type(
      screen.getByRole("textbox", { name: "Choice 1" }),
      "A, with comma",
    );
    expect(saved()[0].fields[0].options).toEqual(["A, with comma", "B"]);
    await user.click(screen.getByRole("button", { name: "Add choice" }));
    await user.click(screen.getByRole("button", { name: "Validate" }));
    expect(screen.getByText("Add non-empty, distinct choices.")).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: "Choice 3" }), "C");
    expect(
      screen.queryByText("Add non-empty, distinct choices."),
    ).not.toBeInTheDocument();
  });
  it("confirms populated section removal and supports cancellation", async () => {
    const user = userEvent.setup();
    render(
      <Builder
        initial={[
          { fields: [{ name: "name", label: "Name", type: "text" }] },
          { fields: [{ name: "role", label: "Role", type: "text" }] },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remove section 1" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Keep section",
      }),
    );
    expect(saved()).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Remove section 1" }));
    await user.click(screen.getByRole("button", { name: "Confirm removal" }));
    expect(saved()).toEqual([
      { fields: [{ name: "role", label: "Role", type: "text" }] },
    ]);
  });
  it("keeps a single group out of the way", () => {
    render(
      <Builder
        initial={[{ fields: [{ name: "name", label: "Name", type: "text" }] }]}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Remove section 1" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Group 1")).not.toBeInTheDocument();
  });
  it("exposes blank labels with associated inline errors", () => {
    render(<Builder />);
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(screen.getByRole("textbox", { name: "Question" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByRole("textbox", { name: "Question" }),
    ).toHaveAccessibleDescription("Enter a question or guidance title.");
  });
});
