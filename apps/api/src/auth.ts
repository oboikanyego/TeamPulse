import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export type Role = 'admin' | 'manager' | 'member';

export interface JwtUser {
  id: string;
  email: string;
  name: string;
}

export type AuthedRequest = Request & { user?: JwtUser };

const secret = () => process.env.JWT_SECRET || 'dev-only-secret-change-me';

export function signToken(user: JwtUser): string {
  return jwt.sign(user, secret(), { expiresIn: '12h' });
}

export function authRequired(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  try {
    req.user = jwt.verify(header.slice(7), secret()) as JwtUser;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired session' });
  }
}
