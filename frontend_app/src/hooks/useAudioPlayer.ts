import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/date-utils";

/**
 * Hook for managing audio playback with comprehensive controls and state.
 *
 * Provides a complete audio player implementation with play/pause, volume control,
 * seeking, and real-time progress tracking. Handles edge cases like loading states,
 * errors, and duration detection for various audio formats.
 *
 * @description Manages an HTMLAudioElement with React state synchronization,
 * providing formatted time displays and graceful error handling.
 *
 * @param {string | undefined} src - URL of the audio file to play
 *
 * @returns Audio player state and controls
 * @returns {React.RefObject<HTMLAudioElement>} audioRef - Ref to attach to <audio> element
 * @returns {boolean} isPlaying - Whether audio is currently playing
 * @returns {boolean} isMuted - Whether audio is muted
 * @returns {number} currentTime - Current playback position in seconds
 * @returns {number} duration - Total duration in seconds
 * @returns {number} displayVolume - Volume level 0-100
 * @returns {boolean} isLoading - Whether audio is loading
 * @returns {boolean} hasError - Whether an error occurred
 * @returns {() => Promise<void>} togglePlayPause - Toggle play/pause state
 * @returns {() => void} toggleMute - Toggle mute state
 * @returns {(value: number[]) => void} handleTimeSliderChange - Handler for time slider
 * @returns {(value: number[]) => void} handleVolumeSliderChange - Handler for volume slider
 * @returns {(time: number, autoPlay?: boolean) => Promise<void>} seekTo - Seek to specific time
 * @returns {string} formattedCurrentTime - Current time as "MM:SS"
 * @returns {string} formattedDuration - Duration as "MM:SS"
 *
 * @example
 * ```tsx
 * import { useAudioPlayer } from '@/hooks/useAudioPlayer';
 *
 * function AudioPlayerComponent({ audioUrl }: { audioUrl: string }) {
 *   const {
 *     audioRef,
 *     isPlaying,
 *     togglePlayPause,
 *     currentTime,
 *     duration,
 *     formattedCurrentTime,
 *     formattedDuration,
 *     handleTimeSliderChange,
 *   } = useAudioPlayer(audioUrl);
 *
 *   return (
 *     <div>
 *       <audio ref={audioRef} src={audioUrl} />
 *       <button onClick={togglePlayPause}>
 *         {isPlaying ? 'Pause' : 'Play'}
 *       </button>
 *       <span>{formattedCurrentTime} / {formattedDuration}</span>
 *       <Slider
 *         value={[currentTime]}
 *         max={duration}
 *         onValueChange={handleTimeSliderChange}
 *       />
 *     </div>
 *   );
 * }
 * ```
 *
 * @see {@link formatDuration} for time formatting utility
 */
