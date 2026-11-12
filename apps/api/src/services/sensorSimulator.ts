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
  kind: "corn" | "leafy" | "tomato" | "custom";
};

export const SIMULATION_INTERVAL_MINUTES = 5;
const SIMULATION_INTERVAL_MS = SIMULATION_INTERVAL_MINUTES * 60 * 1000;

export const demoGreenhouses: GreenhouseProfile[] = [
  {
    id: "demo-gh-1",
    name: "1号玉米大棚",
    location: "示范基地A区",
    area: 960,
    offset: 0.4,
    cropBias: 1.1,
    kind: "corn"
  },
  {
    id: "demo-gh-2",
    name: "2号叶菜大棚",
    location: "示范基地B区",
    area: 680,
    offset: -0.8,
    cropBias: 0.7,
    kind: "leafy"
  },
  {
    id: "demo-gh-3",
    name: "3号番茄大棚",
    location: "示范基地C区",
    area: 720,
    offset: 0.2,
    cropBias: 0.9,
    kind: "tomato"
  }
];

const sensorTypes: SensorType[] = ["temperature", "humidity", "soil_moisture", "light", "co2", "water_level"];

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getProfile(greenhouseId?: string): GreenhouseProfile {
  const known = demoGreenhouses.find((item) => item.id === greenhouseId);
  if (known) return known;
  if (!greenhouseId) return demoGreenhouses[0];

  // 自定义大棚不再回退到 1 号棚；由 ID 派生稳定且彼此不同的模拟参数。
  const seed = stableHash(greenhouseId);
  return {
    id: greenhouseId,
    name: "自定义模拟大棚",
    location: "自定义区域",
    area: 0,
    offset: ((seed % 2001) - 1000) / 1000,
    cropBias: 0.45 + ((seed >>> 11) % 90) / 100,
    kind: "custom"
  };
}

