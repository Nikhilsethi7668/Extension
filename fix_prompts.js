
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Adjust if your local DB is different
const MONGO_URI = 'mongodb://127.0.0.1:27017/facebookmark';

const promptsPath = path.join(__dirname, 'api/prompts.json');
const rawData = fs.readFileSync(promptsPath);
const prompts = JSON.parse(rawData);

const locationMap = {
    "White Rock": "Ocean Pier",
    "Surrey Central": "City Center",
    "King George": "City Boulevard",
    "Fraser Valley": "Country Road",
    "Sea-to-Sky": "Mountain Highway",
    "Gastown": "Cobblestone Street",
    "Yaletown": "Urban Alley",
    "Granville Island": "Market Parking",
    "Metrotown": "Rooftop Deck",
    "Lonsdale": "City Skyline",
    "Kitsilano": "Suburban Street",
    "Annacis Island": "Industrial Park",
    "Lafarge Lake": "Lakefront",
    "New Westminster": "Riverfront Market",
    "River Road": "River Road",
    "152nd Street": "Suburban Avenue"
};

const conditionMap = [
    "Golden Hour", "Misty", "Rainy", "Sunny", "Dusk", "Overcast"
];

console.log('Refining Titles...');

const processedPrompts = prompts.map(p => {
    let oldTitle = p.title;
    let newLocation = "Scenic Spot";
    let newCondition = "Standard";

    // Find Location
    for (const [key, val] of Object.entries(locationMap)) {
        if (oldTitle.includes(key) || p.prompt.includes(key)) {
            newLocation = val;
            break;
        }
    }

    // Find Condition
    for (const cond of conditionMap) {
        if (oldTitle.includes(cond) || p.prompt.includes(cond)) {
            newCondition = cond;
            break;
        }
    }

    // Construct New Title
    const newTitle = `${newLocation} (${newCondition})`;

    return {
        title: newTitle,
        prompt: p.prompt
    };
});

// Save refined JSON
fs.writeFileSync(promptsPath, JSON.stringify(processedPrompts, null, 4));
console.log(`Saved ${processedPrompts.length} refined prompts to JSON.`);

// Seeding DB
const ImagePromptsSchema = new mongoose.Schema({
    title: { type: String, required: true },
    prompt: { type: String, required: true }
}, { timestamps: true });

const ImagePrompts = mongoose.model("ImagePrompts", ImagePromptsSchema);

async function seed() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to Mongo.');

        console.log('Seeding ImagePrompts...');

        // We use bulkWrite for efficiency
        const operations = processedPrompts.map(p => ({
            updateOne: {
                filter: { title: p.title, prompt: p.prompt },
                update: { $set: { title: p.title, prompt: p.prompt } },
                upsert: true
            }
        }));

        const result = await ImagePrompts.bulkWrite(operations);
        console.log(`Seeding Complete. Upserted: ${result.upsertedCount}, Modified: ${result.modifiedCount}, Matched: ${result.matchedCount}`);

        await mongoose.disconnect();
    } catch (err) {
        console.error('Seeding Failed:', err);
    }
}

seed();