export function useAudioPlayer(src: string | undefined) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [displayVolume, setDisplayVolume] = useState(75);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Reset state when source changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setHasError(false);
    setIsLoading(!!src);
  }, [src]);

  // Effect for setting up audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    const handleLoadStart = () => {
      setIsLoading(true);
      setHasError(false);
    };

    const handleLoadedMetadata = () => {
      setIsLoading(false);
      if (Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      } else {
        // Fallback: try to get duration after a short delay
        setTimeout(() => {
          if (Number.isFinite(audio.duration)) {
            setDuration(audio.duration);
          }
        }, 100);
      }
    };

    const handleLoadedData = () => {
      setIsLoading(false);
      // Double-check duration after data is loaded
      if (Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleCanPlay = () => {
      setIsLoading(false);
      // Final attempt to get duration
      if (Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      if (Number.isFinite(audio.currentTime)) {
        setCurrentTime(audio.currentTime);
      }
      
      // Sometimes duration becomes available during playback
      if (Number.isFinite(audio.duration) && duration === 0) {
        setDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = (e: Event) => {
      console.error('Audio error:', e);
      setIsLoading(false);
      setHasError(true);
      setIsPlaying(false);
    };

    const handleDurationChange = () => {
      if (Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleVolumeChange = () => {
      // Sync state if volume changed externally (less common, but good practice)
      // Avoid feedback loop by checking if it's significantly different
      const currentVolumePercent = Math.round(audio.volume * 100);
      if (Math.abs(currentVolumePercent - displayVolume) > 1) {
        setDisplayVolume(currentVolumePercent);
      }
      setIsMuted(audio.muted); // Also sync muted state
    };

    const handlePlay = () => {
      // Sync isPlaying state when audio starts playing from any source
      setIsPlaying(true);
    };

    const handlePause = () => {
      // Sync isPlaying state when audio is paused from any source
      setIsPlaying(false);
    };

    // Set initial volume and muted state from default state
    audio.volume = displayVolume / 100;
    audio.muted = isMuted;

    // Add all event listeners
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('loadeddata', handleLoadedData);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener("volumechange", handleVolumeChange);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    // Force load metadata
    audio.load();

    // Set initial duration if metadata already loaded
    if (audio.readyState >= 1) {
      handleLoadedMetadata();
    }

    return () => {
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('loadeddata', handleLoadedData);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener("volumechange", handleVolumeChange);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
    // Rerun effect only if the audio source changes
  }, [src, displayVolume, isMuted, duration]); // Added duration dependency

  // Note: We don't need a separate effect for play/pause state changes
  // because the play/pause control is now handled directly in togglePlayPause and seekTo
  // The 'play' and 'pause' event listeners keep the state in sync

  // --- Control Functions ---

  const togglePlayPause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || hasError) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        // Ensure audio is loaded before playing
        if (audio.readyState < 2) {
          setIsLoading(true);
          await new Promise((resolve, reject) => {
            const handleCanPlay = () => {
              audio.removeEventListener('canplay', handleCanPlay);
              audio.removeEventListener('error', handleErrorEvent);
              setIsLoading(false);
              resolve(undefined);
            };
            const handleErrorEvent = () => {
              audio.removeEventListener('canplay', handleCanPlay);
              audio.removeEventListener('error', handleErrorEvent);
              setIsLoading(false);
              setHasError(true);
              reject(new Error('Failed to load audio'));
            };
            audio.addEventListener('canplay', handleCanPlay);
            audio.addEventListener('error', handleErrorEvent);
          });
        }
        
        await audio.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Play/pause error:', error);
      setHasError(true);
      setIsPlaying(false);
    }
  }, [isPlaying, hasError]);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const newMuted = !isMuted;
    audio.muted = newMuted; // Directly update the audio element
    setIsMuted(newMuted); // Update state
  }, [isMuted]);

  const handleTimeSliderChange = useCallback((value: Array<number>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const newTime = value[0];
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  const handleVolumeSliderChange = useCallback((value: Array<number>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newVolumePercent = value[0];
    setDisplayVolume(newVolumePercent); // Update state
    audio.volume = newVolumePercent / 100; // Update audio element volume
    
    // If adjusting volume while muted, unmute
    if (newVolumePercent > 0 && audio.muted) {
      audio.muted = false;
      setIsMuted(false);
    }
  }, []);

  /**
   * Seek to a specific time and optionally start playing
   * @param time Time in seconds to seek to
   * @param autoPlay Whether to automatically start playing after seeking
   */
  const seekTo = useCallback(async (time: number, autoPlay = true) => {
    const audio = audioRef.current;
    if (!audio || hasError || !Number.isFinite(time)) {
      if (!Number.isFinite(time)) {
        console.warn('Invalid seek time:', time);
      }
      return;
    }

    try {
      // Seek to the specified time
      audio.currentTime = time;
      setCurrentTime(time);


      // If autoPlay is enabled and not already playing, start playback
      if (autoPlay && !isPlaying) {
        // Ensure audio is loaded before playing
        if (audio.readyState < 2) {
          setIsLoading(true);
          await new Promise<void>((resolve, reject) => {
            const handleCanPlay = () => {
              audio.removeEventListener('canplay', handleCanPlay);
              audio.removeEventListener('error', handleErrorEvent);
              setIsLoading(false);
              resolve();
            };
            const handleErrorEvent = () => {
              audio.removeEventListener('canplay', handleCanPlay);
              audio.removeEventListener('error', handleErrorEvent);
              setIsLoading(false);
              setHasError(true);
              reject(new Error('Failed to load audio'));
            };
            audio.addEventListener('canplay', handleCanPlay);
            audio.addEventListener('error', handleErrorEvent);
          });
        }
        
        await audio.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Seek error:', error);
      setHasError(true);
      setIsPlaying(false);
    }
  }, [isPlaying, hasError]);

  // --- Derived Values ---
  const formattedCurrentTime = formatDuration(currentTime);
  const formattedDuration = formatDuration(duration || 0);

  return {
    audioRef,
    isPlaying,
    isMuted,
    currentTime,
    duration,
    displayVolume,
    isLoading,
    hasError,
    togglePlayPause,
    toggleMute,
    handleTimeSliderChange,
    handleVolumeSliderChange,
    seekTo,
    formattedCurrentTime,
    formattedDuration,
  };
}
