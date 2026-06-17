import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PromptBrowseView } from '@/features/prompt-management/ui/view';
import { formatDate } from '@/lib/date-utils';

const mockUseUserPermissions = vi.fn();

vi.mock('@/features/prompt-management/state/context', () => {
  return {
    usePromptManagement: () => {
      const updatedAtMs = new Date('2025-03-29T12:00:00Z').getTime();
      return {
        selectedCategory: { id: 'cat-1', name: 'Example Category' },
        selectedPrompt: {
          id: 'sub-1',
          name: 'Example Prompt',
          category_id: 'cat-1',
          business_unit_id: 'cat-1',
          prompts: { default: 'Hello' },
          created_at: updatedAtMs,
          updated_at: updatedAtMs,
          updated_by_user_id: 'user-123',
          updated_by_display_name: 'Jane Editor',
        },
        editSubcategory: vi.fn(),
      };
    },
  };
});

vi.mock('@/hooks/usePermissions', () => {
  return {
    useUserPermissions: () => mockUseUserPermissions(),
  };
});

describe('PromptBrowseView', () => {
  beforeEach(() => {
    mockUseUserPermissions.mockReset();
  });

  it('renders updated_at without double-multiplying epoch ms', () => {
    mockUseUserPermissions.mockReturnValue({
      data: {
        permission: 'Editor',
        business_unit_ids: ['cat-1'],
      },
    });

    const updatedAtMs = new Date('2025-03-29T12:00:00Z').getTime();
    const expected = formatDate(updatedAtMs);
    const wrong = formatDate(updatedAtMs * 1000);

    render(<PromptBrowseView onEdit={() => {}} />);

    expect(screen.getByText(new RegExp(`Last modified\\s+${expected}\\s+by\\s+Jane Editor`))).toBeTruthy();
    expect(screen.queryByText(new RegExp(wrong))).toBeNull();
    expect(screen.queryByText(/58090/)).toBeNull();
  });

  it('hides edit controls for editors outside the prompt business unit', () => {
    mockUseUserPermissions.mockReturnValue({
      data: {
        permission: 'Editor',
        business_unit_ids: ['business-unit-other'],
      },
    });

    render(<PromptBrowseView onEdit={() => {}} />);

    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /all|only editors|nobody/i })).toBeNull();
  });
});
