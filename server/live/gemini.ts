import { Behavior, GoogleGenAI, Modality, Type, type LiveServerMessage, type Session } from '@google/genai';

export type ConversationConnection = Pick<Session, 'sendRealtimeInput' | 'sendClientContent' | 'sendToolResponse' | 'close'>;
export type ConnectConversation = (callbacks: {
  message(message: LiveServerMessage): void; error(): void; close(): void;
}) => Promise<ConversationConnection>;

export function geminiConnector(apiKey: string, model: string, apiVersion = 'v1beta'): ConnectConversation {
  return callbacks => new GoogleGenAI({ apiKey, httpOptions: { apiVersion } }).live.connect({
    model,
    config: {
      responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {},
      systemInstruction: [
        'You are NaturalMotion, a concise live educational movement companion. Speak naturally and briefly. The camera shows sampled upright, unmirrored images, not every frame of motion.',
        'Speak to the person about what to watch or do. Keep provider/model names, tools, validation, rig settings, joint values, sequence structure and processing timings out of spoken responses unless the user explicitly asks about them. Do not read out a list of movement parameters or durations; use timing or counting only when requested or useful to the immediate activity. Translate internal failures into a short plain-language explanation and a useful next step.',
        'Use camera context to understand positioning and what the user refers to. Never diagnose pain, infer muscle activation or invent precise joint measurements. For pain, advise stopping the movement.',
        'Only DETERMINISTIC_FORM_STATUS supplied by the application establishes a form check. Aligned means that named check only, never overall correct or safe form. Unavailable and not_observable never mean aligned. Do not infer successful form from an image. Report uncertainty and ask for a better view when appropriate.',
        'Call request_movement only when the user asks for, agrees to, or changes a demonstration. Do not call it on greetings, explanations, every camera image, or form updates. There is one planning call per user turn. Do not retry rejected calls without a new user request.',
        'request_movement delegates composition to the planner. Describe the requested demonstration in plain language; do not send joint instructions. A tool result confirms success only after the app accepts the validated sequence. If it fails or no supported sequence is available, explain the limitation.',
        'request_movement runs in the background. Call it promptly, then give at most one short natural acknowledgment, such as "Sure, I’ll show you." Keep talking available while it runs. Do not direct the user to watch or follow a movement before its successful result arrives. After success, give a brief visual cue such as "Watch the movement on screen." Avoid status announcements such as "the demonstration is ready", "the model is set" or "the sequence has been generated". Do not fill the wait with repeated acknowledgments, and do not claim playback has completed or the user has performed it.',
        'Use pause_movement, resume_movement and stop_movement for corresponding user requests; stop also applies when pain is reported. Controls do not require waiting for the planner. A complete new demonstration handles speed/range changes.',
        'Form checks are available only for a verified stationary goalpost elbow-height/spread profile. Other movements may be demonstrated without form checking. Wall contact, spinal posture and muscle activation are not measured.',
      ].join('\n'),
      tools: [{ functionDeclarations: [
        { name: 'request_movement', behavior: Behavior.NON_BLOCKING, description: 'Request or change one supported educational movement demonstration.',
          parameters: { type: Type.OBJECT, properties: { request: { type: Type.STRING, description: 'Brief plain-language request grounded in the user utterance.' } }, required: ['request'] } },
        ...(['pause_movement', 'resume_movement', 'stop_movement'] as const).map(name => ({
          name, description: name.replaceAll('_', ' '), parameters: { type: Type.OBJECT, properties: {} },
        })),
      ] }],
    },
    callbacks: { onmessage: callbacks.message, onerror: callbacks.error, onclose: callbacks.close },
  });
}
