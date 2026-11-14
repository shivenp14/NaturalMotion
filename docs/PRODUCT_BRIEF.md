# Hands-Free Anatomical Movement Coach

> Working product brief for HackPrinceton Fall 2026. This document captures the agreed direction, research findings, and remaining implementation decisions. The product name is provisional.

## 1. Product summary

A mobile-first, hands-free movement coach that turns conversation into a personalized, animated movement sequence, explains the muscles involved, and uses the phone camera to provide observable form feedback.

The user describes everyday stiffness through voice and shows their movement to the camera. The agent constructs a sequence from supported, parameterized movement components. A single anatomical body model demonstrates the sequence and highlights relevant muscle regions. Pose estimation and explicit movement-specific checks support feedback while the user follows along.

The application is designed to expand across body regions. The first complete, tested experience will focus on upper-back/shoulder stiffness associated with desk work.

## 2. Motivation and audience

The idea originated from a teammate experiencing back discomfort and wanting accessible movement guidance. Office workers who spend long periods sitting are the initial audience. More active users and additional body regions are possible future extensions.

The agreed product promise is guided movement for everyday stiffness and physical wellbeing. Diagnosis, injury treatment, and replacing a clinician or chiropractor are outside that promise.

## 3. Agreed constraints

| Area | Decision |
| --- | --- |
| Team | Three technically experienced people using coding agents |
| Time budget at planning | Approximately 12–15 hours; reassess remaining time before implementation |
| Starting point | No application code or acquired anatomy asset at planning time |
| Application | Expo + React Native + TypeScript |
| Primary platform | Android first; iOS compatibility is a later consideration |
| Anatomy asset budget | Maximum $25; free assets preferred |
| Visual presentation | One polished anatomical model that both demonstrates movement and highlights muscles |
| Voice interaction | Hands-free, alternating listening and speaking; no push-to-talk requirement |
| Initial validation | One complete movement experience in the upper-back/shoulder region |
| Expansion | Additional components and body regions after the first complete experience works |
| Demo acceptance | Three consecutive successful full-flow runs on the presentation phone |

The exact Android phone and OS version remain unspecified.

## 4. Core experience

1. **Describe:** The user verbally describes their stiffness and what they want help with.
2. **Clarify:** The agent asks relevant follow-up questions within the product's wellness scope.
3. **Construct:** The agent creates a sequence using supported movement components and permitted parameters.
4. **Demonstrate:** The anatomical model performs the sequence, with relevant muscle regions highlighted.
5. **Observe:** The user follows the demonstration while the camera tracks the landmarks needed for supported checks.
6. **Guide:** A movement-specific check identifies an observable issue, and the agent explains a correction.
7. **Recognize:** The app recognizes the user's adjustment when the supported check indicates a change.
8. **Continue:** The user can converse further and request supported changes to the sequence or demonstration.

The camera's role must affect the experience. A key demonstration is a visible form issue, a corresponding correction, and recognition of the adjustment.

Comfort is user-reported. An observed movement change does not establish pain relief or identify the cause of discomfort.

## 5. Parameterized movement generation

### The central design decision

The agent constructs sequences from **parameterized movement components**. This preserves generative behavior while giving the application a defined movement language it can execute.

Each possible sequence does not require a separately recorded animation. The agent can combine supported components and choose permitted parameters such as:

- Component order.
- Demonstration speed and timing.
- Pauses and repetitions.
- Side or direction, where supported.
- Other component-specific parameters with explicitly configured limits.

Which parameters are actually supported must be established during implementation. The agent's ability to describe a movement does not automatically make that movement executable or assessable.

### Proposed component contract

Each supported component should define:

| Field | Purpose |
| --- | --- |
| Identifier and description | Give the agent an unambiguous executable choice |
| Animation behavior | Translate permitted parameters into movement of the rig |
| Parameter schema and limits | Define what the application can execute |
| Muscle-region mapping | Identify expected involved or targeted regions for educational highlighting |
| Camera placement | Explain how the user should position the phone and body |
| Required landmarks | Identify the observations needed for each supported check |
| Form-check rules | Define the specific observable issues the component can assess |
| Feedback descriptions | Give the agent grounded information for explaining findings |
| Visibility handling | Define when the app should request repositioning or withhold a judgment |

This contract is an implementation proposal derived from the agreed architecture. Exact components, ranges, thresholds, and transitions remain to be established and tested.

### Extending coverage

