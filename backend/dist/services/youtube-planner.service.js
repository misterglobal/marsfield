"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planYoutubeProduction = planYoutubeProduction;
const DEFAULT_ANGLES = [
    'Origins and context',
    'Key people and factions',
    'Conflict or turning point',
    'Daily life and material culture',
    'Trade, technology, and geography',
    'Myths, misconceptions, and debate',
    'Legacy and modern relevance',
    'Unexpected human detail',
];
function clampInt(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.max(min, Math.min(max, Math.round(parsed)));
}
function cleanTopic(topic) {
    return topic.replace(/\s+/g, ' ').trim().slice(0, 180);
}
function slugWords(topic) {
    return cleanTopic(topic)
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 8);
}
function planYoutubeProduction(input) {
    const topic = cleanTopic(input.topic);
    if (topic.length < 3)
        throw new Error('Topic must be at least 3 characters');
    const audience = cleanTopic(input.audience || 'curious history and culture viewers');
    const targetDurationMin = clampInt(input.targetDurationMin, 8, 3, 60);
    const angleCount = clampInt(input.angleCount, 8, 4, 12);
    const keywords = slugWords(topic);
    const sceneCount = clampInt(Math.round(targetDurationMin * 2.2), 12, 8, 24);
    const totalSeconds = targetDurationMin * 60;
    const research = {
        topic,
        disclaimer: 'Dry-run research scaffold. Verify facts before publishing.',
        angles: DEFAULT_ANGLES.slice(0, angleCount).map((angle, index) => ({
            angle,
            questions: [
                `What does ${topic} reveal through ${angle.toLowerCase()}?`,
                `Which concrete dates, places, artifacts, or people make this angle credible?`,
                `What surprising detail would keep a viewer watching?`,
            ],
            factPrompts: Array.from({ length: 5 }, (_, factIndex) => ({
                id: `${index + 1}.${factIndex + 1}`,
                prompt: `Find a verifiable fact about ${topic} connected to ${angle.toLowerCase()}.`,
            })),
        })),
    };
    const strategy = {
        targetAudience: audience,
        contentType: targetDurationMin >= 8 ? 'long-form documentary explainer' : 'short educational explainer',
        positioning: `A cinematic, fact-grounded explanation of ${topic} for ${audience}.`,
        keywords: Array.from(new Set([...keywords, 'history', 'explained', 'documentary', 'ancient world'].filter(Boolean))).slice(0, 12),
        estimatedViews: targetDurationMin >= 8 ? '1k-25k early-channel potential with strong thumbnail/title fit' : '500-10k short-form discovery potential',
        bestPublishTime: 'Tuesday or Thursday, 10:00 AM audience-local time',
        competitorAngles: [
            'Broad encyclopedia-style overview',
            'Mystery or lost-civilization framing',
            'Battle/trade-map visual explainer',
        ],
    };
    const scriptSections = [
        {
            name: 'Cold open',
            purpose: 'Immediate curiosity and open loop',
            narration: `There is a version of ${topic} that most people never hear — the human story hiding behind the usual summary.`,
        },
        {
            name: 'Introduction',
            purpose: 'Topic promise and credibility',
            narration: `In this video, we will trace ${topic} through evidence, power, conflict, daily life, and the legacy still visible today.`,
        },
        ...research.angles.slice(0, Math.min(6, angleCount)).map((angle, index) => ({
            name: `Main section ${index + 1}: ${angle.angle}`,
            purpose: angle.angle,
            narration: `To understand ${topic}, we need to look at ${angle.angle.toLowerCase()} — not as trivia, but as a clue to how people actually lived and made choices.`,
        })),
        {
            name: 'Conclusion',
            purpose: 'Recap and meaning',
            narration: `${topic} matters because it turns a distant subject into a chain of real decisions, risks, ambitions, and consequences.`,
        },
        {
            name: 'Call to action',
            purpose: 'Comment prompt and next video',
            narration: `If you want a deeper episode on one part of ${topic}, tell me which angle you would follow next.`,
        },
    ];
    const secondsPerScene = Math.max(10, Math.round(totalSeconds / sceneCount));
    const storyboard = Array.from({ length: sceneCount }, (_, index) => {
        const section = scriptSections[Math.min(scriptSections.length - 1, Math.floor(index / Math.max(1, sceneCount / scriptSections.length)))];
        return {
            index,
            title: `Scene ${index + 1}: ${section.name}`,
            durationSeconds: index === sceneCount - 1 ? totalSeconds - secondsPerScene * (sceneCount - 1) : secondsPerScene,
            sceneDescription: `Cinematic visual for ${topic}: ${section.purpose}.`,
            cameraDirection: index % 3 === 0 ? 'Slow push-in with subtle parallax' : index % 3 === 1 ? 'Lateral pan across layered historical detail' : 'Close-up detail reveal, then widen',
            visualMood: 'Ethereal cinematic documentary, textured light, dramatic depth',
            keyVisualElements: [topic, section.purpose, 'maps, artifacts, faces, architecture, atmosphere'].filter(Boolean),
            imagePrompt: `Ethereal cinematic documentary frame about ${topic}, ${section.purpose}, historical texture, dramatic light, no text, 16:9.`,
        };
    });
    const seo = {
        titles: [
            `The Hidden Story of ${topic}`,
            `${topic} Explained: The History Most People Miss`,
            `Why ${topic} Still Matters`,
            `The Rise, Mystery, and Legacy of ${topic}`,
        ],
        description: `A cinematic, fact-grounded documentary explainer about ${topic}. We explore the origins, turning points, daily life, misconceptions, and legacy of the subject.\n\nComment which angle you want explored next.`,
        tags: Array.from(new Set([...keywords, 'history explained', 'documentary', 'ancient history', 'education'])).slice(0, 15),
    };
    const thumbnailConcepts = [
        {
            title: 'The hidden story',
            prompt: `High-contrast cinematic YouTube thumbnail for ${topic}, mysterious historical atmosphere, one bold subject, dramatic rim light, no small text.`,
        },
        {
            title: 'Before it vanished',
            prompt: `Ethereal ancient-world thumbnail for ${topic}, glowing map fragments, monumental architecture, emotional human silhouette.`,
        },
        {
            title: 'What they never told you',
            prompt: `Documentary thumbnail for ${topic}, expressive face or artifact foreground, deep shadow, gold light, strong negative space for title text.`,
        },
    ];
    return {
        topic,
        audience,
        targetDurationMin,
        research,
        strategy,
        script: {
            hook: scriptSections[0].narration,
            sections: scriptSections,
            ttsText: scriptSections.map((section) => section.narration).join('\n\n'),
            writingNotes: ['Cold open first', 'Open loops between sections', 'Write for the ear', 'Verify factual claims before generation'],
        },
        storyboard,
        seo,
        thumbnailConcepts,
        estimatedCreditsMin: Math.max(200, sceneCount * 14),
    };
}
