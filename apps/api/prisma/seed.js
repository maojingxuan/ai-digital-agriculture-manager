import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();
const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@123456";
const userPassword = process.env.SEED_USER_PASSWORD || "User@123456";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

async function ensureAuthUsers() {
  const admin = await prisma.user.findFirst({
    where: { OR: [{ email: "farmer@example.com" }, { role: "admin" }] },
    orderBy: { createdAt: "asc" }
  }) ?? await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!admin) return;

  await prisma.user.update({
    where: { id: admin.id },
    data: {
      role: "admin",
      passwordHash: admin.passwordHash || hashPassword(adminPassword)
    }
  });

  const regularUser = await prisma.user.findUnique({ where: { email: "user@example.com" } });
  if (!regularUser) {
    await prisma.user.create({
      data: {
        name: "示范普通用户",
        phone: "13900000000",
        email: "user@example.com",
        role: "user",
        passwordHash: hashPassword(userPassword)
      }
    });
  } else if (!regularUser.passwordHash || regularUser.role !== "user") {
    await prisma.user.update({
      where: { id: regularUser.id },
      data: {
        role: "user",
        passwordHash: regularUser.passwordHash || hashPassword(userPassword)
      }
    });
  }
}
const embeddingSize = 96;
const agricultureLexicon = [
  "玉米",
  "叶片",
  "黄褐色",
  "斑点",
  "病斑",
  "大斑病",
  "小斑病",
  "灰斑病",
  "锈病",
  "虫害",
  "玉米螟",
  "蚜虫",
  "草地贪夜蛾",
  "粘虫",
  "温度",
  "湿度",
  "通风",
  "灌溉",
  "土壤",
  "光照",
  "玉米田",
  "水肥",
  "农药",
  "施药",
  "安全",
  "采收",
  "溯源"
];

