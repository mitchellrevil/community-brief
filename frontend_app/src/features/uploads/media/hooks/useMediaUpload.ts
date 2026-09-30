import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { MediaUploadValues } from "@/shared/schema/audio-upload.schema";
import type {
  AudioUploadMetadata,
  RecordingSettings,
} from "@/types/audio-upload";
import { getMissingRequiredFieldsFromSections } from "@/components/shared/FormValidator";
import {
  isUploadCancelledError,
  uploadFile,
} from "@/features/recordings/data/api";
import { recordingsKeys } from "@/features/recordings/data/keys";
import { useIsMobile } from "@/hooks/useMobile";
import { validateAndGetAudioMetadata } from "@/lib/file-utils";
import { isOnlineSync } from "@/lib/online-status";
import { useTemplates } from "@/shared/data/templates";
import { mediaUploadSchema } from "@/shared/schema/audio-upload.schema";

// File type key
export type FileTypeKey =
  | "audio"
  | "video"
  | "document"
  | "transcript"
  | "image"
  | "other";
type UploadPhase = "idle" | "uploading" | "finalizing";

// File type configurations - exported for use in FileDropzone
export const FILE_TYPES = {
  audio: {
    accept: "audio/*",
    extensions: [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"],
    description: "Audio files for transcription and analysis",
  },
  video: {
    accept: "video/*",
    extensions: [".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm"],
    description: "Video files (audio will be extracted for analysis)",
  },
  document: {
    accept: ".pdf,.doc,.docx,.txt,.rtf",
    extensions: [".pdf", ".doc", ".docx", ".txt", ".rtf"],
    description: "Documents and text files for analysis",
  },
  transcript: {
    accept: ".txt,.srt,.vtt,.json",
    extensions: [".txt", ".srt", ".vtt", ".json"],
    description: "Transcript files ready for analysis",
  },
  image: {
    accept: "image/*",
    extensions: [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"],
    description: "Images with text content (OCR analysis)",
  },
} as const;

/**
 * Sanitize filenames for safe upload/links
 */
export function sanitizeFilename(filename: string): string {
  try {
    filename = decodeURIComponent(filename);
  } catch {
    // If decoding fails, use original filename
  }

  const lastDot = filename.lastIndexOf(".");
  let name = lastDot !== -1 ? filename.slice(0, lastDot) : filename;
  let ext = lastDot !== -1 ? filename.slice(lastDot) : "";

  name = name
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  ext = ext.replace(/[^a-zA-Z0-9.]/g, "").toLowerCase();

  return name ? `${name}${ext}` : `file${ext}`;
}

/**
 * Get file type from a File object
 */
export function getFileType(file: File): FileTypeKey {
  const extension = file.name
    .toLowerCase()
    .substring(file.name.lastIndexOf("."));

  for (const [type, config] of Object.entries(FILE_TYPES)) {
    if ((config.extensions as ReadonlyArray<string>).includes(extension)) {
      return type as keyof typeof FILE_TYPES;
    }
  }

  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.includes("text") || file.type.includes("document"))
    return "document";

  return "other";
}

export interface UseMediaUploadResult {
  // Form instance
  form: ReturnType<typeof useForm<MediaUploadValues>>;
  formValues: MediaUploadValues;

  // File state
  fileType: FileTypeKey | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;

  // Category state
  currentCategory: string | undefined;
  currentSubcategory: string | undefined;
  expandedCategories: Set<string>;
  categorySearch: string;
  setCategorySearch: (search: string) => void;

  // Runtime-scoped catalog data shared with recording uploads.
  categories: ReturnType<typeof useTemplates>["folders"];
  subcategories: ReturnType<typeof useTemplates>["templates"];
  getSubcategoriesForCategory: ReturnType<
    typeof useTemplates
  >["getTemplatesForFolder"];
  isLoadingCategories: boolean;

  // Pre-session form state
  preSessionFormData: Record<string, any>;
  preSessionSections: Array<any>;
  hasFormFields: boolean;
  viewMode: "form" | "preview";
  setViewMode: (mode: "form" | "preview") => void;

  // Transcript state
  transcriptText: string;
  setTranscriptText: (text: string) => void;
  showTranscriptInput: boolean;
  setShowTranscriptInput: (show: boolean) => void;

  // Upload/conversion state
  isConverting: boolean;
  conversionProgress: number;
  conversionStep: string;
  isSubmitting: boolean;
  isUploading: boolean;
  isFinalizing: boolean;
  isUploadCancelled: boolean;
  isUploadCancellable: boolean;
  uploadProgress: { loaded: number; total: number; percentage: number } | null;
  uploadSuccessJobId: string | null;
  uploadError: string | null;
  activeUploadFileName: string | null;

  // UI state
  promptPreviewOpen: boolean;
  setPromptPreviewOpen: (open: boolean) => void;
  copiedPrompt: boolean;
  promptPreviewText: string;
  showSelector: boolean;
  setShowSelector: (show: boolean) => void;
  isWindowDrag: boolean;
  setIsWindowDrag: (drag: boolean) => void;
  isMobile: boolean;

  // Callbacks
  handleFileSelect: (file: File) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleTranscriptUpload: () => void;
  handleCategorySelect: (id: string) => void;
  handleSubcategorySelect: (id: string) => void;
  handlePreSessionInputChange: (fieldName: string, value: unknown) => void;
  handleCopyPrompt: () => void;
  toggleCategory: (categoryId: string) => void;
  onSubmit: (values: MediaUploadValues) => Promise<void>;
  resetForm: (options?: { clearSuccess?: boolean }) => void;
  dismissUploadError: () => void;
  cancelUpload: () => void;
}

interface UseMediaUploadOptions {
  initialMediaFile?: File | null;
  onSuccess?: (jobId: string) => void;
}

export function useMediaUpload(
  options?: UseMediaUploadOptions,
): UseMediaUploadResult {
  const { initialMediaFile, onSuccess } = options ?? {};
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  // Refs
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const ffmpegDurationRef = useRef<number | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeUploadIdRef = useRef(0);
  const uploadPhaseRef = useRef<UploadPhase>("idle");

  // Form state
  const form = useForm<MediaUploadValues>({
    resolver: zodResolver(mediaUploadSchema),
  });
  const formValues = form.watch();
  const currentCategory = formValues.promptCategory;
  const currentSubcategory = formValues.promptSubcategory;

  // File type state
  const [fileType, setFileType] = useState<FileTypeKey | null>(null);

  // Category state
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [categorySearch, setCategorySearch] = useState("");

  // Pre-session form state
  const [preSessionFormData, setPreSessionFormData] = useState<
    Record<string, any>
  >({});
  const [viewMode, setViewMode] = useState<"form" | "preview">("preview");

  // Transcript state
  const [transcriptText, setTranscriptText] = useState("");
  const [showTranscriptInput, setShowTranscriptInput] = useState(false);

  // Conversion state
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [conversionStep, setConversionStep] = useState("");

  // Upload state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    loaded: number;
    total: number;
    percentage: number;
  } | null>(null);
  const [uploadSuccessJobId, setUploadSuccessJobId] = useState<string | null>(
    null,
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeUploadFileName, setActiveUploadFileName] = useState<
    string | null
  >(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isUploadCancelled, setIsUploadCancelled] = useState(false);

  // UI state
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(true);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [isWindowDrag, setIsWindowDrag] = useState(false);

  // Use category data hook
  const {
    folders: categories,
    templates: subcategories,
    isLoading: isLoadingCategories,
    getTemplatesForFolder: getSubcategoriesForCategory,
  } = useTemplates("runtime");

  // Pre-session sections derived from current subcategory
  const currentSubcategoryData = useMemo(
    () =>
      subcategories.find(
        (subcategory) => subcategory.id === currentSubcategory,
      ),
    [subcategories, currentSubcategory],
  );

  const preSessionSections = useMemo(
    () => currentSubcategoryData?.pre_session_talking_points ?? [],
    [currentSubcategoryData],
  );

  const hasFormFields = useMemo(
    () => preSessionSections.some((section: any) => section.fields.length > 0),
    [preSessionSections],
  );

  // Prompt preview text
  const promptPreviewText = useMemo(() => {
    if (!currentSubcategory) return "";
    const sub = subcategories.find((s) => s.id === currentSubcategory);
    if (!sub?.prompts)
      return "No template content found for this meeting type.";
    return Object.entries(sub.prompts)
      .map(([k, v]) => `${k}:\n${v}`)
      .join("\n\n---\n\n");
  }, [currentSubcategory, subcategories]);

  // Set initial media file if provided
  useEffect(() => {
    if (initialMediaFile) {
      form.setValue("mediaFile", initialMediaFile);
      setFileType(getFileType(initialMediaFile));
    }
  }, [initialMediaFile, form]);

  // Update view mode based on form fields
  useEffect(() => {
    if (hasFormFields) {
      setViewMode("form");
    } else {
      setViewMode("preview");
    }
    setPreSessionFormData({});
  }, [hasFormFields, currentSubcategory]);

  // Upload mutation
  const { mutateAsync: uploadMediaMutation, isPending: isUploading } =
    useMutation({
      mutationKey: ["community-brief/upload-media"],
      networkMode: "always",
      mutationFn: async (
        values: MediaUploadValues & {
          uploadMetadata?: AudioUploadMetadata;
          signal: AbortSignal;
          uploadId: number;
        },
      ) =>
        await uploadFile(
          values.mediaFile,
          values.promptCategory,
          values.promptSubcategory,
          preSessionFormData,
          (progress: { loaded: number; total: number; percentage: number }) =>
            setUploadProgress(progress),
          values.uploadMetadata,
          values.signal,
          (phase) => {
            if (
              values.uploadId === activeUploadIdRef.current &&
              !values.signal.aborted
            ) {
              uploadPhaseRef.current = phase;
              setIsFinalizing(phase === "finalizing");
            }
          },
        ),
      onSuccess: (data, values) => {
        if (
          values.signal.aborted ||
          values.uploadId !== activeUploadIdRef.current
        ) {
          return;
        }
        setUploadProgress(null);
        setUploadError(null);
        queryClient.invalidateQueries({ queryKey: recordingsKeys.base() });

        if (data.queued) {
          setUploadSuccessJobId(null);
          toast.success("Recording queued for upload", {
            description: "Will upload automatically when you're back online",
          });
        } else {
          const jobId = data.job_id ?? "Unknown";
          setUploadSuccessJobId(jobId);
          toast.success(`File processed successfully! Job ID: ${jobId}`);
          onSuccess?.(jobId);
        }
      },
      onError: (error, values) => {
        if (values.uploadId !== activeUploadIdRef.current) {
          return;
        }
        uploadPhaseRef.current = "idle";
        if (isUploadCancelledError(error, values.signal)) {
          setUploadProgress(null);
          setUploadError(null);
          setUploadSuccessJobId(null);
          setIsUploadCancelled(true);
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : `There was an error processing your file. Please try again.`;
        setUploadError(message);
        toast.error(message);
        setUploadProgress(null);
      },
    });

  useEffect(
    () => () => {
      if (uploadPhaseRef.current !== "finalizing") {
        abortControllerRef.current?.abort();
      }
    },
    [],
  );
  // Prevent page refresh during upload
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isUploading || isConverting || isSubmitting) {
        event.preventDefault();
        event.returnValue =
          "Upload in progress. Are you sure you want to leave?";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isUploading, isConverting, isSubmitting]);

  // Validate pre-session form
  const validatePreSessionForm = useCallback(() => {
    if (!hasFormFields) return true;
    const missing = getMissingRequiredFieldsFromSections(preSessionSections, preSessionFormData);

    if (missing.length > 0) {
      toast.error(`Please fill in required fields: ${missing.join(", ")}`);
      return false;
    }
    return true;
  }, [hasFormFields, preSessionSections, preSessionFormData]);

  // Convert file to WAV
  const convertToWav = useCallback(async (file: File): Promise<File> => {
    const { convertToWavWithFFmpeg } = await import("@/lib/ffmpegConvert");
    return await convertToWavWithFFmpeg(file, {
      setIsConverting,
      setConversionProgress,
      setConversionStep,
      onMetadata: (meta) => {
        ffmpegDurationRef.current = meta.durationSeconds;
      },
    });
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback(
    (file: File) => {
      setUploadSuccessJobId(null);
      setUploadError(null);
      setIsUploadCancelled(false);
      setActiveUploadFileName(file.name);
      form.setValue("mediaFile", file);
      setFileType(getFileType(file));
      setTranscriptText("");
      setShowTranscriptInput(false);
      form.clearErrors("mediaFile");
    },
    [form],
  );

  // Handle drag drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsWindowDrag(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) handleFileSelect(files[0]);
    },
    [handleFileSelect],
  );

  // Handle transcript upload
  const handleTranscriptUpload = useCallback(() => {
    if (!transcriptText.trim()) {
      toast.error("Please enter transcript text");
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `transcript-${timestamp}.txt`;
    const transcriptFile = new (window as any).File(
      [transcriptText],
      fileName,
      {
        type: "text/plain",
        lastModified: Date.now(),
      },
    ) as File;

    form.setValue("mediaFile", transcriptFile);
    setUploadSuccessJobId(null);
    form.trigger("mediaFile");
    setFileType("transcript");
    setShowTranscriptInput(false);
    setUploadError(null);
    setIsUploadCancelled(false);
    setActiveUploadFileName(fileName);
    form.clearErrors("mediaFile");
    toast.success("Transcript uploaded successfully!");
  }, [transcriptText, form]);

  // Toggle category expansion
  const toggleCategory = useCallback((categoryId: string) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  }, []);

  // Handle category selection
  const handleCategorySelect = useCallback(
    (id: string) => {
      form.setValue("promptCategory", id);
      form.setValue("promptSubcategory", "");
      form.clearErrors("promptCategory");
      form.clearErrors("promptSubcategory");
      form.trigger(["promptCategory", "promptSubcategory"]);

      if (!expandedCategories.has(id)) {
        toggleCategory(id);
      }
    },
    [form, expandedCategories, toggleCategory],
  );

  // Handle subcategory selection
  const handleSubcategorySelect = useCallback(
    (id: string) => {
      const subcategory = subcategories.find((s) => s.id === id);
      if (!subcategory) return;

      const parentCategoryId = subcategory.folder_id;
      if (!currentCategory || currentCategory !== parentCategoryId) {
        form.setValue("promptCategory", parentCategoryId);
        form.clearErrors("promptCategory");
        if (!expandedCategories.has(parentCategoryId)) {
          toggleCategory(parentCategoryId);
        }
      }

      form.setValue("promptSubcategory", id);
      form.clearErrors("promptSubcategory");
      form.trigger(["promptCategory", "promptSubcategory"]);

      if (isMobile) {
        setShowSelector(false);
      }
    },
    [
      subcategories,
      currentCategory,
      form,
      expandedCategories,
      toggleCategory,
      isMobile,
    ],
  );

  // Handle pre-session input change
  const handlePreSessionInputChange = useCallback(
    (fieldName: string, value: unknown) => {
      setPreSessionFormData((prev) => ({
        ...prev,
        [fieldName]: value,
      }));
    },
    [],
  );

  // Handle copy prompt
  const handleCopyPrompt = useCallback(() => {
    if (!promptPreviewText) return;
    navigator.clipboard.writeText(promptPreviewText).then(() => {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 1500);
    });
  }, [promptPreviewText]);

  // Reset form
  const resetForm = useCallback(
    (resetOptions?: { clearSuccess?: boolean }) => {
      if (uploadPhaseRef.current === "finalizing") {
        return;
      }

      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      activeUploadIdRef.current += 1;
      uploadPhaseRef.current = "idle";
      const shouldClearSuccess = resetOptions?.clearSuccess ?? true;

      form.reset({
        mediaFile: undefined,
        promptCategory: "",
        promptSubcategory: "",
      });
      setPreSessionFormData({});
      setFileType(null);
      setTranscriptText("");
      setShowTranscriptInput(false);
      setExpandedCategories(new Set());
      setUploadProgress(null);
      setUploadError(null);
      setIsUploadCancelled(false);
      setIsFinalizing(false);
      if (shouldClearSuccess) {
        setUploadSuccessJobId(null);
        setActiveUploadFileName(null);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      form.clearErrors();
    },
    [form],
  );

  const dismissUploadError = useCallback(() => {
    setUploadError(null);
    setIsUploadCancelled(false);
  }, []);

  const cancelUpload = useCallback(() => {
    const controller = abortControllerRef.current;
    if (
      !controller ||
      controller.signal.aborted ||
      uploadPhaseRef.current === "finalizing"
    ) {
      return;
    }

    controller.abort();
    setUploadProgress(null);
    setUploadError(null);
    setUploadSuccessJobId(null);
    setIsUploadCancelled(true);
  }, []);

  // Submit handler
  const onSubmit = useCallback(
    async (values: MediaUploadValues) => {
      setIsSubmitting(true);
      setUploadError(null);
      setIsUploadCancelled(false);

      if (!values.mediaFile) {
        toast.error("Please select or upload a media file before submitting.");
        form.setError("mediaFile", {
          type: "manual",
          message: "Please add a media file.",
        });
        setIsSubmitting(false);
        return;
      }

      if (!values.promptCategory) {
        toast.error("Please select a service area before submitting.");
        form.setError("promptCategory", {
          type: "manual",
          message: "Please select a service area.",
        });
        setIsSubmitting(false);
        return;
      }

      if (!values.promptSubcategory) {
        toast.error("Please select a meeting type before submitting.");
        form.setError("promptSubcategory", {
          type: "manual",
          message: "Please select a meeting type.",
        });
        setIsSubmitting(false);
        return;
      }

      if (!validatePreSessionForm()) {
        setIsSubmitting(false);
        return;
      }

      let processedFile = values.mediaFile;
      const originalFile = processedFile;
      const selectedFileType = getFileType(originalFile);
      let uploadMetadata: AudioUploadMetadata | undefined;
      ffmpegDurationRef.current = undefined;

      if (processedFile) {
        const originalName = processedFile.name;
        const cleanName = sanitizeFilename(originalName);
        if (cleanName !== originalName) {
          processedFile = new (window as any).File([processedFile], cleanName, {
            type: processedFile.type,
            lastModified: processedFile.lastModified,
          }) as File;
        }
      }

      const isCurrentlyOnline = isOnlineSync();

      if (
        processedFile &&
        (selectedFileType === "audio" || selectedFileType === "video") &&
        isCurrentlyOnline
      ) {
        const originalFileName = processedFile.name;

        try {
          setIsConverting(true);
          setConversionProgress(0);
          setConversionStep("Starting conversion...");

          processedFile = await convertToWav(processedFile);

          if (
            processedFile.name !== originalFileName ||
            processedFile.type === "audio/wav"
          ) {
            toast.success("Media converted to WAV format successfully!");
          }
        } catch {
          toast.error(
            "Media conversion failed. Uploading original file instead.",
          );
          processedFile = values.mediaFile;
        } finally {
          setIsConverting(false);
          setConversionProgress(0);
          setConversionStep("");
        }
      } else {
        if (processedFile && !isCurrentlyOnline) {
          toast.info(
            "Offline: Uploading in original format, will process when online",
          );
        }
      }

      if (processedFile && (selectedFileType === "audio" || selectedFileType === "video")) {
        const wasConverted = processedFile !== originalFile;
        const convertedDurationSeconds = ffmpegDurationRef.current;
        const meta = await validateAndGetAudioMetadata(processedFile);
        const detectedDurationSeconds =
          meta.isValid && typeof meta.duration === "number"
            ? meta.duration
            : undefined;
        const durationSeconds =
          typeof convertedDurationSeconds === "number"
            ? convertedDurationSeconds
            : detectedDurationSeconds;

        const settings: RecordingSettings = {
          source_mime_type: values.mediaFile?.type,
          mime_type: processedFile.type || values.mediaFile?.type,
        };

        if (wasConverted && processedFile.type === "audio/wav") {
          settings.sample_rate_hz = 16000;
          settings.channels = 1;
          settings.codec = "pcm_s16le";
        }

        uploadMetadata = {
          audio_duration_seconds: durationSeconds,
          audio_duration_minutes:
            typeof durationSeconds === "number"
              ? durationSeconds / 60
              : undefined,
          recording_settings: settings,
        };
      }

      let controller: AbortController | null = null;
      let uploadId: number | null = null;

      try {
        setActiveUploadFileName(processedFile.name);
        controller = new AbortController();
        uploadId = activeUploadIdRef.current + 1;
        activeUploadIdRef.current = uploadId;
        abortControllerRef.current = controller;
        uploadPhaseRef.current = "uploading";
        setIsFinalizing(false);
        await uploadMediaMutation({
          ...values,
          mediaFile: processedFile,
          uploadMetadata,
          signal: controller.signal,
          uploadId,
        });

        if (
          !controller.signal.aborted &&
          uploadId === activeUploadIdRef.current
        ) {
          uploadPhaseRef.current = "idle";
          setIsFinalizing(false);
          setIsSubmitting(false);
          resetForm({ clearSuccess: false });
        }
      } catch {
        // Error handled by mutation's onError callback
      } finally {
        if (controller && abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        if (uploadId === activeUploadIdRef.current) {
          uploadPhaseRef.current = "idle";
          setIsFinalizing(false);
          setIsSubmitting(false);
        }
      }
    },
    [
      form,
      uploadMediaMutation,
      validatePreSessionForm,
      convertToWav,
      resetForm,
    ],
  );

  return {
    // Form
    form,
    formValues,

    // File state
    fileType,
    fileInputRef,

    // Category state
    currentCategory,
    currentSubcategory,
    expandedCategories,
    categorySearch,
    setCategorySearch,

    // Category data
    categories,
    subcategories,
    getSubcategoriesForCategory,
    isLoadingCategories,

    // Pre-session form state
    preSessionFormData,
    preSessionSections,
    hasFormFields,
    viewMode,
    setViewMode,

    // Transcript state
    transcriptText,
    setTranscriptText,
    showTranscriptInput,
    setShowTranscriptInput,

    // Upload/conversion state
    isConverting,
    conversionProgress,
    conversionStep,
    isSubmitting,
    isUploading,
    isFinalizing,
    isUploadCancelled,
    isUploadCancellable: isUploading && !isFinalizing && !isUploadCancelled,
    uploadProgress,
    uploadSuccessJobId,
    uploadError,
    activeUploadFileName,

    // UI state
    promptPreviewOpen,
    setPromptPreviewOpen,
    copiedPrompt,
    promptPreviewText,
    showSelector,
    setShowSelector,
    isWindowDrag,
    setIsWindowDrag,
    isMobile,

    // Callbacks
    handleFileSelect,
    handleDrop,
    handleTranscriptUpload,
    handleCategorySelect,
    handleSubcategorySelect,
    handlePreSessionInputChange,
    handleCopyPrompt,
    toggleCategory,
    onSubmit,
    resetForm,
    dismissUploadError,
    cancelUpload,
  };
}
