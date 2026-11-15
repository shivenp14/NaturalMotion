import vocabulary from '../../assets/models/heatsy/muscles.json';
import type { AvatarView } from '../shared/presentation';

export type AnatomyFocus = 'none' | 'shoulders' | 'upper_back' | 'wall_angel';
export type AnatomyView = AvatarView;

/** Only visible regions verified in this particular mesh are offered in the UI. */
export const anatomyFocusOptions: { id: AnatomyFocus; label: string }[] = [
  { id: 'none', label: 'All gray' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'upper_back', label: 'Upper back' },
];

/** Codes encode a part plus its side, as specified by the asset's vocabulary. */
export function getFocusCodes(focus: AnatomyFocus): Set<number> {
  const codes = new Set<number>();
  if (focus === 'none') return codes;
  const muscleIds = new Set(vocabulary.muscles.filter((muscle) => muscle.group === focus).map((muscle) => muscle.id));
  // Educational regions for the pose proof; not measured activation or a
  // complete/validated account of all muscles involved in a wall angel.
  const previewParts = new Set(['trapezius_upper', 'trapezius_middle', 'trapezius_lower', 'deltoid_lateral', 'deltoid_posterior']);
  vocabulary.parts.forEach((part, index) => {
    if (focus === 'wall_angel' ? previewParts.has(part.id) : muscleIds.has(part.muscle)) {
      codes.add(1 + 2 * index);
      codes.add(2 + 2 * index);
    }
  });
  return codes;
}

export function getPartFocusCodes(partIds: readonly string[], side: 'left' | 'right'): Set<number> {
  const ids = new Set(partIds);
  const codes = new Set<number>();
  vocabulary.parts.forEach((part, index) => {
    if (ids.has(part.id)) codes.add(1 + 2 * index + (side === 'right' ? 1 : 0));
  });
  return codes;
}

export const anatomyViewAngles: Record<AnatomyView, number> = {
  front: 0,
  back: Math.PI,
  side: Math.PI / 2,
  left_side: -Math.PI / 2,
};
