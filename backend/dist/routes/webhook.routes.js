"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// POST /api/v1/webhooks/replicate
router.post('/replicate', async (req, res) => {
    try {
        const { id, status, output, error } = req.body;
        if (!id || !status) {
            res.status(400).json({ error: 'Missing replicate event properties' });
            return;
        }
        const prediction = await prisma.prediction.findFirst({
            where: { replicatePredictionId: id },
        });
        if (!prediction) {
            res.status(404).json({ error: 'Associated prediction not found in database' });
            return;
        }
        const finalStatus = status === 'succeeded' ? 'succeeded' : status === 'failed' ? 'failed' : 'processing';
        const outputUrl = Array.isArray(output) ? output[0] : output;
        await prisma.$transaction(async (tx) => {
            await tx.prediction.update({
                where: { id: prediction.id },
                data: {
                    status: finalStatus,
                    outputUrl: outputUrl || null,
                    errorMessage: error || null,
                    completedAt: finalStatus === 'succeeded' || finalStatus === 'failed' ? new Date() : null,
                },
            });
            if (finalStatus === 'succeeded' && outputUrl && prediction.userId) {
                const existingAsset = await tx.asset.findFirst({
                    where: { predictionId: prediction.id },
                    select: { id: true },
                });
                if (!existingAsset) {
                    await tx.asset.create({
                        data: {
                            userId: prediction.userId,
                            predictionId: prediction.id,
                            url: outputUrl,
                            type: prediction.workflow === 'text-to-image' ? 'image' : 'video',
                        },
                    });
                }
            }
        });
        console.log(`Webhook Event processed for prediction ${prediction.id}. Status: ${finalStatus}`);
        res.status(200).send('OK');
    }
    catch (error) {
        console.error('Webhook routing error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});
exports.default = router;
