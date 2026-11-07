// @graph-om/core/src/auth/index.ts
// Authentication and authorization helpers for Graph-OM

import { GraphClient } from '../client';
import type { DriverAdapter, GraphSchemaRegistry } from '../types';

export interface User {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  metadata?: Record<string, unknown>;
}

export interface AuthConfig {
  driver: DriverAdapter;
  schema: GraphSchemaRegistry;
  userNodeLabel: string;
  roleNodeLabel?: string;
  permissionNodeLabel?: string;
  sessionNodeLabel?: string;
  tokenExpiry?: number; // seconds
  refreshTokenExpiry?: number; // seconds
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface TokenPayload {
  sub: string;
  email?: string;
  roles?: string[];
  tokenType: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export interface AuthResult {
  user: User;
  session: Session;
  tokens: TokenPair;
}

export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
}

export class AuthManager {
  private client: GraphClient;
  private config: AuthConfig;
  private tokenSecret: string;

  constructor(config: AuthConfig, tokenSecret: string) {
    this.config = config;
    this.tokenSecret = tokenSecret;
    this.client = new GraphClient(config.driver, config.schema);
  }

  getClient(): GraphClient {
    return this.client;
  }

  // Password hashing (using Web Crypto API)
  async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    const computedHash = await this.hashPassword(password);
    return computedHash === hash;
  }

  // Base64 URL encoding/decoding (Node.js compatible)
  private base64UrlEncode(str: string): string {
    return Buffer.from(str).toString('base64url');
  }

  private base64UrlDecode(str: string): string {
    return Buffer.from(str, 'base64url').toString();
  }

  // JWT token generation (simplified - use a proper JWT library in production)
  generateToken(payload: Record<string, unknown>, expiresIn: number): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      ...payload,
      iat: now,
      exp: now + expiresIn,
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedClaims = this.base64UrlEncode(JSON.stringify(claims));
    const signature = this.sign(`${encodedHeader}.${encodedClaims}`);

