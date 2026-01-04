import mongoose from "mongoose";

const PromptUsedSchema = new mongoose.Schema({
    promptId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ImagePrompts"
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    vehicle: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vehicle"
    },
    vin: {
        type: String, // Keep for legacy or easy lookup
    }
}, { timestamps: true })

export default mongoose.model("PromptUsed", PromptUsedSchema);

