import vocabulary from '../../assets/models/heatsy/muscles.json';

export type AnatomyFocus = 'none' | 'shoulders' | 'upper_back';
export type AnatomyView = 'front' | 'back' | 'side';

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
  vocabulary.parts.forEach((part, index) => {
    if (muscleIds.has(part.muscle)) {
      codes.add(1 + 2 * index);
      codes.add(2 + 2 * index);
    }
  });
  return codes;
}

export const anatomyViewAngles: Record<AnatomyView, number> = {
  front: 0,
  back: Math.PI,
  side: Math.PI / 2,
};
