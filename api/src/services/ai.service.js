import { OpenRouter } from '@openrouter/sdk';
import dotenv from 'dotenv';
dotenv.config();
import { saveImageLocally } from './storage.service.js';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const openRouter = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
});

// Helper to clean up AI JSON response
const cleanJson = (text) => {
    // 1. Remove think blocks
    const withoutThink = text.replace(/<think>[\s\S]*?<\/think>/g, '');

    // 2. Try to extract the first valid JSON block ({...} or [...])
    const jsonMatch = withoutThink.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
        return jsonMatch[0].trim();
    }

    // Fallback: standard cleanup
    return withoutThink.replace(/```json|```/g, '').trim();
};


export const generateVehicleContent = async (vehicle, instructions, sentiment = 'professional', contactNumber = null) => {
    try {
        if (!process.env.OPENROUTER_API_KEY) {
            console.error('[AI Service] OPENROUTER_API_KEY is missing from environment variables!');
            throw new Error('OPENROUTER_API_KEY is not set');
        }

        const prompt = `
      Act as a professional vehicle salesperson.
      You are an expert car salesman copywriting assistant. 
      I need you to write a catchy title and a detailed, selling description for a vehicle listing on Facebook Marketplace.
      REQUIRED: The description MUST include 3-4 relevant emojis to make it engaging.
      Write a compelling Facebook Marketplace listing for the following vehicle:
      Year: ${vehicle.year || ''}
      Make: ${vehicle.make || ''}
      Model: ${vehicle.model || ''}
      Trim: ${vehicle.trim || ''}
      Price: ${vehicle.price || ''}
      Mileage: ${vehicle.mileage || ''}
      Location: ${vehicle.location || ''}
      ${contactNumber ? `Contact Number: ${contactNumber}` : ''}
      
      User Instructions: ${instructions || 'No specific instructions.'}
      Sentiment: ${sentiment}

      ${contactNumber ? 'IMPORTANT: You MUST include the Contact Number in the description so potential buyers can reach the seller.' : ''}

      Please provide:
      Title: (A catchy title under 100 characters)
      Description: (A detailed, engaging description under 60 words. REQUIRED: You MUST include 3-4 relevant emojis in the description body)
      
      Output in JSON format: { "title": "...", "description": "..." }
    `;

        const completion = await openRouter.chat.send({
            model: 'google/gemini-2.0-flash-001',
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            stream: false,
        });

        const text = completion.choices[0].message.content;

        // Clean up response if it's wrapped in triple backticks and potential think blocks
        const jsonString = cleanJson(text);
        return JSON.parse(jsonString);
    } catch (error) {
        console.error('AI Generation Error:', error);
        return {
            title: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
            description: `Check out this ${vehicle.year} ${vehicle.make} ${vehicle.model}. Contact for more details.`
        };
    }
};

// Image generation via FlashFender Generate API (https://generate.flashfender.com)
import ImagePrompts from '../models/ImagePrompts.js';
import { prepareImage } from './image-processor.service.js';

const FLASHFENDER_GENERATE_URL = 'https://generate.flashfender.com/api/v1/generate';
// Exterior: Flux add-background. Interior: Flux 2 edit (image-to-image).
const FLUX_MODEL = 'fal-ai/flux-2-lora-gallery/add-background';
const INTERIOR_MODEL = 'fal-ai/flux-2/edit';
// Regenerate: use same Flux 2 edit as interior (flux-2-pro/edit may not be supported by FlashFender).
const REGENERATE_MODEL = 'fal-ai/flux-2/edit';
const OPENROUTER_VISION_MODEL = 'google/gemini-2.0-flash-001';

/**
 * OpenRouter vision (cheapest model): analyze image and refine prompt.
 * - Exterior: keep prompt but remove any car-modification wording (paint, wheels, body, etc.).
 * - Interior: refine to enhance only the view outside the windows; do not modify interior.
 */
