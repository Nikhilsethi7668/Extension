import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const generateVehicleContent = async (vehicle, instructions, sentiment = 'professional') => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

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
