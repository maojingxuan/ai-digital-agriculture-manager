import assert from "node:assert/strict";
import { ProductCopyService } from "../dist/services/productCopyService.js";

const input = {
  name: "鲜食玉米",
  category: "谷物",
  origin: "示范基地A区",
  cultivationMethod: "设施栽培"
};
let capturedMessages;
const service = new ProductCopyService({
  isConfigured: () => true,
  chat: async (messages) => {
    capturedMessages = messages;
    return '```json\n{"description":"这批鲜食玉米来自示范基地A区，采用设施栽培，适合用于展示产地与种植方式。","avatarScript":"大家好，我是数字农业管家。今天介绍来自示范基地A区的鲜食玉米，采用设施栽培。"}\n```';
  }
});

const copy = await service.generate(input);
assert.match(copy.description, /鲜食玉米/);
assert.match(copy.avatarScript, /示范基地A区/);
assert.equal(JSON.parse(capturedMessages[1].content).origin, input.origin);

let attempts = 0;
const retryService = new ProductCopyService({
  isConfigured: () => true,
  chat: async () => {
    attempts++;
    return attempts === 1
      ? '{"description":"保证每一颗都饱满鲜嫩","avatarScript":"保证品质稳定"}'
      : '{"description":"鲜食玉米来自示范基地A区，采用设施栽培。","avatarScript":"大家好，我是数字农业管家。今天介绍来自示范基地A区的鲜食玉米。"}';
  }
});
assert.match((await retryService.generate(input)).description, /示范基地A区/);
assert.equal(attempts, 2);

const groundedCopy = await new ProductCopyService({
    isConfigured: () => true,
    chat: async () => '{"description":"鲜食玉米来自示范基地A区，成熟期采摘。","avatarScript":"大家好，介绍鲜食玉米，采摘时间为成熟期。"}'
  }).generate(input);
assert.doesNotMatch(`${groundedCopy.description} ${groundedCopy.avatarScript}`, /成熟期|采摘/);
assert.match(groundedCopy.description, /示范基地A区/);

await assert.rejects(
  new ProductCopyService({ isConfigured: () => false }).generate(input),
  /未配置/
);
await assert.rejects(
  new ProductCopyService({ isConfigured: () => true, chat: async () => "无效输出" }).generate(input),
  /格式无效/
);
console.log("Product copy model generation and failure handling passed");
