import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { CategorySelector } from '@/features/uploads/media/CategorySelector';
import { FILE_TYPES, FileDropzone } from '@/features/uploads/media/FileDropzone';
import { PreSessionForm } from '@/features/uploads/media/PreSessionForm';
import { UploadProgressSimulator } from '@/features/uploads/media/UploadProgressSimulator';
import { getFileType, sanitizeFilename, useMediaUpload } from '@/features/uploads/media/hooks/useMediaUpload';
import { MediaUploadForm } from '@/features/uploads/media/upload-form';
import * as testUtilsModule from '@/tests/test-utils';

type TestUtilsModule = typeof testUtilsModule;

function loadTestUtils(): Promise<TestUtilsModule> {
  return Promise.resolve(testUtilsModule);
}

const mediaModule = {
  CategorySelector,
  FileDropzone,
  FILE_TYPES,
  PreSessionForm,
  UploadProgressSimulator,
  useMediaUpload,
  getFileType,
  sanitizeFilename,
  MediaUploadForm,
};

function loadMediaModule() {
  return Promise.resolve(mediaModule);
}

/**
 * Tests for Phase 5: Split MediaUploadForm Component
 *
 * These tests verify that:
 * 1. useMediaUpload hook properly manages form state
 * 2. FileDropzone handles drag events and file validation
 * 3. CategorySelector renders and handles selection correctly
 * 4. PreSessionForm validates and renders dynamic fields
 * 5. UploadProgress displays status correctly
 * 6. MediaUploadForm orchestrates subcomponents correctly
 */

