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

// Flash Fender Integration
import sharp from 'sharp';
import { removeBackground } from '@imgly/background-removal-node';
import ImagePrompts from '../models/ImagePrompts.js';
import { prepareImage } from './image-processor.service.js';

// Helper to convert buffer to Data URI
const toDataUri = (mimetype, buffer) => {
    return `data:${mimetype};base64,${buffer.toString('base64')}`;
};

export const processImageWithAI = async (imageUrl, prompt = 'Remove background', promptId) => {
    try {
        console.log(`[AI Service] Processing image request. Prompt: "${prompt}"`);

        // 1. Fetch the original image
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        // Resize to max 800px (optimization for API payload)
        const imageBuffer = await sharp(Buffer.from(imageResponse.data))
            .resize({ width: 800, withoutEnlargement: true })
            .toBuffer();

        if (!process.env.FLASH_FENDER_IMG_KEY) {
            throw new Error('FLASH_FENDER_IMG_KEY is missing in .env file');
        }
        
        const imagePrompt = await ImagePrompts.findById(promptId);
        
        // 2. INTENT & SCENE CLASSIFICATION WITH OPENROUTER
        let visualDescription = "";
        let intent = "SMART_EDIT";
        let isInterior = false;

        try {
            console.log('[AI Service] Analyzing Intent & Scene with OpenRouter...');
            
            const analysisPrompt = `
                You are an expert AI implementation assistant for an automotive image editing pipeline.
                
                The user wants to edit a vehicle image using an AI inpainting model.
                User's Request: "${imagePrompt?.prompt || prompt}"

                **CRITICAL RULES:**
                - The subject vehicle MUST NOT be distorted, hallucinated, or modified in geometry/body shape.
                - If the user asks for a background change, the prompt MUST describe ONLY the background environment (e.g., "sunny beach with waves", "modern showroom"). DO NOT include "a car", "a vehicle", or generic descriptors of the subject in the prompt string if possible, to prevent the generator from drawing a second car in the background.
                - If the user asks for a color change, ONLY the paint should change.

                **INTENT CLASSIFICATION:**
                - "MODIFY_BACKGROUND": If the user wants to change the setting, location, weather, or background.
                - "MODIFY_VEHICLE": If the user EXPLICITLY asks to change the car itself.

                **OUTPUT JSON ONLY:**
                {
                    "intent": "MODIFY_BACKGROUND" | "MODIFY_VEHICLE",
                    "sceneType": "INTERIOR" | "EXTERIOR",
                    "enhancedPrompt": "Descriptions of the specific background setting ONLY (for background change) OR detailed vehicle description (for vehicle edit)..."
                }
            `;

            const completion = await openRouter.chat.send({
                model: 'deepseek/deepseek-r1', 
                messages: [{ role: 'user', content: analysisPrompt }],
                stream: false,
            });

            const textResponse = completion.choices[0].message.content;
            const jsonStr = cleanJson(textResponse);
            const result = JSON.parse(jsonStr);

            visualDescription = result.enhancedPrompt || prompt; 
            intent = result.intent === 'MODIFY_VEHICLE' ? 'GENERATE_NEW' : 'SMART_EDIT';
            isInterior = result.sceneType === 'INTERIOR';
            
            console.log(`[AI Service] Intent: ${intent} | Scene: ${result.sceneType} | Prompt: "${visualDescription.substring(0, 30)}..."`);
        } catch (err) {
            console.warn('[AI Service] Intent analysis failed, defaulting.', err.message);
        }


        // 3. PREPARE PROCESSING (Mask Generation)
        console.log('[AI Service] Preparing masks...');

        // Convert to PNG Buffer for sharp/imgly
        const pngBuffer = await sharp(imageBuffer).png().toBuffer();
        const blob = new Blob([pngBuffer], { type: 'image/png' });
        
        // Remove Background to get the subject (Car)
        const bgRemovedBlob = await removeBackground(blob);
        const bgRemovedBuffer = Buffer.from(await bgRemovedBlob.arrayBuffer());

        let maskBuffer;

        if (intent === 'SMART_EDIT') {
            // INTENT: Change Background, Keep Car.
            // DILATION STEP: Expand the Car Mask (White)
            console.log('[AI Service] Creating Inverted Mask (Dilated to Protect Car)...');
            maskBuffer = await sharp(bgRemovedBuffer)
                .ensureAlpha()
                .extractChannel(3) // Get Alpha (Car=White)
                .blur(5)           // Blur edges
                .threshold(10)     // Threshold low to capture blur
                .negate()          // Invert (Car=0/Black, BG=255/White) --> Area to INPAINT is WHITE
                .toBuffer();
        } else {
            // INTENT: Change Car, Keep Background.
            console.log('[AI Service] Creating Standard Mask (Edit Car)...');
            maskBuffer = await sharp(bgRemovedBuffer)
                .ensureAlpha()
                .extractChannel(3)
                .toBuffer(); // Car=White (Edit), BG=Black (Protect)
        }

        // 4. CONSTRUCT API PAYLOAD
        const userPrompt = String(visualDescription).trim();
        const finalPrompt = isInterior
            ? `${userPrompt} Keep car interior unchanged - preserve dashboard, seats, steering wheel exactly as original.`
            : `${userPrompt}, photorealistic`;

        // If changing background, forbid creating NEW cars in the background
        const isBackgroundChange = !isInterior && intent === 'SMART_EDIT';
        const negativePrompt = isInterior
            ? 'changing interior, modified dashboard, altered seats, different steering wheel, interior artifacts, distortion, blurry'
            : (isBackgroundChange 
                ? 'car, vehicle, truck, van, automobile, duplicate cars, multiple cars, extra vehicle, ghost car, floating car, cropped car, huge car, changed car color, modified car, split image, bad composition' 
                : 'duplicate cars, multiple cars, extra vehicle, ghost car, floating car, cropped car, huge car, changed car color, modified car, split image, bad composition');

        const payload = {
            prompt: finalPrompt,
            image_url: toDataUri('image/jpeg', imageBuffer),
            mask_image_url: toDataUri('image/png', maskBuffer),
            strength: isInterior ? 0.85 : 0.95, 
            control_scale: isInterior ? 0.95 : 0.95,
            negative_prompt: negativePrompt,
            sync_mode: true,
            width: 600, 
            height: 800,
            // Flash Fender specific params from cURL example can be added if needed, 
            // but for Inpainting/Edit we use the specialized params above.
            steps: 20,
            cfg_scale: 7.0 
        };

        // Note: Use dimensions from resized imageBuffer for accuracy
        const metadata = await sharp(imageBuffer).metadata();
        payload.width = metadata.width;
        payload.height = metadata.height;

        console.log(`[AI Service] Calling Flash Fender API... Strength: ${payload.strength}`);

        // 5. CALL FLASH FENDER API
        const ffResponse = await axios.post('https://api.flashfender.com/api/v1/generate', payload, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.FLASH_FENDER_IMG_KEY
            },
            timeout: 60000 // 60s timeout
        });

        if (ffResponse.data && (ffResponse.data.images || ffResponse.data.image_url)) {
            let resultUrl = '';
            
            if (ffResponse.data.images && ffResponse.data.images.length > 0) {
                 resultUrl = ffResponse.data.images[0].url;
            } else if (ffResponse.data.image_url) {
                resultUrl = ffResponse.data.image_url;
            } else {
                 throw new Error('Unknown response format from Flash Fender');
            }

            console.log(`[AI Service] Generation Success: ${resultUrl}`);

            // 6. STEALTH PIPELINE (Safeguard)
            console.log(`[AI Service] Applying Stealth Protocol...`);
            const stealthResult = await prepareImage(resultUrl, {
                 headers: { 'x-api-key': process.env.FLASH_FENDER_IMG_KEY }
            });

            if (!stealthResult.success) {
                throw new Error(`Stealth processing failed: ${stealthResult.error}`);
            }

            const processedUrl = `https://api-flash.adaptusgroup.ca${stealthResult.relativePath}`;

            return {
                success: true,
                originalUrl: imageUrl,
                processedUrl: processedUrl,
                provider: 'flash-fender',
                wasGenerated: true,
                metadata: {
                    intent: intent,
                    isInterior,
                    prompt: finalPrompt
                }
            };
        }

        throw new Error('No images returned from Flash Fender');

    } catch (error) {
        console.error('[AI Service] Processing Error:', error?.response?.data || error.message);
        throw new Error(`Failed to process image: ${error.message}`);
    }
};
