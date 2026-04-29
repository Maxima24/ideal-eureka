import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class ApiVersionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const path: string = request.path || '';

    // Only enforce on /api/* routes
    if (!path.startsWith('/api/')) return true;

    const version = request.headers['x-api-version'];
    if (!version || version !== '1') {
      throw new BadRequestException({
        status: 'error',
        message: 'API version header required',
      });
    }

    return true;
  }
}