function hashToken(token) {
  let hash = 2166136261;
  for (const char of token) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function createEmbedding(text) {
  const vector = Array.from({ length: embeddingSize }, () => 0);
  const normalized = text.toLowerCase();
  const tokens = normalized.match(/[a-z0-9]+|[\u4e00-\u9fa5]{1,4}/g) ?? [];
  const lexiconHits = agricultureLexicon.filter((keyword) => normalized.includes(keyword.toLowerCase()));

  for (const token of [...tokens, ...lexiconHits, ...lexiconHits]) {
    vector[hashToken(token) % embeddingSize] += 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

function splitText(content, maxLength = 520) {
  const paragraphs = content
    .split(/\n{2,}|(?<=[。！？；])/)
    .map((item) => item.trim())
    .filter(Boolean);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (`${current}${paragraph}`.length > maxLength && current) {
      chunks.push(current.trim());
      current = "";
    }
    current = `${current}${current ? "\n" : ""}${paragraph}`;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function tokenCount(content) {
  const chineseChars = content.match(/[\u4e00-\u9fa5]/g)?.length ?? 0;
  const words = content.match(/[a-zA-Z0-9]+/g)?.length ?? 0;
  return Math.ceil(chineseChars * 0.7 + words);
}

async function seedKnowledgeDocument({ title, category, content }) {
  const chunks = splitText(content);
  await prisma.knowledgeDocument.create({
    data: {
      title,
      category,
      sourceType: "seed",
      contentHash: hashToken(content).toString(),
      metadata: {
        version: "mvp",
        createdBy: "seed"
      },
      chunks: {
        create: chunks.map((chunk, index) => ({
          chunkIndex: index,
          title: `${title} #${index + 1}`,
          content: chunk,
          tokenCount: tokenCount(chunk),
          embedding: createEmbedding(`${title}\n${category}\n${chunk}`)
        }))
      }
    }
  });
}

async function main() {
  const forceReset = process.argv.includes("--force");
  const counts = await prisma.$transaction([
    prisma.user.count(),
    prisma.greenhouse.count(),
    prisma.sensor.count(),
    prisma.sensorData.count(),
    prisma.crop.count(),
    prisma.diseaseDiagnosis.count(),
    prisma.patrolRecord.count(),
    prisma.warning.count(),
    prisma.product.count(),
    prisma.productTrace.count(),
    prisma.device.count(),
    prisma.deviceCommand.count(),
    prisma.agentConversation.count(),
    prisma.agentActionLog.count(),
    prisma.knowledgeDocument.count(),
    prisma.knowledgeChunk.count(),
    prisma.knowledgeRetrievalLog.count()
  ]);
  const existingRecords = counts.reduce((sum, count) => sum + count, 0);

  if (existingRecords > 0 && !forceReset) {
    await ensureAuthUsers();
    console.log(`Database already contains ${existingRecords} records. Seed skipped to protect existing data.`);
    console.log("Login accounts and roles are ready; existing business data was not changed.");
    console.log("Run `npm run db:seed:reset` only when you intentionally want to replace all local data.");
    return;
  }

  if (forceReset && existingRecords > 0) {
    console.log(`Resetting ${existingRecords} existing records before creating demo data.`);
  }

  await prisma.knowledgeRetrievalLog.deleteMany();
  await prisma.knowledgeChunk.deleteMany();
  await prisma.knowledgeDocument.deleteMany();
  await prisma.agentActionLog.deleteMany();
  await prisma.agentConversation.deleteMany();
  await prisma.deviceCommand.deleteMany();
  await prisma.device.deleteMany();
  await prisma.productTrace.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warning.deleteMany();
  await prisma.patrolRecord.deleteMany();
  await prisma.diseaseDiagnosis.deleteMany();
  await prisma.sensorData.deleteMany();
  await prisma.sensor.deleteMany();
  await prisma.crop.deleteMany();
  await prisma.greenhouse.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: {
      name: "示范农场管理员",
      phone: "13800000000",
      email: "farmer@example.com",
      passwordHash: hashPassword(adminPassword),
      role: "admin"
    }
  });

  await prisma.user.create({
    data: {
      name: "示范普通用户",
      phone: "13900000000",
      email: "user@example.com",
      passwordHash: hashPassword(userPassword),
      role: "user"
    }
  });

  const greenhouse = await prisma.greenhouse.create({
    data: {
      name: "1号玉米示范田",
      location: "智慧农业示范基地A区",
      area: 960,
      ownerId: user.id
    }
  });

  const nursery = await prisma.greenhouse.create({
    data: {
      name: "2号玉米制种田",
      location: "智慧农业示范基地B区",
      area: 680,
      ownerId: user.id
    }
  });

  const sensorDefinitions = [
    ["temperature", "空气温度传感器", "℃"],
    ["humidity", "空气湿度传感器", "%"],
    ["soil_moisture", "土壤湿度传感器", "%"],
    ["light", "光照传感器", "lux"],
    ["co2", "CO2传感器", "ppm"],
    ["water_level", "水箱水位传感器", "%"]
  ];

  await prisma.sensor.createMany({
    data: [greenhouse, nursery].flatMap((item) =>
      sensorDefinitions.map(([sensorType, name, unit]) => ({
        greenhouseId: item.id,
        name,
        sensorType,
        unit,
        status: "online",
        installedAt: new Date("2026-09-01T08:00:00.000Z")
      }))
    )
  });

  const baseTime = new Date("2026-09-07T00:00:00.000Z");
  const sensorRows = [greenhouse, nursery].flatMap((item, greenhouseIndex) => Array.from({ length: 24 }).flatMap((_, index) => {
    const timestamp = new Date(baseTime.getTime() + index * 60 * 60 * 1000);
    const daytime = Math.max(0, Math.sin(((index - 6) / 12) * Math.PI));
    const offset = greenhouseIndex === 0 ? 0 : -1.5;

    return [
      {
        greenhouseId: item.id,
        sensorType: "temperature",
        value: 19 + daytime * 11 + offset,
        unit: "℃",
        timestamp
      },
      {
        greenhouseId: item.id,
        sensorType: "humidity",
        value: 82 - daytime * 18 + greenhouseIndex * 4,
        unit: "%",
        timestamp
      },
      {
        greenhouseId: item.id,
        sensorType: "soil_moisture",
        value: 46 - daytime * 5 + (index % 5),
        unit: "%",
        timestamp
      },
      {
        greenhouseId: item.id,
        sensorType: "light",
        value: daytime > 0 ? 4200 + daytime * 48000 : 450,
        unit: "lux",
        timestamp
      },
      {
        greenhouseId: item.id,
        sensorType: "co2",
        value: 440 + (1 - daytime) * 150 + greenhouseIndex * 30,
        unit: "ppm",
        timestamp
      },
      {
        greenhouseId: item.id,
        sensorType: "water_level",
        value: 76 - index * 0.8 - greenhouseIndex * 4,
        unit: "%",
        timestamp
      }
    ];
  }));

  await prisma.sensorData.createMany({ data: sensorRows });

  const crop = await prisma.crop.create({
    data: {
      greenhouseId: greenhouse.id,
      name: "玉米",
      variety: "鲜食玉米（甜糯 619）",
      growthStage: "抽雄吐丝期",
      plantedAt: new Date("2026-07-20T00:00:00.000Z"),
      expectedHarvestAt: new Date("2026-10-05T00:00:00.000Z"),
      status: "growing"
    }
  });

  const diagnosis = await prisma.diseaseDiagnosis.create({
    data: {
      userId: user.id,
      cropId: crop.id,
      cropType: "玉米",
      imageUrl: "/uploads/demo-corn-leaf.jpg",
      symptomDescription: "下部叶片出现灰褐色梭形病斑，局部发黄。",
      suspectedDisease: "疑似玉米大斑病",
      confidence: 0.82,
      riskLevel: "medium",
      analysis: "叶片病斑与湿度偏高环境共同出现，需要关注病害扩散风险。",
      suggestion: "建议加强田间通风降湿，清除下部病叶，并安排农技人员复核。",
      reviewRequired: true
    }
  });

  const patrol = await prisma.patrolRecord.create({
    data: {
      userId: user.id,
      greenhouseId: greenhouse.id,
      cropId: crop.id,
      plotName: "1号玉米示范田",
      cropName: "玉米",
      imageUrl: "/uploads/demo-greenhouse.jpg",
      growthStatus: "整体长势稳定",
      anomalies: ["局部叶色偏浅", "下部叶片出现灰褐色病斑"],
      environmentRisk: "空气湿度偏高时可能增加叶斑类病害风险。",
      suggestion: "建议雨后及时排水降湿，并复查异常植株。",
      conclusion: "当前地块整体可控，建议重点关注叶片病斑区域。"
    }
  });

  await prisma.warning.create({
    data: {
      userId: user.id,
      greenhouseId: greenhouse.id,
      diagnosisId: diagnosis.id,
      patrolRecordId: patrol.id,
      warningType: "disease_risk",
      level: "medium",
      title: "玉米叶部病害风险",
      content: "AI问诊与巡田记录均发现叶部异常，建议尽快复核。",
      status: "open"
    }
  });

  const product = await prisma.product.create({
    data: {
      ownerId: user.id,
      cropId: crop.id,
      name: "智慧田鲜食玉米",
      category: "粮食",
      imageUrl: "/uploads/demo-product-corn.jpg",
      origin: "智慧农业示范基地A区",
      specification: "5穗装",
      price: 29.9,
      harvestTime: new Date("2026-09-07T06:00:00.000Z"),
      cultivationMethod: "旱作绿色栽培",
      description: "来自智慧田的鲜食玉米，穗大粒饱，溯源记录完整。",
      avatarScript: "大家好，我是AI数字农业管家。现在为你介绍智慧田鲜食玉米，它来自示范基地A区，采摘新鲜，品质稳定。",
      status: "active"
    }
  });

  await prisma.productTrace.createMany({
    data: [
      {
        productId: product.id,
        traceType: "planting",
        title: "播种记录",
        content: "2026年7月20日完成玉米播种。",
        occurredAt: new Date("2026-07-20T00:00:00.000Z")
      },
      {
        productId: product.id,
        traceType: "harvest",
        title: "采摘记录",
        content: "2026年9月7日清晨完成首批采摘。",
        occurredAt: new Date("2026-09-07T06:00:00.000Z")
      }
    ]
  });

  const devices = await Promise.all(
    [greenhouse, nursery].flatMap((item) => [
      prisma.device.create({
        data: {
          greenhouseId: item.id,
          name: `${item.name}风机`,
          deviceType: "ventilation",
          status: "online",
          lastOnlineAt: new Date("2026-09-07T08:30:00.000Z")
        }
      }),
      prisma.device.create({
        data: {
          greenhouseId: item.id,
          name: `${item.name}水泵`,
          deviceType: "irrigation",
          status: "online",
          lastOnlineAt: new Date("2026-09-07T08:30:00.000Z")
        }
      }),
      prisma.device.create({
        data: {
          greenhouseId: item.id,
          name: `${item.name}补光灯`,
          deviceType: "lighting",
          status: "online",
          lastOnlineAt: new Date("2026-09-07T08:30:00.000Z")
        }
      })
    ])
  );

  const command = await prisma.deviceCommand.create({
    data: {
      deviceId: devices[0].id,
      operatorUserId: user.id,
      command: "open_ventilation",
      parameters: {
        durationMinutes: 20,
        level: "medium"
      },
      operator: user.name,
      executionStatus: "success",
      executedAt: new Date("2026-09-07T08:35:00.000Z")
    }
  });

  const conversation = await prisma.agentConversation.create({
    data: {
      userId: user.id,
      title: "今日大棚湿度咨询",
      channel: "web"
    }
  });

  await prisma.agentActionLog.create({
    data: {
      userId: user.id,
      conversationId: conversation.id,
      diagnosisId: diagnosis.id,
      patrolRecordId: patrol.id,
      deviceCommandId: command.id,
      userRequest: "今天大棚湿度偏高需要怎么处理？",
      agentReasoning: "用户询问环境处理建议。Agent查询最新湿度数据，并结合问诊与巡田中的叶部异常记录，判断需要通风降湿和人工复核。",
      toolName: "agriculture_data.query_latest",
      toolParameters: {
        greenhouseId: greenhouse.id,
        sensorTypes: ["humidity", "temperature", "soil_moisture"]
      },
      toolResult: {
        humidity: 78,
        temperature: 29,
        soilMoisture: 42,
        relatedDiagnosisId: diagnosis.id,
        relatedPatrolRecordId: patrol.id
      },
      finalReply: "当前大棚湿度偏高，且近期有叶片斑点记录。建议先通风20分钟，降低叶面湿度，并复查异常植株。",
      executionStatus: "success"
    }
  });

  await seedKnowledgeDocument({
    title: "玉米常见叶部病害识别与检查",
    category: "病虫害知识",
    content: [
      "玉米叶片出现黄褐色或灰褐色病斑时，应先检查病斑形态、发生部位和扩展速度。大斑病常见梭形、灰褐色大型病斑，小斑病常表现为较小的椭圆形病斑，湿度较高时病斑可能扩大。",
      "检查时要观察叶片正反面、下部老叶、叶缘和叶脉附近，记录是否有霉层、穿孔、黄化晕圈，是否多株同时发生。",
      "还需要结合田间空气湿度、夜间结露、通风排涝情况和近期浇水方式判断。湿度持续偏高、通风不良和叶面长时间潮湿，会提高叶部病害风险。",
      "如果疑似病害扩散，应先清除严重病株底叶，并请当地农技人员复核。涉及农药和施药方案时，应严格遵循产品标签、当地植保建议和安全间隔期。"
    ].join("\n\n")
  });

  await seedKnowledgeDocument({
    title: "大棚温湿度管理基础",
    category: "温湿度管理",
    content: [
      "设施大棚温湿度管理应结合昼夜变化。白天温度上升时需要关注通风、遮阳和光照，夜间温度下降时要关注保温和结露。",
      "空气湿度过高容易增加灰霉病、霜霉病、叶斑类病害风险。连续高湿时，应优先检查通风口、棚膜滴水、地表积水和叶面湿润时间。",
      "湿度偏低时，要结合土壤墒情和作物萎蔫程度判断，不宜只看空气湿度单项指标。"
    ].join("\n\n")
  });

  await seedKnowledgeDocument({
    title: "灌溉与土壤湿度管理",
    category: "灌溉知识",
    content: [
      "灌溉决策应综合土壤湿度、天气、作物生育期和根系状态。土壤湿度偏低时可以安排小水勤浇，避免忽干忽湿。",
      "叶部病害高发期不宜在傍晚大量喷淋，避免夜间叶面长时间潮湿。大棚作物更推荐结合滴灌或膜下灌溉减少空气湿度波动。",
      "灌溉后要观察排水和根区透气情况，土壤长期过湿可能诱发根系问题。"
    ].join("\n\n")
  });

  await seedKnowledgeDocument({
    title: "常见虫害巡查要点",
    category: "常见虫害",
    content: [
      "玉米田常见虫害包括玉米螟、蚜虫、草地贪夜蛾和粘虫。巡查时应重点查看心叶、叶片背面、雄穗和雌穗，以及茎秆蛀孔和排粪情况。",
      "虫害常伴随叶片孔洞、窗纸状透斑、叶缘缺刻、茎秆蛀孔或果穗虫粪。发现虫口密度上升时，应结合物理诱捕、生物防治和当地植保建议处理。",
      "涉及药剂防治时必须注意轮换用药、防护和安全间隔期，避免残留风险。"
    ].join("\n\n")
  });

  await seedKnowledgeDocument({
    title: "农产品品质与溯源信息",
    category: "农产品知识",
    content: [
      "农产品介绍应准确表达产地、采摘时间、种植方式、检测信息和溯源记录，不应夸大功效。",
      "溯源信息可包含定植记录、农事操作、采收批次、检测报告、仓储和运输信息。对消费者展示时，应强调真实、可查和批次一致。",
      "数字人介绍农产品时，应使用清晰可信的表达，避免医疗功效、绝对化承诺和无法验证的品质描述。"
    ].join("\n\n")
  });

  await seedKnowledgeDocument({
    title: "设施大棚日常管理",
    category: "大棚管理知识",
    content: [
      "大棚日常管理包括通风、保温、遮阳、补光、水肥、病虫害巡查和设备巡检。每日应记录温度、湿度、土壤湿度、光照、CO2和水箱水位等关键指标。",
      "发现传感器异常时，应先检查设备供电、网络状态、安装位置和探头污染情况，再判断是否为真实环境异常。",
      "AI系统给出的建议应作为辅助判断，关键农事操作仍需结合现场观察和农技规范。"
    ].join("\n\n")
  });

  console.log("Seed data created.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