    return `${encodedHeader}.${encodedClaims}.${signature}`;
  }

  private sign(data: string): string {
    // Simplified HMAC - use proper crypto in production
    let hash = 0;
    const secret = this.tokenSecret;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      const secretChar = secret.charCodeAt(i % secret.length);
      hash = (hash << 5) - hash + char + secretChar;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  verifyToken(token: string): { valid: boolean; payload?: TokenPayload; error?: string } {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Invalid token format' };
      }

      const [encodedHeader, encodedClaims, signature] = parts;
      if (!encodedHeader || !encodedClaims || !signature) {
        return { valid: false, error: 'Invalid token format' };
      }
      const expectedSignature = this.sign(`${encodedHeader}.${encodedClaims}`);

      if (signature !== expectedSignature) {
        return { valid: false, error: 'Invalid signature' };
      }

      const claims = JSON.parse(this.base64UrlDecode(encodedClaims)) as TokenPayload;
      const now = Math.floor(Date.now() / 1000);

      if (claims.exp && claims.exp < now) {
        return { valid: false, error: 'Token expired' };
      }

      return { valid: true, payload: claims };
    } catch {
      return { valid: false, error: 'Invalid token' };
    }
  }

  // User registration
  async register(data: {
    email: string;
    password: string;
    roles?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<AuthResult> {
    const { email, password, roles = ['user'], metadata = {} } = data;

    // Check if user exists
    const existing = await this.client.findUnique(this.config.userNodeLabel, {
      where: { email: { eq: email } },
    });

    if (existing) {
      throw new Error('User already exists');
    }

    const passwordHash = await this.hashPassword(password);
    const userId = crypto.randomUUID();

    const user = await this.client.create(this.config.userNodeLabel, {
      data: {
        id: userId,
        email,
        passwordHash,
        roles,
        metadata,
        createdAt: new Date(),
      },
    });

    return this.createSession(user as unknown as User);
  }

  // User login
  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.client.findUnique(this.config.userNodeLabel, {
      where: { email: { eq: email } },
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const valid = await this.verifyPassword(
      password,
      (user as Record<string, unknown>)['passwordHash'] as string,
    );
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    return this.createSession(user as unknown as User);
  }

  // Create session and tokens
  private async createSession(user: User): Promise<AuthResult> {
    const sessionId = crypto.randomUUID();
    const accessTokenExpiry = this.config.tokenExpiry ?? 3600; // 1 hour
    const refreshTokenExpiry = this.config.refreshTokenExpiry ?? 604800; // 7 days

    const accessToken = this.generateToken(
      { sub: user.id, email: user.email, roles: user.roles, tokenType: 'access' },
      accessTokenExpiry,
    );

    const refreshToken = this.generateToken(
      { sub: user.id, tokenType: 'refresh' },
      refreshTokenExpiry,
    );

    const expiresAt = new Date(Date.now() + accessTokenExpiry * 1000);

    const session: Session = {
      id: sessionId,
      userId: user.id,
      token: accessToken,
      refreshToken,
      expiresAt,
      createdAt: new Date(),
    };

    // Store session if session node label is configured
    if (this.config.sessionNodeLabel) {
      await this.client.create(this.config.sessionNodeLabel, {
        data: {
          id: sessionId,
          userId: user.id,
          token: accessToken,
          refreshToken,
          expiresAt,
          createdAt: new Date(),
        },
      });
    }

    return {
      user,
      session,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: accessTokenExpiry,
      },
    };
  }

  // Refresh access token
  async refreshToken(refreshToken: string): Promise<TokenPair> {
    const verification = this.verifyToken(refreshToken);
    if (!verification.valid || verification.payload?.tokenType !== 'refresh') {
      throw new Error('Invalid refresh token');
    }

    const payload = verification.payload!;
    const userId = payload.sub;
    const user = await this.client.findUnique<Record<string, unknown>>(this.config.userNodeLabel, {
      where: { id: { eq: userId } } as any,
    });

    if (!user) {
      throw new Error('User not found');
    }

    const accessTokenExpiry = this.config.tokenExpiry ?? 3600;
    const accessToken = this.generateToken(
      {
        sub: userId,
        email: (user as Record<string, unknown>)['email'] as string,
        roles: (user as Record<string, unknown>)['roles'] as string[],
        tokenType: 'access',
      },
      accessTokenExpiry,
    );

    const newRefreshToken = this.generateToken(
      { sub: userId, tokenType: 'refresh' },
      this.config.refreshTokenExpiry ?? 604800,
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: accessTokenExpiry,
    };
  }

  // Logout - invalidate session
  async logout(token: string): Promise<void> {
    const verification = this.verifyToken(token);
    if (!verification.valid) return;

    const userId = verification.payload?.sub;
    if (!userId) return;

    if (this.config.sessionNodeLabel) {
      await this.client.delete<Record<string, unknown>>(this.config.sessionNodeLabel, {
        where: { userId: { eq: userId }, token: { eq: token } } as any,
      });
    }
  }

  // Get current user from token
  async getCurrentUser(token: string): Promise<User | null> {
    const verification = this.verifyToken(token);
    if (!verification.valid || !verification.payload) return null;

    const payload = verification.payload;
    const userId = payload.sub;
    const user = await this.client.findUnique<Record<string, unknown>>(this.config.userNodeLabel, {
      where: { id: { eq: userId } } as any,
    });

    return user as unknown as User | null;
  }

  // Role-based access control
  hasRole(user: User, role: string): boolean {
    return user.roles.includes(role);
  }

  hasAnyRole(user: User, roles: string[]): boolean {
    return roles.some((r) => user.roles.includes(r));
  }

  hasAllRoles(user: User, roles: string[]): boolean {
    return roles.every((r) => user.roles.includes(r));
  }

  // Permission-based access control
  hasPermission(user: User, permission: string): boolean {
    return user.permissions.includes(permission);
  }

  hasAnyPermission(user: User, permissions: string[]): boolean {
    return permissions.some((p) => user.permissions.includes(p));
  }

  hasAllPermissions(user: User, permissions: string[]): boolean {
    return permissions.every((p) => user.permissions.includes(p));
  }

  // Resource-based authorization
  async canAccess(
    user: User,
    resourceLabel: string,
    action: 'read' | 'write' | 'delete',
    resourceId?: string,
    ownershipField = 'userId',
  ): Promise<PermissionCheck> {
    // Check if user has admin role
    if (this.hasRole(user, 'admin')) {
      return { allowed: true };
    }

    // Check if user owns the resource
    if (resourceId) {
      const resource = await this.client.findUnique(resourceLabel, {
        where: { id: { eq: resourceId } } as any,
      });

      if (resource) {
        const ownerId = (resource as Record<string, unknown>)[ownershipField] as string;
        if (ownerId === user.id) {
          return { allowed: true };
        }
      }
    }

    // Check permissions
    const permission = `${resourceLabel.toLowerCase()}:${action}`;
    if (this.hasPermission(user, permission)) {
      return { allowed: true };
    }

    return { allowed: false, reason: 'Insufficient permissions' };
  }

  // Middleware helper for Express/Fastify
  createAuthMiddleware() {
    return async (request: {
      headers: Record<string, string | undefined>;
    }): Promise<User | null> => {
      const authHeader = request.headers['authorization'];
      if (!authHeader?.startsWith('Bearer ')) return null;

      const token = authHeader.slice(7);
      return this.getCurrentUser(token);
    };
  }

  // Policy-based authorization
  definePolicy(
    name: string,
    check: (user: User, context: Record<string, unknown>) => boolean,
  ): void {
    // Store policy for later use
    (this as any)[`policy_${name}`] = check;
  }

  checkPolicy(name: string, user: User, context: Record<string, unknown>): boolean {
    const policy = (this as any)[`policy_${name}`];
    if (!policy) return false;
    return policy(user, context);
  }
}

export function createAuthManager(config: AuthConfig, tokenSecret: string): AuthManager {
  return new AuthManager(config, tokenSecret);
}

// RBAC helpers
export const Roles = {
  ADMIN: 'admin',
  USER: 'user',
  MODERATOR: 'moderator',
  GUEST: 'guest',
};

export const Permissions = {
  // User permissions
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
  USER_DELETE: 'user:delete',
  USER_LIST: 'user:list',

  // Post permissions
  POST_READ: 'post:read',
  POST_WRITE: 'post:write',
  POST_DELETE: 'post:delete',
  POST_LIST: 'post:list',
  POST_PUBLISH: 'post:publish',

  // Comment permissions
  COMMENT_READ: 'comment:read',
  COMMENT_WRITE: 'comment:write',
  COMMENT_DELETE: 'comment:delete',

  // Admin permissions
  ADMIN_USERS: 'admin:users',
  ADMIN_SETTINGS: 'admin:settings',
  ADMIN_ANALYTICS: 'admin:analytics',
};

export function createRolePermissionsMap(): Record<string, string[]> {
  return {
    [Roles.ADMIN]: Object.values(Permissions),
    [Roles.MODERATOR]: [
      Permissions.USER_READ,
      Permissions.USER_LIST,
      Permissions.POST_READ,
      Permissions.POST_WRITE,
      Permissions.POST_DELETE,
      Permissions.POST_PUBLISH,
      Permissions.COMMENT_READ,
      Permissions.COMMENT_WRITE,
      Permissions.COMMENT_DELETE,
    ],
    [Roles.USER]: [
      Permissions.USER_READ,
      Permissions.POST_READ,
      Permissions.POST_WRITE,
      Permissions.COMMENT_READ,
      Permissions.COMMENT_WRITE,
    ],
    [Roles.GUEST]: [Permissions.POST_READ],
  };
}

// Higher-order function for protecting resolvers/handlers
export function requireAuth(
  authManager: AuthManager,
  handler: (user: User, ...args: unknown[]) => Promise<unknown>,
) {
  return async (token: string, ...args: unknown[]) => {
    const user = await authManager.getCurrentUser(token);
    if (!user) {
      throw new Error('Authentication required');
    }
    return handler(user, ...args);
  };
}

export function requireRole(
  authManager: AuthManager,
  role: string,
  handler: (user: User, ...args: unknown[]) => Promise<unknown>,
) {
  return async (token: string, ...args: unknown[]) => {
    const user = await authManager.getCurrentUser(token);
    if (!user) {
      throw new Error('Authentication required');
    }
    if (!authManager.hasRole(user, role)) {
      throw new Error(`Role '${role}' required`);
    }
    return handler(user, ...args);
  };
}

export function requirePermission(
  authManager: AuthManager,
  permission: string,
  handler: (user: User, ...args: unknown[]) => Promise<unknown>,
) {
  return async (token: string, ...args: unknown[]) => {
    const user = await authManager.getCurrentUser(token);
    if (!user) {
      throw new Error('Authentication required');
    }
    if (!authManager.hasPermission(user, permission)) {
      throw new Error(`Permission '${permission}' required`);
    }
    return handler(user, ...args);
  };
}
