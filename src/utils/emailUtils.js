const crypto = require('crypto');
const { MailtrapClient } = require('mailtrap');

class EmailUtils {
    static #client;

    static generateToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    static getClient() {
        if (!this.#client) {
            const { MAILTRAP_TOKEN } = process.env;
            if (!MAILTRAP_TOKEN) {
                console.warn('Mailtrap API token missing. Emails will only be logged.');
                return null;
            }
            this.#client = new MailtrapClient({ token: MAILTRAP_TOKEN });
        }
        return this.#client;
    }

    static from() {
        return {
            email: process.env.MAIL_FROM_ADDRESS || 'noreply@example.com',
            name: process.env.MAIL_FROM_NAME || 'Your App'
        };
    }

    static async sendVerificationEmail(username, email, token) {
        const base = process.env.APP_BASE_URL || 'http://localhost:3000';
        const link = `${base}/api/auth/verify-email?token=${token}`;

        console.log(`
            ========== EMAIL VERIFICATION ==========
            To: ${email}
            Token: ${token}
            Link: ${link}
            ========================================
         `);
        const client = this.getClient();
        if (!client) return true; // log-only mode, your mailtrap token was not found

        try {
            await client.send({
                from: this.from(),
                to: [{ email }],
                subject: 'Verify your email address',
                text: `Hi ${username}\n\nVerify your email:\n${link}\nToken: ${token}\n\nIf not you, ignore this.`,
                html: `
                    <h2>Email Verification</h2>
                    <p>Hi <strong>${username}</strong>,</p>
                    <p>Please verify your email by clicking the button below:</p>
                    <p><a href="${link}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Verify Email</a></p>
                    <p>Or use this code:</p>
                    <pre style="background:#f4f4f4;padding:10px;border-radius:4px;">${token}</pre>
                    <p>If you didn’t create an account, ignore this email.</p>
                `,
                category: 'verification'
            });
            return true;
        } catch (err) {
            console.error('Mailtrap verification send failed:', err.message);
            return false;
        }
    }

    static async sendPasswordResetEmail(username, email, token) {
        const base = process.env.APP_BASE_URL || 'http://localhost:3000';
        const link = `${base}/reset-password?token=${token}`;

        console.log(`
            ========== PASSWORD RESET ==========
            To: ${email}
            Token: ${token}
            Link: ${link}
            ====================================
        `);
        const client = this.getClient();
        if (!client) return true;

        try {
            await client.send({
                from: this.from(),
                to: [{ email }],
                subject: 'Reset your password',
                text: `Hi ${username}\n\nReset link:\n${link}\nToken: ${token}\nExpires in 1 hour.\nIf not you, ignore this.`,
                html: `
                    <h2>Password Reset</h2>
                    <p>Hi <strong>${username}</strong>,</p>
                    <p>You requested a password reset. Click below:</p>
                    <p><a href="${link}" style="background:#dc2626;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Reset Password</a></p>
                    <p>Or use this code:</p>
                    <pre style="background:#f4f4f4;padding:10px;border-radius:4px;">${token}</pre>
                    <p>This link expires in 1 hour.</p>
                    <p>If you didn’t request this, you can ignore it.</p>
                `,
                category: 'password_reset'
            });
            return true;
        } catch (err) {
            console.error('Mailtrap password reset send failed:', err.message);
            return false;
        }
    }
}

module.exports = EmailUtils;