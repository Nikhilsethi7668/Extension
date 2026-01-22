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


export const generateVehicleContent = async (vehicle, instructions, sentiment = 'professional') => {
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
      
      User Instructions: ${instructions || 'No specific instructions.'}
      Sentiment: ${sentiment}

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
        
        // 2. INTENT CLASSIFICATION WITH OPENROUTER (Multimodal)
        let visualDescription = "";
        let intent = "SMART_EDIT"; // Default to smart edit (background only)

        try {
            console.log('[AI Service] Analyzing Intent & Enhancing Prompt with OpenRouter (Text Only)...');
            
            const analysisPrompt = `
                You are an expert AI implementation assistant for an automotive image editing pipeline.
                
                The user wants to edit a vehicle image using an AI inpainting model (Flux/Fal.ai).
                User's Request: "${imagePrompt?.prompt || prompt}"

                YOUR GOAL: 
                1. Analyze the user's intent.
                2. WRITE A HIGHLY OPTIMIZED PROMPT for the image generator that fulfills the user's request while STRICTLY PRESERVING the vehicle's authenticity.

                **CRITICAL RULES:**
                - The subject vehicle MUST NOT be distorted, hallucinated, or modified in geometry/body shape.
                - If the user asks for a background change, the car must look EXACTLY the same.
                - If the user asks for a color change, ONLY the paint should change.

                **INTENT CLASSIFICATION:**
                - "MODIFY_BACKGROUND": If the user wants to change the setting, location, weather, or background (e.g. "at the beach", "showroom", "remove background").
                - "MODIFY_VEHICLE": If the user EXPLICITLY asks to change the car itself (e.g. "make it red", "add a spoiler", "black rims").

                **OUTPUT JSON ONLY:**
                {
                    "intent": "MODIFY_BACKGROUND" | "MODIFY_VEHICLE",
                    "enhancedPrompt": "A detailed, photorealistic description of the scene..." (Include technical keywords like '8k', 'raw photo', 'masterpiece')
                }
            `;

            const completion = await openRouter.chat.send({
                model: 'deepseek/deepseek-r1', 
                messages: [
                    {
                        role: 'user',
                        content: analysisPrompt
                    },
                ],
                stream: false,
            });

            const textResponse = completion.choices[0].message.content;
            const jsonStr = cleanJson(textResponse);
            const result = JSON.parse(jsonStr);

            // Use the AI's enhanced prompt instead of constructing one manually with a generic visual description
            visualDescription = result.enhancedPrompt; 
            intent = result.intent === 'MODIFY_VEHICLE' ? 'GENERATE_NEW' : 'SMART_EDIT';
            console.log(`[AI Service] Intent: ${intent} | Enhanced Prompt: "${visualDescription.substring(0, 50)}..."`);
        } catch (err) {
            console.warn('[AI Service] Intent analysis failed, defaulting to SMART_EDIT. Error:', err.message);
        }


        // 3. PREPARE FOR FLUX (Mask Generation)
        console.log('[AI Service] Preparing masks for Flux Inpainting...');

        // Convert to PNG Buffer for sharp/imgly
        const pngBuffer = await sharp(imageBuffer).png().toBuffer();
        const blob = new Blob([pngBuffer], { type: 'image/png' });
        console.log("Sharp processed");
        // Remove Background to get the subject (Car)
        const bgRemovedBlob = await removeBackground(blob);
        const bgRemovedBuffer = Buffer.from(await bgRemovedBlob.arrayBuffer());
        console.log("Background removed");

        // Upload Original Image to Fal
        const originalImageUrl = await uploadToFal(imageBuffer);

        let maskBuffer;

        if (intent === 'SMART_EDIT') {
            // INTENT: Change Background, Keep Car.
            // MASK: White = Modify (Background), Black = Protect (Car).
            // bgRemovedBuffer Alpha: Car=255 (White), BG=0 (Black).

            // DILATION STEP: Expand the Car Mask (White) slightly to ensure edges are protected.
            // If we don't dilate, the boundary might be modified. 
            // Logic: Blur -> Threshold (Low) = Expands White Area.

            console.log('[AI Service] Creating Inverted Mask (Dilated to Protect Car entirely)...');
            maskBuffer = await sharp(bgRemovedBuffer)
                .ensureAlpha()
                .extractChannel(3) // Get Alpha (Car=White)
                .blur(5)           // Blur edges (White bleeds into Black)
                .threshold(10)     // Threshold low to capture blur (Expands Car)
                .negate()          // Invert (Car=0/Black, BG=255/White)
                .toBuffer();
        } else {
            // INTENT: Change Car, Keep Background.
            // ... (Logic stays same or similar)
            console.log('[AI Service] Creating Standard Mask (Edit Car, Protect BG)...');
            maskBuffer = await sharp(bgRemovedBuffer)
                .ensureAlpha()
                .extractChannel(3) // Get Alpha
                .toBuffer();
        }

        // Upload Mask to Fal
        const maskUrl = await uploadToFal(maskBuffer);

        console.log(`[AI Service] Calling Fal.ai Flux Inpainting. Intent: ${intent}`);
        console.log(`[AI Service] Original URL: ${originalImageUrl}`);
        console.log(`[AI Service] Mask URL: ${maskUrl}`);

        // 4. CALL FAL.AI
        // Switching to 'fal-ai/iclight-v2' for better control over preservation.
        const falResult = await subscribe('fal-ai/iclight-v2', {
            input: {
                prompt: `${visualDescription}. CRITICAL: Do not modify the vehicle body, wheels, or geometry. Keep the vehicle EXACTLY as it is. Ensure perfect perspective match between car and background. No floating cars.`,
                image_url: originalImageUrl,
                mask_url: maskUrl,
                enable_safety_checker: false,
                image_size: "landscape_4_3",
                strength: 0.95 // Ensure effective inpainting in masked area
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
            const processedUrl =`https://api-flash.adaptusgroup.ca${stealthResult.relativePath}`;

            return {
                success: true,
                originalUrl: imageUrl,
                processedUrl: processedUrl,
                provider: 'fal-ai-iclight-v2',
                wasGenerated: true,
                metadata: {
                    intent: intent,
                    prompt: prompt,
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
