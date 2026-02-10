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

// Image generation via FlashFender Generate API (https://generate.flashfender.com)
import ImagePrompts from '../models/ImagePrompts.js';
import { prepareImage } from './image-processor.service.js';

const FLASHFENDER_GENERATE_URL = 'https://generate.flashfender.com/api/v1/generate';

export const processImageWithAI = async (imageUrl, prompt = 'Remove background', promptId) => {
    try {
        console.log(`[AI Service] Processing image request. Prompt: "${prompt}"`);

        if (!process.env.FLASH_FENDER_IMG_KEY) {
            throw new Error('FLASH_FENDER_IMG_KEY is missing in .env file');
        }

        const imagePrompt = await ImagePrompts.findById(promptId);
        const visualDescription = imagePrompt?.prompt || prompt;
        const intent = 'MODIFY_BACKGROUND';

        console.log(`[AI Service] Processing Background Change | Prompt: "${visualDescription}"`);
        console.log(`[AI Service] Passing image URL directly: ${imageUrl}`);

        let loraPrompt = visualDescription.startsWith('Add Background')
            ? visualDescription
            : `Add Background ${visualDescription}`;

        loraPrompt = `${loraPrompt} *CRITICAL CONSTRAINTS:*
1. *Detection & Filtering:* Analyze the image. If the image depicts the *INTERIOR* of a car (dashboard, seats, steering wheel, or views from inside), *STOP*. Do not apply any changes. Skip the background replacement entirely for interior shots.
2. *Subject Preservation:* If the image is an *EXTERIOR* shot, you are permitted to change only the surroundings. The vehicle itself must remain 100% untouched. Do not modify the paint, wheels, windows, or body lines.
3. *Environment Replacement:* Replace the entire background and floor/ground surface according to the style context provided above.
4. *No Bleed:* Ensure no "environmental blending" occurs on the car's surface. The car should look as if it was professionally cut out and placed into the new setting without any digital alteration to the original pixels of the vehicle.`;

        // 2. Call FlashFender Generate API (uses fal add-background under the hood)
        const generateResponse = await axios.post(
            FLASHFENDER_GENERATE_URL,
            {
                prompt: loraPrompt,
                image_url: imageUrl,
                model: 'fal-ai/flux-2-lora-gallery/add-background',
                width: 800,
                height: 600,
                steps: 40,
                cfg_scale: 7,
            },
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
