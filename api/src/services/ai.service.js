import { OpenRouter } from '@openrouter/sdk';
import dotenv from 'dotenv';
dotenv.config();
import { saveImageLocally } from './storage.service.js';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

// FORCE HARDCODE KEY (User Request due to env issues)
process.env.FAL_KEY = '1e80787c-9a39-4f09-9eac-d89f349f5a1e:9f8d078dce42d7c391b0891bb3bf011a';

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
            model: 'deepseek/deepseek-r1',
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

// Fal.ai Integration for Image Generation
import falPkg from "@fal-ai/client";
const { fal } = falPkg;
const { subscribe, storage } = fal;
import { removeBackground } from '@imgly/background-removal-node';
import sharp from 'sharp';
import ImagePrompts from '../models/ImagePrompts.js';
import { prepareImage } from './image-processor.service.js';

// Helper to upload buffer to Fal
const uploadToFal = async (buffer, type = 'image/png') => {
    const blob = new Blob([buffer], { type });
    const url = await storage.upload(blob);
    return url;
};

export const processImageWithAI = async (imageUrl, prompt = 'Remove background', promptId) => {
    try {
        console.log(`[AI Service] Processing image request. Prompt: "${prompt}"`);

        // 1. Fetch the original image
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data);

        // CHECK: Ensure Fal Key is available
        if (!process.env.FAL_KEY) {
            throw new Error('FAL_KEY is missing in .env file');
        }
        const imagePrompt = await ImagePrompts.findById(promptId);

        // 2. Setup Prompt and Intent
        // Strictly enforcing Background Change mode as per configuration.
        const visualDescription = imagePrompt?.prompt || prompt;
        const intent = 'MODIFY_BACKGROUND';

        console.log(`[AI Service] Processing Background Change | Prompt: "${visualDescription}"`);

        // 3. Prepare Image for Flux 2 LoRA (Requires Clean White Background)
        console.log('[AI Service] Preparing clean white background image...');

        // Convert to PNG for processing
        const pngBuffer = await sharp(imageBuffer).png().toBuffer();
        const blob = new Blob([pngBuffer], { type: 'image/png' });

        // Remove background to isolate the vehicle
        console.log("[AI Service] Removing original background...");
        const bgRemovedBlob = await removeBackground(blob);
        const bgRemovedBuffer = Buffer.from(await bgRemovedBlob.arrayBuffer());

        // Composite isolated vehicle onto white background
        const cleanImageBuffer = await sharp(bgRemovedBuffer)
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            .toBuffer();

        console.log("[AI Service] Composited vehicle on white background.");

        // Upload prepared image to Fal
        const cleanImageUrl = await uploadToFal(cleanImageBuffer);
        console.log(`[AI Service] Prepared Image URL: ${cleanImageUrl}`);

        // Ensure prompt has the required prefix
        let loraPrompt = visualDescription.startsWith('Add Background')
            ? visualDescription
            : `Add Background ${visualDescription}`;

        // Add detailed instructions to preserve the vehicle
        loraPrompt = `${loraPrompt} keep in mind you dont have to do anything with the vehicle either exteriar 
                    or interior of vehicle but I want you to only change its background i.e vehicle will 
                    remain as it is but background or surrounding needs to be changed accordingly 
                    if the image contains interiar of car so dont change anything in vehicle or of vehicle instead
                    edit just the part of image from where surrounding of vehicle can be seen generally that is possible through
                    mirror when picture is from interior of vehicle but if image contains full exteriar of image i.e image of vehicle 
                    is taken from outside so just have to change background of vehicle dont have to even touch the 
                    vehicle`;

        // 4. CALL FAL.AI (Flux 2 LoRA)
        // Docs: https://fal.ai/models/fal-ai/flux-2-lora-gallery/add-background/api
        // No mask support. Input must be subject on white/clean background.
        const falResult = await subscribe('fal-ai/flux-2-lora-gallery/add-background', {
            input: {
                prompt: loraPrompt,
                image_urls: [cleanImageUrl], // Array of strings
                enable_safety_checker: false,
                image_size: "landscape_4_3",
                lora_scale: 1.0 // Strength of the effect
            },
            logs: true,
            onQueueUpdate: (update) => {
                if (update.status === 'IN_PROGRESS') {
                    update.logs.map((log) => log.message).forEach(msg => console.log(`[Fal] ${msg}`));
                }
            },
        });

        if (falResult.data && falResult.data.images && falResult.data.images.length > 0) {
            const resultUrl = falResult.data.images[0].url;
            console.log(`[AI Service] Fal Generation Success: ${resultUrl}`);

            // 5. Apply STEALTH Pipeline to Result (Safeguard)
            // This ensures AI generated images also have geometric perturbation + fake metadata
            console.log(`[AI Service] Applying Stealth Protocol to AI result...`);

            const stealthResult = await prepareImage(resultUrl, {
                // Use default random camera/metadata
            });

            if (!stealthResult.success) {
                throw new Error(`Stealth processing failed: ${stealthResult.error}`);
            }

            // Construct full URL (Internal localhost for now, routes will handle full URL mapping)
            // But we need to return something the frontend can use or the backend saves.
            // savedPath was relative. stealthResult.relativePath is `/uploads/prepared/...`
            const processedUrl = `https://api.flashfender.com${stealthResult.relativePath}`;

            return {
                success: true,
                originalUrl: imageUrl,
                processedUrl: processedUrl,
                provider: 'fal-ai-flux-2-lora',
                wasGenerated: true,
                metadata: {
                    intent: intent,
                    prompt: loraPrompt,
                    originalDescription: visualDescription.substring(0, 50) + '...'
                }
            };
        }

        throw new Error('No images returned from Fal.ai');

    } catch (error) {
        console.error('[AI Service] Fal Processing Error:', error);
        throw new Error(`Failed to process image with Fal: ${error.message}`);
    }
};
