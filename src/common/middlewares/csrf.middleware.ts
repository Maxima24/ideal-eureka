import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Only enforce CSRF on state-mutating methods from cookie-based (web) sessions
    const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!mutating.includes(req.method)) return next();

    // Skip if using Bearer token (CLI)
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) return next();

    // Skip auth endpoints
    if (req.path.startsWith('/auth/')) return next();

    const csrfCookie = req.cookies?.csrf_token;
    const csrfHeader = req.headers['x-csrf-token'];

    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    next();
  }
}

// Helper: generate a CSRF token and set it as a readable cookie
export function setCsrfCookie(res: Response): string {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('csrf_token', token, {
    httpOnly: false, // JS must read this to send as header
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 1000, // 1 hour
  });
  return token;
}