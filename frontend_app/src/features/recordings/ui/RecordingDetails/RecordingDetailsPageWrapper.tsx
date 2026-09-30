import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import type { AudioRecording } from "@/types/api";
import { RecordingDetailsPage } from "@/features/recordings/ui/RecordingDetails/RecordingDetailsPage";
import { RecordingDetailsSkeleton } from "@/components/ui/recording-details-skeleton";
import { fetchRecordingByIdApi } from "@/features/recordings/data/api";

interface RecordingDetailsPageWrapperProps {
  id: string;
}

export function RecordingDetailsPageWrapper({
  id,
}: RecordingDetailsPageWrapperProps) {
  const router = useRouter();
  const [recording, setRecording] = useState<AudioRecording | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper function to safely access localStorage
  const safeGetLocalStorage = (key: string) => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.error("Error accessing localStorage:", e);
      return null;
    }
  };

  useEffect(() => {
    const actualId = id;

    // Function to fetch a single recording by ID from the API
    const fetchRecordingById = async (recordingId: string) => {
      try {
        const data = await fetchRecordingByIdApi(recordingId);
        setRecording(data);
        setIsLoading(false);
        return true;
      } catch (err: any) {
        console.error("Error fetching recording by ID:", err);

        // Check if it's a 403 Forbidden error (user doesn't have access)
        if (
          err?.message?.includes("403") ||
          err?.status === 403 ||
          err?.response?.status === 403
        ) {
          setError("You don't have permission to access this recording.");
          setIsLoading(false);
          // Redirect to unauthorized page after a short delay
          setTimeout(() => {
            router.navigate({ to: "/unauthorised" });
          }, 2000);
          return true; // Return true to prevent fallback to cache
        }

        return false;
      }
    };

    const getRecordingFromCache = () => {
      try {
        const cachedJobs = safeGetLocalStorage("cachedJobs");
        if (cachedJobs) {
          const jobs = JSON.parse(cachedJobs) as Array<AudioRecording>;
          const cachedJob = jobs.find(
            (job: AudioRecording) => job.id === actualId,
          );
          if (cachedJob) {
            setRecording(cachedJob);
            setIsLoading(false);
            return true;
          }
        }
        return false;
      } catch (e) {
        console.error("Error parsing cached jobs:", e);
        return false;
      }
    };

    const loadRecording = async () => {
      // Try API first
      const foundFromApi = await fetchRecordingById(actualId);
      if (foundFromApi) return;
      // If not in API, try from cache
      const foundInCache = getRecordingFromCache();
      if (foundInCache) return;
      setError(
        "Recording not found. Please try again from the recordings list.",
      );
      setIsLoading(false);
      setTimeout(() => {
        router.navigate({ to: "/audio-recordings" });
      }, 3000);
    };

    loadRecording();
  }, [id, router]);

  if (isLoading) {
    return <RecordingDetailsSkeleton />;
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
          <p>{error}</p>
          <p className="mt-2">
            <button
              onClick={() => router.navigate({ to: "/audio-recordings" })}
              className="text-blue-500 underline"
            >
              Return to recordings list
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (!recording) {
    return (
      <div className="container mx-auto px-4 py-6">Recording not found</div>
    );
  }

  return <RecordingDetailsPage />;
}
