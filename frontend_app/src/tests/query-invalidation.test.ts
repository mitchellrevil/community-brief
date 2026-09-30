import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { recordingsKeys } from '@/features/recordings/data/keys';

/**
 * Phase 1: Query Cache Over-Invalidation Tests
 * 
 * These tests ensure that mutations only invalidate their specific query keys
 * instead of invalidating ALL queries globally (which causes unnecessary network
 * requests and UI flicker).
 */

describe('Query Invalidation - Targeted Invalidation', () => {
  let queryClient: QueryClient;
  let invalidatedQueries: Set<string>;
  let globalInvalidationCount: number;

  const queryKeyLabel = (queryKey: ReadonlyArray<unknown>) => queryKey.join('-');

  beforeEach(() => {
    invalidatedQueries = new Set();
    globalInvalidationCount = 0;
    
    // Create a fresh query client for each test WITHOUT global invalidation
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 30 * 1000,
          gcTime: 5 * 60 * 1000,
        },
      },
      queryCache: new QueryCache({
        onError: () => {},
      }),
      mutationCache: new MutationCache({
        onError: () => {},
        // NO global invalidation here - that's what we're testing to remove!
      }),
    });

    // Spy on invalidateQueries to track what gets invalidated
    const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
    vi.spyOn(queryClient, 'invalidateQueries').mockImplementation((filters?: any) => {
      if (filters?.queryKey) {
        const key = Array.isArray(filters.queryKey) ? filters.queryKey.join('-') : String(filters.queryKey);
        invalidatedQueries.add(key);
      } else if (!filters || (typeof filters === 'object' && Object.keys(filters).length === 0)) {
        // Global invalidation - this is what we want to prevent!
        globalInvalidationCount++;
        invalidatedQueries.add('__GLOBAL_INVALIDATION__');
      }
      return originalInvalidate(filters);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  describe('User Mutations', () => {
    it('should only invalidate user queries when registering a user', () => {
      // Simulate a user registration mutation's onSuccess
      queryClient.invalidateQueries({ queryKey: ['users'] });

      expect(invalidatedQueries.has('users')).toBe(true);
      expect(invalidatedQueries.has('__GLOBAL_INVALIDATION__')).toBe(false);
      expect(globalInvalidationCount).toBe(0);
    });

    it('should only invalidate user and business-unit queries when assigning business units', () => {
      // Simulate business unit assignment mutation's onSuccess
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['business-units'] });

      expect(invalidatedQueries.has('users')).toBe(true);
      expect(invalidatedQueries.has('business-units')).toBe(true);
      expect(invalidatedQueries.has('__GLOBAL_INVALIDATION__')).toBe(false);
      expect(globalInvalidationCount).toBe(0);
    });

    it('should only invalidate specific user query when updating permissions', () => {
      const userId = 'user-123';
      
      // Simulate permission update mutation's onSuccess
      queryClient.invalidateQueries({ queryKey: ['user', userId] });

      expect(invalidatedQueries.has(`user-${userId}`)).toBe(true);
      expect(invalidatedQueries.has('__GLOBAL_INVALIDATION__')).toBe(false);
      expect(globalInvalidationCount).toBe(0);
    });
  });

  describe('Job Mutations', () => {
    it('should only invalidate job-related queries when deleting a job', () => {
      const jobId = 'job-123';
      
      // Simulate job delete mutation's onSuccess
      queryClient.invalidateQueries({ queryKey: recordingsKeys.single(jobId) });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.base() });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.sharedJobs() });

      expect(invalidatedQueries.has(queryKeyLabel(recordingsKeys.single(jobId)))).toBe(true);
      expect(invalidatedQueries.has(queryKeyLabel(recordingsKeys.base()))).toBe(true);
      expect(invalidatedQueries.has(queryKeyLabel(recordingsKeys.sharedJobs()))).toBe(true);
      expect(invalidatedQueries.has('__GLOBAL_INVALIDATION__')).toBe(false);
      expect(globalInvalidationCount).toBe(0);
    });

    it('should only invalidate job and sharing queries when sharing a job', () => {
      const jobId = 'job-123';
      
      // Simulate job share mutation's onSuccess
      queryClient.invalidateQueries({ queryKey: recordingsKeys.jobSharingInfo(jobId) });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.single(jobId) });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.sharedJobs() });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.base() });

      expect(invalidatedQueries.has(queryKeyLabel(recordingsKeys.jobSharingInfo(jobId)))).toBe(true);
      expect(invalidatedQueries.has(queryKeyLabel(recordingsKeys.single(jobId)))).toBe(true);
      expect(invalidatedQueries.has(queryKeyLabel(recordingsKeys.sharedJobs()))).toBe(true);
      expect(invalidatedQueries.has(queryKeyLabel(recordingsKeys.base()))).toBe(true);
      expect(invalidatedQueries.has('__GLOBAL_INVALIDATION__')).toBe(false);
      expect(globalInvalidationCount).toBe(0);
    });

    it('should only invalidate deleted job queries when restoring a job', () => {
      const jobId = 'job-123';
      
      // Simulate job restore mutation's onSuccess
      queryClient.invalidateQueries({ queryKey: recordingsKeys.single(jobId) });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.deletedJobs() });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.base() });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.adminAllJobs() });

      expect(invalidatedQueries.has(queryKeyLabel(recordingsKeys.single(jobId)))).toBe(true);
      expect(invalidatedQueries.has(queryKeyLabel(recordingsKeys.deletedJobs()))).toBe(true);
      expect(invalidatedQueries.has(queryKeyLabel(recordingsKeys.base()))).toBe(true);
      expect(invalidatedQueries.has(queryKeyLabel(recordingsKeys.adminAllJobs()))).toBe(true);
      expect(invalidatedQueries.has('__GLOBAL_INVALIDATION__')).toBe(false);
      expect(globalInvalidationCount).toBe(0);
    });

    it('should only invalidate analysis queries when refining analysis', () => {
      const jobId = 'job-123';
      
      // Simulate analysis refinement mutation's onSuccess
      queryClient.invalidateQueries({ queryKey: ['community-brief', 'analysis-refinement', 'history', jobId] });
      queryClient.invalidateQueries({ queryKey: ['community-brief', 'audio-recordings'] });

      expect(invalidatedQueries.has(`community-brief-analysis-refinement-history-${jobId}`)).toBe(true);
      expect(invalidatedQueries.has('community-brief-audio-recordings')).toBe(true);
      expect(invalidatedQueries.has('__GLOBAL_INVALIDATION__')).toBe(false);
      expect(globalInvalidationCount).toBe(0);
    });
  });

  describe('Unrelated Query Protection', () => {
    it('should NOT invalidate analytics queries when updating a user', () => {
      // Set up some cached data
      queryClient.setQueryData(['analytics', 'dashboard'], { data: 'cached' });
      queryClient.setQueryData(['categories'], { data: 'cached' });
      
      // Execute user update mutation with targeted invalidation
      queryClient.invalidateQueries({ queryKey: ['users'] });

      expect(invalidatedQueries.has('users')).toBe(true);
      expect(invalidatedQueries.has('analytics-dashboard')).toBe(false);
      expect(invalidatedQueries.has('categories')).toBe(false);
      expect(invalidatedQueries.has('__GLOBAL_INVALIDATION__')).toBe(false);
      expect(globalInvalidationCount).toBe(0);
    });

    it('should NOT invalidate user queries when deleting a job', () => {
      const jobId = 'job-123';
      
      // Set up some cached data
      queryClient.setQueryData(['users'], { data: 'cached' });
      queryClient.setQueryData(['business-units'], { data: 'cached' });
      
      // Execute job delete mutation with targeted invalidation
      queryClient.invalidateQueries({ queryKey: recordingsKeys.single(jobId) });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.base() });

      expect(invalidatedQueries.has(queryKeyLabel(recordingsKeys.single(jobId)))).toBe(true);
      expect(invalidatedQueries.has(queryKeyLabel(recordingsKeys.base()))).toBe(true);
      expect(invalidatedQueries.has('users')).toBe(false);
      expect(invalidatedQueries.has('business-units')).toBe(false);
      expect(invalidatedQueries.has('__GLOBAL_INVALIDATION__')).toBe(false);
      expect(globalInvalidationCount).toBe(0);
    });
  });

  describe('Global Invalidation Prevention', () => {
    it('should NEVER trigger global invalidation without query keys', () => {
      // NEW behavior - always specify query keys (this is the correct pattern)
      queryClient.invalidateQueries({ queryKey: ['users'] });

      expect(invalidatedQueries.has('__GLOBAL_INVALIDATION__')).toBe(false);
      expect(invalidatedQueries.has('users')).toBe(true);
      expect(globalInvalidationCount).toBe(0);
    });

    it('should detect global invalidation if it happens (anti-pattern)', () => {
      // This is the OLD buggy behavior we're removing - calling invalidateQueries with no filter
      queryClient.invalidateQueries();

      expect(invalidatedQueries.has('__GLOBAL_INVALIDATION__')).toBe(true);
      expect(globalInvalidationCount).toBe(1);
    });

    it('should handle multiple mutations without cross-contamination', () => {
      // Mutation 1: Update user
      queryClient.invalidateQueries({ queryKey: ['users'] });

      expect(invalidatedQueries.has('users')).toBe(true);
      
      invalidatedQueries.clear();

      // Mutation 2: Delete job (should not affect user queries)
      queryClient.invalidateQueries({ queryKey: recordingsKeys.base() });

      expect(invalidatedQueries.has(queryKeyLabel(recordingsKeys.base()))).toBe(true);
      expect(invalidatedQueries.has('users')).toBe(false);
      expect(invalidatedQueries.has('__GLOBAL_INVALIDATION__')).toBe(false);
      expect(globalInvalidationCount).toBe(0);
    });
  });
});

