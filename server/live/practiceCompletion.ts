/** A camera update cannot reuse an old movement request as a finish instruction. */
export function hasPracticeCompletionCue(text: string): boolean {
  const cue = text.toLowerCase().replace(/[’‘]/g, "'");
  if (/\b(?:not|never|almost|nearly|haven't|hasn't|didn't|don't|won't)\b[^.!?]{0,30}\b(?:done|finish(?:ed)?|complet(?:e|ed)|review)\b/.test(cue) ||
    /\b(?:when|if|until|before|after)\b[^.!?]{0,30}\b(?:done|finish(?:ed)?|complet(?:e|ed))\b/.test(cue) ||
    /\b(?:will|would|going to|about to|plan to|say|saying|mean)\b[^.!?]{0,45}\b(?:done|finish(?:ed)?|complet(?:e|ed))\b/.test(cue) ||
    /\bi'll\b[^.!?]{0,45}\b(?:done|finish(?:ed)?|complet(?:e|ed))\b/.test(cue)) return false;
  return /\b(?:done|finished|completed)\b/.test(cue) || /\bthat(?:'s| is) (?:it|all)\b/.test(cue) ||
    /\b(?:review|assess|check)\b[^.!?]{0,25}\b(?:my|that|the|this)\b[^.!?]{0,25}\b(?:form|attempt|repetition|movement)\b/.test(cue) ||
    /\bhow did i do\b/.test(cue);
}