function toSimulationTime(date: Date) {
  return new Date(Math.floor(date.getTime() / SIMULATION_INTERVAL_MS) * SIMULATION_INTERVAL_MS);
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

function eventPulse(hour: number, start: number, duration: number) {
  if (hour < start || hour > start + duration) return 0;
  return Math.sin(((hour - start) / duration) * Math.PI);
}

function eventDecay(hour: number, start: number, duration: number) {
  if (hour < start || hour > start + duration) return 0;
  return Math.exp(-2.2 * ((hour - start) / duration));
}

function managementEffects(profile: GreenhouseProfile, date: Date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  const seed = stableHash(profile.id);
  const fiveMinuteShift = (seed % 7) * (5 / 60);
  const morningIrrigation = 6 + fiveMinuteShift;
  const eveningIrrigation = 17.5 + fiveMinuteShift;
  const irrigationPulse = Math.max(
    eventPulse(hour, morningIrrigation, 0.5),
    eventPulse(hour, eveningIrrigation, 0.4) * 0.7
  );
  const soilAfterIrrigation = Math.max(
    eventDecay(hour, morningIrrigation, 4.5),
    eventDecay(hour, eveningIrrigation, 3) * 0.65
  );
  const ventilation = eventPulse(hour, 9.5 + fiveMinuteShift, 7);
  const nightCooling = hour < 6 ? (6 - hour) / 6 : hour >= 19 ? Math.min(1, (hour - 19) / 4) : 0;
  const completedIrrigations =
    (hour >= morningIrrigation ? 5.5 : 0) +
    (hour >= eveningIrrigation ? 3.5 : 0);

  return {
    temperature: -2.2 * ventilation - 2.8 * nightCooling,
    humidity: 4.5 * irrigationPulse - 7.5 * ventilation + 2 * nightCooling,
    soil_moisture: 12 * soilAfterIrrigation,
    light: 0,
    co2: -55 * ventilation + 25 * nightCooling,
    water_level: -completedIrrigations
  } satisfies Record<SensorType, number>;
}

function anomalyBoost(profile: GreenhouseProfile, type: SensorType, date: Date) {
  const hour = date.getHours();
  const day = Math.floor(date.getTime() / 86_400_000);
  const signature = (day + Math.round(profile.offset * 10) + hour * 3) % 29;

  // 仅 1 号大棚产生模拟异常；2、3 号始终展示正常监测数据。
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
  const sampleDate = toSimulationTime(date);
  const hour = sampleDate.getHours() + sampleDate.getMinutes() / 60;
  const dayIndex = sampleDate.getTime() / 86_400_000;
  const daytime = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const slowWeather = wave(dayIndex + profile.offset, 7) * 1.7;
  const minuteIndex = sampleDate.getTime() / 60000;
  const microNoise =
    wave(minuteIndex + profile.offset * 13, 37) * 0.38 +
    wave(minuteIndex + profile.cropBias * 17, 83) * 0.22;
  const anomaly = anomalyBoost(profile, sensorType, sampleDate);
  const effects = managementEffects(profile, sampleDate);

  const rawValues: Record<SensorType, number> = {
    temperature: 19.5 + daytime * 10.5 + slowWeather + microNoise + profile.cropBias + anomaly + effects.temperature,
    humidity: 83 - daytime * 19 - slowWeather * 2 + wave(hour, 24, 5) * 4 + anomaly + effects.humidity,
    soil_moisture: 46 - daytime * 4 + wave(dayIndex * 24 + hour, 36, profile.offset) * 4 + anomaly + effects.soil_moisture,
    light: daytime > 0 ? 3500 + daytime * 50000 + slowWeather * 1100 + anomaly * 900 : 35 + Math.abs(microNoise) * 90,
    co2: 430 + (1 - daytime) * 160 + wave(hour, 12, profile.cropBias) * 35 + anomaly + effects.co2,
    water_level: 78 - ((dayIndex * 1.6 + profile.cropBias * 3) % 18) + wave(hour, 8) * 1.5 + anomaly + effects.water_level
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

  // 叶菜、番茄与自定义大棚都有独立的稳定曲线，并共享灌溉/通风/夜间降温事件。
  if (profile.kind !== "corn") {
    const tomato = profile.kind === "tomato";
    const custom = profile.kind === "custom";
    const customBias = custom ? profile.offset : 0;
    const healthyValues: Record<SensorType, number> = {
      temperature:
        (tomato ? 20.5 : custom ? 20.8 + customBias : 19.5) +
        daytime * (tomato ? 7.2 : 6.5) +
        slowWeather * 0.45 +
        microNoise +
        effects.temperature,
      humidity:
        (tomato ? 72 : custom ? 68 + customBias * 3 : 67) -
        daytime * 8 +
        wave(hour, 24, profile.offset) * 2.2 +
        effects.humidity,
      soil_moisture:
        (tomato ? 53 : custom ? 50 + profile.cropBias * 3 : 51) +
        wave(dayIndex * 24 + hour, 30, profile.offset) * 2.5 +
        effects.soil_moisture,
      light:
        daytime > 0
          ? 2800 + daytime * (tomato ? 35000 : 31000) + slowWeather * 500
          : 25 + Math.abs(microNoise) * 70,
      co2:
        (tomato ? 485 : custom ? 470 + profile.cropBias * 18 : 465) +
        (1 - daytime) * 95 +
        wave(hour, 12, profile.cropBias) * 18 +
        effects.co2,
      water_level:
        (tomato ? 78 : custom ? 72 + profile.cropBias * 4 : 74) +
        wave(hour, 10, profile.offset) * 1.8 +
        effects.water_level
    };
    const normalRanges: Record<SensorType, [number, number]> = {
      temperature: [18.2, 29.5],
      humidity: [48, 77],
      soil_moisture: [41, 70],
      light: [0, 56000],
      co2: [370, 790],
      water_level: [35, 96]
    };
    const [normalMin, normalMax] = normalRanges[sensorType];
    return round(clamp(healthyValues[sensorType], Math.max(min, normalMin), Math.min(max, normalMax)), definition.precision);
  }

  // 1 号持续有“需要关注”的指标，但不制造“存在风险”级别的读数。
  const attentionValues: Record<SensorType, [number, number]> = {
    temperature: [18, 32],
    humidity: [80, 86],
    soil_moisture: [34, 72],
    light: [1200, 58000],
    co2: [360, 900],
    water_level: [24, 100]
  };
  const [attentionMin, attentionMax] = attentionValues[sensorType];
  return round(clamp(rawValues[sensorType], attentionMin, attentionMax), definition.precision);
}

export function getMetricStatus(sensorType: SensorType, value: number, date = new Date()): DataStatus {
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
    const hour = date.getHours() + date.getMinutes() / 60;
    // 日出、日落附近低照度属于自然现象，只在主要日照时段判断“光照偏低”。
    const daylightHours = hour >= 7 && hour < 17.5;
    if (daylightHours && value < 1200) return "low";
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
  const previous = generateSensorValue(greenhouseId, sensorType, new Date(date.getTime() - SIMULATION_INTERVAL_MS));
  const status = getMetricStatus(sensorType, value, date);
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
  const sampleDate = toSimulationTime(date);
  const metrics = sensorTypes.map((sensorType) => metricFromValue(greenhouse.id, sensorType, sampleDate));
  const anomalies = metrics.filter((metric) => metric.status === "risk" || metric.status === "high" || metric.status === "low");
  const status = getGreenhouseStatus(greenhouse.id, sampleDate);
  const summary =
    anomalies.length === 0
      ? "当前大棚环境稳定，各项指标处于适宜区间。"
      : `当前有${anomalies.length}项指标需要关注：${anomalies.map((item) => `${item.label}${item.value}${item.unit}`).join("，")}。`;

  return {
    greenhouseId: greenhouse.id,
    farmName: greenhouse.name,
    updatedAt: sampleDate.toISOString(),
    metrics,
    summary,
    status
  };
}

export function getHistory(
  greenhouseId?: string,
  hours = 24,
  intervalMinutes = SIMULATION_INTERVAL_MINUTES,
  date = new Date()
): SensorHistorySeries[] {
  const greenhouse = getProfile(greenhouseId);
  const sampleDate = toSimulationTime(date);
  // 纵深防御：即使绕过路由层直接传参，也把 hours 钳制在 1~720，防止生成超大点数
  const numeric = Number(hours);
  const safeHours = Number.isFinite(numeric) ? Math.min(720, Math.max(1, Math.floor(numeric))) : 24;
  const requestedInterval = Number.isFinite(intervalMinutes)
    ? Math.max(SIMULATION_INTERVAL_MINUTES, Math.floor(intervalMinutes))
    : SIMULATION_INTERVAL_MINUTES;
  // 24 小时保持 5 分钟粒度；更长时间范围自动降采样，避免接口返回数万点。
  const cappedInterval = Math.ceil((safeHours * 60) / 2000 / SIMULATION_INTERVAL_MINUTES) * SIMULATION_INTERVAL_MINUTES;
  const safeIntervalMinutes = Math.max(requestedInterval, cappedInterval);
  const steps = Math.max(1, Math.floor((safeHours * 60) / safeIntervalMinutes));

  return sensorTypes.map((sensorType) => {
    const definition = sensorDefinitions[sensorType];
    const points: SensorDataPoint[] = Array.from({ length: steps + 1 }).map((_, index) => {
      const timestamp = new Date(sampleDate.getTime() - (steps - index) * safeIntervalMinutes * 60 * 1000);
      const value = generateSensorValue(greenhouse.id, sensorType, timestamp);

      return {
        greenhouseId: greenhouse.id,
        sensorType,
        value,
        unit: definition.unit,
        timestamp: timestamp.toISOString(),
        status: getMetricStatus(sensorType, value, timestamp)
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
  // 异常按 15 分钟聚合，避免 5 分钟曲线产生过密、重复的告警。
  return getHistory(greenhouse.id, hours, 15, date)
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
  const sampleDate = toSimulationTime(date);
  const metrics = sensorTypes.map((sensorType) => {
    const value = generateSensorValue(greenhouseId, sensorType, sampleDate);
    return getMetricStatus(sensorType, value, sampleDate);
  });

  if (metrics.some((status) => status === "risk")) return "warning";
  if (metrics.some((status) => status !== "normal")) return "attention";
  return "optimal";
}

/**
 * 综合大棚状态：结合近 24 小时异常记录评级，
 * 避免“当前读数正常、但近 24 小时仍有异常”时显示正常数据。
 */
export function getComprehensiveStatus(greenhouseId: string, date = new Date()): GreenhouseStatus {
  const anomalies = getAnomalies(greenhouseId, 24, date);
  if (anomalies.some((anomaly) => anomaly.level === "risk")) return "warning";
  if (anomalies.length > 0) return "attention";
  return getGreenhouseStatus(greenhouseId, date);
}

export function getDashboard(
  greenhouseId?: string,
  date = new Date(),
  greenhouseOverride?: GreenhouseSummary
): EnvironmentDashboard {
  const sampleDate = toSimulationTime(date);
  const profile = getProfile(greenhouseId);
  const knownGreenhouse = getGreenhouses().find((item) => item.id === profile.id);
  const greenhouse = greenhouseOverride?.id === profile.id
    ? greenhouseOverride
    : knownGreenhouse ?? {
        id: profile.id,
        name: profile.name,
        location: profile.location,
        area: profile.area,
        status: getComprehensiveStatus(profile.id, sampleDate)
      };
  const realtime = getRealtimeSnapshot(profile.id, sampleDate);
  const anomalies = getAnomalies(profile.id, 24, sampleDate);
  const effectiveStatus = getComprehensiveStatus(profile.id, sampleDate);
  const nowISO = sampleDate.toISOString();
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
    realtime: {
      ...realtime,
      farmName: greenhouse.name,
      status: effectiveStatus
    },
    history: getHistory(profile.id, 24, SIMULATION_INTERVAL_MINUTES, sampleDate),
    anomalies,
    recommendations: Array.from(new Map(baseRecommendations.map((item) => [item.text, item])).values()).slice(0, 5)
  };
}
