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
  try {
    // Use shared FFmpeg singleton to avoid re-downloading 25MB WASM
    const ffmpeg = await getFFmpeg();
    const onProgress = ({ progress }: any) => {
      setConversionProgress?.(Math.round(progress * 100));
    };
    const onLog = ({ message }: any) => {
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
    const inputName = file.name;
    const outputName = inputName.replace(/\.[^/.]+$/, "") + ".wav";
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
    // Clean up event listeners to avoid memory leaks when reusing singleton
    ffmpeg.off("progress", onProgress);
    ffmpeg.off("log", onLog);
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
    return wavFile;
  } catch (e) {
    setIsConverting?.(false);
    setConversionStep?.("");
    setConversionProgress?.(0);
    toast.error("Conversion failed. Uploading original file.");
    return file;
  }
}
