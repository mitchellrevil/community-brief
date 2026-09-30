import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { SubcategoryStep } from "@/features/uploads/recording/ui/SubcategoryStep";

test("the favourite star does not select the prompt", async () => {
  const user = userEvent.setup();
  const onSelectSubcategory = vi.fn();
  const onToggleFavourite = vi.fn();

  render(
    <SubcategoryStep
      selectedCategory={{
        id: "category-1",
        name: "Children's Services",
        created_at: 0,
        updated_at: 0,
        is_business_unit: true,
      }}
      childCategories={[]}
      subcategories={[
        {
          id: "prompt-1",
          name: "Team Meeting Notes",
          folder_id: "category-1",
          prompts: {},
          created_at: 0,
          updated_at: 0,
          pre_session_talking_points: [],
          in_session_talking_points: [],
          analysis_workflow: "standard",
          visibility: "all",
          speaker_identification_enabled: false,
          recording_disclaimer_enabled: false,
        },
      ]}
      favouritePromptIds={[]}
      searchQuery=""
      showSampleSubcategory={false}
      onSearchChange={vi.fn()}
      onBack={vi.fn()}
      onSelectCategory={vi.fn()}
      onSelectSubcategory={onSelectSubcategory}
      onToggleFavourite={onToggleFavourite}
      onSelectSampleSubcategory={vi.fn()}
      sentinelRef={{ current: null }}
    />,
  );

  await user.click(
    screen.getByRole("button", {
      name: "Add Team Meeting Notes to favourites",
    }),
  );

  expect(onToggleFavourite).toHaveBeenCalledWith("prompt-1");
  expect(onSelectSubcategory).not.toHaveBeenCalled();
});
