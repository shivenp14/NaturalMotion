import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { MovementSequence } from '../shared/contracts';
import { upperBodyControls } from './upperBodyControls';
import { cloneUpperBodyPose, initialUpperBodyPose, relaxedUpperBodyPose, upperBodyPoseError, type PoseGroup, type UpperBodyPose } from './upperBodyPose';
import { createUpperBodyPoseReference } from './upperBodySequence';

type Props = {
  ready: boolean;
  onPoseChange: (pose: UpperBodyPose) => void;
  onPlay: (sequence: MovementSequence) => void;
};

/** Local development controls; external session sequences keep precedence in the viewport. */
export function UpperBodyControlLab({ ready, onPoseChange, onPlay }: Props) {
  const [pose, setPose] = useState(initialUpperBodyPose);
  const [group, setGroup] = useState<PoseGroup>('left');
  const [selectedId, setSelectedId] = useState('left_shoulder_elevation');
  const [error, setError] = useState<string | null>(null);
  const controls = upperBodyControls.filter((control) => control.group === group);
  const selected = controls.find((control) => control.id === selectedId) ?? controls[0];
  const value = selected.read(pose);

  function show(next: UpperBodyPose) {
    const invalid = upperBodyPoseError(next);
    setError(invalid);
    if (invalid) return;
    setPose(next);
    onPoseChange(next);
  }
  function change(nextValue: number) {
    const next = cloneUpperBodyPose(pose);
    selected.write(next, nextValue);
    show(next);
  }
  function play() {
    try {
      const sequence = createUpperBodyPoseReference(pose, `upper-body-lab-${Date.now()}`);
      setError(null);
      onPlay(sequence);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to play this pose.');
    }
  }

  return (
    <View style={styles.lab}>
      <Text style={styles.label}>Upper-body controls · preview</Text>
      <View style={styles.row}>
        {(['left', 'right', 'torso', 'neck'] as const).map((option) => (
          <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: group === option }}
            onPress={() => setGroup(option)} style={[styles.button, group === option && styles.selected]}>
            <Text style={styles.text}>{option === 'left' ? 'Left arm' : option === 'right' ? 'Right arm' : option === 'torso' ? 'Torso' : 'Neck'}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.row}>
        {controls.map((control) => (
          <Pressable key={control.id} accessibilityRole="button" accessibilityState={{ selected: selected.id === control.id }}
            onPress={() => { setSelectedId(control.id); setError(null); }}
            style={[styles.button, selected.id === control.id && styles.selected]}>
            <Text style={styles.text}>{control.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.label}>{selected.label}: {value}°</Text>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${selected.label}`} disabled={!ready || value <= selected.minimum}
          accessibilityState={{ disabled: !ready || value <= selected.minimum }}
          style={styles.button} onPress={() => change(Math.max(selected.minimum, value - selected.step))}>
          <Text style={styles.text}>− {selected.step}°</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${selected.label}`} disabled={!ready || value >= selected.maximum}
          accessibilityState={{ disabled: !ready || value >= selected.maximum }}
          style={styles.button} onPress={() => change(Math.min(selected.maximum, value + selected.step))}>
          <Text style={styles.text}>+ {selected.step}°</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={!ready} style={styles.button} onPress={() => change(selected.neutral)}>
          <Text style={styles.text}>Reset angle</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" disabled={!ready} style={styles.button} onPress={() => show(relaxedUpperBodyPose())}>
          <Text style={styles.text}>Arms down</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={!ready} style={styles.button} onPress={() => show(initialUpperBodyPose())}>
          <Text style={styles.text}>Reset all</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={!ready} style={styles.button} onPress={play}>
          <Text style={styles.text}>Play pose and return</Text>
        </Pressable>
      </View>
      <Text style={styles.caption}>Swipe the control list for more. Angles are model settings; combined poses have additional limits.</Text>
      {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  lab: { gap: 10 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  label: { color: '#d5dbde', fontSize: 12, fontWeight: '500' },
  caption: { color: '#aab3b8', fontSize: 12, lineHeight: 18 },
  error: { color: '#e9b4a8', fontSize: 12, lineHeight: 18 },
  button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center', borderRadius: 10, backgroundColor: '#1c2225' },
  selected: { backgroundColor: '#3b484e' },
  text: { color: '#d5dbde', fontSize: 12 },
});
