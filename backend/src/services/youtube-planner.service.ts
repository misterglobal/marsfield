export interface YoutubePlannerInput {
  topic: string;
  audience?: string;
  targetDurationMin?: number;
  angleCount?: number;
  format?: string;
  tone?: string;
  objective?: string;
}

const ANGLES = [
  { angle: 'Origin', tension: 'the accepted beginning versus the messier evidence', proof: 'a dated source, object, or location' },
  { angle: 'System', tension: 'what the system promised versus who actually benefited', proof: 'a process, map, hierarchy, or material trace' },
  { angle: 'People', tension: 'the famous version versus an ordinary person’s experience', proof: 'a firsthand account or grounded human detail' },
  { angle: 'Turning point', tension: 'the moment events could still have gone another way', proof: 'a decision, conflict, discovery, or reversal' },
  { angle: 'Consequence', tension: 'the immediate result versus the lasting cost', proof: 'a before-and-after comparison' },
  { angle: 'Misconception', tension: 'the popular shorthand versus the strongest counter-evidence', proof: 'two credible sources in disagreement' },
  { angle: 'Legacy', tension: 'what disappeared versus what remains visible now', proof: 'a modern parallel with a traceable link' },
  { angle: 'Unanswered question', tension: 'what we can establish versus what remains uncertain', proof: 'an explicit evidence gap' },
  { angle: 'Geography', tension: 'the story people tell versus what the landscape allowed', proof: 'a route, climate constraint, or spatial comparison' },
  { angle: 'Technology', tension: 'the invention itself versus the behavior it changed', proof: 'a mechanism demonstrated in action' },
  { angle: 'Power', tension: 'the official narrative versus the incentive underneath it', proof: 'a law, record, exchange, or institutional decision' },
  { angle: 'Afterlife', tension: 'the original meaning versus how later generations reused it', proof: 'a specific adaptation or reinterpretation' },
];

const SHOT_RECIPES = [
  { type: 'Macro evidence reveal', camera: 'Locked macro, then a precise rack focus', transition: 'Match cut on shape', purpose: 'proof' },
  { type: 'Geographic orientation', camera: 'Top-down map drift with one animated route', transition: 'Route line carries into frame', purpose: 'context' },
  { type: 'Human-scale reconstruction', camera: 'Handheld medium follow at eye level', transition: 'Motivated cut on movement', purpose: 'empathy' },
  { type: 'Archive comparison', camera: 'Controlled split-frame push with labeled-safe negative space', transition: 'Hard cut on contradiction', purpose: 'contrast' },
  { type: 'Process insert', camera: 'Three-step close-up sequence, wide to detail', transition: 'Sound bridge', purpose: 'explanation' },
  { type: 'Environmental wide', camera: 'Static wide with foreground movement and deep staging', transition: 'Slow dissolve only at chapter break', purpose: 'scale' },
  { type: 'Portrait pressure shot', camera: 'Very slow push from medium to close-up', transition: 'J-cut into the next claim', purpose: 'tension' },
  { type: 'Graphic evidence board', camera: '2.5D parallax across no more than three evidence layers', transition: 'Graphic wipe from source edge', purpose: 'clarity' },
  { type: 'Counterfactual beat', camera: 'Locked symmetrical frame with one changing element', transition: 'Smash cut to consequence', purpose: 'reversal' },
  { type: 'Present-day echo', camera: 'Gimbal reveal from detail to recognisable location', transition: 'Visual rhyme', purpose: 'relevance' },
];

