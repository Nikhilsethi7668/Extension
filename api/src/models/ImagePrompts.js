import mongoose from "mongoose";

const ImagePromptsSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    prompt: {
        type: String,
        required: true
    }
},{timestamps:true})

export default mongoose.model("ImagePrompts", ImagePromptsSchema);
