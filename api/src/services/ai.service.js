import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { saveImageLocally } from './storage.service.js';
import axios from 'axios';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const generateVehicleContent = async (vehicle, instructions, sentiment = 'professional') => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

        const prompt = `
      Act as a professional vehicle salesperson.
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
      Description: (A detailed, engaging description)
      
      Output in JSON format: { "title": "...", "description": "..." }
    `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Clean up response if it's wrapped in triple backticks
        const jsonString = text.replace(/```json|```/g, '').trim();
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

// Helper to upload buffer to Fal
const uploadToFal = async (buffer, type = 'image/png') => {
    const blob = new Blob([buffer], { type });
    const url = await storage.upload(blob);
    return url;
};

export const processImageWithGemini = async (imageUrl, prompt = 'Remove background') => {
    try {
        console.log(`[AI Service] Processing image request. Prompt: "${prompt}"`);

        // 1. Fetch the original image
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data);

        // CHECK: Ensure Fal Key is available (Fal client uses FAL_KEY env var automatically, but good to check)
        if (!process.env.FAL_KEY) {
            throw new Error('FAL_KEY is missing in .env file');
        }

        // 2. INTENT CLASSIFICATION WITH GEMINI
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
        const base64Image = imageBuffer.toString('base64');
        let visualDescription = "";
        let intent = "SMART_EDIT"; // Default to smart edit (background only)

        try {
            console.log('[AI Service] Analyzing Intent with Gemini...');
            const analysisPrompt = `
                Analyze this image and the user's edit prompt: "${prompt}".
                GOAL: Achieve a pixel-perfect, distortion-free result. Use common sense to ensure the vehicle retains accurate geometry and no parts appear distorted.

                **Keep the car in the image as it is, do not remove it, or change its camera angle or position**
                Task 1: Describe the image in detail (key "visualDescription"). Focus on the vehicle's integrity.
                Task 2: Determine if the user wants to modify the ACTUAL VEHICLE ITSELF (e.g. change color, add spoiler, fix dent, change wheels, convert to convertible) or JUST THE BACKGROUND/ENVIRONMENT (e.g. showroom, beach, white background, remove background, sunny day).
                
                If any modification to the car body, paint, or parts is requested, intent must be "MODIFY_VEHICLE".
                If only the setting, location, or background is changing, intent must be "MODIFY_BACKGROUND".
                
                IMPORTANT: If the prompt mentions "remove background" or "transparent background", the intent MUST be "MODIFY_BACKGROUND".
                NOTE: For "remove background", the goal is to remove background clutter but PRESERVE the road/ground and the vehicle (do not disturb the road or vehicle).
                
                Output JSON only:
                {
                    "visualDescription": "...",
                    "intent": "MODIFY_VEHICLE" or "MODIFY_BACKGROUND"
                }
            `;

            const analysisResult = await model.generateContent([
                analysisPrompt,
                { inlineData: { data: base64Image, mimeType: "image/jpeg" } }
            ]);

            const textResponse = analysisResult.response.text();
            const jsonStr = textResponse.replace(/```json|```/g, '').trim();
            const result = JSON.parse(jsonStr);

            visualDescription = result.visualDescription;
            intent = result.intent === 'MODIFY_VEHICLE' ? 'GENERATE_NEW' : 'SMART_EDIT';
            console.log(`[AI Service] Intent Detected: ${intent} (User Prompt: "${prompt}")`);

        } catch (geminiError) {
            console.warn('[AI Service] Intent analysis failed, defaulting to Smart Edit:', geminiError.message);
            visualDescription = "A vehicle";
        }

        // 3. PREPARE FOR FLUX (Mask Generation)
        console.log('[AI Service] Preparing masks for Flux Inpainting...');

        // Convert to PNG Buffer for sharp/imgly
        const pngBuffer = await sharp(imageBuffer).png().toBuffer();
        const blob = new Blob([pngBuffer], { type: 'image/png' });

        // Remove Background to get the subject (Car)
        const bgRemovedBlob = await removeBackground(blob);
        const bgRemovedBuffer = Buffer.from(await bgRemovedBlob.arrayBuffer());

        // Upload Original Image to Fal
        const originalImageUrl = await uploadToFal(imageBuffer);
        
        let maskBuffer;

        if (intent === 'SMART_EDIT') {
            // INTENT: Change Background, Keep Car.
            // MASK: White = Modify (Background), Black = Protect (Car).
            // bgRemovedBuffer Alpha: Car=255 (White), BG=0 (Black).
            // We need to INVERT the alpha channel.
            console.log('[AI Service] Creating Inverted Mask (Edit BG, Protect Car)...');
            maskBuffer = await sharp(bgRemovedBuffer)
                .ensureAlpha()
                .extractChannel(3) // Get Alpha
                .negate()          // Invert (Car=0, BG=255)
                .toBuffer();
        } else {
            // INTENT: Change Car, Keep Background.
            // MASK: White = Modify (Car), Black = Protect (Background).
            // bgRemovedBuffer Alpha: Car=255 (White), BG=0 (Black).
            // We use Alpha channel AS IS.
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
        const falResult = await subscribe('fal-ai/flux/dev/inpainting', {
            input: {
                prompt: `${prompt}. ${visualDescription}. High quality, photorealistic, 8k, masterpiece.`,
                image_url: originalImageUrl,
                mask_url: maskUrl,
                enable_safety_checker: false, // Optional: disable if strict safety is not needed for vehicles
                image_size: "landscape_4_3" // Good for car listings
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

            // Download and Save Locally
            const resultImgRes = await axios.get(resultUrl, { responseType: 'arraybuffer' });
            const resultBuffer = Buffer.from(resultImgRes.data);
            
            const fileName = `fal-edit-${Date.now()}.png`;
            const savedPath = await saveImageLocally(resultBuffer, fileName);
            const processedUrl = `http://localhost:5573${savedPath}`;

            return {
                success: true,
                originalUrl: imageUrl,
                processedUrl: processedUrl,
                provider: 'fal-ai-flux-inpainting',
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
