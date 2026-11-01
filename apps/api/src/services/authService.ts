import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { PrismaClient, User } from "@prisma/client";

export type AppRole = "admin" | "user";

export interface AuthUser {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: AppRole;
}

type TokenPayload = {
  sub: string;
  role: AppRole;
  ver: number;
  iat: number;
  exp: number;
};

export class AuthenticationError extends Error {}

export function normalizeRole(role: string): AppRole {
  return role === "admin" ? "admin" : "user";
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, expectedHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicUser(user: User): AuthUser {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone ?? undefined,
    email: user.email ?? undefined,
    role: normalizeRole(user.role)
  };
}

export class AuthService {
  private readonly secret: string;

  constructor(private readonly prisma: PrismaClient) {
    const secret = process.env.AUTH_SECRET?.trim();
    if (!secret || secret.length < 32) {
      throw new Error("AUTH_SECRET 缺失或过短，请先运行 npm run auth:init。");
    }
    this.secret = secret;
  }

  async register(data: {
    name: string;
    identifier: string;
    password: string;
    role?: AppRole;
    adminCode?: string;
  }) {
    const name = data.name.trim();
    if (!name) {
      throw new AuthenticationError("姓名或昵称不能为空。");
    }
    const rawIdentifier = data.identifier.trim();
    if (!rawIdentifier) {
      throw new AuthenticationError("邮箱或手机号不能为空。");
    }
    if (data.password.length < 8) {
      throw new AuthenticationError("密码长度至少为8位。");
    }

    const isEmail = rawIdentifier.includes("@");
    const email = isEmail ? rawIdentifier.toLowerCase() : null;
    const phone = !isEmail ? rawIdentifier : null;

    if (isEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(rawIdentifier)) {
        throw new AuthenticationError("请输入有效的邮箱地址。");
      }
    } else {
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (!phoneRegex.test(rawIdentifier)) {
        throw new AuthenticationError("请输入有效的11位手机号码（或提供邮箱地址）。");
      }
    }

    const targetRole = data.role === "admin" ? "admin" : "user";
    if (targetRole === "admin") {
      // 管理员邀请码必须显式配置；未配置时禁止注册管理员，杜绝硬编码默认值
      const expectedCode = process.env.ADMIN_INVITE_CODE?.trim() ?? "";
      if (!expectedCode || !data.adminCode || data.adminCode.trim() !== expectedCode) {
        throw new AuthenticationError("管理员邀请码未配置或错误，无法注册为管理员。");
      }
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : [])
        ]
      }
    });

    if (existing) {
      throw new AuthenticationError(
        isEmail ? "该邮箱已被注册，请直接登录。" : "该手机号已被注册，请直接登录。"
      );
    }

    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        phone,
        role: targetRole,
        passwordHash: hashPassword(data.password)
      }
    });

    const authUser = publicUser(user);
    return { token: this.createToken(authUser, user.updatedAt.getTime()), user: authUser };
  }

  async login(identifier: string, password: string) {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedIdentifier },
          { phone: identifier.trim() }
        ]
      }
    });
    if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
      throw new AuthenticationError("账号或密码错误。");
    }
    const authUser = publicUser(user);
    return { token: this.createToken(authUser, user.updatedAt.getTime()), user: authUser };
  }

  async resolveToken(token: string): Promise<AuthUser> {
    const payload = this.verifyToken(token);
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new AuthenticationError("登录账号不存在。");
    if (payload.ver !== user.updatedAt.getTime()) {
      throw new AuthenticationError("账号信息已更新，请重新登录。");
    }
    return publicUser(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !verifyPassword(currentPassword, user.passwordHash)) {
      throw new AuthenticationError("当前密码不正确。");
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashPassword(newPassword) }
    });
  }

  private createToken(user: AuthUser, version: number) {
    const now = Math.floor(Date.now() / 1000);
    const payload: TokenPayload = {
      sub: user.id,
      role: user.role,
      ver: version,
      iat: now,
      exp: now + 8 * 60 * 60
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encoded}.${this.sign(encoded)}`;
  }

  private verifyToken(token: string): TokenPayload {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) throw new AuthenticationError("登录凭证格式无效。");
    const expected = Buffer.from(this.sign(encoded));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new AuthenticationError("登录凭证签名无效。");
    }
    try {
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
      if (!payload.sub || payload.exp <= Math.floor(Date.now() / 1000)) {
        throw new AuthenticationError("登录已过期，请重新登录。");
      }
      return payload;
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError("登录凭证内容无效。");
    }
  }

  private sign(value: string) {
    return createHmac("sha256", this.secret).update(value).digest("base64url");
  }
}
