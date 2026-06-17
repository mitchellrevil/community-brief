/**
 * Date utility functions for parsing and formatting dates
 * Optimized for performance with consistent parsing logic
 */

/**
 * Parse different date formats (number in ms/s, ISO string) into a Date object
 * Supports timestamps in seconds (< 1e12) and milliseconds
 * @param input - Date input as string, number, or null/undefined
 * @returns Date object or null if parsing fails
 */
export function parseDate(input: string | number | undefined | null): Date | null {
  if (input === undefined || input === null || input === "") return null;

  // If it's already a number
  if (typeof input === "number") {
    // If looks like seconds (10 digits), convert to ms
    if (input < 1e12) return new Date(input * 1000);
    return new Date(input);
  }

  // If it's a numeric string, try to parse as int
  if (/^\d+$/.test(String(input))) {
    const n = parseInt(String(input), 10);
    if (n < 1e12) return new Date(n * 1000);
    return new Date(n);
  }

  // Fall back to Date parsing for ISO strings
  const d = new Date(String(input));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format date as localized date string (e.g., "Jan 15, 2025")
 * @param input - Date input to format
 * @returns Formatted date string or "-" if invalid
 */
export function formatDate(input: string | number | undefined | null): string {
  const date = parseDate(input);
  return date
    ? date.toLocaleDateString("en-US", { 
        month: "short", 
        day: "numeric", 
        year: "numeric" 
      })
    : "-";
}

/**
 * Format time as localized time string (e.g., "3:45 PM")
 * @param input - Date input to format
 * @returns Formatted time string or "-" if invalid
 */
export function formatTime(input: string | number | undefined | null): string {
  const date = parseDate(input);
  return date
    ? date.toLocaleTimeString("en-US", { 
        hour: "numeric", 
        minute: "2-digit", 
        hour12: true 
      })
    : "-";
}

/**
 * Format date and time together (e.g., "Jan 15, 2025 at 3:45 PM")
 * @param input - Date input to format
 * @returns Formatted date and time string or "-" if invalid
 */
export function formatDateTime(input: string | number | undefined | null): string {
  const date = parseDate(input);
  if (!date) return "-";
  return `${formatDate(input)} at ${formatTime(input)}`;
}

/**
 * Format duration in seconds to human-readable string (e.g., "3:45", "1:23:45")
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return "-";
  
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
