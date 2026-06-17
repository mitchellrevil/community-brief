/**
 * Prompt Workflow Integration Tests
 * 
 * Tests prompt management workflows using MSW for API mocking.
 * Verifies: create prompt → assign to category → verify in list
 */

import * as React from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, delay, http } from 'msw';
import { apiPath } from '../apiPaths';
import { renderWithProviders } from '../test-utils';
import { mockUsers } from '../providers/TestAuth';
import { mockData, server } from './setup';

// Track API calls for verification
let createdPrompts: Array<{ name: string; categoryId: string }> = [];
let movedPrompts: Array<{ promptId: string; newCategoryId: string }> = [];

// Simplified prompt management component for testing
function PromptManagementTestComponent() {
  const [categories, setCategories] = React.useState<Array<any>>([]);
  const [prompts, setPrompts] = React.useState<Array<any>>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [newPromptName, setNewPromptName] = React.useState('');
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string>('');
  const [isCreating, setIsCreating] = React.useState(false);

  // Load categories and prompts
  React.useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [categoriesRes, promptsRes] = await Promise.all([
          fetch(apiPath('/prompts/categories')),
          fetch(apiPath('/prompts/subcategories')),
        ]);
        
        if (!categoriesRes.ok || !promptsRes.ok) {
          throw new Error('Failed to load data');
        }
        
        const categoriesData = await categoriesRes.json();
        const promptsData = await promptsRes.json();
        
        setCategories(categoriesData.categories || []);
        setPrompts(promptsData.subcategories || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const handleCreatePrompt = async () => {
    if (!newPromptName.trim() || !selectedCategoryId) return;
    
    setIsCreating(true);
    try {
      const response = await fetch(apiPath('/prompts/subcategories'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPromptName,
          category_id: selectedCategoryId,
          prompts: { default: 'Enter your prompt content here...' },
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create prompt');
      }
      
      const newPrompt = await response.json();
      
      // Add to prompt list
      setPrompts(prev => [...prev, {
        id: newPrompt.id,
        subcategory_name: newPrompt.subcategory_name,
        category_id: newPrompt.category_id,
        prompts: newPrompt.prompts,
      }]);
      
      // Close dialog and reset
      setShowCreateDialog(false);
      setNewPromptName('');
      setSelectedCategoryId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setIsCreating(false);
    }
  };

  const handleMovePrompt = async (promptId: string, newCategoryId: string) => {
    try {
      const response = await fetch(apiPath(`/prompts/subcategories/${promptId}/move`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: newCategoryId }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to move prompt');
      }
      
      // Update prompt in list
      setPrompts(prev => 
        prev.map(p => 
          p.id === promptId 
            ? { ...p, category_id: newCategoryId }
            : p
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move failed');
    }
  };

  // Group prompts by category
  const promptsByCategory = React.useMemo(() => {
    const grouped: Record<string, Array<any>> = {};
    categories.forEach(cat => {
      grouped[cat.id] = prompts.filter(p => p.category_id === cat.id);
    });
    return grouped;
  }, [categories, prompts]);

  if (isLoading) {
    return <div data-testid="loading">Loading prompt library...</div>;
  }

  if (error) {
    return <div data-testid="error">{error}</div>;
  }

  return (
    <div data-testid="prompt-management">
      <h1>Prompt Library</h1>
      
      {/* Create Button */}
      <button
        onClick={() => setShowCreateDialog(true)}
        data-testid="create-prompt-button"
      >
        Create New Prompt
      </button>

      {/* Category Tree with Prompts */}
      <div data-testid="prompt-tree">
        {categories.map(category => (
          <div key={category.id} data-testid={`category-${category.id}`}>
            <h3 data-testid={`category-name-${category.id}`}>{category.name}</h3>
            <ul data-testid={`prompt-list-${category.id}`}>
              {promptsByCategory[category.id].map(prompt => (
                <li 
                  key={prompt.id}
                  data-testid={`prompt-item-${prompt.id}`}
                >
                  <span data-testid={`prompt-name-${prompt.id}`}>
                    {prompt.subcategory_name}
                  </span>
                  
                  {/* Move to category selector */}
                  <select
                    data-testid={`move-select-${prompt.id}`}
                    value={prompt.category_id}
                    onChange={(e) => handleMovePrompt(prompt.id, e.target.value)}
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div data-testid="create-dialog" role="dialog">
          <h2>Create New Prompt</h2>
          
          <div>
            <label htmlFor="prompt-name">Prompt Name:</label>
            <input
              id="prompt-name"
              type="text"
              value={newPromptName}
              onChange={(e) => setNewPromptName(e.target.value)}
              data-testid="prompt-name-input"
              placeholder="Enter prompt name"
            />
          </div>
          
          <div>
            <label htmlFor="category">Category:</label>
            <select
              id="category"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              data-testid="category-select"
            >
              <option value="">Select a category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <button
              onClick={() => setShowCreateDialog(false)}
              data-testid="cancel-button"
            >
              Cancel
            </button>
            <button
              onClick={handleCreatePrompt}
              disabled={isCreating || !newPromptName.trim() || !selectedCategoryId}
              data-testid="confirm-create-button"
            >
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

describe('Prompt Workflow Integration Tests', () => {
  const user = userEvent.setup();

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' });
  });

  afterEach(() => {
    server.resetHandlers();
    createdPrompts = [];
    movedPrompts = [];
  });

  afterAll(() => {
    server.close();
  });

  describe('Create new prompt', () => {
    it('creates a new prompt in the system', async () => {
      // Set up handlers
      server.use(
        http.get(apiPath('/prompts/categories'), async () => {
          await delay(30);
          return HttpResponse.json({
            categories: [
              mockData.category({ id: 'meetings-cat', name: 'Meetings' }),
              mockData.category({ id: 'reports-cat', name: 'Reports' }),
            ],
          });
        }),
        
        http.get(apiPath('/prompts/subcategories'), async () => {
          await delay(30);
          return HttpResponse.json({
            subcategories: [
              {
                id: 'existing-prompt-1',
                subcategory_name: 'Team Standup',
                category_id: 'meetings-cat',
                prompts: { default: 'Analyze team standup...' },
              },
            ],
          });
        }),
        
        http.post(apiPath('/prompts/subcategories'), async ({ request }) => {
          await delay(50);
          const body = await request.json() as { name: string; category_id: string };
          
          // Track the creation
          createdPrompts.push({ name: body.name, categoryId: body.category_id });
          
          return HttpResponse.json({
            id: `new-prompt-${Date.now()}`,
            subcategory_name: body.name,
            category_id: body.category_id,
            prompts: { default: 'Enter your prompt content here...' },
          });
        })
      );

      renderWithProviders(<PromptManagementTestComponent />, {
        auth: mockUsers.admin,
      });

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByTestId('prompt-management')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify initial state
      expect(screen.getByTestId('prompt-item-existing-prompt-1')).toBeInTheDocument();

      // Click create button
      await user.click(screen.getByTestId('create-prompt-button'));

      // Dialog should open
      await waitFor(() => {
        expect(screen.getByTestId('create-dialog')).toBeInTheDocument();
      });

      // Enter prompt name
      const nameInput = screen.getByTestId('prompt-name-input');
      await user.type(nameInput, 'Weekly Review');

      // Select category
      const categorySelect = screen.getByTestId('category-select');
      await user.selectOptions(categorySelect, 'meetings-cat');

      // Click create
      await user.click(screen.getByTestId('confirm-create-button'));

      // Wait for dialog to close
      await waitFor(() => {
        expect(screen.queryByTestId('create-dialog')).not.toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify API was called correctly
      expect(createdPrompts).toHaveLength(1);
      expect(createdPrompts[0]).toEqual({
        name: 'Weekly Review',
        categoryId: 'meetings-cat',
      });

      // Verify new prompt appears in the list
      await waitFor(() => {
        const meetingsList = screen.getByTestId('prompt-list-meetings-cat');
        expect(within(meetingsList).getByText('Weekly Review')).toBeInTheDocument();
      });
    });
  });

  describe('Assign prompt to category', () => {
    it('assigns a prompt to a different category and verifies in list', async () => {
      // Set up handlers
      server.use(
        http.get(apiPath('/prompts/categories'), async () => {
          await delay(30);
          return HttpResponse.json({
            categories: [
              mockData.category({ id: 'cat-a', name: 'Category A' }),
              mockData.category({ id: 'cat-b', name: 'Category B' }),
            ],
          });
        }),
        
        http.get(apiPath('/prompts/subcategories'), async () => {
          await delay(30);
          return HttpResponse.json({
            subcategories: [
              {
                id: 'movable-prompt',
                subcategory_name: 'Movable Prompt',
                category_id: 'cat-a',
                prompts: { default: 'Some prompt content...' },
              },
            ],
          });
        }),
        
        http.put(apiPath('/prompts/subcategories/:promptId/move'), async ({ params, request }) => {
          await delay(50);
          const body = await request.json() as { category_id: string };
          
          // Track the move
          movedPrompts.push({
            promptId: params.promptId as string,
            newCategoryId: body.category_id,
          });
          
          return HttpResponse.json({
            id: params.promptId,
            category_id: body.category_id,
            message: 'Prompt moved successfully',
          });
        })
      );

      renderWithProviders(<PromptManagementTestComponent />, {
        auth: mockUsers.admin,
      });

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByTestId('prompt-management')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify initial state - prompt is in Category A
      const categoryAList = screen.getByTestId('prompt-list-cat-a');
      expect(within(categoryAList).getByText('Movable Prompt')).toBeInTheDocument();

      // Category B should be empty initially
      const categoryBList = screen.getByTestId('prompt-list-cat-b');
      expect(within(categoryBList).queryByText('Movable Prompt')).not.toBeInTheDocument();

      // Move the prompt to Category B using the select
      const moveSelect = screen.getByTestId('move-select-movable-prompt');
      await user.selectOptions(moveSelect, 'cat-b');

      // Wait for the update
      await waitFor(() => {
        expect(movedPrompts).toHaveLength(1);
      }, { timeout: 3000 });

      // Verify API was called correctly
      expect(movedPrompts[0]).toEqual({
        promptId: 'movable-prompt',
        newCategoryId: 'cat-b',
      });

      // Verify prompt now appears in Category B
      await waitFor(() => {
        const updatedCategoryBList = screen.getByTestId('prompt-list-cat-b');
        expect(within(updatedCategoryBList).getByText('Movable Prompt')).toBeInTheDocument();
      });

      // Verify prompt no longer in Category A
      const updatedCategoryAList = screen.getByTestId('prompt-list-cat-a');
      expect(within(updatedCategoryAList).queryByText('Movable Prompt')).not.toBeInTheDocument();
    });
  });
});
