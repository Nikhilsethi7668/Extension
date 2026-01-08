import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendPasswordResetEmail = async (email, resetToken, userName) => {
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3682'}/reset-password?token=${resetToken}`;

    try {
        const { data, error } = await resend.emails.send({
            from: process.env.FROM_EMAIL || 'Flash Fender <no-reply@updates.adaptusgroup.ca>',
            to: [email],
            subject: 'Reset Your Flash Fender Password',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                    <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #0f62fe; margin-bottom: 20px;">Password Reset Request</h2>
                        
                        <p style="color: #333; font-size: 16px; line-height: 1.6;">Hi ${userName},</p>
                        
                        <p style="color: #333; font-size: 16px; line-height: 1.6;">
                            We received a request to reset your password for your Flash Fender account.
                        </p>
                        
                        <p style="color: #333; font-size: 16px; line-height: 1.6;">
                            Click the button below to reset your password:
                        </p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${resetLink}" 
                               style="background-color: #0f62fe; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                                Reset Password
                            </a>
                        </div>
                        
                        <p style="color: #666; font-size: 14px; line-height: 1.6;">
                            Or copy and paste this link into your browser:
                        </p>
                        <p style="color: #0f62fe; font-size: 14px; word-break: break-all;">
                            ${resetLink}
                        </p>
                        
                        <p style="color: #666; font-size: 14px; line-height: 1.6; margin-top: 20px;">
                            <strong>This link will expire in 1 hour.</strong>
                        </p>
                        
                        <p style="color: #666; font-size: 14px; line-height: 1.6;">
                            If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
                        </p>
                        
                        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                        
                        <p style="color: #999; font-size: 12px; line-height: 1.6;">
                            Thanks,<br>
                            Flash Fender Team
                        </p>
                    </div>
                </div>
            `,
        });

        if (error) {
            console.error('Resend email error:', error);
            throw new Error('Failed to send email');
        }

        return data;
    } catch (error) {
        console.error('Email service error:', error);
        throw error;
    }
};

export const sendOrgWelcomeEmail = async (email, password, orgName, adminName) => {
    const loginLink = `${process.env.FRONTEND_URL || 'http://localhost:3682'}/login`;

    try {
        const { data, error } = await resend.emails.send({
            from: process.env.FROM_EMAIL || 'Flash Fender <no-reply@updates.adaptusgroup.ca>',
            to: [email],
            subject: 'Welcome to Flash Fender!',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                    <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #0f62fe; margin-bottom: 20px;">Welcome to Flash Fender!</h2>
                        
                        <p style="color: #333; font-size: 16px; line-height: 1.6;">Hi ${adminName},</p>
                        
                        <p style="color: #333; font-size: 16px; line-height: 1.6;">
                            Your organization <strong>${orgName}</strong> has been successfully created.
                        </p>
                        
                        <div style="background-color: #f0f7ff; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #0f62fe;">
                            <h3 style="margin-top: 0; color: #0f62fe; font-size: 18px;">Your Admin Credentials</h3>
                            <p style="margin-bottom: 5px;"><strong>Email:</strong> ${email}</p>
                            <p style="margin-bottom: 0;"><strong>Password:</strong> ${password}</p>
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${loginLink}" 
                               style="background-color: #0f62fe; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                                Login to Dashboard
                            </a>
                        </div>
                        
                        <p style="color: #666; font-size: 14px; line-height: 1.6;">
                            Please change your password after logging in for the first time.
                        </p>
                        
                        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                        
                        <p style="color: #999; font-size: 12px; line-height: 1.6;">
                            Thanks,<br>
                            Flash Fender Team
                        </p>
                    </div>
                </div>
            `,
        });

        if (error) {
            console.error('Resend email error:', error);
            // Don't throw here, just log error so flow continues
            return null;
        }

        return data;
    } catch (error) {
        console.error('Email service error:', error);
        return null;
    }
};

