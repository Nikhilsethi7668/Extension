import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const token = jwt.sign({ id: '65f0123456789abcdef01234' }, process.env.JWT_SECRET, { expiresIn: '1h' });
console.log('Token:', token);
