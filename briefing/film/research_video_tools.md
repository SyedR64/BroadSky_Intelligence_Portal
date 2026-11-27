# AI video tools for a 3 to 7 minute film: state of play, late November 2026

Date of research: 2026-11-23. Method: 17 web searches and about 15 page fetches. Several sites (Artlist, MarkTechPost) blocked fetching, so some figures come from search summaries only.

Reader warning. Most spec and price sources are resellers and vendor blogs, not the model makers. They often disagree. Every figure below carries a URL. Items marked UNVERIFIED must be checked on the maker's page before you commit money.

## 1. Tool by tool

### ByteDance Seedance (latest: 2.5; 2.0 still sold)
- Seedance 2.5 launched 31 July 2026 in Jimeng and Doubao Pro. Official post: up to 30 seconds in one pass, up to 30 image, 10 video and 10 audio references, joint audio-video generation, multi-shot inside 30 seconds, camera moves by prompt, reference-based editing. API via BytePlus ModelArk was "coming soon" on that post. https://seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5
- Press said native 4K and 50 reference inputs. The official post does not state resolution. A reseller says the API ships 480p and 720p only. Treat 4K as UNVERIFIED. https://thenextweb.com/news/bytedance-seedance-2-5-ai-video-4k-30-seconds and https://byteplus.com/en/blog/dreamina-seedance2-5 (search summary)
- Seedance 2.0 (official paper): 4 to 15 seconds, native 480p and 720p, native audio. Resellers sell 1080p. https://seed.bytedance.com/en/public_papers/seedance-2-0-advancing-video-generation-for-world-complexity
- Frame rate: 24 fps for 2.0 per one reseller. https://www.atlascloud.ai/hi/blog/guides/seedance-2.0-complete-guide
- Image-to-video with first frame and optional last frame is listed for the Flash variants. Same Atlas page.
- Real people: ByteDance paused real-person image uploads after Disney, Paramount and MPA letters in February 2026. A vendor blog says it relaunched with face blocking, IP filters and C2PA watermarks. Vendor claim, UNVERIFIED. https://au.variety.com/2026/film/news/bytedance-safeguards-seedance-disney-legal-threat-ip-violations-33139/ and https://www.atlascloud.ai/blog/guides/is-hollywood-trying-to-shut-down-seedance-2.0
- Price: Runway's API lists seedance2_5 at $0.30/s (720p), $0.68/s (1080p), $1.10/s (4K); seedance2 at $0.30/s (720p), $0.40/s (1080p). https://docs.dev.runwayml.com/guides/pricing/ Atlas Cloud lists Seedance 2.0 at $0.10/s standard. https://www.atlascloud.ai/hi/blog/guides/seedance-2.0-complete-guide
- Where: Jimeng/Doubao (China), BytePlus ModelArk API (not available in the US per one summary), and aggregators (Runway, Vercel AI Gateway, fal, Artlist, Atlas Cloud). https://vercel.com/ai-gateway/models/seedance-2.5 and https://help.artlist.io/hc/en-us/articles/37430797266973-Seedance-2-0-Family (blocked; from search listing)
- Commercial terms and watermark: no official ByteDance terms found. Reseller licences (for example Artlist's) are the reseller's own. UNVERIFIED.
- Text and logo quality: not stated by ByteDance. Official post admits weak spots in complex physical motion and multi-subject scenes.

### MiniMax Hailuo (latest: H3, also called Hailuo 3.0)
- Released about 31 July 2026. 5 to 15 seconds, up to 2K (1440p), 24 fps, native stereo audio. https://hailuoai.video/zh-Intl/tool-pages-html/minimax-h3
- References: up to 12 files (9 images, 3 videos, 3 audio) steering look, motion, camera, voice. Same page. First, or first-and-last frame workflow is mentioned. Same page.
- Camera moves can be copied from a reference video. Same page.
- Price: Hailuo's own estimate $0.073 to $0.120/s at 2K. Same page. Segmind lists $0.1625/s at 2K. https://blog.segmind.com/minimax-h3-release-date-open-weights-and-api-pricing-explained/ Runway lists hailuo3 at $0.10/s (768p) and $0.15/s (2K). https://docs.dev.runwayml.com/guides/pricing/
- Open weights promised. https://rits.shanghai.nyu.edu/ai/minimax-releases-h3-2k-video-with-native-audio-open-weights-promised/
- Commercial terms: page says built for advertising and film work but states no licence. Watermark: not stated. UNVERIFIED. Same Hailuo page.
- Blocks: generations can be refused for safety or IP reasons. https://www.kapwing.com/resources/how-to-prompt-minimax-h3-hailuo-3-0-a-guide-for-ai-video-creators/
- Rank: Artificial Analysis image-to-video board (undated) shows Seedance 2.0 720p at Elo 1192 and MiniMax H3 at 1185. https://artificialanalysis.ai/pt/video/leaderboard/image-to-video

### Google (Veo 3.1, now succeeded by Gemini Omni 1.2 Flash)
- Veo 3.1 preview models in the Gemini API were shut down 22 October 2026. Google points users to Omni Flash. https://aistudio.google.com/docs/video
- Omni 1.2 Flash: 3 to 15 seconds, draft at 360p or 720p then upscale to 1080p or 4K, native dialogue with multi-speaker lip sync, character/product/style image references, 3-second motion clips, multi-turn editing, $0.07/s at 720p, SynthID watermark on all output. https://blog.google/innovation-and-ai/technology/developers-tools/introducing-gemini-omni-1-2-flash/
- Veo 3.1 GA pricing (third party): about $0.40/s at 720p and 1080p, $0.60/s at 4K for Standard. https://apidog.com/blog/gemini-omni-1-1-flash-pricing/
- Where: Gemini API, Google Cloud, AI Studio, Flow, Vids, Gemini app (Ultra plan). Same Google blog.
- Real people: only the "avatar" feature of yourself is described. No general rule found. UNVERIFIED. https://engadget.com/2176590/googles-gemini-omni-can-generate-anything-from-any-input-starting-with-video

### OpenAI Sora
- Discontinued. OpenAI announced on 24 March 2026 that the app and API would close. https://www.axios.com/2026/03/24/openai-discontinue-sora-video-app Other summaries give an API shutdown date of 24 September 2026. https://developers.openai.com/api/docs/pricing?web=1 (search listing, UNVERIFIED). Do not plan on Sora.

### Kling (latest: 4.0; 4.0 Flash)
- Official page: 3 to 30 seconds in one generation, 720p/1080p/4K, 10-bit HDR, 21:9, stereo audio, lip sync in 9 languages, up to 15 reference assets (10 images, 5 videos, 7 subjects), start and end frames, up to 10 keyframes, multilingual text and logos claimed clear in motion. https://kling.ai/blog/kling-4-vs-3
- Full launch reported 15 October 2026. https://www.bernama.com/tv/news.php?id=2622573 (search listing)
- Runway API price: kling_4 720p $0.157/s, 1080p $0.235/s (promo 20% off to 30 November 2026); Flash $0.094/s. https://docs.dev.runwayml.com/guides/pricing/
- Lip-sync gains partly unverified outside demos. https://www.mindstudio.ai/blog/kling-4-0-first-look/ (search listing)

### Runway
- Latest generator is Gen-4.5: 2 to 10 seconds, no native audio, $0.12/s on API. Aleph 2 edits existing video at $0.28/s. https://docs.dev.runwayml.com/guides/pricing/ and https://help.runwayml.com/hc/en-us/articles/46974685288467 (search listing)
- Runway now also resells Seedance, Kling, Veo, Hailuo, Wan and others on one credit system (1 credit = $0.01). Same pricing page. This makes it useful as an aggregator.

### Luma
- Ray3.14 (January 2026): native 1080p, 4x faster, 3x cheaper than Ray3. https://www.businesswire.com/news/home/20260126744711/en Ray3.2 named on Luma's page for frame-level control. https://lumalabs.ai/learning-center/articles/luma-video-models-field-guide (search listing). Clip length and price not verified.

### Pika
- Only Pika 2.2 specs found (1080p, up to 10 s). Pika now centres on effects and social clips. Not suited to this film. https://lumalabs.ai/news/luma-vs-pika

### Newer leaders
- Alibaba Wan 3.0 is ranked top text-to-video in one November 2026 roundup; I could not read the page. Runway lists wan3 at $0.10/s (720p). https://www.marktechpost.com/2026/11/13/best-ai-video-generation-models-2026/ (blocked) and https://docs.dev.runwayml.com/guides/pricing/
- Gemini Omni (above) is Google's new leader. Grok Imagine 1.5 and "HappyHorse 1.0" also appear on Runway's price list, no further data.
- Leaderboard snapshots disagree month to month. Do not trust a single "number one."

### Gaps I could not fill
Pika's current commercial terms, Luma clip length, every maker's rules on real company logos, and any firm commercial licence text for Seedance and Hailuo. Read each maker's terms of service before paying.

## 2. Comparison table (best-evidenced figures)

| Tool | Max clip | Top res | Native audio | Refs | Approx $/s |
|---|---|---|---|---|---|
| Seedance 2.5 | 30 s | 720p confirmed, 4K claimed | Yes | 30 img, 10 vid, 10 audio | 0.30 (720p) to 0.68 (1080p) |
| Seedance 2.0 | 15 s | 720p native, 1080p resold | Yes | many | 0.10 to 0.40 |
| Hailuo H3 | 15 s | 2K | Yes | 12 files | 0.07 to 0.16 |
| Gemini Omni 1.2 | 15 s | 4K upscale | Yes, lip sync | images, motion clips, voice | 0.07 (720p) |
| Kling 4.0 | 30 s | 4K | Yes, 9 languages | 15 assets | 0.16 to 0.24 |
| Runway Gen-4.5 | 10 s | 720p | No | first frame | 0.12 |
| Luma Ray3.14 | not verified | 1080p | not verified | not verified | not verified |
| Sora | closed | n/a | n/a | n/a | n/a |

## 3. (a) How professionals build a multi-minute AI film in 2026
Sources are how-to blogs and vendor guides, so treat as common practice, not proof.
1. Script, then shot list, then style guide. Build character sheets and environment stills before any video. https://www.mindstudio.ai/blog/ai-short-film-seedance-2-workflow-voice-swap-cost-2
2. Lock reference frames. Make a storyboard still per shot with an image model. Feed the approved still as the first frame; this is described as the most effective consistency technique. https://www.mindstudio.ai/blog/ai-one-person-short-film-production-workflow
3. Generate about 3 takes per shot. Expect 40 to 60 percent usable on the first pass. https://www.mindstudio.ai/blog/ai-short-film-seedance-2-workflow-voice-swap-cost-2
4. Upscale and conform. Cut in DaVinci Resolve or Premiere, grade to unify clips, export H.264 1080p 24 fps or ProRes. https://invideo.io/blog/ai-filmmaking/
5. Audio: ElevenLabs for voice-over and effects, Suno or Udio for music (check licence tier), mix to about -14 LUFS. Same MindStudio page.
Note: that MindStudio article says Seedance 2.0 makes silent video, which conflicts with ByteDance's paper saying native audio. Trust the paper.

## 4. (b) What AI video still does badly, and the workaround
- Readable screens, on-screen text, signs, logos: generate atmosphere, add exact text and UI in post. https://capcut.com/create/ai-video-limitations-2026
- Logos shift during motion. https://kling.ai/blog/limitations-of-current-ai-video-generation-technology
- Hands: avoid close-ups, over-generate. https://www.lilachbullock.com/why-ai-generated-videos-still-look-weird/
- Character drift across 50+ clips: reference images, image-to-video from fixed stills, medium shots (small faces lose identity). https://www.kapwing.com/resources/how-to-prompt-minimax-h3-hailuo-3-0-a-guide-for-ai-video-creators/
- Fast action and multi-subject scenes: keep beats short. Seedance's own post concedes this.
- Long takes: even 30-second models are multi-shot cuts; plan cuts.
- Real screen recordings composited over AI device shots: standard practice but I found no source dedicated to it. It follows from the text and UI advice above. Motion graphics (After Effects, Figma, Remotion) for all type.
- Real people's likenesses: Seedance and others block face uploads. Do not rely on a model to make a real person.

## 5. (c) Budget and time for a 4 to 5 minute film, 50 to 70 shots
Basis: a 3-minute short needed 40 to 60 clips, 150 to 200 generations, $100 to $250 total, 22 to 30 hours. https://www.mindstudio.ai/blog/ai-short-film-seedance-2-workflow-voice-swap-cost-2 Another guide quotes $315 to $750 per finished minute. https://www.mindstudio.ai/blog/ai-one-person-short-film-production-workflow
My estimate, scaled and my own arithmetic:
- Shots: 60 finals, 5 s average, 3 takes each plus 30% retries = about 235 generations of 5 to 8 s.
- Generation at $0.15 to $0.30/s, about 1,400 seconds: roughly $210 to $420. With a 1080p premium pass for hero shots, up to about $800.
- Stills and references: $30 to $100. Voice-over and effects (ElevenLabs): $20 to $100. Music licence: $0 to $300 (verify commercial terms). Lip sync tools if needed: $10 to $50.
- Out-of-pocket total: about $400 to $1,500. This excludes your time and any real screen recordings.
- Time for one person: 40 to 70 hours over 2 to 3 weeks (script and approvals 8 to 12, stills 8 to 12, video 15 to 25, motion graphics and screen capture 8 to 15, edit/audio 10 to 15). A team of two can compress to 1 to 1.5 weeks.
- Biggest cost driver is retries, not price per second.

## 6. (d) Prompting the top two tools
These examples are my drafts built on the cited structures. Not verified by test generation.

### Seedance (2.x/2.5)
Structure: subject and look, action, environment and lighting, camera and shot type, mood last. Name the shot type early. One camera move per prompt. Positive phrasing, no negatives. https://www.atlascloud.ai/hi/blog/guides/seedance-2.0-complete-guide References are addressed by an @name syntax on Dreamina and Jimeng. Same page. Seedance 2.5 also accepts timestamp-level direction for multi-shot clips. Official post above.

Example, establishing shot:
"Wide aerial establishing shot of a mid-sized American city skyline at dawn, glass towers catching the first orange light, thin mist over the river, a few lit office windows. Slow, steady push-in toward the towers. Cool blue shadows turning to warm gold, soft film grain, calm and hopeful mood. Ambient audio: distant traffic hum, faint birdsong, no music, no text on screen."

Example, technician at a house:
"Medium tracking shot, handheld, of a service technician in a plain navy work shirt and cap, no logos, stepping out of a white van and walking up a suburban driveway with a toolbox. Morning light, tidy lawn, a homeowner opens the front door and smiles. Camera follows at shoulder height, one smooth move. Natural audio: van door closing, footsteps on concrete, birds. No text, no brand marks."

### MiniMax H3
Structure: References, Retention, Scene, Timeline, Camera, Audio, Constraints. One main action per prompt; give each reference a role. https://www.kapwing.com/resources/how-to-prompt-minimax-h3-hailuo-3-0-a-guide-for-ai-video-creators/ Describe camera by movement, range and speed. https://lumalabs.ai/learning-center/articles/minimax-h3-prompting-guide (search listing)

Example, establishing shot:
"References: none. Retention: n/a. Scene: a city skyline at dawn, glass towers, river mist, warm light on the horizon. Timeline: [0-5s] light slowly brightens on the towers; [5-10s] first windows turn gold. Camera: slow aerial push-in, wide, steady. Audio: faint city hum, birdsong, no music. Constraints: no on-screen text, no logos, no people close up, no flicker."

Example, technician at a house:
"References: Image 1 defines the technician (navy uniform, no logo); Image 2 defines the house. Retention: keep uniform and face the same throughout. Scene: suburban street, morning. Timeline: [0-4s] white van parks; [4-8s] technician takes a toolbox and walks to the door; [8-10s] homeowner opens it and nods. Camera: medium tracking shot at shoulder height, smooth. Audio: van door, footsteps, birdsong. Constraints: no text, no brand marks, keep hands out of close-up."

## 7. (e) Legal cautions when showing a real firm and real people without their involvement
This is background, not legal advice. Have counsel review before sending.
- Likeness: AI depictions of real people can raise right-of-publicity and privacy claims; in the US, state law varies. https://law.stanford.edu/wp-content/uploads/2026/02/TTLF-WP-147-Karabegovic.pdf
- False endorsement and trademark: showing a real firm's name or logo in a way that suggests it approved the film can support Lanham Act claims. https://scholars.uky.edu/en/publications/deceptive-exploitation-deepfakes-the-rights-of-publicity-and-priv/
- A court refused to dismiss a face-swap ad case on expressive-use grounds. https://news.bloomberglaw.com/safety/mrbeast-tom-hanks-stung-by-ai-scams-as-law-rushes-to-keep-pace
- Practical risk: cease-and-desist letters are the usual first step. Same Bloomberg source.
- Tool rules: makers block real faces and IP, and may ban accounts. Seedance case above.
- Disclosure: SynthID and C2PA marks make AI origin detectable. Label the film as AI-generated.
- I found no 2026 statute or source on corporate-specific claims. State digital-replica and deepfake laws, and trade libel and defamation, need counsel.
- Safe pattern: do not generate the likeness of any real person or any real logo. Use composited real footage you own or are licensed to use, or an invented presenter, with real marks added only with written permission. A film sent privately to the CEO of the firm shown is lower risk than a public one, but permission is still the clean route.

## 8. Recommendation
- Use Seedance 2.5 (or 2.0 via an aggregator such as Runway, since the BytePlus API is not available in the US) for hero cinematic shots: skylines, drone-style moves, multi-shot sequences up to 30 s, and anything needing many references. Confirm the resolution you actually get.
- Use MiniMax H3 for 2K character and product shots with controlled references, and for cost-sensitive filler and B-roll at $0.10 to $0.15/s.
- Keep Kling 4.0 as the dialogue and 4K backup if you need long lip-synced takes, and Gemini Omni 1.2 for cheap drafts and conversational edits.
- Skip Sora (closed), Pika (wrong fit) and Runway Gen-4.5 as a primary (no audio, 720p), though Runway is handy as one billing hub for many models.
- Do every readable screen, chart, name, logo and caption as real screen recording or motion graphics, not AI.
- Do voice-over in ElevenLabs, music from a licensed library, final mix in DaVinci Resolve.
- Before spending: run a 10-shot test on both tools with the same stills, check resolution, commercial terms and watermark, then lock the tool per shot type.
- Note: I did not research the YC launch videos the client wants to use as models. That needs a separate step.