const VISUAL_THREADS = [
  {
    id: 'human',
    name: 'Human consequence',
    purpose: 'Keep the stakes legible at an individual scale without requiring the same person in every shot.',
    anchors: ['human-scale behavior', 'material detail', 'restrained eye-level framing'],
    characterPolicy: 'Use an established person only when the narration concerns their experience; otherwise use hands, traces, or environment.',
  },
  {
    id: 'evidence',
    name: 'Evidence trail',
    purpose: 'Make claims feel connected through recurring sources, artifacts, records, and observable details.',
    anchors: ['one evidence object', 'controlled macro detail', 'brass highlight against a restrained palette'],
    characterPolicy: 'No character required unless their interaction proves the claim.',
  },
  {
    id: 'system',
    name: 'System and geography',
    purpose: 'Widen from individual events to routes, institutions, processes, and power.',
    anchors: ['directional line motif', 'top-down or architectural orientation', 'indigo structural accents'],
    characterPolicy: 'Prefer spatial relationships and process; introduce people only for scale or causality.',
  },
  {
    id: 'echo',
    name: 'Present-day echo',
    purpose: 'Connect the historical or abstract argument to a visible consequence or modern parallel.',
    anchors: ['before-and-after visual rhyme', 'recognisable environment', 'returning shape or texture'],
    characterPolicy: 'A recurring person may return for payoff, but a location or object can carry the callback instead.',
  },
] as const;

type VisualThreadId = typeof VISUAL_THREADS[number]['id'];

function visualThreadFor(purpose: string, index: number): VisualThreadId {
  if (purpose === 'empathy' || purpose === 'tension') return 'human';
  if (purpose === 'proof' || purpose === 'contrast' || purpose === 'clarity') return 'evidence';
  if (purpose === 'context' || purpose === 'explanation' || purpose === 'scale') return 'system';
  if (purpose === 'relevance') return 'echo';
  return VISUAL_THREADS[index % VISUAL_THREADS.length].id;
}

function validateStoryboardContinuity(storyboard: Array<Record<string, any>>) {
  const issues: Array<{ severity: 'error' | 'warning'; sceneNumber: number; code: string; message: string }> = [];
  const planted = new Map<string, number>();
  const paidOff = new Set<string>();

  storyboard.forEach((scene, index) => {
    const previous = storyboard[index - 1];
    if (index > 0 && !scene.previousShotSummary) {
      issues.push({ severity: 'error', sceneNumber: scene.sceneNumber, code: 'MISSING_HANDOFF', message: 'Scene has no explicit incoming connection.' });
    }
    if (!scene.continuityContract?.preserve?.length || !scene.continuityContract?.change?.length) {
      issues.push({ severity: 'error', sceneNumber: scene.sceneNumber, code: 'EMPTY_CONTINUITY_CONTRACT', message: 'Scene must say what remains stable and what changes.' });
    }
    if (previous?.storyFunction === scene.storyFunction && previous?.visualThreadId === scene.visualThreadId) {
      issues.push({ severity: 'warning', sceneNumber: scene.sceneNumber, code: 'REPEATED_VISUAL_FUNCTION', message: 'Adjacent scenes repeat the same visual thread and story function.' });
    }
    for (const motif of scene.plants || []) planted.set(motif, scene.sceneNumber);
    for (const motif of scene.callbacks || []) paidOff.add(motif);
  });

  for (const [motif, sceneNumber] of planted) {
    if (!paidOff.has(motif)) {
      issues.push({ severity: 'warning', sceneNumber, code: 'UNPAID_SETUP', message: `The planted motif "${motif}" has no later callback.` });
    }
  }
  return {
    status: issues.some((issue) => issue.severity === 'error') ? 'needs_revision' : issues.length ? 'review' : 'passed',
    issues,
  };
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function clean(value: unknown, fallback = '', max = 180): string {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max);
}

function keywordsFor(topic: string): string[] {
  return topic.toLowerCase().replace(/[^\w\s-]/g, '').split(/\s+/).filter(Boolean).slice(0, 8);
}

