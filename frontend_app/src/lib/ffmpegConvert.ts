import { toast } from "sonner";
import { getFFmpeg } from "./audio-compression";

export interface AudioFfmpegMetadata {
  durationSeconds?: number;
}

export interface FFmpegConvertOptions {
  setIsConverting?: (v: boolean) => void;
  setConversionProgress?: (v: number) => void;
  setConversionStep?: (v: string) => void;
  onMetadata?: (meta: AudioFfmpegMetadata) => void;
}

function fileExtension(file: Blob): string {
  if (file.type.includes("mp4")) return "m4a";
  if (file.type.includes("wav")) return "wav";
  if (file.type.includes("mpeg")) return "mp3";
  return "webm";
}

let mergeOperationId = 0;

export async function concatenateAudioSegments(
  segments: Array<Blob>,
  opts: FFmpegConvertOptions = {},
): Promise<File> {
  if (segments.length < 2) {
    throw new Error("At least two audio segments are required");
  }

  const { setConversionProgress, setConversionStep } = opts;
  const ffmpeg = await getFFmpeg();
  const operationPrefix = `recording-merge-${++mergeOperationId}`;
  const inputNames = segments.map(
    (segment, index) => `${operationPrefix}-segment-${index}.${fileExtension(segment)}`,
  );
  const outputName = `${operationPrefix}.wav`;
  const onProgress = ({ progress }: { progress: number }) => {
    setConversionProgress?.(Math.round(progress * 100));
  };

  ffmpeg.on("progress", onProgress);
  try {
    setConversionStep?.("Preparing recording segments...");
    setConversionProgress?.(10);
    await Promise.all(
      segments.map(async (segment, index) => {
        await ffmpeg.writeFile(
          inputNames[index],
          new Uint8Array(await segment.arrayBuffer()),
        );
      }),
    );

    setConversionStep?.("Joining recording segments...");
    setConversionProgress?.(35);
    const filterInputs = segments.map((_, index) => `[${index}:a]`).join("");
    await ffmpeg.exec([
      ...inputNames.flatMap((name) => ["-i", name]),
      "-filter_complex",
      `${filterInputs}concat=n=${segments.length}:v=0:a=1[out]`,
      "-map",
      "[out]",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-y",
      outputName,
    ]);

    setConversionStep?.("Finalizing recording...");
    setConversionProgress?.(90);
    const outputData = await ffmpeg.readFile(outputName);
    const outputBytes = outputData instanceof Uint8Array
      ? new Uint8Array(outputData)
      : new TextEncoder().encode(outputData);
    setConversionProgress?.(100);
    return new File([outputBytes], "continued-recording.wav", { type: "audio/wav" });
  } finally {
    ffmpeg.off("progress", onProgress);
    await Promise.allSettled([
      ...inputNames.map((name) => ffmpeg.deleteFile(name)),
      ffmpeg.deleteFile(outputName),
    ]);
  }
}

function parseDurationSeconds(message: string): number | undefined {
  const match = message.match(/Duration:\s*([0-9:.]+)/);
  if (!match || match[1] === "N/A") return undefined;
  const parts = match[1].split(":");
  if (parts.length !== 3) return undefined;
  const [hours, minutes, seconds] = parts;
  const secs = Number.parseFloat(seconds);
  if (Number.isNaN(secs)) return undefined;
  return (Number.parseInt(hours, 10) * 3600) + (Number.parseInt(minutes, 10) * 60) + secs;
}

export async function convertToWavWithFFmpeg(
  file: File,
  opts: FFmpegConvertOptions = {}
): Promise<File> {
  const { setIsConverting, setConversionProgress, setConversionStep, onMetadata } = opts;
  
  // Skip conversion if file is already WAV
  if (file.type === "audio/wav" || file.name.toLowerCase().endsWith('.wav')) {
    return file;
  }
  
  if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) return file;
  setIsConverting?.(true);
  setConversionStep?.("Loading FFmpeg...");
  setConversionProgress?.(10);
  const meta: AudioFfmpegMetadata = {};
  let inputName: string | null = null;
  let outputName: string | null = null;
  let ffmpeg: Awaited<ReturnType<typeof getFFmpeg>> | null = null;
  let onProgress: ((event: { progress: number }) => void) | null = null;
  let onLog: ((event: { message: string }) => void) | null = null;
  try {
    // Use shared FFmpeg singleton to avoid re-downloading 25MB WASM
    ffmpeg = await getFFmpeg();
    onProgress = ({ progress }: { progress: number }) => {
      setConversionProgress?.(Math.round(progress * 100));
    };
    onLog = ({ message }: { message: string }) => {
      if (meta.durationSeconds === undefined) {
        const duration = parseDurationSeconds(message);
        if (duration !== undefined) {
          meta.durationSeconds = duration;
        }
      }
    };
    ffmpeg.on("progress", onProgress);
    ffmpeg.on("log", onLog);
    setConversionStep?.("Preparing file...");
    setConversionProgress?.(25);
    inputName = file.name;
    outputName = inputName.replace(/\.[^/.]+$/, "") + ".wav";
    const fileData = await file.arrayBuffer();
    await ffmpeg.writeFile(inputName, new Uint8Array(fileData));
    setConversionStep?.("Converting to WAV...");
    setConversionProgress?.(50);
    await ffmpeg.exec([
      "-i", inputName,
      "-vn", // Remove any video stream
      "-acodec", "pcm_s16le",
      "-ar", "16000",
      "-ac", "1",
      "-y",
      outputName,
    ]);
    setConversionStep?.("Finalizing...");
    setConversionProgress?.(85);
    const outputData = await ffmpeg.readFile(outputName);
    const wavBytes = outputData instanceof Uint8Array
      ? new Uint8Array(outputData)
      : new TextEncoder().encode(outputData);
    const wavFile = new File([wavBytes], outputName, { type: "audio/wav" });
    onMetadata?.(meta);
    setConversionProgress?.(100);
    setIsConverting?.(false);
    return wavFile;
  } catch (e) {
    setIsConverting?.(false);
    setConversionStep?.("");
    setConversionProgress?.(0);
    toast.error("Conversion failed. Uploading original file.");
    return file;
  } finally {
    if (ffmpeg && onProgress) ffmpeg.off("progress", onProgress);
    if (ffmpeg && onLog) ffmpeg.off("log", onLog);
    if (ffmpeg) {
      await Promise.allSettled([
        ...(inputName ? [ffmpeg.deleteFile(inputName)] : []),
        ...(outputName ? [ffmpeg.deleteFile(outputName)] : []),
      ]);
    }
  }
}
