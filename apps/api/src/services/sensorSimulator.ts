import type {
  AgricultureMetric,
  AgricultureSnapshot,
  DataStatus,
  EnvironmentDashboard,
  GreenhouseStatus,
  GreenhouseSummary,
  SensorAnomaly,
  SensorDataPoint,
  SensorHistorySeries,
  SensorSummary,
  SensorType
} from "@agri/shared";

export const sensorDefinitions: Record<SensorType, { label: string; unit: string; precision: number }> = {
  temperature: { label: "空气温度", unit: "℃", precision: 1 },
  humidity: { label: "空气湿度", unit: "%", precision: 0 },
  soil_moisture: { label: "土壤湿度", unit: "%", precision: 0 },
  light: { label: "光照强度", unit: "lux", precision: 0 },
  co2: { label: "CO2", unit: "ppm", precision: 0 },
  water_level: { label: "水箱水位", unit: "%", precision: 0 }
};

type GreenhouseProfile = {
  id: string;
  name: string;
  location: string;
  area: number;
  offset: number;
  cropBias: number;
};

export const demoGreenhouses: GreenhouseProfile[] = [
  {
    id: "demo-gh-1",
    name: "1号玉米示范田",
    location: "示范基地A区",
    area: 960,
    offset: 0.4,
    cropBias: 1.1
  },
  {
    id: "demo-gh-2",
    name: "2号玉米制种田",
    location: "示范基地B区",
    area: 680,
    offset: -0.8,
    cropBias: 0.7
  }
];

const sensorTypes: SensorType[] = ["temperature", "humidity", "soil_moisture", "light", "co2", "water_level"];

function getProfile(greenhouseId?: string) {
  return demoGreenhouses.find((item) => item.id === greenhouseId) ?? demoGreenhouses[0];
}

