import assert from "node:assert/strict";
import "../dist/config/env.js";
import { PrismaClient } from "@prisma/client";
import { AuthService } from "../dist/services/authService.js";
import { DeviceControlService } from "../dist/services/deviceControlService.js";

const prisma = new PrismaClient();
const rollbackMarker = new Error("AUTH_TEST_ROLLBACK");

async function main() {
  const auth = new AuthService(prisma);
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@123456";
  const userPassword = process.env.SEED_USER_PASSWORD || "User@123456";
  const adminLogin = await auth.login("farmer@example.com", adminPassword);
  const userLogin = await auth.login("user@example.com", userPassword);

  assert.equal(adminLogin.user.role, "admin");
  assert.equal(userLogin.user.role, "user");
  assert.equal((await auth.resolveToken(adminLogin.token)).id, adminLogin.user.id);
  await assert.rejects(auth.login("user@example.com", "WrongPassword!"), /账号或密码错误/);

  const testRegIdentifier = `test_reg_${Date.now()}@example.com`;
  const regResult = await auth.register({
    name: "新注册测试农户",
    identifier: testRegIdentifier,
    password: "TestPassword@123"
  });
  assert.equal(regResult.user.name, "新注册测试农户");
  assert.equal(regResult.user.role, "user");
  assert.ok(regResult.token);
  const regLogin = await auth.login(testRegIdentifier, "TestPassword@123");
  assert.equal(regLogin.user.id, regResult.user.id);
  await assert.rejects(
    auth.register({ name: "重复农户", identifier: testRegIdentifier, password: "TestPassword@123" }),
    /已被注册/
  );
  await prisma.user.delete({ where: { id: regResult.user.id } });

  // Test admin registration with invite code
  const testAdminIdentifier = `test_admin_${Date.now()}@example.com`;
  await assert.rejects(
    auth.register({
      name: "非法管理测试",
      identifier: testAdminIdentifier,
      password: "AdminPassword@123",
      role: "admin",
      adminCode: "WrongCode123"
    }),
    /管理员邀请码错误/
  );
  const adminRegResult = await auth.register({
    name: "新注册管理员",
    identifier: testAdminIdentifier,
    password: "AdminPassword@123",
    role: "admin",
    adminCode: process.env.ADMIN_INVITE_CODE || "admin888"
  });
  assert.equal(adminRegResult.user.role, "admin");
  await prisma.user.delete({ where: { id: adminRegResult.user.id } });

  const beforeCommands = await prisma.deviceCommand.count();
  try {
    await prisma.$transaction(async (transaction) => {
      const devices = new DeviceControlService(transaction);
      const device = (await devices.listDevices())[0];
      assert.ok(device, "A seeded device is required for the authorization test");
      const command = `open_${device.deviceType}`;

      await assert.rejects(
        devices.execute({ deviceId: device.id, command, confirmExecution: true, operator: userLogin.user }),
        /仅限管理员/
      );
      await assert.rejects(
        devices.execute({ deviceId: device.id, command, confirmExecution: false, operator: adminLogin.user }),
        /明确确认/
      );
      const result = await devices.execute({
        deviceId: device.id,
        command,
        confirmExecution: true,
        operator: adminLogin.user
      });
      assert.equal(result.operatorUserId, adminLogin.user.id);
      throw rollbackMarker;
    });
  } catch (error) {
    if (error !== rollbackMarker) throw error;
  }
  assert.equal(await prisma.deviceCommand.count(), beforeCommands, "Authorization test data must roll back");
  console.log("登录、角色权限和设备控制鉴权测试通过，测试命令已回滚。");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
