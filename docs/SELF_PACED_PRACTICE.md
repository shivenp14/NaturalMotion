# Self-paced practice and reviews

This is the current live coaching flow. It replaces playback-timed, per-frame corrections. The user watches once, performs the whole movement at their own pace, then receives one review. No correctness checkpoint or scripted hold gates progression.

## Session flow

1. **Demonstration:** validated movement and avatar view plans play normally. Watching is ungraded.
2. **Invitation:** actual renderer completion triggers one short invitation to try a full repetition. It waits for the conversation to be idle.
3. **Quiet recording:** capture begins immediately after the demonstration ends, even without visible landmarks or a correct starting pose. The user gets into position and performs the complete movement at a normal, comfortable pace. The avatar stays as a visual reference; it does not run a timed practice replay.
4. **Spoken completion:** the user says **“I’m done,” “I finished doing it,” “I’ve finished,”** or a similar natural completion phrase. The conversation model calls `finish_practice`. This is the primary completion flow. No timer, return pose, camera disappearance or trajectory endpoint triggers a review automatically.
5. **Retrospective review:** only the finished attempt is reviewed. An enduring mismatch yields one tip for the next repetition; sufficiently observed matching movement receives clear positive feedback. A corrected repetition is acknowledged with “That looked better…” rather than repeating the earlier cue. Incomplete or invisible evidence receives an honest incomplete/not-observable result, never invented praise.
6. **Retry:** say **“I’m ready to try it again”** to call `start_practice`, without generating another demonstration. Perform the next full repetition and say **“I’m done.”** Holding an end pose cannot create another attempt or loop feedback. Starting a new attempt clears queued review speech so it does not interrupt movement.

Capture is bounded to 10 Hz, 900 samples and two minutes. Reaching a bound keeps the app quiet and waiting for the finish cue, then reports insufficient evidence rather than making a partial recording look successful. Automatic completion is deferred.

## Assessment boundary

- The planner still selects upper-arm elevation, elbow bend and forearm direction per side/step. Numerical targets come from authored geometry, not LLM-written predicates or correction text.
- `RepetitionTracker` derives progress from observable changing metrics through ordered movement groups. During retrospective analysis, direction changes can identify a smaller excursion and yield a range tip; this never ends recording. Multiple progress regions and advancing samples are required; a static pose or isolated spike cannot establish correct performance.
- `SelfPacedPractice` owns capture, explicit retry and finite review state. Geometry is aligned retrospectively, independently of the renderer clock. Positioning frames before departure from the opening pose are excluded from the movement review; this does not require correct elbows or forearms to begin recording.
- A review needs adequate fresh visibility across the moving phases. Gaps, missing selected measurements and insufficient coverage cannot become good form. Persistent errors use median evidence, a majority threshold and an uncertainty buffer above the configured tolerance; individual frames do not produce spoken correction.
- `PracticeAttempt` carries bounded raw measurement samples, timestamps and source/attempt identities. `LiveClient` calibrates all evidence times. The server validates bounds/ordering, replays the deterministic tracker, computes its own review, and deduplicates by attempt ID. Client-authored praise or feedback is not accepted.
- Legacy `form` frame messages are silent. While the practice stage is `performing`, unsolicited model audio/transcripts are suppressed. Only a completed-attempt `PRACTICE_REVIEW` authorizes form feedback. Stop/pause/view/practice tools remain available for actual user requests.

Positive feedback describes the observed arm movement, with narrower wording for partial check coverage. It does not establish clinical safety, wall contact, muscle activation, wrist/palm orientation or spinal posture. Very small or entirely static movements without an observable trajectory may remain unavailable. The prior incorrect elbow cue's exact camera evidence was not captured; timing mismatch and repetition-loop paths have been removed, but physical measurement accuracy still needs acceptance.

## Speech/transcription changes

The live provider previously used automatic transcription language detection. It now supplies English ASR hints (`inputAudioTranscription.languageCodes: ['en-US']`) and less sensitive automatic speech-start detection. Native-audio output retains the English system instruction; it does not use an unsupported output language-code setting. See the [provider transcription reference](https://ai.google.dev/api/live#AudioTranscriptionConfig) and [native-audio language documentation](https://ai.google.dev/gemini-api/docs/live-api/capabilities#voices-and-language).

`MicrophoneSilenceGate` suppresses sustained near-digital silence while preserving a 300 ms pre-roll, immediate onset, and 900 ms hangover. The low peak threshold favors retaining quiet speech at stretching distance. Capture duration comes from actual frame count. Closing the gate sends one `audioStreamEnd`; session changes clear buffered audio.

This is not a background-speaker classifier. Room voices, noise or echo can still pass. No foreign-script text is hidden to manufacture an English-only test result. The original Chinese transcription source was not established; normal microphone testing must confirm improvement.

## Integration and verification

Current production modules: `selfPacedPractice.ts`, `repetitionTracker.ts`, `validatePracticeAttempt.ts`, `src/shared/practice.ts`, and live protocol/backend handlers. Earlier `adaptiveForm`, `PracticeSession` and `FeedbackSpeechPolicy` tests remain historical coverage; those modules no longer drive live practice speech.

Actual-provider regression command:

```sh
AGENT_TEST_BASE_URL=http://127.0.0.1:3002 node --import tsx scripts/practiceSmoke.ts
```

This explicitly uses synthetic geometry and renderer-completion context. It checks one generated demonstration, automatic initial recording, an explicit retry, two natural completion phrases sent as text through `finish_practice`, quiet recording, one elbow correction after the first attempt, and positive improvement feedback after the corrected attempt. It does not render a body or verify a person or microphone recognition. `npm run check` passed all 184 tests plus lint/typechecks; `npm run export:android` passed.

The Samsung SM-S928U / Android 17 suite passed **6 checks, 0 failed, 2 unsupported**, including actual-provider spoken-finish tool handling through text and a truthful not-observable review on the no-person feed. Earlier artifacts: `.expo/device-smoke/self-paced-practice/`. Latest spoken-completion rerun: `.expo/device-smoke/spoken-completion/`. Human repetition accuracy and native landmark arrival remain unsupported in that unattended run. No simulator was used.

For the next physical-phone acceptance:

1. Keep the current USB forwarding and unlocked phone. Use Metro 8084 and backend 3002.
2. Start normal live coaching. Say **“Show me how to do a wall angel.”** Watch, then perform one continuous movement and return at a comfortable normal pace. Do not wait at checkpoints or try to match the avatar's timer.
3. Verify silence during movement. After returning, say **“I’m done.”** Expect one review only after that cue. No readiness cue, checkpoint button or automatic completion is required.
4. Say **“I’m ready to try it again,”** then try the suggested correction in another full repetition and say **“I’ve finished.”** Verify a positive acknowledgment when the visible arm movement matches. Holding the end pose should not repeat the review.
5. Hide a wrist/leave the frame during one attempt; it should not produce a successful form judgment. Check camera framing with shoulders, elbows, wrists and hips visible.
6. Check the transcript in a quiet room, then normal ambient conditions. Note whether unexpected language appears under **You** (input transcription) or **Guide** (output). Actual microphone quality and measurement reliability remain manual acceptance items.
