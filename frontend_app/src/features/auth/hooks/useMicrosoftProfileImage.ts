import { useEffect, useState } from "react";

import { fetchMicrosoftProfileImage } from "../data/api";

export function useMicrosoftProfileImage(accessToken?: string | null): string | null {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setImageUrl(null);
      return;
    }

    let isMounted = true;

    const loadImage = async () => {
      try {
        const url = await fetchMicrosoftProfileImage(accessToken);
        if (isMounted) {
          setImageUrl(url);
        }
      } catch {
        if (isMounted) {
          setImageUrl(null);
        }
      }
    };

    void loadImage();

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  return imageUrl;
}