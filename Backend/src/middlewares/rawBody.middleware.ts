import { Request, Response, NextFunction } from 'express';

export function rawBodyMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (req.path.startsWith('/api/webhooks')) {
    let data = '';
    
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
    });
    
    req.on('end', () => {
      (req as any).rawBody = data;
      next();
    });
  } else {
    next();
  }
}