function round(value: number, precision: number) {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function wave(input: number, period: number, phase = 0) {
  return Math.sin(((input + phase) / period) * Math.PI * 2);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function anomalyBoost(profile: GreenhouseProfile, type: SensorType, date: Date) {
  const hour = date.getHours();
  const day = Math.floor(date.getTime() / 86_400_000);
  const signature = (day + Math.round(profile.offset * 10) + hour * 3) % 29;

  // 仅 1 号大棚（demo-gh-1）产生模拟异常，形成"1号存在风险 vs 2号环境优秀"的对比
  if (profile.id !== "demo-gh-1") return 0;

  // 周期性模拟异常：每 6 小时一轮，各传感器在不同相位依次触发
  const cycle = (day + Math.round(profile.offset * 10) + hour) % 6;
  if (type === "temperature" && cycle === 1) return 7;
  if (type === "humidity" && cycle === 2) return 16;
  if (type === "soil_moisture" && cycle === 3) return -14;
  if (type === "co2" && cycle === 4) return 430;
  if (type === "water_level" && cycle === 5) return -45;

  // 保留原有偶发异常
  if (signature === 7 && type === "humidity") return 13;
  if (signature === 11 && type === "soil_moisture") return -12;
  if (signature === 17 && type === "co2") return 340;
  if (signature === 23 && type === "water_level") return -22;
  if (signature === 5 && type === "temperature") return 4.5;

  return 0;
}

export function generateSensorValue(greenhouseId: string | undefined, sensorType: SensorType, date = new Date()) {
  const profile = getProfile(greenhouseId);
  const hour = date.getHours() + date.getMinutes() / 60;
  const dayIndex = Math.floor(date.getTime() / 86_400_000);
  const daytime = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const slowWeather = wave(dayIndex + profile.offset, 7) * 1.7;
  const microNoise = wave(date.getTime() / 60000 + profile.offset * 13, 17) * 0.6;
  const anomaly = anomalyBoost(profile, sensorType, date);

  const rawValues: Record<SensorType, number> = {
    temperature: 19.5 + daytime * 10.5 + slowWeather + microNoise + profile.cropBias + anomaly,
    humidity: 83 - daytime * 19 - slowWeather * 2 + wave(hour, 24, 5) * 4 + anomaly,
    soil_moisture: 48 - daytime * 4 + wave(dayIndex * 24 + hour, 36, profile.offset) * 5 + anomaly,
    light: daytime > 0 ? 4500 + daytime * 49000 + slowWeather * 1100 + anomaly * 900 : 1600 + microNoise * 120,
    co2: 430 + (1 - daytime) * 160 + wave(hour, 12, profile.cropBias) * 35 + anomaly,
    water_level: 74 - ((dayIndex * 2 + hour / 12 + profile.cropBias) % 22) + wave(hour, 8) * 2 + anomaly
  };

  const ranges: Record<SensorType, [number, number]> = {
    temperature: [8, 42],
    humidity: [35, 98],
    soil_moisture: [18, 82],
    light: [0, 62000],
    co2: [320, 1150],
    water_level: [8, 100]
  };

  const definition = sensorDefinitions[sensorType];
  const [min, max] = ranges[sensorType];

  // 2号大棚（demo-gh-2）作为"环境优秀"对比示例：各指标稳定在适宜区间
  if (profile.id === "demo-gh-2") {
    const healthyValues: Record<SensorType, number> = {
      temperature: 22 + wave(date.getHours(), 6) * 1.5,
      humidity: 62 + wave(date.getHours(), 12) * 3,
      soil_moisture: 55 + wave(date.getHours(), 8) * 4,
      light: daytime > 0 ? 22000 + wave(date.getHours(), 6) * 3000 : 1800,
      co2: 520 + wave(date.getHours(), 12) * 30,
      water_level: 62 + wave(date.getHours(), 6) * 5
    };
    return round(clamp(healthyValues[sensorType], min, max), definition.precision);
  }

  return round(clamp(rawValues[sensorType], min, max), definition.precision);
}

export function getMetricStatus(sensorType: SensorType, value: number): DataStatus {
  if (sensorType === "temperature") {
    if (value > 33 || value < 14) return "risk";
    if (value > 30) return "high";
    if (value < 18) return "low";
  }

  if (sensorType === "humidity") {
    if (value > 88) return "risk";
    if (value > 78) return "high";
    if (value < 45) return "low";
  }

  if (sensorType === "soil_moisture") {
    if (value < 30) return "risk";
    if (value < 40) return "low";
    if (value > 72) return "high";
  }

  if (sensorType === "light") {
    if (value < 1200) return "low";
    if (value > 58000) return "high";
  }

  if (sensorType === "co2") {
    if (value > 950) return "risk";
    if (value > 800) return "high";
    if (value < 360) return "low";
  }

  if (sensorType === "water_level") {
    if (value < 18) return "risk";
    if (value < 32) return "low";
  }

  return "normal";
}

function suggestion(sensorType: SensorType, status: DataStatus) {
  const suggestions: Record<SensorType, Record<DataStatus, string>> = {
    temperature: {
      normal: "温度处于适宜范围。",
      high: "温度偏高，建议关注通风和遮阳。",
      low: "温度偏低，夜间需关注保温。",
      risk: "温度异常，建议立即复查棚内环境。"
    },
    humidity: {
      normal: "空气湿度稳定。",
      high: "湿度偏高，建议通风降湿。",
      low: "湿度偏低，可结合叶面状态调整喷雾。",
      risk: "湿度过高，病害风险上升。"
    },
    soil_moisture: {
      normal: "土壤湿度适中。",
      high: "土壤偏湿，注意控水和根系透气。",
      low: "土壤湿度偏低，建议安排补水。",
      risk: "土壤缺水明显，建议尽快灌溉。"
    },
    light: {
      normal: "光照条件良好。",
      high: "光照较强，注意作物灼伤风险。",
      low: "光照偏低，可关注补光或遮挡情况。",
      risk: "光照异常，建议检查传感器或棚膜遮挡。"
    },
    co2: {
      normal: "CO2浓度处于合理范围。",
      high: "CO2偏高，建议检查通风状态。",
      low: "CO2偏低，可关注通风强度与作物光合作用。",
      risk: "CO2异常升高，建议立即通风并复查设备。"
    },
    water_level: {
      normal: "水箱水位充足。",
      high: "水位较高，设备状态正常。",
      low: "水箱水位偏低，建议补水。",
      risk: "水箱水位过低，可能影响灌溉任务。"
    }
  };

  return suggestions[sensorType][status];
}

// 生成更详细的 AI 建议：包含当前数值、正常范围、影响与处理动作
function detailedSuggestion(anomaly: SensorAnomaly): string {
  const { sensorType, level, value, unit } = anomaly;
  const v = `${value}${unit}`;

  switch (sensorType) {
    case "temperature":
      if (level === "high" || level === "risk") {
        return `棚内温度当前 ${v}，已高于适宜上限（30℃），易抑制作物光合与生长。建议开启通风、放下遮阳网降温，并在午后高温时段重点观察。`;
      }
      return `棚内温度当前 ${v}，低于适宜下限（18℃），夜间存在冷害风险。建议加强保温覆盖，检查加热/卷帘设备是否正常运行。`;
    case "humidity":
      if (level === "high" || level === "risk") {
        return `空气湿度当前 ${v}，高于适宜上限（78%），易诱发灰霉病等病害。建议加强通风排湿、减少夜间结露，必要时启用除湿设备。`;
      }
      return `空气湿度当前 ${v}，低于适宜下限（45%），作物易失水萎蔫。建议结合叶面状态适度喷雾加湿，并检查灌溉是否均匀。`;
    case "soil_moisture":
      if (level === "low" || level === "risk") {
        return `土壤湿度当前 ${v}，低于适宜下限（40%），作物根系可能缺水。建议安排滴灌补水，并检查滴灌管是否存在堵塞。`;
      }
      return `土壤湿度当前 ${v}，高于适宜上限（72%），易造成根系缺氧、烂根。建议暂停浇水、加强排水与土壤透气。`;
    case "light":
      return `光照强度当前 ${v}，低于适宜下限（1200Lux），可能影响作物光合作用。建议开启补光灯，或检查棚膜是否有遮挡、污损。`;
    case "co2":
      if (level === "high" || level === "risk") {
        return `CO2浓度当前 ${v}，高于适宜上限（800ppm），可能抑制光合作用。建议开启通风换气，检查风机排风设备是否正常运行。`;
      }
      return `CO2浓度当前 ${v}，低于适宜下限（360ppm），光合作用原料不足。建议适度关闭通风，必要时进行CO2补充。`;
    case "water_level":
      if (level === "risk") {
        return `水箱水位当前 ${v}，已处于过低水平（<18%），灌溉系统可能无法正常运行。请立即补水，并排查进水阀门与供水管路是否故障。`;
      }
      return `水箱水位当前 ${v}，低于正常水平（≥32%），可能影响后续灌溉任务。建议尽快补水，并检查供水管路或阀门是否存在渗漏。`;
    default:
      return `${anomaly.label}当前 ${v}，出现异常，建议及时排查并采取相应措施。`;
  }
}

function metricFromValue(greenhouseId: string, sensorType: SensorType, date: Date): AgricultureMetric {
  const value = generateSensorValue(greenhouseId, sensorType, date);
  const previous = generateSensorValue(greenhouseId, sensorType, new Date(date.getTime() - 60 * 60 * 1000));
  const status = getMetricStatus(sensorType, value);
  const definition = sensorDefinitions[sensorType];
  const delta = value - previous;

  return {
    key: sensorType,
    label: definition.label,
    value,
    unit: definition.unit,
    status,
    suggestion: suggestion(sensorType, status),
    trend: Math.abs(delta) < 0.8 ? "stable" : delta > 0 ? "up" : "down",
    timestamp: date.toISOString()
  };
}

export function getGreenhouses(): GreenhouseSummary[] {
  return demoGreenhouses.map((greenhouse) => ({
    id: greenhouse.id,
    name: greenhouse.name,
    location: greenhouse.location,
    area: greenhouse.area,
    status: getComprehensiveStatus(greenhouse.id)
  }));
}

export function getSensors(greenhouseId?: string): SensorSummary[] {
  const greenhouse = getProfile(greenhouseId);
  return sensorTypes.map((sensorType) => ({
    id: `${greenhouse.id}-${sensorType}`,
    greenhouseId: greenhouse.id,
    name: `${sensorDefinitions[sensorType].label}传感器`,
    sensorType,
    unit: sensorDefinitions[sensorType].unit,
    status: "online"
  }));
}

export function getRealtimeSnapshot(greenhouseId?: string, date = new Date()): AgricultureSnapshot {
  const greenhouse = getProfile(greenhouseId);
  const metrics = sensorTypes.map((sensorType) => metricFromValue(greenhouse.id, sensorType, date));
  const anomalies = metrics.filter((metric) => metric.status === "risk" || metric.status === "high" || metric.status === "low");
  const status = getGreenhouseStatus(greenhouse.id, date);
  const summary =
    anomalies.length === 0
      ? "当前大棚环境稳定，各项指标处于适宜区间。"
      : `当前有${anomalies.length}项指标需要关注：${anomalies.map((item) => `${item.label}${item.value}${item.unit}`).join("，")}。`;

  return {
    greenhouseId: greenhouse.id,
    farmName: greenhouse.name,
    updatedAt: date.toISOString(),
    metrics,
    summary,
    status
  };
}

export function getHistory(greenhouseId?: string, hours = 24, intervalMinutes = 60, date = new Date()): SensorHistorySeries[] {
  const greenhouse = getProfile(greenhouseId);
  // 纵深防御：即使绕过路由层直接传参，也把 hours 钳制在 1~720，防止生成超大点数
  const numeric = Number(hours);
  const safeHours = Number.isFinite(numeric) ? Math.min(720, Math.max(1, Math.floor(numeric))) : 24;
  const steps = Math.max(1, Math.floor((safeHours * 60) / intervalMinutes));

  return sensorTypes.map((sensorType) => {
    const definition = sensorDefinitions[sensorType];
    const points: SensorDataPoint[] = Array.from({ length: steps + 1 }).map((_, index) => {
      const timestamp = new Date(date.getTime() - (steps - index) * intervalMinutes * 60 * 1000);
      const value = generateSensorValue(greenhouse.id, sensorType, timestamp);

      return {
        greenhouseId: greenhouse.id,
        sensorType,
        value,
        unit: definition.unit,
        timestamp: timestamp.toISOString(),
        status: getMetricStatus(sensorType, value)
      };
    });

    return {
      sensorType,
      label: definition.label,
      unit: definition.unit,
      points
    };
  });
}

export function getAnomalies(greenhouseId?: string, hours = 24, date = new Date()): SensorAnomaly[] {
  const greenhouse = getProfile(greenhouseId);
  return getHistory(greenhouse.id, hours, 60, date)
    .flatMap((series) =>
      series.points
        .filter((point) => point.status !== "normal")
        .map((point) => ({
          id: `${point.greenhouseId}-${point.sensorType}-${point.timestamp}`,
          greenhouseId: point.greenhouseId,
          greenhouseName: greenhouse.name,
          sensorType: point.sensorType,
          label: series.label,
          value: point.value,
          unit: point.unit,
          level: point.status as Exclude<DataStatus, "normal">,
          message: suggestion(point.sensorType, point.status),
          timestamp: point.timestamp
        }))
    )
    .slice(-12)
    .reverse();
}

export function getGreenhouseStatus(greenhouseId?: string, date = new Date()): GreenhouseStatus {
  const metrics = sensorTypes.map((sensorType) => {
    const value = generateSensorValue(greenhouseId, sensorType, date);
    return getMetricStatus(sensorType, value);
  });

  if (metrics.some((status) => status === "risk")) return "warning";
  if (metrics.some((status) => status !== "normal")) return "attention";
  return "optimal";
}

/**
 * 综合大棚状态：结合近 24 小时异常记录评级，
 * 避免"当前实时正常却显示环境优秀、但同时有历史异常"的矛盾。
 */
export function getComprehensiveStatus(greenhouseId: string, date = new Date()): GreenhouseStatus {
  const anomalies = getAnomalies(greenhouseId, 24, date);
  if (anomalies.some((anomaly) => anomaly.level === "risk")) return "warning";
  if (anomalies.length > 0) return "attention";
  return getGreenhouseStatus(greenhouseId, date);
}

export function getDashboard(greenhouseId?: string, date = new Date()): EnvironmentDashboard {
  const greenhouse = getGreenhouses().find((item) => item.id === getProfile(greenhouseId).id) ?? getGreenhouses()[0];
  const realtime = getRealtimeSnapshot(greenhouse.id, date);
  const anomalies = getAnomalies(greenhouse.id, 24, date);
  const effectiveStatus = getComprehensiveStatus(greenhouse.id, date);
  const nowISO = date.toISOString();
  const baseRecommendations =
    anomalies.length > 0
      ? anomalies.slice(0, 8).map((anomaly) => ({ text: detailedSuggestion(anomaly), time: anomaly.timestamp }))
      : effectiveStatus === "optimal"
        ? [
            { text: "保持当前管理节奏。", time: nowISO },
            { text: "建议继续观察午后温度和光照变化。", time: nowISO }
          ]
        : realtime.metrics.filter((metric) => metric.status !== "normal").map((metric) => ({ text: metric.suggestion, time: nowISO }));

  return {
    greenhouse: { ...greenhouse, status: effectiveStatus },
    realtime: { ...realtime, status: effectiveStatus },
    history: getHistory(greenhouse.id, 24, 60, date),
    anomalies,
    recommendations: Array.from(new Map(baseRecommendations.map((item) => [item.text, item])).values()).slice(0, 5)
  };
}
