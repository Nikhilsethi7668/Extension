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
    vehicleId:{
        type: mongoose.Schema.Types.ObjectId,
        ref:"Vehicle"  
    }
},{timestamps:true})

export default mongoose.model("PromptUsed", PromptUsedSchema);