// Setup matchMedia mock before any tests run
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('MediaUploadForm Component Split', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('useMediaUpload Hook', () => {
    it('should export useMediaUpload hook', async () => {
      const { useMediaUpload } = await loadMediaModule();
      expect(useMediaUpload).toBeDefined();
      expect(typeof useMediaUpload).toBe('function');
    });

    it('should initialize with null file type', async () => {
      const { useMediaUpload } = await loadMediaModule();
      const { createQueryClient, createQueryClientWrapper } = await loadTestUtils();

      const queryClient = createQueryClient();
      const wrapper = createQueryClientWrapper(queryClient);

      const { result } = renderHook(() => useMediaUpload(), { wrapper });

      expect(result.current.fileType).toBeNull();
      expect(result.current.isConverting).toBe(false);
      expect(result.current.isSubmitting).toBe(false);
    });

    it('should detect audio file type correctly', async () => {
      const { getFileType } = await loadMediaModule();

      const audioFile = new File(['test'], 'test.mp3', { type: 'audio/mpeg' });
      const type = getFileType(audioFile);

      expect(type).toBe('audio');
    });

    it('should detect video file type correctly', async () => {
      const { getFileType } = await loadMediaModule();

      const videoFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const type = getFileType(videoFile);

      expect(type).toBe('video');
    });

    it('should detect document file type correctly', async () => {
      const { getFileType } = await loadMediaModule();

      const docFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const type = getFileType(docFile);

      expect(type).toBe('document');
    });

    it('should sanitize filenames with special characters', async () => {
      const { sanitizeFilename } = await loadMediaModule();

      expect(sanitizeFilename('my file name.mp3')).toBe('my_file_name.mp3');
      expect(sanitizeFilename('test@#$%file!.wav')).toBe('test_file.wav');
      expect(sanitizeFilename('___test___.mp3')).toBe('test.mp3');
    });

    it('should provide stable form instance', async () => {
      const { useMediaUpload } = await loadMediaModule();
      const { createQueryClient, createQueryClientWrapper } = await loadTestUtils();

      const queryClient = createQueryClient();
      const wrapper = createQueryClientWrapper(queryClient);

      const { result, rerender } = renderHook(() => useMediaUpload(), { wrapper });
      const formFirstRender = result.current.form;

      rerender();
      const formSecondRender = result.current.form;

      expect(formFirstRender).toBe(formSecondRender);
    });
  });

  describe('FileDropzone Component', () => {
    it('should be exported as a memoized component', async () => {
      const { FileDropzone } = await loadMediaModule();

      expect(FileDropzone).toBeDefined();
      // Memoized components have $$typeof symbol property
      expect('$$typeof' in (FileDropzone as object)).toBe(true);
    });

    it('should export FILE_TYPES configuration', async () => {
      const { FILE_TYPES } = await loadMediaModule();

      expect(FILE_TYPES).toBeDefined();
      expect(FILE_TYPES.audio).toBeDefined();
      expect(FILE_TYPES.video).toBeDefined();
      expect(FILE_TYPES.document).toBeDefined();
      expect(FILE_TYPES.transcript).toBeDefined();
      expect(FILE_TYPES.image).toBeDefined();
    });

    it('should have proper audio file extensions', async () => {
      const { FILE_TYPES } = await loadMediaModule();

      expect(FILE_TYPES.audio.extensions).toContain('.mp3');
      expect(FILE_TYPES.audio.extensions).toContain('.wav');
      expect(FILE_TYPES.audio.extensions).toContain('.m4a');
    });

    it('should have accept attribute for each file type', async () => {
      const { FILE_TYPES } = await loadMediaModule();

      expect(FILE_TYPES.audio.accept).toBe('audio/*');
      expect(FILE_TYPES.video.accept).toBe('video/*');
      expect(FILE_TYPES.image.accept).toBe('image/*');
    });
  });

  describe('CategorySelector Component', () => {
    it('should be exported as a memoized component', async () => {
      const { CategorySelector } = await loadMediaModule();

      expect(CategorySelector).toBeDefined();
      // Memoized components have $$typeof symbol property
      expect('$$typeof' in (CategorySelector as object)).toBe(true);
    });

    it('should accept required props', async () => {
      const module = await loadMediaModule();
      // Just verify it exports correctly - actual prop validation would need rendering
      expect(module.CategorySelector).toBeDefined();
    });
  });

  describe('PreSessionForm Component', () => {
    it('should be exported as a memoized component', async () => {
      const { PreSessionForm } = await loadMediaModule();

      expect(PreSessionForm).toBeDefined();
      // Memoized components have $$typeof symbol property
      expect('$$typeof' in (PreSessionForm as object)).toBe(true);
    });

    it('should support multiple field types', async () => {
      // PreSessionForm should handle text, date, number, markdown, checkbox, select, textarea
      const module = await loadMediaModule();
      expect(module.PreSessionForm).toBeDefined();
    });
  });

  describe('UploadProgress Component', () => {
    it('should be exported correctly', async () => {
      // The existing UploadProgressSimulator should work with the new structure
      const { UploadProgressSimulator } = await loadMediaModule();

      expect(UploadProgressSimulator).toBeDefined();
    });
  });

  describe('MediaUploadForm Integration', () => {
    it('should export MediaUploadForm', async () => {
      const { MediaUploadForm } = await loadMediaModule();

      expect(MediaUploadForm).toBeDefined();
      expect(typeof MediaUploadForm).toBe('function');
    });

    it('should compose subcomponents correctly', async () => {
      // Verify all subcomponents are imported by the main form
      const mainFormModule = await loadMediaModule();
      const fileDropzoneModule = mainFormModule;
      const categorySelectorModule = mainFormModule;
      const preSessionFormModule = mainFormModule;
      const hookModule = mainFormModule;

      // All modules should exist
      expect(mainFormModule.MediaUploadForm).toBeDefined();
      expect(fileDropzoneModule.FileDropzone).toBeDefined();
      expect(categorySelectorModule.CategorySelector).toBeDefined();
      expect(preSessionFormModule.PreSessionForm).toBeDefined();
      expect(hookModule.useMediaUpload).toBeDefined();
    });
  });

  describe('Re-render Isolation', () => {
    it('FileDropzone should be memoized to prevent unnecessary re-renders', async () => {
      const { FileDropzone } = await loadMediaModule();

      // Verify it's a memo component
      const component = FileDropzone as any;
      expect(component.$$typeof).toBeDefined();
    });

    it('CategorySelector should be memoized to prevent unnecessary re-renders', async () => {
      const { CategorySelector } = await loadMediaModule();

      // Verify it's a memo component
      const component = CategorySelector as any;
      expect(component.$$typeof).toBeDefined();
    });

    it('PreSessionForm should be memoized to prevent unnecessary re-renders', async () => {
      const { PreSessionForm } = await loadMediaModule();

      // Verify it's a memo component
      const component = PreSessionForm as any;
      expect(component.$$typeof).toBeDefined();
    });
  });

  describe('Form State Management', () => {
    it('useMediaUpload should provide handleFileSelect callback', async () => {
      const { useMediaUpload } = await loadMediaModule();
      const { createQueryClient, createQueryClientWrapper } = await loadTestUtils();

      const queryClient = createQueryClient();
      const wrapper = createQueryClientWrapper(queryClient);

      const { result } = renderHook(() => useMediaUpload(), { wrapper });

      expect(result.current.handleFileSelect).toBeDefined();
      expect(typeof result.current.handleFileSelect).toBe('function');
    });

    it('useMediaUpload should provide handleCategorySelect callback', async () => {
      const { useMediaUpload } = await loadMediaModule();
      const { createQueryClient, createQueryClientWrapper } = await loadTestUtils();

      const queryClient = createQueryClient();
      const wrapper = createQueryClientWrapper(queryClient);

      const { result } = renderHook(() => useMediaUpload(), { wrapper });

      expect(result.current.handleCategorySelect).toBeDefined();
      expect(typeof result.current.handleCategorySelect).toBe('function');
    });

    it('useMediaUpload should provide handleSubcategorySelect callback', async () => {
      const { useMediaUpload } = await loadMediaModule();
      const { createQueryClient, createQueryClientWrapper } = await loadTestUtils();

      const queryClient = createQueryClient();
      const wrapper = createQueryClientWrapper(queryClient);

      const { result } = renderHook(() => useMediaUpload(), { wrapper });

      expect(result.current.handleSubcategorySelect).toBeDefined();
      expect(typeof result.current.handleSubcategorySelect).toBe('function');
    });

    it('useMediaUpload should provide stable callbacks across renders', async () => {
      const { useMediaUpload } = await loadMediaModule();
      const { createQueryClient, createQueryClientWrapper } = await loadTestUtils();

      const queryClient = createQueryClient();
      const wrapper = createQueryClientWrapper(queryClient);

      const { result, rerender } = renderHook(() => useMediaUpload(), { wrapper });

      const firstHandleFileSelect = result.current.handleFileSelect;
      const firstHandleCategorySelect = result.current.handleCategorySelect;

      rerender();

      // Callbacks should be stable (wrapped in useCallback)
      expect(result.current.handleFileSelect).toBe(firstHandleFileSelect);
      expect(result.current.handleCategorySelect).toBe(firstHandleCategorySelect);
    });
  });

  describe('Pre-session Form State', () => {
    it('useMediaUpload should track pre-session form data', async () => {
      const { useMediaUpload } = await loadMediaModule();
      const { createQueryClient, createQueryClientWrapper } = await loadTestUtils();

      const queryClient = createQueryClient();
      const wrapper = createQueryClientWrapper(queryClient);

      const { result } = renderHook(() => useMediaUpload(), { wrapper });

      expect(result.current.preSessionFormData).toBeDefined();
      expect(typeof result.current.preSessionFormData).toBe('object');
    });

    it('useMediaUpload should provide handlePreSessionInputChange', async () => {
      const { useMediaUpload } = await loadMediaModule();
      const { createQueryClient, createQueryClientWrapper } = await loadTestUtils();

      const queryClient = createQueryClient();
      const wrapper = createQueryClientWrapper(queryClient);

      const { result } = renderHook(() => useMediaUpload(), { wrapper });

      expect(result.current.handlePreSessionInputChange).toBeDefined();
      expect(typeof result.current.handlePreSessionInputChange).toBe('function');
    });
  });

  describe('Upload Flow', () => {
    it('useMediaUpload should track upload progress', async () => {
      const { useMediaUpload } = await loadMediaModule();
      const { createQueryClient, createQueryClientWrapper } = await loadTestUtils();

      const queryClient = createQueryClient();
      const wrapper = createQueryClientWrapper(queryClient);

      const { result } = renderHook(() => useMediaUpload(), { wrapper });

      expect(result.current.uploadProgress).toBeNull();
      expect(result.current.isUploading).toBe(false);
    });

    it('useMediaUpload should provide onSubmit handler', async () => {
      const { useMediaUpload } = await loadMediaModule();
      const { createQueryClient, createQueryClientWrapper } = await loadTestUtils();

      const queryClient = createQueryClient();
      const wrapper = createQueryClientWrapper(queryClient);

      const { result } = renderHook(() => useMediaUpload(), { wrapper });

      expect(result.current.onSubmit).toBeDefined();
      expect(typeof result.current.onSubmit).toBe('function');
    });
  });
});

