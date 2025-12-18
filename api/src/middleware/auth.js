import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
    let token;

    // Check for API Key in headers (for Extension)
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
        try {
            const user = await User.findOne({ apiKey }).populate('organization');

            if (!user) {
                res.status(401);
                throw new Error('Invalid API Key');
            }

            if (user.status !== 'active') {
                res.status(403);
                throw new Error('Your account is inactive');
            }

            if (user.organization.status !== 'active') {
                res.status(403);
                throw new Error('Your organization is inactive');
            }

            req.user = user;
            return next();
        } catch (error) {
            res.status(error.statusCode || 401);
            throw new Error(error.message || 'Not authorized, API Key failed');
        }
    }

    // Check for JWT in Authorization header (for Dashboard)
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('-password').populate('organization');

            if (!user) {
                res.status(401);
                throw new Error('User not found');
            }

            if (user.status !== 'active') {
                res.status(403);
                throw new Error('Account inactive');
            }

            if (user.organization.status !== 'active') {
                res.status(403);
                throw new Error('Organization inactive');
            }

            req.user = user;
            return next();
        } catch (error) {
            console.error(error);
            res.status(401);
            throw new Error('Not authorized, token failed');
        }
    }

    if (!token && !apiKey) {
        res.status(401);
        throw new Error('Not authorized, no token or API key');
    }
};

export const admin = (req, res, next) => {
    if (req.user && (req.user.role === 'super_admin' || req.user.role === 'org_admin')) {
        next();
    } else {
        res.status(401);
        throw new Error('Not authorized as an admin');
    }
};

export const superAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'super_admin') {
        next();
    } else {
        res.status(401);
        throw new Error('Not authorized as a super admin');
    }
};
