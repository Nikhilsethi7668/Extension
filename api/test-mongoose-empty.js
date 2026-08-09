import mongoose from 'mongoose';

const testSchema = new mongoose.Schema({
    desc: String
});
const Test = mongoose.model('Test', testSchema);

const doc = new Test({ desc: '' });
console.log("Empty string doc:", doc.toObject());

const doc2 = new Test({ });
console.log("Undefined doc:", doc2.toObject());
