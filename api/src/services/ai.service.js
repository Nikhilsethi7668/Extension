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

// OpenAI Integration for Image Generation
import { removeBackground } from '@imgly/background-removal-node';
import sharp from 'sharp';
import FormData from 'form-data';

export const processImageWithGemini = async (imageUrl, prompt = 'Remove background') => {
    try {
        console.log(`[AI Service] Processing image request. Prompt: "${prompt}"`);

        // 1. Fetch the original image
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data);

        // CHECK: Ensure OpenAI Key is available
        const openAiKey = process.env.OPENAI_API_KEY;
        if (!openAiKey) {
            throw new Error('OPENAI_API_KEY is missing in .env file');
        }

        // 2. INTENT CLASSIFICATION WITH GEMINI
        // We use Gemini to decide: Does the user want to change the CAR (Generate) or just the BACKGROUND (Smart Edit)?
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
        const base64Image = imageBuffer.toString('base64');
        let visualDescription = "";
        let intent = "SMART_EDIT"; // Default to smart edit (background only)

        try {
            console.log('[AI Service] Analyzing Intent with Gemini...');
            const analysisPrompt = `
                Analyze this image and the user's edit prompt: "${prompt}".
                GOAL: Achieve a pixel-perfect, distortion-free result. Use common sense to ensure the vehicle retains accurate geometry and no parts appear distorted.

                **Keep the car in the image as it is, do not remove it. or change its camera angle or position**
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
            // Clean markdown
            const jsonStr = textResponse.replace(/```json|```/g, '').trim();
            const result = JSON.parse(jsonStr);

            visualDescription = result.visualDescription;
            intent = result.intent === 'MODIFY_VEHICLE' ? 'GENERATE_NEW' : 'SMART_EDIT';
            console.log(`[AI Service] Intent Detected: ${intent} (User Prompt: "${prompt}")`);

        } catch (geminiError) {
            console.warn('[AI Service] Intent analysis failed, defaulting to Smart Edit:', geminiError.message);
            visualDescription = "A vehicle";
        }

        // 3. EXECUTE BASED ON INTENT

        // A) SMART EDIT (Background Change - Preserve Car)
        if (intent === 'SMART_EDIT') {
            console.log('[AI Service] Executing Smart Edit (BG Removal + Inpainting)...');

            try {
                // Step A: Remove Background using @imgly (High quality, local)
                // PRE-PROCESS: Convert Buffer to Standard PNG using Sharp first.
                console.log('[AI Service] Converting input to standard PNG...');
                const pngBuffer = await sharp(imageBuffer).png().toBuffer();

                // Convert to Blob - @imgly expects Blob/Buffer/Path
                // Data URL failed, Buffer failed (maybe?), so let's try explicit Blob
                const blob = new Blob([pngBuffer], { type: 'image/png' });

                console.log(`[AI Service] Removing background (using Blob of size ${blob.size})...`);
                const bgRemovedBlob = await removeBackground(blob);
                const bgRemovedBuffer = Buffer.from(await bgRemovedBlob.arrayBuffer());
                console.log(`[AI Service] Background removed. Size: ${bgRemovedBuffer.length}`);

                // Step B: Ensure PNG format and Resize for DALL-E (Must be square, <4MB)
                const inputImage = await sharp(bgRemovedBuffer)
                    .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .png()
                    .toBuffer();

                // Step C: Prepare FormData for OpenAI
                const formData = new FormData();
                formData.append('image', inputImage, { filename: 'image.png', contentType: 'image/png' });
                formData.append('prompt', `${prompt}. High quality, photorealistic, 8k, masterpiece, professional automotive photography. No distortion, preserve car shape, accurate geometry.`);
                formData.append('n', 1);
                formData.append('size', '1024x1024');

                console.log('[AI Service] Sending to OpenAI DALL-E 2 Edit API...');

                // Step D: Call OpenAI Edit API
                const openaiResponse = await axios.post(
                    'https://api.openai.com/v1/images/edits',
                    formData,
                    {
                        headers: {
                            ...formData.getHeaders(),
                            'Authorization': `Bearer ${openAiKey}`
                        }
                    }
                );

                if (openaiResponse.data && openaiResponse.data.data && openaiResponse.data.data.length > 0) {
                    const generatedData = openaiResponse.data.data[0];

                    // Step E: Save result
                    const resultUrl = generatedData.url;
                    const resultImgRes = await axios.get(resultUrl, { responseType: 'arraybuffer' });
                    const resultBuffer = Buffer.from(resultImgRes.data);

                    const fileName = `smart-edit-${Date.now()}.png`;
                    const savedPath = await saveImageLocally(resultBuffer, fileName);
                    const processedUrl = `http://localhost:5573${savedPath}`;

                    console.log(`[AI Service] ✅ Smart Edit Complete: ${processedUrl}`);

                    return {
                        success: true,
                        originalUrl: imageUrl,
                        processedUrl: processedUrl,
                        provider: 'openai-dall-e-2-edit-smart',
                        wasGenerated: true
                    };
                }
            } catch (err) {
                console.error('[AI Service] Smart Edit Failed:', err);
                if (err.response) {
                    console.error('[AI Service] OpenAI Response Data:', JSON.stringify(err.response.data, null, 2));
                }
                throw new Error(`Smart Edit Failed: ${err.message}`);
            }
        }

        // B) MODIFY VEHICLE (Edit the Car, Keep Background)
        // User wants true "Editing" (e.g. change color), not regeneration of the whole scene.
        // Solution: Invert the mask. Make the CAR transparent (to be filled), keep BACKGROUND opaque (protected).

        console.log('[AI Service] Executing Vehicle Edit (Inverted Mask Inpainting)...');

        // Step A: Remove Background to isolate subject
        // Pre-process as PNG Blob
        const pngBuffer = await sharp(imageBuffer).png().toBuffer();
        const blob = new Blob([pngBuffer], { type: 'image/png' });

        const bgRemovedBlob = await removeBackground(blob);
        const bgRemovedBuffer = Buffer.from(await bgRemovedBlob.arrayBuffer());

        // Step B: Create an Inverted Mask
        // Input: Car is Opaque, BG is Transparent.
        // Output for Mask: Car must be Transparent (to edit), BG must be Opaque (to protect).
        const { data, info } = await sharp(bgRemovedBuffer)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Iterate through pixels to invert alpha for masking
        // 4 channels: R, G, B, Alpha
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            // If Alpha is high (Car), make it 0 (Transparent -> Edit). 
            // If Alpha is low (BG), make it 255 (Opaque -> Protect).
            if (alpha > 128) {
                data[i + 3] = 0; // Mask this area (Edit it)
            } else {
                data[i + 3] = 255; // Protect this area
            }
        }

        const invertedMaskBuffer = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
            .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 255 } })
            .png()
            .toBuffer();

        // DALL-E Edit requires the 'image' to be RGBA
        const originalResized = await sharp(imageBuffer)
            .resize(1024, 1024, { fit: 'contain' })
            .png()
            .ensureAlpha()
            .toBuffer();

        // Step C: Prepare FormData
        // When providing a 'mask', the 'image' should be the original full image.
        const formData = new FormData();
        formData.append('image', originalResized, { filename: 'image.png', contentType: 'image/png' });
        formData.append('mask', invertedMaskBuffer, { filename: 'mask.png', contentType: 'image/png' });
        formData.append('prompt', `${prompt}. High quality, photorealistic, 8k, masterpiece. No distortion, ensure accurate vehicle geometry, do not alter vehicle body shape unless explicitly asked.`);
        formData.append('n', 1);
        formData.append('size', '1024x1024');

        console.log('[AI Service] Sending to DALL-E 2 Edit (Inverted)...');

        const openaiResponse = await axios.post(
            'https://api.openai.com/v1/images/edits',
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${openAiKey}`
                }
            }
        );

        if (openaiResponse.data?.data?.[0]) {
            const resultUrl = openaiResponse.data.data[0].url;
            const resultImgRes = await axios.get(resultUrl, { responseType: 'arraybuffer' });
            const savedPath = await saveImageLocally(Buffer.from(resultImgRes.data), `vehicle-edit-${Date.now()}.png`);

            console.log(`[AI Service] ✅ Vehicle Edit Complete.`);
            return {
                success: true,
                originalUrl: imageUrl,
                processedUrl: `http://localhost:5573${savedPath}`,
                provider: 'openai-dall-e-2-edit-vehicle',
                wasGenerated: true,
                metadata: {
                    prompt: prompt,
                    originalDescription: visualDescription.substring(0, 100) + '...',
                    processedAt: new Date().toISOString()
                }
            };
        }

        throw new Error('No image data received from OpenAI');

    } catch (error) {
        console.error('[AI Service] Image Generation Error:', error.response?.data || error.message);
        if (error.response?.data?.error) {
            console.error(`[AI Service] OpenAI Error: ${JSON.stringify(error.response.data.error)}`);
        }
        throw new Error(`Failed to process image: ${error.message}`);
    }
};