const analyzeImageAndRefinePrompt = async (imageUrl, userPrompt) => {
    if (!process.env.OPENROUTER_API_KEY) return null;
    try {
        const systemPrompt = `You are an image analyst for car photos. Look at the image and respond with JSON only, no other text.
Rules:
1. Decide if the image shows a car's EXTERIOR (outside: body, wheels, full car in a setting) or INTERIOR (inside: dashboard, seats, steering wheel, view from inside).
2. If EXTERIOR: set "scene" to "exterior". For "refinedPrompt": take the user's prompt and remove any phrases that ask to modify the car itself (e.g. change color, paint, wheels, rims, body, modify car). Keep only background/environment/floor/setting changes. If the user prompt is only about background, keep it as-is.
3. If INTERIOR: set "scene" to "interior". For "refinedPrompt": write a single clear instruction to enhance or replace ONLY what is visible through the car windows (the outside scenery). Do not mention modifying the interior. Example: "Add Background Beautiful scenic view visible through the car windows - mountains and sky. Do not modify the interior; only change the view through the windows according to user needs and keep background style as is asked by user."
4. The refinedPrompt must ask for minimal, subtle edits only: the car or interior should look natural and proper. Do not request harsh weather, extreme effects, or dramatic changes—keep lighting, weather, and scenery mild and realistic so the result looks believable.
Output exactly: {"scene":"exterior"|"interior","refinedPrompt":"..."}`;

        const completion = await openRouter.chat.send({
            model: OPENROUTER_VISION_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: `User prompt: "${userPrompt}". Analyze this image and respond with the JSON only.` },
                        { type: 'image_url', imageUrl: { url: imageUrl } },
                    ],
                },
            ],
            stream: false,
        });

        const text = completion?.choices?.[0]?.message?.content?.trim() || '';
        const jsonStr = cleanJson(text);
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed.scene === 'string' && typeof parsed.refinedPrompt === 'string') {
            const scene = parsed.scene.toLowerCase().includes('interior') ? 'interior' : 'exterior';
            return { scene, refinedPrompt: parsed.refinedPrompt.trim() };
        }
        return null;
    } catch (err) {
        console.warn('[AI Service] OpenRouter vision analysis failed, using original prompt:', err?.message);
        return null;
    }
};

export const processImageWithAI = async (imageUrl, prompt = 'Remove background', promptId) => {
    try {
        console.log(`[AI Service] Processing image request. Prompt: "${prompt}"`);

        if (!process.env.FLASH_FENDER_IMG_KEY) {
            throw new Error('FLASH_FENDER_IMG_KEY is missing in .env file');
        }

        const imagePrompt = await ImagePrompts.findById(promptId);
        let visualDescription = imagePrompt?.prompt || prompt;
        const intent = 'MODIFY_BACKGROUND';

        // OpenRouter: analyze image and refine prompt (exterior: strip car mods; interior: enhance outside windows only)
        const analysis = await analyzeImageAndRefinePrompt(imageUrl, visualDescription);
        if (analysis) {
            visualDescription = analysis.refinedPrompt;
            console.log(`[AI Service] OpenRouter analysis: scene=${analysis.scene}, refinedPrompt: "${visualDescription.substring(0, 80)}..."`);
        }

        console.log(`[AI Service] Processing Background Change | Prompt: "${visualDescription}"`);
        console.log(`[AI Service] Passing image URL directly: ${imageUrl}`);
        
        const isInterior = analysis?.scene === 'interior';
        const loraPrompt = visualDescription;



        // Interior: fal flux-2/edit. Exterior: fal flux add-background.
        const model = isInterior ? INTERIOR_MODEL : FLUX_MODEL;
        const payload = {
            prompt: visualDescription,
            image_url: imageUrl,
            model,
            width: 800,
            height: 600,
            steps: 30,
            cfg_scale: 7,
        };
        console.log(`[AI Service] Using ${isInterior ? 'fal Flux 2 edit (interior)' : 'fal Flux add-background (exterior)'}: ${model}`);
        const generateResponse = await axios.post(
            FLASHFENDER_GENERATE_URL,
            payload,
            {
                timeout: 120000,
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env.FLASH_FENDER_IMG_KEY,
                },
            }
        );

        const data = generateResponse.data;
        const resultImageUrl = data?.image_url;

        if (!resultImageUrl) {
            throw new Error(data?.error?.message || 'No image URL in FlashFender generate response');
        }

        console.log(`[AI Service] FlashFender Generate Success: ${resultImageUrl}`);

        // 3. Apply stealth pipeline to result
        console.log('[AI Service] Applying Stealth Protocol to AI result...');
        const stealthResult = await prepareImage(resultImageUrl, {});

        if (!stealthResult.success) {
            throw new Error(`Stealth processing failed: ${stealthResult.error}`);
        }

        const processedUrl = `https://api.flashfender.com${stealthResult.relativePath}`;

        return {
            success: true,
            originalUrl: imageUrl,
            processedUrl,
            provider: 'flashfender-generate',
            wasGenerated: true,
            metadata: {
                intent,
                prompt: loraPrompt,
                originalDescription: visualDescription.substring(0, 50) + '...',
                ...(data.fal_usage && { fal_usage: data.fal_usage }),
            },
        };
    } catch (error) {
        console.error('[AI Service] FlashFender Generate Error:', error?.response?.data || error);
        const msg = error?.response?.data?.error?.message || error.message;
        throw new Error(`Failed to process image: ${msg}`);
    }
};

