"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteGeneration = quoteGeneration;
const MAX_VARIATIONS_PER_REQUEST = 4;
function parseVariationCount(params) {
    const requested = params?.variations ?? params?.variation_count ?? 1;
    if (requested === undefined || requested === null || requested === '') {
        return 1;
    }
    if (typeof requested !== 'number' || !Number.isInteger(requested) || requested < 1 || requested > MAX_VARIATIONS_PER_REQUEST) {
        throw new Error(`Variations must be an integer from 1 to ${MAX_VARIATIONS_PER_REQUEST}`);
    }
    return requested;
}
function getBaseCredits(input) {
    if (input.workflow === 'text-to-image')
        return 1;
    if (input.model === 'bytedance/seedance-2.0-mini')
        return 2;
    if (input.model === 'bytedance/seedance-2.0-fast')
        return 3;
    if (input.model === 'bytedance/seedance-2.0')
        return 4;
    if (input.model === 'kwaivgi/kling-v3-omni-video')
        return 5;
    if (input.workflow.includes('video') || input.workflow === 'lip-sync')
        return 3;
    return 1;
}
function quoteGeneration(input) {
    const baseCredits = getBaseCredits(input);
    const variationCount = parseVariationCount(input.params);
    const variationCredits = Math.max(0, variationCount - 1) * Math.ceil(baseCredits * 0.75);
    return {
        baseCredits,
        variationCount,
        variationCredits,
        totalCredits: baseCredits + variationCredits,
    };
}
