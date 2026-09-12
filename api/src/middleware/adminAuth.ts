import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { getAdminApiKey } from '../config/env';

export function requireAdminApiKey(req: Request, res: Response, next: NextFunction): void {
  const configuredKey = getAdminApiKey();
  const providedKey = req.header('X-Admin-API-Key');

  if (!providedKey) {
    res.status(401).json({
      success: false,
      message: 'admin API key is required'
    });
    return;
  }

  const configuredBuffer = Buffer.from(configuredKey);
  const providedBuffer = Buffer.from(providedKey);

  if (
    configuredBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(configuredBuffer, providedBuffer)
  ) {
    res.status(403).json({
      success: false,
      message: 'invalid admin API key'
    });
    return;
  }

  next();
}
