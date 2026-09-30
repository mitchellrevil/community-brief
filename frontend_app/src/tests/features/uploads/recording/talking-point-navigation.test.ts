import { describe, expect, it } from 'vitest';

import {
  flattenTalkingPoints,
  getNextTalkingPointIndex,
  getPreviousTalkingPointIndex,
} from '@/features/uploads/recording/talkingPointNavigation';

describe('talkingPointNavigation', () => {
  it('flattens in-session talking point sections into a single field list', () => {
    const sections = [
      {
        fields: [
          { name: 'Intro', type: 'text', value: 'Welcome' },
          { name: 'Goal', type: 'text', value: 'Define plan' },
        ],
      },
      {
        fields: [{ name: 'Wrap-up', type: 'markdown', value: '- Next steps' }],
      },
      {
        fields: null,
      },
    ];

    expect(flattenTalkingPoints(sections as any)).toEqual([
      { name: 'Intro', type: 'text', value: 'Welcome' },
      { name: 'Goal', type: 'text', value: 'Define plan' },
      { name: 'Wrap-up', type: 'markdown', value: '- Next steps' },
    ]);
  });

  it('moves forward without exceeding the final talking point', () => {
    expect(getNextTalkingPointIndex(0, 3)).toBe(1);
    expect(getNextTalkingPointIndex(2, 3)).toBe(2);
  });

  it('moves backward without dropping below zero', () => {
    expect(getPreviousTalkingPointIndex(2)).toBe(1);
    expect(getPreviousTalkingPointIndex(0)).toBe(0);
  });
});
