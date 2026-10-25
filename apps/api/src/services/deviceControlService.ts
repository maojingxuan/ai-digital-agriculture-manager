import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuthUser } from "./authService.js";

const commandByDeviceType: Record<string, string[]> = {
  ventilation: ["open_ventilation", "close_ventilation"],
  irrigation: ["open_irrigation", "close_irrigation"],
  lighting: ["open_lighting", "close_lighting"]
};

export class DeviceControlService {
  constructor(private readonly prisma: PrismaClient) {}

  listDevices() {
    return this.prisma.device.findMany({
      include: { greenhouse: { select: { id: true, name: true } } },
      orderBy: [{ greenhouse: { name: "asc" } }, { name: "asc" }]
    });
  }

  listCommands(limit = 50) {
    return this.prisma.deviceCommand.findMany({
      include: {
        device: { include: { greenhouse: { select: { id: true, name: true } } } },
        operatorUser: { select: { id: true, name: true, role: true } }
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200)
    });
  }

  async execute(input: {
    deviceId: string;
    command: string;
    parameters?: Prisma.InputJsonObject;
    confirmExecution: boolean;
    operator: AuthUser;
  }) {
    if (input.operator.role !== "admin") throw new Error("该操作仅限管理员。");
    if (!input.confirmExecution) throw new Error("设备控制需要明确确认后才能执行。");
    const device = await this.prisma.device.findUnique({
      where: { id: input.deviceId },
      include: { greenhouse: { select: { id: true, name: true } } }
    });
    if (!device) throw new Error("未找到指定设备。");
    const allowedCommands = commandByDeviceType[device.deviceType] ?? [];
    if (!allowedCommands.includes(input.command)) {
      throw new Error("该命令与设备类型不匹配，已拒绝执行。");
    }
    return this.prisma.deviceCommand.create({
      data: {
        deviceId: device.id,
        operatorUserId: input.operator.id,
        command: input.command,
        parameters: {
          source: "admin_console",
          ...(input.parameters ?? {})
        },
        operator: input.operator.name,
        executionStatus: "success",
        executedAt: new Date()
      },
      include: { device: { include: { greenhouse: true } } }
    });
  }
}
