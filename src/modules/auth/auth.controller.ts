import {
  Controller,
  Post,
  Body,
  BadRequestException,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
  Query,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService,private readonly configService:ConfigService) {}

  // ─── Web GitHub OAuth Callback ──────────────────────────────────────────────
  
 @Public()
@Get('github/web')
async handleWebCallback(
  @Query('code') code: string,
  @Query('state') state: string,
  @Req() req: Request,
  @Res() res: Response
) {
  if (!code) {
    throw new BadRequestException('Missing authorization code');
  }

  const backendUrl = this.configService.get<string>('BACKEND_URL');
  const redirectUri = `${backendUrl}/auth/github/web`;

  const { accessToken, refreshToken } = await this.authService.exchangeCodeForWeb({
    code,
    redirectUri,
  });

  const isProduction = process.env.NODE_ENV === 'production';
  const webPortalUrl = this.configService.get<string>('WEB_PORTAL_URL');

  res.clearCookie('oauth_state');

  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 3 * 60 * 1000,
    path: '/',
  });

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 5 * 60 * 1000,
    path: '/',
  });

  return res.redirect(`${webPortalUrl}/dashboard`);
}
  // ─── CLI GitHub OAuth Callback (with PKCE) ──────────────────────────────────

  @Public()
  @Post('github/cli')
  async handleCliCallback(
    @Body()
    body: {
      code: string;
      code_verifier?: string;
      redirect_uri: string;
      state: string;
    },
  ) {
    console.log('=== CLI CALLBACK RECEIVED ===');
    console.log('  redirect_uri:', JSON.stringify(body.redirect_uri));
    console.log('  code_verifier present:', !!body.code_verifier);
    console.log('  code length:', body.code?.length);
    console.log('  state:', body.state);
    console.log('==============================');

    if (!body.code || !body.redirect_uri) {
      throw new BadRequestException('Missing required fields: code and redirect_uri');
    }

    if (!body.code_verifier) {
      console.warn('⚠️  No code_verifier provided for CLI authentication');
      // For CLI, we require PKCE for security
      throw new BadRequestException('Missing code_verifier for CLI authentication');
    }

    const { accessToken, refreshToken, user } = await this.authService.exchangeCodeForCli({
      code: body.code,
      codeVerifier: body.code_verifier,
      redirectUri: body.redirect_uri,
    });

    return {
      status: 'success',
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
        role: user.role,
      },
    };
  }

  // ─── Legacy endpoint for backward compatibility ─────────────────────────────
  // This will try to detect if it's web or CLI based on presence of code_verifier
  
  @Public()
  @Post('github/exchange')
  async handleLegacyExchange(
    @Body()
    body: {
      code: string;
      code_verifier?: string;
      redirect_uri: string;
      state?: string;
    },
  ) {
    console.log('=== LEGACY EXCHANGE ENDPOINT ===');
    console.log('  has code_verifier:', !!body.code_verifier);
    console.log('  redirect_uri:', JSON.stringify(body.redirect_uri));
    console.log('================================');

    if (!body.code || !body.redirect_uri) {
      throw new BadRequestException('Missing required fields: code and redirect_uri');
    }

    // Detect if this is a CLI request (has code_verifier) or web request (no code_verifier)
    if (body.code_verifier) {
      // CLI flow with PKCE
      console.log('➡️  Routing to CLI flow (PKCE detected)');
      const { accessToken, refreshToken, user } = await this.authService.exchangeCodeForCli({
        code: body.code,
        codeVerifier: body.code_verifier,
        redirectUri: body.redirect_uri,
      });

      return {
        status: 'success',
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar_url: user.avatar_url,
          role: user.role,
        },
      };
    } else {
      // Web flow without PKCE
      console.log('➡️  Routing to Web flow (no PKCE)');
      const { accessToken, refreshToken, user } = await this.authService.exchangeCodeForWeb({
        code: body.code,
        redirectUri: body.redirect_uri,
      });

      return {
        status: 'success',
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar_url: user.avatar_url,
          role: user.role,
        },
      };
    }
  }


  // In your AuthController
@Get('me')
@UseGuards(JwtAuthGuard)
async getMe(@Req() req: any) {
  const userId = req.user?.id;   // ← use 'id', not 'sub'
  if (!userId) {
    throw new UnauthorizedException('Not authenticated');
  }
  const user = await this.authService.getUserById(userId);
  return {
    status: 'success',
    data: {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
      role: user.role,
      last_login_at: user.last_login_at,
    },
  };
}


@Public()
@Post('refresh')
async refresh(@Body('refresh_token') refreshToken: string) {
  if (!refreshToken) {
    throw new BadRequestException('refresh_token required');
  }
  return this.authService.refresh(refreshToken);
}
}