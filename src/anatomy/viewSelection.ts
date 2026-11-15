import vocabulary from '../../assets/models/heatsy/muscles.json';
import type { AvatarView } from '../shared/presentation';
import type { AnatomyFocus } from './regions';
import type { UpperBodySegment } from './upperBodySequence';

// Visibility preferences for represented educational regions, not activation estimates.
const regionViews: Record<string, AvatarView> = {
  trapezius_upper: 'back', trapezius_middle: 'back', trapezius_lower: 'back',
  infraspinatus: 'back', deltoid_posterior: 'back', triceps_long: 'back',
  deltoid_lateral: 'side', biceps_brachii_short: 'front',
};

export function recommendedAvatarView(segment?: UpperBodySegment, focus: AnatomyFocus = 'none'): AvatarView {
  if (!segment) return focus === 'upper_back' || focus === 'wall_angel' ? 'back' : 'front';
  const scores: Record<AvatarView, number> = { front: 0, back: 0, side: 0, left_side: 0 };
  for (const code of segment.focusCodes) {
    const part = vocabulary.parts[Math.floor((code - 1) / 2)];
    const view = part && regionViews[part.id];
    if (view) scores[view === 'side' && code % 2 === 1 ? 'left_side' : view]++;
  }
  scores.front += Math.min(scores.side, scores.left_side) * 2;
  // Keep a stable neutral tie-break rather than rotating arbitrarily.
  return (['front', 'back', 'side', 'left_side'] as const).reduce((best, view) => scores[view] > scores[best] ? view : best, 'front' as AvatarView);
}
