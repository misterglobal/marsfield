"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplicateService = void 0;
const replicate_1 = __importDefault(require("replicate"));
class ReplicateService {
    replicate = null;
    constructor() {
        const token = process.env.REPLICATE_API_TOKEN;
        if (token) {
            this.replicate = new replicate_1.default({ auth: token });
        }
        else {
            console.warn("REPLICATE_API_TOKEN is not defined. Falling back to Mock predictions generator.");
        }
    }
    async createPrediction(model, input, webhookUrl) {
        // If Replicate token exists, use real API
        if (this.replicate) {
            try {
                const payload = model.includes(':') ? { version: model.split(':', 2)[1], input } : { model, input };
                if (webhookUrl) {
                    payload.webhook = webhookUrl;
                    payload.webhook_events_filter = ['completed'];
                }
                const prediction = await this.replicate.predictions.create(payload);
                return {
                    id: prediction.id,
                    status: prediction.status,
                    outputUrl: this.getOutputUrl(prediction.output),
                    outputUrls: this.getOutputUrls(prediction.output),
                };
            }
            catch (error) {
                console.error("Replicate API Error:", this.formatReplicateError(error));
                throw error;
            }
        }
        // Mock response fallback for offline testing
        const mockId = `mock_pred_${Math.random().toString(36).substring(7)}`;
        return {
            id: mockId,
            status: 'succeeded',
            outputUrl: model.includes('flux') || model.includes('diffusion') || model.includes('banana') || model.includes('recraft')
                ? 'https://picsum.photos/800/600' // Mock Image
                : 'https://www.w3schools.com/html/mov_bbb.mp4', // Mock Video
        };
    }
    async getPrediction(id) {
        if (this.replicate && !id.startsWith('mock_')) {
            try {
                const prediction = await this.replicate.predictions.get(id);
                return {
                    id: prediction.id,
                    status: prediction.status,
                    outputUrl: this.getOutputUrl(prediction.output),
                    outputUrls: this.getOutputUrls(prediction.output),
                    error: prediction.error,
                };
            }
            catch (error) {
                console.error("Replicate status retrieve error:", this.formatReplicateError(error));
                throw error;
            }
        }
        return {
            id,
            status: 'succeeded',
            outputUrl: id.includes('image')
                ? 'https://picsum.photos/800/600'
                : 'https://www.w3schools.com/html/mov_bbb.mp4',
        };
    }
    getOutputUrl(output) {
        const value = Array.isArray(output) ? output[0] : output;
        if (typeof value === 'string')
            return value;
        if (value && typeof value === 'object') {
            const candidate = value;
            return candidate.url || candidate.uri;
        }
        return undefined;
    }
    getOutputUrls(output) {
        const values = Array.isArray(output) ? output : [output];
        return values.map((value) => {
            if (typeof value === 'string')
                return value;
            if (value && typeof value === 'object') {
                const candidate = value;
                return candidate.url || candidate.uri || '';
            }
            return '';
        }).filter(Boolean);
    }
    formatReplicateError(error) {
        if (!error || typeof error !== 'object') {
            return { message: String(error) };
        }
        const value = error;
        return {
            name: value.name,
            message: value.message,
            status: value.response?.status,
            statusText: value.response?.statusText,
            url: value.response?.url,
        };
    }
}
exports.ReplicateService = ReplicateService;
