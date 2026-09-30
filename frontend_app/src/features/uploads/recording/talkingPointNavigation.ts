export interface TalkingPointField {
  name?: string;
  type?: string;
  value?: string;
}

export interface TalkingPointSection {
  fields?: Array<TalkingPointField> | null;
}

export function flattenTalkingPoints(
  inSessionTalkingPoints: Array<TalkingPointSection> | null | undefined,
): Array<TalkingPointField> {
  if (!Array.isArray(inSessionTalkingPoints)) {
    return [];
  }

  return inSessionTalkingPoints.flatMap((section) =>
    Array.isArray(section.fields) ? section.fields : [],
  );
}

export function getNextTalkingPointIndex(
  currentIndex: number,
  totalCount: number,
): number {
  if (totalCount <= 0) {
    return 0;
  }

  return Math.min(currentIndex + 1, totalCount - 1);
}

export function getPreviousTalkingPointIndex(currentIndex: number): number {
  return Math.max(0, currentIndex - 1);
}