function timecode(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function planYoutubeProduction(input: YoutubePlannerInput) {
  const topic = clean(input.topic);
  if (topic.length < 3) throw new Error('Topic must be at least 3 characters');
  const audience = clean(input.audience, 'curious viewers who value clear, evidence-led storytelling', 140);
  const targetDurationMin = clampInt(input.targetDurationMin, 8, 3, 60);
  const angleCount = clampInt(input.angleCount, 8, 4, 12);
  const format = clean(input.format, 'Cinematic explainer', 60);
  const tone = clean(input.tone, 'Authoritative and curious', 80);
  const objective = clean(input.objective, 'Make the viewer understand why this story matters now', 180);
  const totalSeconds = targetDurationMin * 60;
  const targetWords = Math.round(targetDurationMin * 145);
  const selectedAngles = ANGLES.slice(0, angleCount);

  const research = {
    topic,
    status: 'needs_sources',
    disclaimer: 'Editorial research brief—not verified reporting. Clear every claim against primary or reputable secondary sources before recording.',
    sourceStandards: ['Prefer primary sources for central claims', 'Triangulate contested claims with two independent sources', 'Label uncertainty in the narration', 'Record URLs, author, publication, date, and access date'],
    angles: selectedAngles.map((item, index) => ({
      ...item,
      questions: [
        `What is the most defensible claim about ${topic} through ${item.angle.toLowerCase()}?`,
        `What would a sceptical viewer challenge, and which source answers them?`,
        `Which concrete image can prove the point without the voice-over?`,
      ],
      factPrompts: [
        { id: `${index + 1}.1`, prompt: `Find the strongest primary or expert source for ${item.proof}.`, status: 'open' },
        { id: `${index + 1}.2`, prompt: `Find a credible source that complicates or contradicts the main claim.`, status: 'open' },
      ],
    })),
  };

  const chapterBlueprints = [
    { name: 'Cold open', purpose: 'Create a specific contradiction and withhold its explanation', beat: `Begin on one concrete image connected to ${topic}. State what it appears to mean, then reveal why that reading is incomplete.`, retention: 'Open a question the film can answer only after the turning point.' },
    { name: 'The promise', purpose: 'Define the viewer contract', beat: `Tell ${audience} exactly what they will understand by the end, without summarising the answer.`, retention: 'Preview three escalating discoveries in one sentence.' },
    ...selectedAngles.slice(0, Math.min(7, Math.max(3, targetDurationMin - 2))).map((item, index) => ({
      name: `${index + 1}. ${item.angle}`,
      purpose: item.tension,
      beat: `Build one evidence-led sequence around ${item.proof}. Move from observation, to interpretation, to consequence; separate established fact from inference.`,
      retention: index % 3 === 0 ? 'End on a contradiction that reframes the next chapter.' : index % 3 === 1 ? 'Plant a visual detail that pays off two beats later.' : 'Answer the prior question, then raise a narrower, higher-stakes one.',
    })),
    { name: 'Synthesis', purpose: 'Resolve the central question without flattening uncertainty', beat: `Connect the strongest pieces of evidence into one clear answer about ${topic}, then name the important limit of that answer.`, retention: 'Deliver the promised payoff before broadening to relevance.' },
    { name: 'Exit beat', purpose: 'Leave the viewer with a precise afterthought and next action', beat: `Return to the opening image with new meaning. Invite one specific comment tied to the unresolved question.`, retention: 'Use a visual callback instead of a generic recap.' },
  ];

  const weighted = chapterBlueprints.map((_, index) => index === 0 ? 0.07 : index === 1 ? 0.08 : index >= chapterBlueprints.length - 2 ? 0.1 : 1);
  const fixedWeight = weighted.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  const scriptSections = chapterBlueprints.map((chapter, index) => {
    const share = weighted[index] / fixedWeight;
    const durationSeconds = index === chapterBlueprints.length - 1 ? totalSeconds - cursor : Math.max(20, Math.round(totalSeconds * share));
    const startSeconds = cursor;
    cursor += durationSeconds;
    const wordTarget = Math.max(45, Math.round(targetWords * share));
    return {
      name: chapter.name,
      purpose: chapter.purpose,
      timecode: `${timecode(startSeconds)}–${timecode(Math.min(totalSeconds, cursor))}`,
      startSeconds,
      durationSeconds,
      wordTarget,
      narration: chapter.beat,
      draftStatus: 'editorial_outline',
      retentionDevice: chapter.retention,
      editorNotes: index === 0
        ? 'No logo sting. Let the first image and first line do the work.'
        : 'Cut any sentence that repeats the visual; use narration for meaning and visuals for evidence.',
    };
  });

  const productionBible = {
    version: 2,
    thematicSpine: `Follow how the strongest visible evidence changes the viewer's understanding of ${topic}.`,
    visualStyle: {
      format,
      tone,
      palette: ['restrained indigo', 'weathered neutral', 'selective brass highlight'],
      lightingRules: ['Use motivated, physically plausible light', 'Keep light direction stable inside continuous action', 'Change lighting only with an explicit time or location transition'],
      lensLanguage: 'Human material uses eye-level perspective; systems use wider or top-down orientation; evidence uses controlled detail.',
    },
    characterPolicy: 'Characters are continuity anchors only when their experience advances the story. Do not force a recurring person into evidence, map, process, or environmental shots.',
    referencePolicy: {
      global: 'Pass the approved style reference to every generation.',
      character: 'Pass a character reference only when that established character appears.',
      location: 'Pass the matching location reference when returning to an established place.',
      previousFrame: 'Pass the prior frame only for continuous action or an intentional visual match; do not contaminate a new visual thread.',
    },
    visualThreads: VISUAL_THREADS,
  };

  const sequences = scriptSections.map((section, index) => ({
    id: `sequence-${index + 1}`,
    chapter: section.name,
    objective: section.purpose,
    questionIn: index === 0 ? `What familiar image of ${topic} is incomplete?` : `What must the viewer now understand after ${scriptSections[index - 1].name}?`,
    discovery: section.narration,
    emotionalChange: index === 0 ? 'familiarity to curiosity' : index >= scriptSections.length - 2 ? 'uncertainty to earned clarity' : 'curiosity to sharper tension',
    setup: `Orient the viewer to ${section.purpose} through one legible subject.`,
    payoff: section.retentionDevice,
    nextSequenceHandoff: index < scriptSections.length - 1
      ? `End on a question, shape, action, or sound that motivates ${scriptSections[index + 1].name}.`
      : 'Return to the opening visual with changed meaning.',
  }));

  const sceneCount = clampInt(Math.round(totalSeconds / 24), 16, 10, 36);
  const baseDuration = Math.floor(totalSeconds / sceneCount);
  const remainder = totalSeconds % sceneCount;
  let sceneCursor = 0;
  const sceneSlots = Array.from({ length: sceneCount }, (_, index) => {
    const durationSeconds = baseDuration + (index < remainder ? 1 : 0);
    const midpoint = sceneCursor + durationSeconds / 2;
    const sectionIndex = scriptSections.reduce(
      (match, candidate, candidateIndex) => midpoint >= candidate.startSeconds ? candidateIndex : match,
      0,
    );
    const slot = { index, durationSeconds, startSeconds: sceneCursor, sectionIndex };
    sceneCursor += durationSeconds;
    return slot;
  });
  const sectionSceneCounts = sceneSlots.reduce((counts, slot) => counts.set(slot.sectionIndex, (counts.get(slot.sectionIndex) || 0) + 1), new Map<number, number>());
  const sectionSceneOrdinals = new Map<number, number>();

  const storyboardDraft = sceneSlots.map((slot) => {
    const { index, durationSeconds, startSeconds, sectionIndex } = slot;
    const section = scriptSections[sectionIndex];
    const sequence = sequences[sectionIndex];
    const ordinal = (sectionSceneOrdinals.get(sectionIndex) || 0) + 1;
    sectionSceneOrdinals.set(sectionIndex, ordinal);
    const shotsInSequence = sectionSceneCounts.get(sectionIndex) || 1;
    const phase = ordinal === 1 ? 'setup' : ordinal === shotsInSequence ? 'payoff' : ordinal <= Math.ceil(shotsInSequence / 2) ? 'development' : 'turn';
    const recipe = SHOT_RECIPES[(index * 3 + Math.floor(index / 4)) % SHOT_RECIPES.length];
    const visualThreadId = visualThreadFor(recipe.purpose, index);
    const visualThread = VISUAL_THREADS.find((thread) => thread.id === visualThreadId)!;
    const visualSubject = visualThreadId === 'human'
      ? 'a sourced human action, personal trace, or lived consequence'
      : visualThreadId === 'evidence'
        ? 'one source, artifact, record, or observable detail'
        : visualThreadId === 'system'
          ? 'a spatial relationship, route, process, or institutional mechanism'
          : 'a present-day consequence or visual rhyme';
    const motif = sectionIndex % 3 === 0 ? 'directional-line' : sectionIndex % 3 === 1 ? 'evidence-shape' : 'material-texture';
    const connectiveType = sectionIndex !== (sceneSlots[index - 1]?.sectionIndex ?? sectionIndex)
      ? 'chapter-bridge'
      : index % 3 === 0 ? 'sound-bridge' : index % 3 === 1 ? 'visual-rhyme' : 'motivated-cut';
    const narrativeChange = phase === 'setup'
      ? `Establish what the viewer needs to notice about ${section.purpose}.`
      : phase === 'development'
        ? `Add concrete evidence that complicates the initial reading of ${section.purpose}.`
        : phase === 'turn'
          ? `Reframe the evidence so the stakes of ${section.purpose} become sharper.`
          : `Pay off this sequence and create a motivated handoff to ${scriptSections[sectionIndex + 1]?.name || 'the closing callback'}.`;

    return {
      index,
      sceneNumber: index + 1,
      sequenceId: sequence.id,
      sequencePhase: phase,
      title: `${recipe.type}: ${section.name}`,
      timecode: `${timecode(startSeconds)}–${timecode(startSeconds + durationSeconds)}`,
      durationSeconds,
      chapter: section.name,
      storyFunction: recipe.purpose,
      visualThreadId,
      visualThread: visualThread.name,
      narrationBeat: section.narration,
      narrativeChange,
      sceneDescription: `${narrativeChange} Show ${visualSubject}; the image must advance the argument rather than merely illustrate ${topic}.`,
      shotType: recipe.type,
      cameraDirection: recipe.camera,
      transition: `${recipe.transition}; ${connectiveType} must use a visible or audible element named in both adjacent shots.`,
      audioDirection: index % 5 === 0 ? 'Let production sound lead for one beat before narration.' : index % 3 === 0 ? 'Use a restrained sound bridge into the next scene.' : 'Keep music under dialogue; reserve the accent for the evidence reveal.',
      keyVisualElements: [visualSubject, recipe.purpose, section.purpose, motif],
      continuityContract: {
        preserve: [productionBible.thematicSpine, ...productionBible.visualStyle.palette, visualThread.anchors[0]],
        optional: ['Recurring character presence', 'Prior location', 'Prior screen direction when action is not continuous'],
        change: [narrativeChange, `Shift emphasis toward the ${visualThread.name.toLowerCase()} thread.`],
        connectiveDevice: { type: connectiveType, motif },
      },
      referenceRequirements: {
        styleReference: true,
        previousFrame: connectiveType === 'visual-rhyme' || connectiveType === 'motivated-cut',
        characterReference: visualThreadId === 'human' ? 'only-if-an-established-person-returns' : false,
        locationReference: 'only-if-returning-to-an-established-location',
      },
      callbacks: phase === 'payoff' || sectionIndex === scriptSections.length - 1 ? [motif] : [],
      plants: phase === 'setup' && sectionIndex < scriptSections.length - 1 ? [motif] : [],
      status: 'needs_reference',
    };
  });

  const storyboard = storyboardDraft.map((scene, index) => {
    const previous = storyboardDraft[index - 1];
    const next = storyboardDraft[index + 1];
    const previousShotSummary = previous
      ? `Shot ${previous.sceneNumber} ended the ${previous.visualThread} beat using ${previous.continuityContract.connectiveDevice.motif}.`
      : 'Opening image establishes the film’s first visual question.';
    const nextShotSetup = next
      ? `End with ${scene.continuityContract.connectiveDevice.motif} or its sound equivalent so shot ${next.sceneNumber} can enter the ${next.visualThread} thread.`
      : 'Resolve the opening visual with changed meaning.';
    const continuityIn = previous
      ? `Carry forward the argument and ${previous.continuityContract.connectiveDevice.motif}; preserve a character or location only if this shot remains in that visual thread.`
      : `Establish the ${scene.visualThread} thread and the production palette.`;
    const continuityOut = nextShotSetup;
    const imagePrompt = `${format}, ${tone.toLowerCase()}. Film about ${topic}. ${scene.shotType}. ${scene.sceneDescription} `
      + `THEMATIC LOCK: ${productionBible.thematicSpine} VISUAL LOCK: ${productionBible.visualStyle.palette.join(', ')}; physically plausible light. `
      + `CONTINUITY IN: ${continuityIn} STORY CHANGE: ${scene.narrativeChange} CONTINUITY OUT: ${continuityOut} `
      + `REFERENCE POLICY: ${scene.referenceRequirements.characterReference ? 'Use the locked character reference only if that established person appears; otherwise omit people.' : 'No character continuity required.'} `
      + '16:9, no text, no logos.';
    return {
      ...scene,
      previousShotSummary,
      nextShotSetup,
      continuityIn,
      continuityOut,
      imagePrompt,
      continuity: `${continuityIn} ${continuityOut}`,
    };
  });
  const continuityReport = validateStoryboardContinuity(storyboard);

  const words = keywordsFor(topic);
  const strategy = {
    targetAudience: audience,
    format,
    tone,
    objective,
    contentType: targetDurationMin >= 8 ? 'chaptered long-form video' : 'focused short-form explainer',
    positioning: `${format} about ${topic}, shaped for ${audience}. ${objective}.`,
    productionBible,
    sequences,
    continuityReport,
    centralQuestion: `What do we misunderstand about ${topic}, and what changes when we follow the strongest evidence?`,
    viewerPromise: `By the end, the viewer can explain the central tension in ${topic}, point to the evidence, and understand why it matters.`,
    keywords: Array.from(new Set([...words, 'explained', 'documentary', 'analysis'])).slice(0, 12),
    reviewGates: [
      { stage: 'Research lock', criteria: 'Every central claim has a source and uncertainty is labelled.' },
      { stage: 'Script lock', criteria: `Narration lands near ${targetWords} words, reads naturally aloud, and each chapter changes the viewer’s understanding.` },
      { stage: 'Picture lock', criteria: 'Every shot has a story function; no adjacent scenes repeat composition, movement, or information.' },
      { stage: 'Delivery', criteria: 'Dialogue is intelligible, captions are checked, rights are cleared, and title/thumbnail match the film.' },
    ],
  };

  const seo = {
    titles: [`The ${topic} Story We Keep Getting Wrong`, `${topic}: What the Evidence Actually Shows`, `Why ${topic} Still Changes the Way We See the World`, `Inside ${topic}: The Detail That Reframes Everything`],
    description: `${strategy.viewerPromise}\n\nThis production is built from an evidence-led editorial brief. Sources and corrections should be included in the final description.`,
    tags: Array.from(new Set([...words, 'video essay', 'documentary', 'explained', 'analysis'])).slice(0, 15),
  };

  return {
    topic, audience, targetDurationMin, research, strategy,
    script: {
      status: 'outline',
      hook: scriptSections[0].narration,
      targetWords,
      estimatedReadMinutes: targetDurationMin,
      sections: scriptSections,
      ttsText: scriptSections.map((section) => section.narration).join('\n\n'),
      writingNotes: ['This is a timed editorial outline, not record-ready copy.', 'Replace research placeholders only after source lock.', 'Read aloud at script lock and cut throat-clearing.', 'Use callbacks and escalation; never restate the same claim.'],
    },
    storyboard,
    seo,
    thumbnailConcepts: [
      { title: 'Evidence in plain sight', composition: 'One recognisable object, extreme crop, one visual anomaly', prompt: `Premium editorial thumbnail for ${topic}; one evidence object in extreme close-up, a single surprising anomaly, restrained palette, hard directional light, clean negative space, no text.` },
      { title: 'Two versions of the story', composition: 'Clean split contrast with one shared focal point', prompt: `High-end documentary thumbnail for ${topic}; two contrasting interpretations in a clean split composition, one shared focal point, bold silhouette, no clutter, no text.` },
      { title: 'Human consequence', composition: 'Expressive human-scale subject against a legible environment', prompt: `Cinematic YouTube thumbnail for ${topic}; human consequence foreground, environment tells the stakes, premium colour grade, one focal point, no text.` },
    ],
    productionMetrics: {
      targetWords,
      scenes: sceneCount,
      averageShotSeconds: Number((totalSeconds / sceneCount).toFixed(1)),
      openResearchTasks: selectedAngles.length * 2,
      readiness: 25,
    },
    estimatedCreditsMin: Math.max(200, sceneCount * 14),
  };
}