The architecture should support additional body regions. Each extension still needs executable movement behavior, appropriate highlighting, and any promised camera checks.

A muscle-group label by itself does not supply those capabilities. User-facing coverage should reflect what the application can actually demonstrate and assess.

## 6. Anatomy and visual direction

The visual reference is a detailed grayscale muscular body on a dark background, with clear muscle boundaries and selective color highlighting.

The same model should perform the demonstration and show relevant regions. Separate anatomical and animation models were rejected because mobile screen space is limited and the unified model is central to the experience.

Visual priorities:

- Clear anatomy and readable highlighting on a phone.
- Clean deformation during supported movement.
- Polished lighting, framing, and presentation.
- Smooth performance on the actual Android device.

If a highly detailed asset is impractical, the accepted fallback is one simpler rigged human body with clearly defined muscle regions or outlines. Creating that asset still requires work; it should not be assumed to be an automatic output of coding agents.

### Meaning of muscle highlighting

Highlighting depicts curated, expected muscle involvement or targets for a supported component. It is an educational illustration.

Deterministic rendering means that the same configured movement produces consistent highlighting. It does not guarantee physiological accuracy or measure this user's actual muscle activation. Observed movement does not uniquely determine muscle activation.

## 7. Camera and form feedback

The provided skeleton-overlay reference represents pose estimation: estimated body landmarks connected into a body skeleton.

Pose landmarks can support selected geometric checks, such as changes in joint position, estimated angles, or torso alignment. They do not directly measure muscle tension, pain, or the cause of stiffness.

Recommended processing flow:

**Camera → pose landmarks and visibility → movement-specific checks → structured observations → agent explanation**

The agent may also receive selected camera frames when useful. Structured observations should preserve information already computed by the application instead of requiring the agent to reinterpret a skeleton image alone.

Initial operating conditions should be constrained: one person, prescribed camera placement, and one movement at a time. Relevant landmarks must be sufficiently observable before the app issues a supported form judgment.

The exact first movement and detectable issue remain undecided. Select them after testing both asset animation and camera observability.

## 8. Voice behavior

The user may stand or sit away from the phone during movement, so requiring a tap for every utterance would create friction.

The agreed first version uses hands-free turn-taking:

1. Listen for the user.
2. Detect the end of their turn.
3. Produce the response.
4. Resume listening.

Interrupting the assistant while it speaks is deferred. Listening, speaking, and movement-tracking states should be understandable to the user.

Microphone capture, spoken playback, camera operation, speech recognition at demonstration distance, and speaker echo behavior must be tested together on the presentation device.

## 9. Technical approach and integration risks

| Layer | Direction | Status |
| --- | --- | --- |
| Mobile application | Expo, React Native, TypeScript | Agreed |
| Native integration | Expo development build if additional native modules are needed | Agreed approach |
| Anatomy renderer | React Three Fiber native with Expo GL | Research-backed candidate |
| Camera-to-pose pipeline | Compatible native camera and pose-estimation integration | Unresolved; first feasibility check |
| Form assessment | Explicit component-specific rules | Agreed |
| Conversation | Agent constructs sequences and explains grounded observations | Agreed |
| Voice services and agent provider | To be selected | Unresolved |
| Anatomy asset and animation implementation | To be selected and inspected | Unresolved |

### Important Expo distinction

Expo Camera documents camera preview, photos, video, and barcode scanning. Its documented API should not be assumed to provide arbitrary raw frames for a native pose pipeline.

Expo Go includes a fixed set of native modules. Additional native camera or pose modules may require an Expo development build. A development build permits custom native integration; compatibility among the chosen packages still needs verification.

MediaPipe's browser Pose Landmarker should not be assumed to run unchanged inside a native Expo camera preview. MediaPipe remains a pose-estimation reference; the native implementation has not been selected.

## 10. Anatomy asset research

These are research leads, not inspected or approved assets. Prices were reported during planning and should be checked before purchase. No asset was purchased, downloaded, or locally inspected during the discussion.

