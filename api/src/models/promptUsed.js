import mongoose from "mongoose";

const PromptUsedSchema = new mongoose.Schema({
    promptId:{
        type: mongoose.Schema.Types.ObjectId,
        ref:"ImagePrompts"  
    },
    userId:{
        type: mongoose.Schema.Types.ObjectId,
        ref:"User"  
    },
    vin:{
        type: String,
    }
},{timestamps:true})

export default mongoose.model("PromptUsed", PromptUsedSchema);

