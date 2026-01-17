// Simple in-memory rate limiter for login attempts
// Stores failed attempts per IP with timestamps

interface LoginAttempt {
    count: number;
    firstAttempt: number;
    blockedUntil?: number;
}

const loginAttempts = new Map<string, LoginAttempt>();

// Configuration
const MAX_ATTEMPTS = 5;           // Max failed attempts
const WINDOW_MS = 60 * 1000;      // 1 minute window
const BLOCK_DURATION_MS = 5 * 60 * 1000;  // 5 minute block

export function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const attempt = loginAttempts.get(ip);

    // No previous attempts
    if (!attempt) {
        return { allowed: true };
    }

    // Currently blocked
    if (attempt.blockedUntil && now < attempt.blockedUntil) {
        return {
            allowed: false,
            retryAfter: Math.ceil((attempt.blockedUntil - now) / 1000)
        };
    }

    // Reset if window expired
    if (now - attempt.firstAttempt > WINDOW_MS) {
        loginAttempts.delete(ip);
        return { allowed: true };
    }

    // Check if too many attempts
    if (attempt.count >= MAX_ATTEMPTS) {
        attempt.blockedUntil = now + BLOCK_DURATION_MS;
        return {
            allowed: false,
            retryAfter: Math.ceil(BLOCK_DURATION_MS / 1000)
        };
    }

    return { allowed: true };
}

export function recordFailedAttempt(ip: string): void {
    const now = Date.now();
    const attempt = loginAttempts.get(ip);

    if (!attempt || now - attempt.firstAttempt > WINDOW_MS) {
        loginAttempts.set(ip, { count: 1, firstAttempt: now });
    } else {
        attempt.count++;
    }
}

export function clearAttempts(ip: string): void {
    loginAttempts.delete(ip);
}

// Cleanup old entries periodically (every 10 minutes)
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [ip, attempt] of loginAttempts.entries()) {
            if (now - attempt.firstAttempt > WINDOW_MS * 10) {
                loginAttempts.delete(ip);
            }
        }
    }, 10 * 60 * 1000);
}
