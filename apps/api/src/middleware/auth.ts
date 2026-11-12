import type { NextFunction, Request, Response } from "express";
import type { AuthService, AuthUser } from "../services/authService.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

export function createAuthenticate(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authorization = req.header("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) {
      res.status(401).json({ message: "请先登录后再访问。" });
      return;
    }
    try {
      req.auth = await authService.resolveToken(token);
      next();
    } catch (error) {
      res.status(401).json({ message: error instanceof Error ? error.message : "登录凭证无效。" });
    }
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ message: "该操作仅限管理员。" });
    return;
  }
  next();
}
