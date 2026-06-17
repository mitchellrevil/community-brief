/**
 * Admin User Management Integration Tests
 * 
 * Tests admin workflows for managing users using MSW for API mocking.
 * Verifies: view users → change permission → verify update in list
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

// Track permission updates for verification
let permissionUpdates: Array<{ userId: string; permission: string }> = [];

// Simplified user management component for testing
function UserManagementTestComponent() {
  const [users, setUsers] = React.useState<Array<any>>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedUser, setSelectedUser] = React.useState<any>(null);
  const [isUpdating, setIsUpdating] = React.useState(false);

  // Load users on mount
  React.useEffect(() => {
    const loadUsers = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(apiPath('/auth/users'));
        if (!response.ok) {
          throw new Error('Failed to load users');
        }
        const data = await response.json();
        setUsers(data.users);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };
    loadUsers();
  }, []);

  const handleUserClick = (user: any) => {
    setSelectedUser(user);
  };

  const handlePermissionChange = async (newPermission: string) => {
    if (!selectedUser) return;
    
    setIsUpdating(true);
    try {
      const response = await fetch(apiPath(`/auth/users/${selectedUser.user_id}/permission`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission: newPermission }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update permission');
      }
      
      // Update user in list
      setUsers(prevUsers => 
        prevUsers.map(u => 
          u.user_id === selectedUser.user_id 
            ? { ...u, permission: newPermission }
            : u
        )
      );
      
      // Update selected user
      setSelectedUser((prev: any) => ({ ...prev, permission: newPermission }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setIsUpdating(false);
    }
  };

  const closeUserDetail = () => {
    setSelectedUser(null);
  };

  if (isLoading) {
    return <div data-testid="loading">Loading users...</div>;
  }

  if (error) {
    return <div data-testid="error">{error}</div>;
  }

  return (
    <div data-testid="user-management">
      <h1>User Management</h1>
      
      {/* User List */}
      <div data-testid="user-list">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Permission</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr 
                key={user.user_id}
                data-testid={`user-row-${user.user_id}`}
                onClick={() => handleUserClick(user)}
                style={{ cursor: 'pointer' }}
              >
                <td data-testid={`user-email-${user.user_id}`}>{user.email}</td>
                <td data-testid={`user-permission-${user.user_id}`}>{user.permission}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* User Detail Panel */}
      {selectedUser && (
        <div data-testid="user-detail-panel">
          <h2>Edit User: {selectedUser.email}</h2>
          <div data-testid="current-permission">
            Current Permission: {selectedUser.permission}
          </div>
          
          <div data-testid="permission-selector">
            <label htmlFor="permission-select">Change Permission:</label>
            <select
              id="permission-select"
              data-testid="permission-select"
              value={selectedUser.permission}
              onChange={(e) => handlePermissionChange(e.target.value)}
              disabled={isUpdating}
            >
              <option value="User">User</option>
              <option value="Editor">Editor</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
          
          {isUpdating && (
            <div data-testid="updating-indicator">Updating...</div>
          )}
          
          <button 
            onClick={closeUserDetail}
            data-testid="close-detail-button"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

describe('Admin User Management Integration Tests', () => {
  const user = userEvent.setup();

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' });
  });

  afterEach(() => {
    server.resetHandlers();
    permissionUpdates = [];
  });

  afterAll(() => {
    server.close();
  });

  describe('View and edit user permissions', () => {
    it('admin can view users and change permission level', async () => {
      // Set up handlers for user list and permission update
      server.use(
        http.get(apiPath('/auth/users'), async () => {
          await delay(30);
          return HttpResponse.json({
            users: [
              mockData.user({ user_id: 'user-admin-1', email: 'admin@example.com', permission: 'Admin' }),
              mockData.user({ user_id: 'user-editor-2', email: 'editor@example.com', permission: 'Editor' }),
              mockData.user({ user_id: 'user-regular-3', email: 'regular@example.com', permission: 'User' }),
            ],
            total: 3,
          });
        }),
        
        http.put(apiPath('/auth/users/:userId/permission'), async ({ params, request }) => {
          await delay(50);
          const body = await request.json() as { permission: string };
          const userId = params.userId as string;
          
          // Track the update for test verification
          permissionUpdates.push({ userId, permission: body.permission });
          
          return HttpResponse.json({
            message: 'Permission updated successfully',
            user_id: userId,
            permission: body.permission,
          });
        })
      );

      renderWithProviders(<UserManagementTestComponent />, {
        auth: mockUsers.admin,
      });

      // Wait for users to load
      await waitFor(() => {
        expect(screen.getByTestId('user-management')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify all users are displayed
      expect(screen.getByTestId('user-row-user-regular-3')).toBeInTheDocument();
      expect(screen.getByTestId('user-permission-user-regular-3')).toHaveTextContent('User');

      // Click on the regular user to select them
      await user.click(screen.getByTestId('user-row-user-regular-3'));

      // User detail panel should open
      await waitFor(() => {
        expect(screen.getByTestId('user-detail-panel')).toBeInTheDocument();
      });
      
      expect(screen.getByTestId('current-permission')).toHaveTextContent('User');

      // Change permission to Editor
      const permissionSelect = screen.getByTestId('permission-select');
      await user.selectOptions(permissionSelect, 'Editor');

      // Wait for update to complete
      await waitFor(() => {
        expect(screen.queryByTestId('updating-indicator')).not.toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify the API was called with correct data
      expect(permissionUpdates).toHaveLength(1);
      expect(permissionUpdates[0]).toEqual({
        userId: 'user-regular-3',
        permission: 'Editor',
      });

      // Verify UI updated
      expect(screen.getByTestId('current-permission')).toHaveTextContent('Editor');
    });
  });

  describe('Permission update reflects in user list', () => {
    it('permission update reflects in the user list after change', async () => {
      server.use(
        http.get(apiPath('/auth/users'), async () => {
          await delay(30);
          return HttpResponse.json({
            users: [
              mockData.user({ user_id: 'user-1', email: 'user1@example.com', permission: 'User' }),
              mockData.user({ user_id: 'user-2', email: 'user2@example.com', permission: 'User' }),
            ],
            total: 2,
          });
        }),
        
        http.put(apiPath('/auth/users/:userId/permission'), async ({ params, request }) => {
          await delay(50);
          const body = await request.json() as { permission: string };
          return HttpResponse.json({
            message: 'Permission updated',
            user_id: params.userId,
            permission: body.permission,
          });
        })
      );

      renderWithProviders(<UserManagementTestComponent />, {
        auth: mockUsers.admin,
      });

      // Wait for users to load
      await waitFor(() => {
        expect(screen.getByTestId('user-list')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify initial state in the list
      expect(screen.getByTestId('user-permission-user-1')).toHaveTextContent('User');

      // Click on user-1 to open detail panel
      await user.click(screen.getByTestId('user-row-user-1'));

      await waitFor(() => {
        expect(screen.getByTestId('user-detail-panel')).toBeInTheDocument();
      });

      // Change to Admin
      await user.selectOptions(screen.getByTestId('permission-select'), 'Admin');

      // Wait for update
      await waitFor(() => {
        expect(screen.queryByTestId('updating-indicator')).not.toBeInTheDocument();
      }, { timeout: 3000 });

      // Close the detail panel 
      await user.click(screen.getByTestId('close-detail-button'));

      // Verify the permission in the user list is updated
      await waitFor(() => {
        expect(screen.getByTestId('user-permission-user-1')).toHaveTextContent('Admin');
      });

      // Verify user-2 remains unchanged
      expect(screen.getByTestId('user-permission-user-2')).toHaveTextContent('User');
    });
  });
});
