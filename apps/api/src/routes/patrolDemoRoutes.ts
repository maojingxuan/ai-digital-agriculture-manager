import type { Express, Request, Response } from "express";
import { z } from "zod";
import { getGreenhouses } from "../services/sensorSimulator.js";
import { DemoError, PatrolDemoService } from "../services/patrolDemoService.js";

export function registerPatrolDemoRoutes(
  app: Express,
  service: PatrolDemoService,
) {
  const ready = service.recover().then(
    () => null,
    (error: unknown) => error,
  );
  // Every route remains behind the existing /api authentication middleware.
  const wrap =
    (handler: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response) => {
      try {
        const startupError = await ready;
        if (startupError)
          throw new DemoError(
            "巡田存储尚未就绪，请检查数据库迁移（npm run db:migrate）。",
            503,
          );
        await handler(req, res);
      } catch (error) {
        res
          .status(error instanceof DemoError ? error.statusCode : 500)
          .json({
            message:
              error instanceof Error ? error.message : "仿真巡田服务不可用。",
          });
      }
    };
  app.get(
    "/api/patrol-demo/greenhouses",
    wrap(async (_req, res) => {
      res.json(getGreenhouses());
    }),
  );
  app.get(
    "/api/patrol-demo/current",
    wrap(async (req, res) => {
      res.json(await service.current(req.auth!));
    }),
  );
  app.get(
    "/api/patrol-demo/runs/:id",
    wrap(async (req, res) => {
      res.json(await service.get(String(req.params.id), req.auth!));
    }),
  );
  app.post(
    "/api/patrol-demo/runs",
    wrap(async (req, res) => {
      const parsed = z
        .object({
          greenhouseId: z.string().min(1, "请选择大棚"),
          threshold: z.number().min(70).max(95),
          requestKey: z
            .string()
            .min(8)
            .max(100)
            .regex(/^[a-zA-Z0-9-]+$/),
        })
        .safeParse(req.body);
      if (!parsed.success)
        throw new DemoError(
          "请选择有效大棚、预警阈值（70～95%）和请求标识。",
          400,
        );
      res.status(201).json(await service.start(parsed.data, req.auth!));
    }),
  );
  app.post(
    "/api/patrol-demo/runs/:id/command",
    wrap(async (req, res) => {
      const parsed = z
        .object({ command: z.enum(["pause", "resume", "cancel", "retry"]) })
        .safeParse(req.body);
      if (!parsed.success) throw new DemoError("无效的巡田操作。", 400);
      res.json(
        await service.command(
          String(req.params.id),
          parsed.data.command,
          req.auth!,
        ),
      );
    }),
  );
  app.post(
    "/api/patrol-demo/runs/:id/review",
    wrap(async (req, res) => {
      if (req.body?.confirmed !== true)
        throw new DemoError("请明确确认已逐项完成人工复核。", 400);
      res.json(await service.resolveReview(String(req.params.id), req.auth!));
    }),
  );
}
