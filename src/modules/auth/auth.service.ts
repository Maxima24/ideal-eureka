import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import { v7 as uuidv7 } from 'uuid';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── GitHub OAuth URL for Web ────────────────────────────────────────────────

  getGithubWebOAuthUrl(params: {
    state: string;
    redirectUri: string;
  }): string {
    const clientId = this.config.get<string>('GITHUB_WEB_CLIENT_ID')!;
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('scope', 'read:user user:email');
    url.searchParams.set('state', params.state);

    return url.toString();
  }

  // ─── GitHub OAuth URL for CLI (with PKCE) ────────────────────────────────────

  getGithubCliOAuthUrl(params: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string {
    const clientId = this.config.get<string>('GITHUB_CLI_CLIENT_ID')!;
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('scope', 'read:user user:email');
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    return url.toString();
  }

  // ─── Exchange code for Web (no PKCE) ─────────────────────────────────────────

  async exchangeCodeForWeb(params: {
    code: string;
    redirectUri: string;
  }): Promise<{ accessToken: string; refreshToken: string; user: any }> {
    const clientId = this.config.get<string>('GITHUB_WEB_CLIENT_ID')!;
    const clientSecret = this.config.get<string>('GITHUB_WEB_CLIENT_SECRET')!;

    // Validate required config
    if (!clientId || !clientSecret) {
      console.error('❌ Missing GitHub Web OAuth configuration');
      throw new UnauthorizedException('GitHub Web OAuth configuration missing');
    }

    console.log('==========================================');
    console.log('📥 GitHub Web OAuth Exchange Request:');
    console.log('  redirectUri:', JSON.stringify(params.redirectUri));
    console.log('  code length:', params.code.length);
    console.log('==========================================');

    // Build request body for GitHub (no PKCE for web)
    const body: Record<string, string> = {
      client_id: clientId,
      client_secret: clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
    };

    console.log('📤 Sending to GitHub API (Web):');
    console.log('  client_id:', clientId);
    console.log('  redirect_uri:', JSON.stringify(body.redirect_uri));

    return this.exchangeCodeWithGitHub(body);
  }

  // ─── Exchange code for CLI (with PKCE) ───────────────────────────────────────

  async exchangeCodeForCli(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<{ accessToken: string; refreshToken: string; user: any }> {
    const clientId = this.config.get<string>('GITHUB_CLI_CLIENT_ID')!;
    const clientSecret = this.config.get<string>('GITHUB_CLI_CLIENT_SECRET')!;

    // Validate required config
    if (!clientId || !clientSecret) {
      console.error('❌ Missing GitHub CLI OAuth configuration');
      throw new UnauthorizedException('GitHub CLI OAuth configuration missing');
    }

    console.log('==========================================');
    console.log('📥 GitHub CLI OAuth Exchange Request:');
    console.log('  redirectUri:', JSON.stringify(params.redirectUri));
    console.log('  has codeVerifier:', !!params.codeVerifier);
    console.log('  code length:', params.code.length);
    console.log('==========================================');

    // Build request body for GitHub (with PKCE)
    const body: Record<string, string> = {
      client_id: clientId,
      client_secret: clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
    };
    
    // Add PKCE code verifier for CLI
    if (params.codeVerifier) {
      body.code_verifier = params.codeVerifier;
      console.log('✅ PKCE code_verifier added to request');
    }

    console.log('📤 Sending to GitHub API (CLI):');
    console.log('  client_id:', clientId);
    console.log('  redirect_uri:', JSON.stringify(body.redirect_uri));
    console.log('  has_code_verifier:', !!body.code_verifier);

    return this.exchangeCodeWithGitHub(body);
  }

  // ─── Generic GitHub token exchange ───────────────────────────────────────────

  private async exchangeCodeWithGitHub(body: Record<string, string>): Promise<{
    accessToken: string;
    refreshToken: string;
    user: any;
  }> {
    try {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });

      const tokenData = await tokenRes.json();

      // Debug: Log GitHub's response
      console.log('📥 GitHub API Response:');
      console.log('  Status:', tokenRes.status);
      console.log('  Has error:', !!tokenData.error);
      console.log('  Has access_token:', !!tokenData.access_token);
      
      if (tokenData.error) {
        console.log('  Error type:', tokenData.error);
        console.log('  Error description:', tokenData.error_description);
        console.log('  Full response:', tokenData);
      }

      // Check for errors
      if (tokenData.error || !tokenData.access_token) {
        console.error('❌ GitHub OAuth exchange failed:');
        console.error('  Error:', tokenData.error);
        console.error('  Description:', tokenData.error_description);
        
        // Provide helpful error messages for common issues
        if (tokenData.error_description?.includes('redirect_uri')) {
          console.error('💡 FIX: The redirect_uri must match exactly what\'s registered in GitHub');
          console.error(`  Sent: ${body.redirect_uri}`);
        } else if (tokenData.error === 'bad_verifier') {
          console.error('💡 FIX: PKCE code_verifier mismatch');
        } else if (tokenData.error === 'bad_client_secret') {
          console.error('💡 FIX: Invalid client secret');
        }
        
        throw new UnauthorizedException(`GitHub OAuth exchange failed: ${tokenData.error_description || tokenData.error}`);
      }

      console.log('✅ GitHub exchange successful!');
      console.log('  Access token received:', tokenData.access_token.substring(0, 10) + '...');
      
      // Fetch GitHub user data
      const githubUser = await this.fetchGithubUser(tokenData.access_token);
      console.log('  GitHub user fetched:', githubUser.username, `(${githubUser.github_id})`);
      
      // Upsert user in database
      const user = await this.upsertUser(githubUser);
      console.log('  User upserted in database:', user.username, user.id);
      
      // Check if user is active
      if (!user.is_active) {
        console.warn('⚠️  User account is disabled:', user.username);
        throw new ForbiddenException('Account is disabled');
      }

      // Issue JWT tokens
      const tokens = await this.issueTokens(user);
      console.log('  JWT tokens issued successfully');
      console.log('==========================================\n');
      
      return { ...tokens, user };
      
    } catch (error) {
      console.error('❌ Unexpected error during OAuth exchange:', error);
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('GitHub OAuth exchange failed: Network or server error');
    }
  }

  // ─── Fetch GitHub user profile ───────────────────────────────────────────────

  private async fetchGithubUser(githubToken: string) {
    const [userRes, emailRes] = await Promise.all([
      fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${githubToken}` },
      }),
      fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${githubToken}` },
      }),
    ]);

    const userData = await userRes.json();
    const emails = await emailRes.json();

    const primaryEmail = Array.isArray(emails)
      ? emails.find((e: any) => e.primary)?.email ?? null
      : null;

    return {
      github_id: String(userData.id),
      username: userData.login,
      email: primaryEmail,
      avatar_url: userData.avatar_url,
    };
  }

  // ─── Upsert user ─────────────────────────────────────────────────────────────

  private async upsertUser(githubUser: {
    github_id: string;
    username: string;
    email: string | null;
    avatar_url: string;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { github_id: githubUser.github_id },
    });

    if (existing) {
      return this.prisma.user.update({
        where: { github_id: githubUser.github_id },
        data: {
          username: githubUser.username,
          email: githubUser.email,
          avatar_url: githubUser.avatar_url,
          last_login_at: new Date(),
        },
      });
    }

    return this.prisma.user.create({
      data: {
        id: uuidv7(),
        github_id: githubUser.github_id,
        username: githubUser.username,
        email: githubUser.email,
        avatar_url: githubUser.avatar_url,
        role: 'analyst',
        is_active: true,
        last_login_at: new Date(),
      },
    });
  }

  // ─── Issue access + refresh tokens ──────────────────────────────────────────

  async issueTokens(user: {
    id: string;
    username: string;
    role: string;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.jwt.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    const rawRefresh = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await this.prisma.refreshToken.create({
      data: {
        token: rawRefresh,
        user_id: user.id,
        expires_at: expiresAt,
      },
    });

    return { accessToken, refreshToken: rawRefresh };
  }

  // ─── Refresh tokens ───────────────────────────────────────────────────────────

  async refresh(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.used || stored.expires_at < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!stored.user.is_active) {
      throw new ForbiddenException('Account is disabled');
    }

    // Invalidate old token
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { used: true },
    });

    return this.issueTokens(stored.user);
  }

  // ─── Logout ───────────────────────────────────────────────────────────────────

  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) return;

    await this.prisma.refreshToken
      .updateMany({
        where: { token: refreshToken, used: false },
        data: { used: true },
      })
      .catch(() => {
        // Silently ignore if token not found
      });
  }

  // ─── Get user by ID ───────────────────────────────────────────────────────────

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.is_active) throw new ForbiddenException('Account is disabled');
    return user;
  }
}