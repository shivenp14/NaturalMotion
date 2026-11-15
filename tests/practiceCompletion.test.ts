import assert from 'node:assert/strict';
import test from 'node:test';
import { hasPracticeCompletionCue } from '../server/live/practiceCompletion';

test('natural finish and explicit retrospective-review requests authorize completion', () => {
  for (const text of ["I'm done", 'I finished doing it', "I've finished", 'I’m done now.', 'That’s it.', 'I completed the movement.',
    'Please review that repetition.', 'Can you check my form?', 'How did I do?']) assert.equal(hasPracticeCompletionCue(text), true, text);
});
test('movement/view requests, readiness, future and negated finish phrases cannot finish camera capture', () => {
  for (const text of ['Show me the side bend.', 'Show me the back of the model.', 'I am doing it now.', "I'm not done yet.",
    'I have not finished.', "I haven't finished doing it.", "I'm almost done", "When I'm done, what do I say?", "After I'm finished, what happens?", "I will say I'm done later.", "I'll be done soon.", "Should I say I'm done?", "Don't review my form yet."])
    assert.equal(hasPracticeCompletionCue(text), false, text);
});
