import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Mic, Pause, Play, RotateCcw, Square, Volume2, VolumeX, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { isOnline } from "@/lib/online-status";
import { queueRecording } from "@/lib/pwa-queue";

interface AudioRecordingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRecordingComplete: (file: File) => void;
}

enum RecordingState {
  IDLE = "idle",
  RECORDING = "recording", 
  PAUSED = "paused",
  RECORDED = "recorded",
  PROCESSING = "processing"
}

function getRandomString(length = 8) {
  return Math.random().toString(36).substring(2, 2 + length);
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function AudioRecordingModal({ isOpen, onClose, onRecordingComplete }: AudioRecordingModalProps) {
  const [state, setState] = useState<RecordingState>(RecordingState.IDLE);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  
  // Playback controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(75);
  const [isMuted, setIsMuted] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Array<Blob>>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Clean up on unmount or close
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (audioURL) {
        URL.revokeObjectURL(audioURL);
      }
    };
  }, [audioURL]);

  // Audio player event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    // Set volume
    audio.volume = volume / 100;
    audio.muted = isMuted;

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [audioURL, volume, isMuted]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunks.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: "audio/wav" });
        const url = URL.createObjectURL(audioBlob);
        setAudioURL(url);
        setState(RecordingState.RECORDED);
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorderRef.current.start();
      setState(RecordingState.RECORDING);
      setRecordingDuration(0);
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      toast.success("Recording started");
    } catch (error) {
      toast.error("Failed to access microphone");
      console.error("Error starting recording:", error);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.pause();
      setState(RecordingState.PAUSED);
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
      mediaRecorderRef.current.resume();
      setState(RecordingState.RECORDING);
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const playPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  };

  const seek = (newTime: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (newVolume: Array<number>) => {
    const volumeValue = newVolume[0];
    setVolume(volumeValue);
    
    if (audioRef.current) {
      audioRef.current.volume = volumeValue / 100;
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
    }
  };

  const resetRecording = () => {
    if (mediaRecorderRef.current && 
        (mediaRecorderRef.current.state === "recording" || mediaRecorderRef.current.state === "paused")) {
      mediaRecorderRef.current.stop();
    }
    
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    setState(RecordingState.IDLE);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setRecordingDuration(0);
    audioChunks.current = [];
    
    if (audioURL) {
      URL.revokeObjectURL(audioURL);
      setAudioURL(null);
    }
  };

  const acceptRecording = async () => {
    if (!audioURL) return;

    setState(RecordingState.PROCESSING);
    setProcessingProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setProcessingProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 100);

      const response = await fetch(audioURL);
      const audioBlob = await response.blob();
      const randomName = `recording-${getRandomString(8)}.wav`;
      const file = new File([audioBlob], randomName, { type: "audio/wav" });

      const offline = !(await isOnline());
      if (offline) {
        clearInterval(progressInterval);
        setProcessingProgress(100);
        
        await queueRecording(audioBlob, {
          categoryId: 'unknown',
          subcategoryId: 'unknown',
          categoryName: 'Recording',
          subcategoryName: 'Audio Recording',
          preSessionData: {},
          timestamp: Date.now()
        });
        
        toast.success("Recording queued for upload", {
          description: "Will upload automatically when you're back online",
          icon: <WifiOff className="w-4 h-4" />
        });
        
        onClose();
        resetRecording();
        return;
      }

      setTimeout(() => {
        setProcessingProgress(100);
        setTimeout(() => {
          onRecordingComplete(file);
          onClose();
          resetRecording();
          toast.success("Recording saved successfully");
        }, 500);
      }, 1000);

    } catch (error) {
      setState(RecordingState.RECORDED);
      setProcessingProgress(0);
      toast.error("Failed to process recording");
      console.error("Error processing recording:", error);
    }
  };

  const handleClose = () => {
    if (state === RecordingState.RECORDING || state === RecordingState.PAUSED) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
    }
    resetRecording();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md border-none shadow-2xl bg-card/95 backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-center">Audio Recording</DialogTitle>
          <DialogDescription className="text-center">
            {state === RecordingState.IDLE && "Click the microphone to start"}
            {state === RecordingState.RECORDING && "Recording in progress..."}
            {state === RecordingState.PAUSED && "Recording paused"}
            {state === RecordingState.RECORDED && "Review your recording"}
            {state === RecordingState.PROCESSING && "Processing..."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 space-y-8">
          {/* Main Visual Area */}
          <div className="flex flex-col items-center justify-center space-y-6">
            
            {/* Timer */}
            {(state === RecordingState.RECORDING || state === RecordingState.PAUSED || state === RecordingState.RECORDED) && (
              <div className={cn(
                "text-4xl font-mono font-bold tabular-nums transition-colors",
                state === RecordingState.RECORDING ? "text-red-500" : 
                state === RecordingState.PAUSED ? "text-orange-500" : "text-foreground"
              )}>
                {formatTime(recordingDuration)}
              </div>
            )}

            {/* Main Button */}
            <div className="relative group">
              {state === RecordingState.RECORDING && (
                <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-20" />
              )}
              
              <button
                onClick={state === RecordingState.IDLE ? startRecording : stopRecording}
                disabled={state === RecordingState.PROCESSING || state === RecordingState.RECORDED}
                className={cn(
                  "w-32 h-32 flex items-center justify-center rounded-full shadow-2xl transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-6 focus:ring-offset-2",
                  state === RecordingState.RECORDING || state === RecordingState.PAUSED
                    ? "bg-red-600 hover:bg-red-700 focus:ring-red-400 text-white ring-4 ring-red-200/30"
                    : state === RecordingState.RECORDED
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary hover:bg-primary/90 focus:ring-primary/40 text-primary-foreground ring-4 ring-primary/10"
                )}
                aria-label={state === RecordingState.RECORDING || state === RecordingState.PAUSED ? 'Stop recording' : 'Start recording'}
              >
                {state === RecordingState.RECORDING || state === RecordingState.PAUSED ? (
                  <Square className="w-12 h-12 fill-current" />
                ) : (
                  <Mic className="w-12 h-12" />
                )}
              </button>
            </div>

            {/* Secondary Controls */}
            {(state === RecordingState.RECORDING || state === RecordingState.PAUSED) && (
              <Button
                onClick={state === RecordingState.RECORDING ? pauseRecording : resumeRecording}
                variant="outline"
                size="sm"
                className="rounded-full px-6"
              >
                {state === RecordingState.RECORDING ? (
                  <>
                    <Pause className="w-4 h-4 mr-2" /> Pause
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" /> Resume
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Playback Interface */}
          {audioURL && state !== RecordingState.PROCESSING && (
            <div className="bg-muted/30 rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-bottom-2">
              <audio ref={audioRef} src={audioURL} preload="metadata" className="hidden" />
              
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={playPause}
                  className="h-10 w-10 rounded-full bg-background shadow-sm hover:bg-accent"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </Button>
                
                <div className="flex-1 space-y-1.5">
                  <Slider
                    value={[currentTime]}
                    max={duration || 100}
                    step={0.1}
                    onValueChange={([value]) => seek(value)}
                    className="cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground font-medium">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 px-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume]}
                  max={100}
                  step={1}
                  onValueChange={handleVolumeChange}
                  className="w-24"
                />
              </div>
            </div>
          )}

          {/* Processing State */}
          {state === RecordingState.PROCESSING && (
            <div className="space-y-3 px-4">
              <div className="flex items-center justify-between text-sm font-medium">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing audio...
                </span>
                <span>{processingProgress}%</span>
              </div>
              <Progress value={processingProgress} className="h-2" />
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between gap-3 sm:gap-0">
          {(state === RecordingState.IDLE || state === RecordingState.RECORDED) && (
            <Button
              variant="ghost"
              onClick={handleClose}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
          )}
          
          {(state === RecordingState.RECORDING || state === RecordingState.PAUSED) && (
            <Button
              variant="ghost"
              onClick={resetRecording}
              className="w-full sm:w-auto text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              Cancel Recording
            </Button>
          )}

          {state === RecordingState.RECORDED && (
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={resetRecording}
                className="flex-1 sm:flex-none"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Redo
              </Button>
              <Button
                onClick={acceptRecording}
                className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white"
              >
                <Check className="w-4 h-4 mr-2" />
                Save
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
