export interface AnalysisAttempt {
  attempt?: number;
  analysis_file_path: string;
  created_at?: string;
}

export interface NormalizedAnalysisAttempt {
  attempt: number;
  analysis_file_path: string;
  created_at?: string;
}

export function normalizeAnalysisAttempts(
  attempts?: Array<AnalysisAttempt> | null,
): Array<NormalizedAnalysisAttempt> {
  if (!Array.isArray(attempts)) {
    return [];
  }

  return attempts.map((attempt, index) => ({
    attempt: typeof attempt.attempt === 'number' ? attempt.attempt : index + 1,
    analysis_file_path: attempt.analysis_file_path,
    created_at: attempt.created_at,
  }));
}

export function getDisplayFilename(filePath?: string): string {
  if (!filePath) {
    return 'Unknown file';
  }

  try {
    const url = new URL(filePath);
    const normalizedPathname = url.pathname.replace(/\\/g, '/');
    return normalizedPathname.split('/').pop() || 'analysis.docx';
  } catch {
    return filePath.split('/').pop() || filePath.split('\\').pop() || 'analysis.docx';
  }
}

export function getFileType(filePath?: string): 'docx' | 'pdf' | 'txt' | 'md' | 'unknown' {
  if (!filePath) {
    return 'unknown';
  }

  try {
    const url = new URL(filePath);
    const pathname = url.pathname;
    const lastDot = pathname.lastIndexOf('.');
    const extension = lastDot !== -1 ? pathname.substring(lastDot + 1).toLowerCase() : '';
    return extension === 'docx'
      ? 'docx'
      : extension === 'pdf'
        ? 'pdf'
        : extension === 'txt' || extension === 'md'
          ? extension
          : 'unknown';
  } catch {
    const lastDot = filePath.lastIndexOf('.');
    const queryMark = filePath.indexOf('?');
    const endPosition = queryMark !== -1 ? queryMark : filePath.length;
    const extension =
      lastDot !== -1 && lastDot < endPosition
        ? filePath.substring(lastDot + 1, endPosition).toLowerCase()
        : '';

    return extension === 'docx'
      ? 'docx'
      : extension === 'pdf'
        ? 'pdf'
        : extension === 'txt' || extension === 'md'
          ? extension
          : 'unknown';
  }
}

export function getAttemptFileName(filename: string, attemptNumber: number): string {
  const parts = filename.split('.');
  if (parts.length > 1) {
    const extension = parts.pop();
    const downloadExtension = extension?.toLowerCase() === 'md' ? 'docx' : extension;
    return `${parts.join('.')}_v${attemptNumber}.${downloadExtension}`;
  }

  return `${filename}_v${attemptNumber}`;
}
