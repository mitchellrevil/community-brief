import { memo, useEffect, useMemo, useState } from "react";
import {
  ClipboardPaste,
  File,
  FileText,
  Film,
  Image,
  Music,
  Upload,
  X,
} from "lucide-react";
import type { MediaUploadValues } from "@/shared/schema/audio-upload.schema";
import type { UseFormReturn } from "react-hook-form";
import type { FileTypeKey } from "./hooks/useMediaUpload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, FormItem, FormMessage } from "@/components/ui/form";
import { MotionDiv } from "@/components/ui/motion";
import { Textarea } from "@/components/ui/textarea";
import { DURATION, EASING } from "@/lib/motion";


// File type configurations with icons
export const FILE_TYPES = {
  audio: {
    icon: Music,
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    accept: "audio/*",
    extensions: [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"],
    description: "Audio files for transcription and analysis",
  },
  video: {
    icon: Film,
    color:
      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    accept: "video/*",
    extensions: [".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm"],
    description: "Video files (audio will be extracted for analysis)",
  },
  document: {
    icon: FileText,
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    accept: ".pdf,.doc,.docx,.txt,.rtf",
    extensions: [".pdf", ".doc", ".docx", ".txt", ".rtf"],
    description: "Documents and text files for analysis",
  },
  transcript: {
    icon: File,
    color:
      "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    accept: ".txt,.srt,.vtt,.json",
    extensions: [".txt", ".srt", ".vtt", ".json"],
    description: "Transcript files ready for analysis",
  },
  image: {
    icon: Image,
    color: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
    accept: "image/*",
    extensions: [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"],
    description: "Images with text content (OCR analysis)",
  },
} as const;

export interface FileDropzoneProps {
  form: UseFormReturn<MediaUploadValues>;
  fileType: FileTypeKey | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  transcriptText: string;
  setTranscriptText: (text: string) => void;
  showTranscriptInput: boolean;
  setShowTranscriptInput: (show: boolean) => void;
  handleFileSelect: (file: File) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleTranscriptUpload: () => void;
  isWindowDrag: boolean;
  setIsWindowDrag: (drag: boolean) => void;
  resetForm: () => void;
}

function FileDropzoneComponent({
  form,
  fileType,
  fileInputRef,
  transcriptText,
  setTranscriptText,
  showTranscriptInput,
  setShowTranscriptInput,
  handleFileSelect,
  handleDrop,
  handleTranscriptUpload,
  isWindowDrag,
  setIsWindowDrag,
  resetForm,
}: FileDropzoneProps) {
  const [clipboardError, setClipboardError] = useState("");

  const transcriptStats = useMemo(() => {
    const trimmed = transcriptText.trim();

    if (!trimmed) {
      return {
        characters: 0,
        words: 0,
        lines: 0,
      };
    }

    return {
      characters: trimmed.length,
      words: trimmed.split(/\s+/).filter(Boolean).length,
      lines: trimmed.split(/\r\n|\r|\n/).length,
    };
  }, [transcriptText]);

  const handleClipboardPaste = async () => {
    setClipboardError("");

    try {
      const text = await navigator.clipboard.readText();

      if (!text.trim()) {
        setClipboardError("Clipboard is empty.");
        return;
      }

      setTranscriptText(text);
    } catch {
      setClipboardError(
        "Clipboard access was blocked. Paste into the box instead.",
      );
    }
  };

  const closeTranscriptInput = () => {
    setShowTranscriptInput(false);
    setTranscriptText("");
    setClipboardError("");
  };

  // Register window drag listeners
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        setIsWindowDrag(true);
      }
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        setIsWindowDrag(true);
      }
    };
    const onDragLeave = (e: DragEvent) => {
      if ((e.target as HTMLElement) === document.documentElement) {
        setIsWindowDrag(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsWindowDrag(false);
      if (e.dataTransfer?.files.length) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleFileSelect, setIsWindowDrag]);

  const renderFileIcon = () => {
    if (!fileType || fileType === "other")
      return <File className="text-muted-foreground h-8 w-8" />;

    const config = FILE_TYPES[fileType];
    const IconComponent = config.icon;
    return <IconComponent className="text-primary h-8 w-8" />;
  };

  const renderFileTypeInfo = () => {
    if (!fileType || fileType === "other") return null;

    const config = FILE_TYPES[fileType];
    const IconComponent = config.icon;

    return (
      <div className="flex items-center gap-2 text-sm">
        <Badge variant="secondary" className={config.color}>
          <IconComponent className="mr-1 h-3 w-3" />
          {fileType.charAt(0).toUpperCase() + fileType.slice(1)}
        </Badge>
        <span className="text-muted-foreground">{config.description}</span>
      </div>
    );
  };

  return (
    <>
      {/* Full-page drag overlay */}
      {isWindowDrag && (
        <div className="bg-background/80 border-primary/40 pointer-events-none fixed inset-0 z-40 flex items-center justify-center border-4 border-dashed backdrop-blur-sm">
          <div className="space-y-4 text-center">
            <Upload className="text-primary mx-auto h-12 w-12 animate-bounce sm:h-16 sm:w-16" />
            <p className="from-primary to-foreground bg-gradient-to-r bg-clip-text text-xl font-semibold text-transparent sm:text-2xl">
              Drop to Upload
            </p>
            <p className="text-muted-foreground text-sm">
              We will auto-detect the file type.
            </p>
          </div>
        </div>
      )}

      {/* Drop Zone */}
      <FormField
        control={form.control}
        name="mediaFile"
        render={({ field }) => (
          <FormItem>
            <MotionDiv
              onClick={() => {
                if (!showTranscriptInput) {
                  fileInputRef.current?.click();
                }
              }}
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsWindowDrag(true);
              }}
              className={`group bg-card relative rounded-xl border border-dashed px-4 py-6 sm:px-6 sm:py-8 ${showTranscriptInput ? "cursor-default" : "cursor-pointer"} ${field.value ? "border-primary/50 border-solid" : ""}`}
              whileHover={{
                scale: 1.01,
                y: -2,
                transition: { duration: DURATION.FAST, ease: EASING.easeOut },
              }}
              whileTap={{
                scale: 0.99,
                transition: { duration: DURATION.FAST, ease: EASING.easeOut },
              }}
              style={{ transformOrigin: "center" }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*,image/*,.pdf,.doc,.docx,.txt,.rtf,.srt,.vtt,.json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
                className="hidden"
              />

              {/* Empty state */}
              {!field.value && !showTranscriptInput && (
                <div className="relative z-10 mx-auto max-w-xl space-y-4 text-center sm:space-y-6">
                  <div className="flex justify-center">
                    <div className="bg-primary/10 text-primary ring-primary/30 transform rounded-2xl p-4 ring-1 transition group-hover:scale-105 sm:p-6">
                      <Upload className="h-8 w-8 sm:h-10 sm:w-10" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-lg font-bold tracking-tight sm:text-2xl">
                      Drop your media or tap to browse
                    </h2>
                    <p className="text-muted-foreground text-xs sm:text-sm">
                      Audio, video, documents, transcripts, images.
                    </p>
                  </div>
                  <div className="text-muted-foreground flex flex-wrap justify-center gap-1.5 text-xs sm:gap-2">
                    <span className="bg-muted/60 rounded-full px-2 py-0.5 sm:py-1">
                      MP3
                    </span>
                    <span className="bg-muted/60 rounded-full px-2 py-0.5 sm:py-1">
                      WAV
                    </span>
                    <span className="bg-muted/60 rounded-full px-2 py-0.5 sm:py-1">
                      MP4
                    </span>
                    <span className="bg-muted/60 rounded-full px-2 py-0.5 sm:py-1">
                      DOCX
                    </span>
                    <span className="bg-muted/60 rounded-full px-2 py-0.5 sm:py-1">
                      PDF
                    </span>
                  </div>
                  <div className="flex flex-col justify-center gap-2 sm:flex-row sm:gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-full sm:w-auto"
                    >
                      Browse Files
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-full sm:w-auto"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowTranscriptInput(true);
                      }}
                    >
                      <ClipboardPaste className="mr-2 h-4 w-4" />
                      Paste Transcript
                    </Button>
                  </div>
                </div>
              )}

              {/* Transcript input */}
              {showTranscriptInput && !field.value && (
                <div
                  className="relative z-10 mx-auto max-w-3xl space-y-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-orange-100 p-2 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-900">
                          <FileText className="h-4 w-4" />
                        </div>
                        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
                          Paste a transcript
                        </h2>
                      </div>
                      <p className="text-muted-foreground text-sm">
                        Add the transcript text below. We will save it as a text
                        file and send it through the same analysis flow.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={closeTranscriptInput}
                      className="self-start"
                      aria-label="Close transcript input"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="bg-background overflow-hidden rounded-lg border">
                    <div className="bg-muted/30 flex flex-col gap-2 border-b px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
                        <span>
                          {transcriptStats.words.toLocaleString()} words
                        </span>
                        <span>
                          {transcriptStats.characters.toLocaleString()}{" "}
                          characters
                        </span>
                        <span>
                          {transcriptStats.lines.toLocaleString()} lines
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleClipboardPaste}
                          className="h-8"
                        >
                          <ClipboardPaste className="mr-2 h-4 w-4" />
                          Paste
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setTranscriptText("");
                            setClipboardError("");
                          }}
                          disabled={!transcriptText}
                          className="h-8"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      rows={12}
                      value={transcriptText}
                      onChange={(e) => {
                        setTranscriptText(e.target.value);
                        setClipboardError("");
                      }}
                      onKeyDown={(e) => {
                        if (
                          (e.ctrlKey || e.metaKey) &&
                          e.key === "Enter" &&
                          transcriptText.trim()
                        ) {
                          e.preventDefault();
                          handleTranscriptUpload();
                        }
                      }}
                      placeholder="Paste the transcript here..."
                      className="bg-background min-h-[18rem] resize-y rounded-none border-0 text-sm leading-6 shadow-none focus-visible:ring-0"
                    />
                  </div>

                  {clipboardError && (
                    <p className="text-destructive text-sm">{clipboardError}</p>
                  )}

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeTranscriptInput}
                      className="w-full sm:w-auto"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleTranscriptUpload}
                      disabled={!transcriptText.trim()}
                      className="w-full sm:w-auto"
                    >
                      Use Transcript
                    </Button>
                  </div>
                </div>
              )}

              {/* File selected state */}
              {field.value && (
                <div className="relative z-10 mx-auto max-w-3xl space-y-4 sm:grid sm:grid-cols-2 sm:items-start sm:gap-8 sm:space-y-0">
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex items-center gap-3 sm:gap-4">
                      {renderFileIcon()}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold sm:text-lg">
                          {field.value.name}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {(field.value.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    {renderFileTypeInfo()}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                      >
                        Replace
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          field.onChange(undefined);
                          resetForm();
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                  <div className="text-muted-foreground space-y-2 border-t pt-3 text-sm sm:space-y-3 sm:border-t-0 sm:pt-0">
                    <p className="text-foreground font-medium">Next Steps</p>
                    <ol className="list-inside list-decimal space-y-1 text-xs sm:text-sm">
                      <li>Select a Service Area</li>
                      <li>Choose Meeting Type</li>
                      <li>Review prompts & Upload</li>
                    </ol>
                  </div>
                </div>
              )}
            </MotionDiv>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

export const FileDropzone = memo(FileDropzoneComponent);
