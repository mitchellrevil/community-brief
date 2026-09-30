import { httpClient } from "@/shared/api/client/httpClient";
import {
  ADD_USER_TO_BUSINESS_UNIT_API,
  BUSINESS_UNITS_API,
  BUSINESS_UNIT_ASSIGN_USER_API,
  BUSINESS_UNIT_BULK_UPDATE_USERS_API,
  BUSINESS_UNIT_BY_ID,
  BUSINESS_UNIT_STATS_API,
  SELF_ASSIGN_BUSINESS_UNIT_API,
} from "@/shared/api/constants";

/**
 * Business unit data structure.
 */
export interface BusinessUnit {
  /** Unique business unit identifier */
  id: string;
  /** Display name of the business unit */
  name: string;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
  /** Parent category ID if nested */
  parent_category_id: string | null;
  /** Whether this is a business unit (vs. regular category) */
  is_business_unit: boolean;
}

/**
 * Paginated response for business units.
 */
export interface PaginatedBusinessUnitsResponse {
  /** Array of business units for the current page */
  business_units: Array<BusinessUnit>;
  /** Total number of business units */
  total: number;
  /** Number of items requested */
  limit?: number;
  /** Starting offset */
  offset?: number;
  /** Whether more pages are available */
  has_more?: boolean;
}

/**
 * Statistics for a business unit.
 */
export interface BusinessUnitStats {
  /** Business unit identifier */
  business_unit_id: string;
  /** Business unit name */
  business_unit_name: string;
  /** Total number of users in the unit */
  total_users: number;
  /** Number of users with EDITOR permission */
  editor_users: number;
  /** Number of users with USER permission */
  user_users: number;
  /** Total categories in the unit */
  total_categories: number;
  /** Total subcategories in the unit */
  total_subcategories: number;
  /** Total prompts in the unit */
  total_prompts: number;
}

/**
 * Request to assign a user to a business unit.
 */
export interface AssignUserToBusinessUnitRequest {
  /** User to assign */
  user_id: string;
  /** Business unit IDs to assign */
  business_unit_ids: Array<string>;
}

/**
 * Response from business unit assignment.
 */
export interface UserBusinessUnitAssignmentResponse {
  /** Assigned user ID */
  user_id: string;
  /** All assigned business unit IDs */
  business_unit_ids: Array<string>;
  /** Human-readable business unit names */
  business_unit_names: Array<string>;
  /** Whether the operation succeeded */
  success: boolean;
}

/**
 * Bulk update request for multiple users.
 */
export interface BulkUserUpdate {
  /** User IDs to update */
  user_ids: Array<string>;
  /** New permission level (optional) */
  permission?: string;
  /** Replace all business unit assignments (optional) */
  business_unit_ids?: Array<string>;
  /** Business units to add (optional) */
  add_business_units?: Array<string>;
  /** Business units to remove (optional) */
  remove_business_units?: Array<string>;
}

/**
 * Response from bulk user update.
 */
export interface BulkUserUpdateResponse {
  /** Number of successful updates */
  success_count: number;
  /** Number of failed updates */
  failed_count: number;
  /** IDs of successfully updated users */
  updated_user_ids: Array<string>;
  /** Details of failed updates */
  failed_updates: Array<{ user_id: string; error: string }>;
  /** Summary message */
  message: string;
}

/**
 * Fetches business units with pagination.
 *
 * @param {number} [limit=50] - Maximum items per page
 * @param {number} [offset=0] - Starting offset
 *
 * @returns {Promise<PaginatedBusinessUnitsResponse>} Paginated business units
 *
 * @throws {ApiError} When the API request fails
 *
 * @example
 * ```tsx
 * import { fetchBusinessUnitsPaginated } from '@/shared/data/business-units/api';
 *
 * const page1 = await fetchBusinessUnitsPaginated(25, 0);
 * console.log(`Found ${page1.total} business units`);
 * ```
 *
 * @see {@link useInfiniteBusinessUnits} for infinite scroll pattern
 */
export async function fetchBusinessUnitsPaginated(
  limit: number = 50,
  offset: number = 0
): Promise<PaginatedBusinessUnitsResponse> {
  const response = await httpClient.get(BUSINESS_UNITS_API, {
    params: { limit, offset },
  });
  const data = response.data;
  
  const returnedCount = (data.business_units?.length || 0);
  const totalFromServer = typeof data.total === 'number' ? data.total : undefined;

  return {
    business_units: data.business_units || [],
    total: data.total || 0,
    limit,
    offset,
    has_more:
      typeof totalFromServer === 'number'
        ? offset + returnedCount < (totalFromServer || 0)
        : returnedCount === limit,
  };
}

/**
 * Fetches all business units (non-paginated).
 *
 * @returns {Promise<Array<BusinessUnit>>} All business units
 *
 * @throws {ApiError} When the API request fails
 *
 * @example
 * ```tsx
 * import { fetchBusinessUnits } from '@/shared/data/business-units/api';
 *
 * const units = await fetchBusinessUnits();
 * const unitNames = units.map((u) => u.name);
 * ```
 */
export async function fetchBusinessUnits(): Promise<Array<BusinessUnit>> {
  const response = await httpClient.get(BUSINESS_UNITS_API);
  const data = response.data;
  return data.business_units || data;
}

export async function fetchBusinessUnit(unitId: string): Promise<BusinessUnit> {
  const response = await httpClient.get(BUSINESS_UNIT_BY_ID(unitId));
  return response.data;
}

export async function fetchBusinessUnitStats(unitId: string): Promise<BusinessUnitStats> {
  const response = await httpClient.get(BUSINESS_UNIT_STATS_API(unitId));
  return response.data;
}

export async function assignUserToBusinessUnits(
  userId: string,
  businessUnitIds: Array<string>
): Promise<UserBusinessUnitAssignmentResponse> {
  const response = await httpClient.post(BUSINESS_UNIT_ASSIGN_USER_API, {
    user_id: userId,
    business_unit_ids: businessUnitIds,
  });
  return response.data;
}

export async function selfAssignToBusinessUnits(
  businessUnitIds: Array<string>
): Promise<{ status: string; message: string; user_id: string; business_unit_ids: Array<string>; business_unit_names: Array<string> }> {
  const response = await httpClient.post(SELF_ASSIGN_BUSINESS_UNIT_API, {
    business_unit_ids: businessUnitIds,
  });
  return response.data;
}

export async function bulkUpdateUsers(
  update: BulkUserUpdate
): Promise<BulkUserUpdateResponse> {
  const response = await httpClient.post(BUSINESS_UNIT_BULK_UPDATE_USERS_API, update);
  return response.data;
}

export async function addUserToBusinessUnit(
  userEmail: string,
  businessUnitIds: Array<string>
): Promise<{ status: string; message: string; user_id: string; business_unit_ids: Array<string> }> {
  const response = await httpClient.post(ADD_USER_TO_BUSINESS_UNIT_API, {
    user_email: userEmail,
    business_unit_ids: businessUnitIds,
  });
  return response.data;
}



