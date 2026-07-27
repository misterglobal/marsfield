"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planYoutubeProduction = planYoutubeProduction;
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
function clampInt(value, fallback, min, max) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}
function clean(value, fallback = '', max = 180) {
    return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max);
}
function keywordsFor(topic) {
    return topic.toLowerCase().replace(/[^\w\s-]/g, '').split(/\s+/).filter(Boolean).slice(0, 8);
}
function timecode(seconds) {
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function planYoutubeProduction(input) {
    const topic = clean(input.topic);
    if (topic.length < 3)
        throw new Error('Topic must be at least 3 characters');
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
    const sceneCount = clampInt(Math.round(totalSeconds / 24), 16, 10, 36);
    const baseDuration = Math.floor(totalSeconds / sceneCount);
    const remainder = totalSeconds % sceneCount;
    let sceneCursor = 0;
    const storyboard = Array.from({ length: sceneCount }, (_, index) => {
        const durationSeconds = baseDuration + (index < remainder ? 1 : 0);
        const midpoint = sceneCursor + durationSeconds / 2;
        const section = scriptSections.reduce((match, candidate) => midpoint >= candidate.startSeconds ? candidate : match, scriptSections[0]);
        const recipe = SHOT_RECIPES[(index * 3 + Math.floor(index / 4)) % SHOT_RECIPES.length];
        const visualSubject = index % 4 === 0 ? 'one source or artifact' : index % 4 === 1 ? 'a human action' : index % 4 === 2 ? 'a spatial or process detail' : 'a consequence visible in the environment';
        const scene = {
            index,
            sceneNumber: index + 1,
            title: `${recipe.type}: ${section.name}`,
            timecode: `${timecode(sceneCursor)}–${timecode(sceneCursor + durationSeconds)}`,
            durationSeconds,
            chapter: section.name,
            storyFunction: recipe.purpose,
            narrationBeat: section.narration,
            sceneDescription: `Show ${visualSubject} that advances “${section.purpose}”. The frame must add evidence, emotion, or orientation—not merely illustrate the topic.`,
            shotType: recipe.type,
            cameraDirection: recipe.camera,
            transition: recipe.transition,
            audioDirection: index % 5 === 0 ? 'Let production sound lead for one beat before narration.' : index % 3 === 0 ? 'Use a restrained sound bridge into the next scene.' : 'Keep music under dialogue; reserve the accent for the evidence reveal.',
            keyVisualElements: [visualSubject, recipe.purpose, section.purpose],
            imagePrompt: `${format}, ${tone.toLowerCase()}. ${recipe.type} for a film about ${topic}; ${visualSubject}; ${section.purpose}; coherent colour pipeline, physically plausible light, period and geographic accuracy, 16:9, no text, no logos.`,
            continuity: 'Maintain established palette, geography, wardrobe logic, light direction, and screen direction. Introduce only one new visual idea.',
            status: 'needs_reference',
        };
        sceneCursor += durationSeconds;
        return scene;
    });
    const words = keywordsFor(topic);
    const strategy = {
        targetAudience: audience,
        format,
        tone,
        objective,
        contentType: targetDurationMin >= 8 ? 'chaptered long-form video' : 'focused short-form explainer',
        positioning: `${format} about ${topic}, shaped for ${audience}. ${objective}.`,
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