/**
 * Regenerate an AI image from its original (or current) image using fal-ai/flux-2-pro/edit.
 * Used when user clicks "Regenerate" on an existing AI-generated image.
 * @param {string} originalImageUrl - Original source image URL (from imageMappings or the current AI image if no mapping).
 * @param {string} prompt - Edit prompt for regeneration.
 * @param {string} [promptId] - Optional ImagePrompts id for prompt lookup.
 * @returns {Promise<{ success, originalUrl, processedUrl, provider, wasGenerated, metadata }>}
 */
export const regenerateImageWithAI = async (originalImageUrl, prompt = 'Enhance image', promptId) => {
    try {
        console.log(`[AI Service] Regenerating image with prompt: "${prompt}"`);

        if (!process.env.FLASH_FENDER_IMG_KEY) {
            throw new Error('FLASH_FENDER_IMG_KEY is missing in .env file');
        }

        let visualDescription = prompt;
        if (promptId) {
            const imagePrompt = await ImagePrompts.findById(promptId);
            if (imagePrompt?.prompt) visualDescription = imagePrompt.prompt;
        }

        const payload = {
            prompt: visualDescription,
            image_url: originalImageUrl,
            model: REGENERATE_MODEL,
            width: 800,
            height: 600,
            steps: 30,
            cfg_scale: 7,
        };
        console.log(`[AI Service] Regenerate using ${REGENERATE_MODEL}`);
        let generateResponse;
        try {
            generateResponse = await axios.post(
                FLASHFENDER_GENERATE_URL,
                payload,
                {
                    timeout: 120000,
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': process.env.FLASH_FENDER_IMG_KEY,
                    },
                }
            );
        } catch (axiosErr) {
            const status = axiosErr?.response?.status;
            const body = axiosErr?.response?.data;
            console.error('[AI Service] Regenerate FlashFender request failed:', { status, body });
            const msg = body?.error?.message || body?.message || axiosErr.message;
            throw new Error(`Failed to regenerate image: ${msg}`);
        }

        const data = generateResponse.data;
        const resultImageUrl = data?.image_url;
        if (!resultImageUrl) {
            const errMsg = data?.error?.message || data?.error || 'No image URL in FlashFender generate response';
            console.error('[AI Service] Regenerate FlashFender response missing image_url:', JSON.stringify(data));
            throw new Error(errMsg);
        }

        console.log('[AI Service] Regenerate success, applying stealth...');
        const stealthResult = await prepareImage(resultImageUrl, {});
        if (!stealthResult.success) {
            throw new Error(`Stealth processing failed: ${stealthResult.error}`);
        }
        const processedUrl = `https://api.flashfender.com${stealthResult.relativePath}`;

        return {
            success: true,
            originalUrl: originalImageUrl,
            processedUrl,
            provider: 'flashfender-generate',
            wasGenerated: true,
            metadata: {
                intent: 'REGENERATE',
                prompt: visualDescription,
                ...(data.fal_usage && { fal_usage: data.fal_usage }),
            },
        };
    } catch (error) {
        const body = error?.response?.data;
        console.error('[AI Service] Regenerate Error:', {
            status: error?.response?.status,
            data: body,
            message: error.message
        });
        const msg = body?.error?.message || body?.message || error.message;
        throw new Error(`Failed to regenerate image: ${msg}`);
    }
};
