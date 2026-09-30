import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FormFieldRenderer } from "@/components/shared/FormFieldRenderer";

afterEach(cleanup);
it("associates an invalid default with its label and error for save-error focus", () => {
  render(<FormFieldRenderer field={{ name: "count", label: "Default answer", type: "number" }}
    value="" onChange={() => {}} error="Enter a valid number" />);
  const input = screen.getByRole("spinbutton", { name: "Default answer" });
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("Enter a valid number");
  input.focus();
  expect(input).toHaveFocus();
});
it("labels dropdowns and gives separate controls unique ids even for duplicate legacy keys", () => {
  render(<>
    <FormFieldRenderer field={{ name: "duplicate", label: "First", type: "select", options: "A, B" }} value="" onChange={() => {}} />
    <FormFieldRenderer field={{ name: "duplicate", label: "Second", type: "select", options: "A, B" }} value="" onChange={() => {}} />
  </>);
  expect(screen.getByRole("combobox", { name: "First" }).id).not.toBe(screen.getByRole("combobox", { name: "Second" }).id);
});