| Candidate | Why investigate it | Outstanding questions |
| --- | --- | --- |
| [Oussema3D rigged anatomy pack](https://www.cgtrader.com/3d-models/character/human-anatomy/rigged-muscle-anatomy-skeleton-muscles-bodybuilder-anatomy) | Reported $9.99; listing specifies rigged GLB, FBX, and Blender exports and a royalty-free license | Separate highlightable muscle regions, mobile performance, rig compatibility, and usable movement clips are unverified |
| [Z-Anatomy official repository](https://github.com/Z-Anatomy/Models-of-human-anatomy) | Free Blender anatomy source; repository includes a biomechanics archive | Export, rigging, animation, and mobile suitability need inspection; review attribution, share-alike terms, and licenses for selected assets |
| [Ruslan Gadzhiev anatomy study](https://sketchfab.com/3d-models/male-body-muscular-system-anatomy-study-991eb96938be4d0d8fadee241a1063d3) | Free-download anatomy lead with reported CC Attribution licensing | Rig, separate regions, file formats, and animations were not verified; direct listing access was limited during research |

The preferred order is to inspect viable free sources, then consider the inexpensive rigged pack if it saves enough preparation time.

Before committing to an asset, prove that one character loads smoothly, performs one chosen movement cleanly, and supports highlighting one relevant region. Rigging and independently highlightable muscles are separate requirements.

## 11. First milestone and demo acceptance

### First technical milestone

On the actual Android phone, prove:

1. Camera input reaches pose estimation and produces useful landmarks.
2. One parameterized movement runs on the anatomical model.
3. One relevant muscle region can be highlighted.
4. One supported form check produces an observable result.

Run an initial camera-to-pose feasibility checkpoint within approximately 60–90 minutes of beginning that integration. Resolve major compatibility problems before investing heavily in surrounding UI polish.

### Complete demo flow

1. The user describes everyday desk-related stiffness.
2. The agent constructs and explains a supported movement sequence.
3. The anatomical model demonstrates it with highlighting.
4. The user requests a supported change, such as slower demonstration or another repetition.
5. The model visibly adapts.
6. The user attempts the movement with a supported, observable form issue.
7. The app identifies that issue and explains a correction.
8. The user adjusts, and the app recognizes the adjustment.

One successful run is the integration milestone. Three consecutive successful runs on the presentation device are the agreed acceptance check before adding features.

## 12. Hackathon positioning

The value proposition is the integrated interaction: conversation controls an executable movement system, anatomy explains the demonstration, and camera observations affect feedback.

Existing products already offer detailed anatomical exercise animations and camera-based exercise coaching. A 3D body viewer alone does not establish novelty.

For the presentation, emphasize:

- A concrete desk-worker problem and the team's personal motivation.
- Visible construction or adaptation of a movement sequence.
- One useful camera-grounded correction.
- A polished single-model mobile experience.
- Honest distinction between implemented coverage and future expansion.

Research into the official Fall 2026 rules found a maximum two-minute live presentation and the rubric categories Creativity, Utility, Charity, and Avidity. Design the demonstration around one clear interaction. The submission page and rules reported conflicting deadline times, so verify the operative deadline with organizers.

## 13. Remaining decisions

- Primary Android phone model and OS version.
- Final anatomy asset, its license obligations, and required optimization.
- Compatible native camera-to-pose implementation.
- First supported movement components and transitions.
- Permitted parameter values and validation behavior.
- First observable form issue and its detection rules.
- Voice and conversational model providers.
- Exact handling of requests outside implemented movement coverage.
- Interface arrangement for demonstration, camera feedback, and conversation.

These are implementation and feasibility decisions. They should preserve the agreed single-model, hands-free, parameterized movement experience.

## 14. Research references

- [HackPrinceton Fall 2026 rules](https://hackprinceton-fall-26.devpost.com/rules)
- [HackPrinceton Fall 2026 submission page](https://hackprinceton-fall-26.devpost.com/)
- [MediaPipe Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker)
- [MediaPipe Pose Landmarker for web](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/)
- [Expo custom native code and development builds](https://docs.expo.dev/workflow/customizing/)
- [React Three Fiber installation, including native support](https://r3f.docs.pmnd.rs/getting-started/installation)
- [React Three Fiber model-part access](https://github.com/pmndrs/react-three-fiber/blob/master/docs/API/hooks.mdx)
- [OpenSim explanation of muscle redundancy](https://opensimconfluence.atlassian.net/wiki/spaces/OpenSim/pages/53084318/Custom%2BStatic%2BOptimization%2Bin%2BMATLAB)
- [Muscle & Motion exercise visualization](https://www.muscleandmotion.com/strength-training-app/)
- [Kaia Motion Coach](https://kaiahealth.com/motion-coach/)
- [Hinge Health movement analysis and AI assistant announcement](https://www.hingehealth.com/gb/en/resources/press-releases/hinge-health-unveils-new-ai-powered-care-tools/)
