import { GoogleGenAI, Modality, Type, type LiveServerMessage, type Session } from '@google/genai';

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
        'Use camera context to understand positioning and what the user refers to. Never diagnose pain, infer muscle activation or invent precise joint measurements. For pain, advise stopping the movement.',
        'Only DETERMINISTIC_FORM_STATUS supplied by the application establishes a form check. Aligned means that named check only, never overall correct or safe form. Unavailable and not_observable never mean aligned. Do not infer successful form from an image. Report uncertainty and ask for a better view when appropriate.',
        'Call request_movement only when the user asks for, agrees to, or changes a demonstration. Do not call it on greetings, explanations, every camera image, or form updates. There is one planning call per user turn. Do not retry rejected calls without a new user request.',
        'request_movement delegates composition to the planner. Describe the requested demonstration in plain language; do not send joint instructions. A tool result confirms success only after the app accepts the validated sequence. If it fails or no supported sequence is available, explain the limitation.',
        'Use pause_movement, resume_movement and stop_movement for corresponding user requests; stop also applies when pain is reported. Controls do not require waiting for the planner. A complete new demonstration handles speed/range changes.',
        'Form checks are available only for a verified stationary goalpost elbow-height/spread profile. Other movements may be demonstrated without form checking. Wall contact, spinal posture and muscle activation are not measured.',
      ].join('\n'),
      tools: [{ functionDeclarations: [
        { name: 'request_movement', description: 'Request or change one supported educational movement demonstration.',
          parameters: { type: Type.OBJECT, properties: { request: { type: Type.STRING, description: 'Brief plain-language request grounded in the user utterance.' } }, required: ['request'] } },
        ...(['pause_movement', 'resume_movement', 'stop_movement'] as const).map(name => ({
          name, description: name.replaceAll('_', ' '), parameters: { type: Type.OBJECT, properties: {} },
        })),
      ] }],
    },
    callbacks: { onmessage: callbacks.message, onerror: callbacks.error, onclose: callbacks.close },
  });
}
