/** Hide model-emitted tool markup; only native protocol tool calls execute actions. */
export function conversationTranscript(role: 'user' | 'assistant', text: string): string {
  if (role === 'user') return text;
  return text
    // This also hides an unfinished code block while its tokens are streaming.
    .replace(/\s*```[\s\S]*?(?:```|$)/g, '')
    .replace(/\[\s*\{\s*"name"\s*:[\s\S]*?(?:\]|$)/g, '')
    .replace(/`{1,2}$/, '')
    .trim();
}