export const sendAgentWelcomeEmail = async (email, password, orgName, agentName, apiKey) => {
    try {
        const { data, error } = await resend.emails.send({
            from: process.env.FROM_EMAIL || 'Flash Fender <no-reply@updates.adaptusgroup.ca>',
            to: [email],
            subject: 'Flash Fender Agent Access',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                    <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #0f62fe; margin-bottom: 20px;">Agent Access Details</h2>
                        
                        <p style="color: #333; font-size: 16px; line-height: 1.6;">Hi ${agentName},</p>
                        
                        <p style="color: #333; font-size: 16px; line-height: 1.6;">
                            You have been added as an agent for <strong>${orgName}</strong>.
                        </p>
                        
                        <div style="background-color: #f0f7ff; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #0f62fe;">
                            <h3 style="margin-top: 0; color: #0f62fe; font-size: 18px;">Your Credentials</h3>
                            <p style="margin-bottom: 5px;"><strong>Email:</strong> ${email}</p>
                            ${password ? `<p style="margin-bottom: 5px;"><strong>Password:</strong> ${password}</p>` : ''}
                            <p style="margin-bottom: 0;"><strong>Extension API Key:</strong> <code style="background-color: #e1e4e8; padding: 2px 5px; border-radius: 3px;">${apiKey}</code></p>
                        </div>
                        
                        <p style="color: #333; font-size: 16px; line-height: 1.6;">
                            Use the API Key above to log in to the Flash Fender Chrome Extension.
                        </p>
                        
                        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                        
                        <p style="color: #999; font-size: 12px; line-height: 1.6;">
                            Thanks,<br>
                            Flash Fender Team
                        </p>
                    </div>
                </div>
            `,
        });

        if (error) {
            console.error('Resend email error:', error);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Email service error:', error);
        return null;
    }
};

export const sendOrgUpdateEmail = async (email, orgName, adminName, newLimits) => {
    try {
        const { data, error } = await resend.emails.send({
            from: process.env.FROM_EMAIL || 'Flash Fender <no-reply@updates.adaptusgroup.ca>',
            to: [email],
            subject: 'Organization Plan Updated - Flash Fender',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                    <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #0f62fe; margin-bottom: 20px;">Plan Updated</h2>
                        
                        <p style="color: #333; font-size: 16px; line-height: 1.6;">Hi ${adminName},</p>
                        
                        <p style="color: #333; font-size: 16px; line-height: 1.6;">
                            The plan limits for your organization <strong>${orgName}</strong> have been updated.
                        </p>
                        
                        <div style="background-color: #f0f7ff; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #0f62fe;">
                            <h3 style="margin-top: 0; color: #0f62fe; font-size: 18px;">New Plan Details</h3>
                            <p style="margin-bottom: 5px;"><strong>Max Agents:</strong> ${newLimits.maxAgents}</p>
                            <p style="margin-bottom: 0;"><strong>Subscription Duration:</strong> ${newLimits.subscriptionDuration}</p>
                            ${newLimits.expiresAt ? `<p style="margin-bottom: 0;"><strong>Expires On:</strong> ${new Date(newLimits.expiresAt).toLocaleDateString()}</p>` : ''}
                        </div>
                        
                        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                        
                        <p style="color: #999; font-size: 12px; line-height: 1.6;">
                            Thanks,<br>
                            Flash Fender Team
                        </p>
                    </div>
                </div>
            `,
        });

        if (error) {
            console.error('Resend email error:', error);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Email service error:', error);
        return null;
    }
};

export const sendOrgStatusEmail = async (email, orgName, adminName, status) => {
    try {
        const { data, error } = await resend.emails.send({
            from: process.env.FROM_EMAIL || 'Flash Fender <no-reply@updates.adaptusgroup.ca>',
            to: [email],
            subject: `Organization Account ${status === 'active' ? 'Activated' : 'Frontend Deactivated'} - Flash Fender`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                    <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #0f62fe; margin-bottom: 20px;">
                            ${status === 'active' ? 'Account Activated' : 'Account Deactivated'}
                        </h2>
                        
                        <p style="color: #333; font-size: 16px; line-height: 1.6;">Hi ${adminName},</p>
                        
                        <p style="color: #333; font-size: 16px; line-height: 1.6;">
                            This email is to inform you that your organization <strong>${orgName}</strong> has been 
                            <strong style="color: ${status === 'active' ? '#10b981' : '#ef4444'};">
                                ${status === 'active' ? 'ENABLED' : 'DISABLED'}
                            </strong>.
                        </p>
                        
                        ${status === 'active' 
                            ? `<div style="background-color: #f0fdf4; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #10b981;">
                                <p style="margin-bottom: 0;">You can now log in and use all features of Flash Fender.</p>
                               </div>`
                            : `<div style="background-color: #fef2f2; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ef4444;">
                                <p style="margin-bottom: 0;">Access to Flash Fender has been temporarily suspended. Please contact support for more information.</p>
                               </div>`
                        }
                        
                        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                        
                        <p style="color: #999; font-size: 12px; line-height: 1.6;">
                            Thanks,<br>
                            Flash Fender Team
                        </p>
                    </div>
                </div>
            `,
        });

        if (error) {
            console.error('Resend email error:', error);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Email service error:', error);
        return null;
    }
};
