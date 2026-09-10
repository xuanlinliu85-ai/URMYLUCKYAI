import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const membershipsPath = path.join(projectRoot, "analysis", "memberships.csv");
const overridesPath = path.join(projectRoot, "analysis", "category_overrides.json");

const normalizeName = value => String(value || "")
  .replace(/^XD/, "")
  .replace(/[\s　]/g, "")
  .replace(/Ａ/g, "A")
  .trim();

const normalizeCategory = value => {
  const category = String(value || "").replaceAll("&nbsp;", "").trim();
  const aliases = {
    "ҽҩ": "医药",
    "机器人": "机器人与高端制造",
    "金刚石": "机器人与高端制造",
    "燃气轮机": "机器人与高端制造",
    "跨境金融": "红利",
    "猪肉": "消费",
    "ũҵ": "消费",
    "农业": "消费",
    "算电协同": "电力",
    "面板": "消费电子",
    "光伏": "新能源",
    "油运": "船舶",
    "船运": "船舶",
    "航运": "船舶",
  };
  return aliases[category] || category;
};

function loadCategoryReference() {
  const weighted = new Map();
  const lines = fs.readFileSync(membershipsPath, "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/).slice(1);
  for (const line of lines) {
    const [code, rawCategory, rawCount] = line.split(",");
    const category = normalizeCategory(rawCategory);
    const count = Number(rawCount || 0);
    if (!code || !category || !Number.isFinite(count)) continue;
    const current = weighted.get(code);
    if (!current || count > current.count) weighted.set(code, { category, count });
  }
  const reference = new Map([...weighted].map(([code, value]) => [code, value.category]));
  const overrides = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
  for (const [code, category] of Object.entries(overrides)) reference.set(code, normalizeCategory(category));
  return reference;
}

const categoryReference = loadCategoryReference();

const channelOrder = [
  "北美算力", "半导体", "有色", "新能源", "AI应用", "消费电子", "医药",
  "红利", "券商", "电力", "商业航天", "机器人与高端制造", "AIDC能源温控",
  "消费", "船舶", "化工", "安防", "特种气体", "其他事件驱动",
];

const channelSubtypes = {
  北美算力: ["光模块/光芯片/光通信", "PCB/覆铜板/电子材料", "服务器/交换机/电源", "国产算力/IDC/CDN"],
  半导体: ["存储芯片/模组", "半导体设备", "半导体材料/特气", "先进封装/封测", "芯片设计/晶圆制造"],
  有色: ["黄金/铜", "稀土/钨/钼", "银/锡/铅锌/其他金属"],
  新能源: ["锂电材料", "电池/整车", "光伏/风电/储能"],
  AI应用: ["大模型/办公软件", "数字营销/互联网平台", "游戏/传媒"],
  消费电子: ["面板/显示", "智能终端/结构件", "电子元件/射频/光学"],
  医药: ["创新药", "CRO/CDMO", "医疗器械/服务"],
  红利: ["银行", "保险", "高股息资产"],
  券商: ["券商", "金融科技"],
  电力: ["电力运营", "电网/电缆/变压器"],
  商业航天: ["卫星/航天电子", "军工材料/连接器"],
  机器人与高端制造: ["机器人/工控", "机床/工程机械/先进制造"],
  AIDC能源温控: ["IDC/算力租赁", "液冷/制冷", "供电/备电"],
  消费: ["白酒/饮料/食品", "家电/品牌消费", "汽车/其他消费"],
  船舶: ["船舶制造/航运"],
  化工: ["基础化工/新材料"],
  安防: ["机器视觉/安防"],
  特种气体: ["电子特气/工业气体"],
  其他事件驱动: ["待持续复核"],
};

const manualPlacements = {
  京东方A: ["消费电子", "面板/显示"],
  蓝色光标: ["AI应用", "数字营销/互联网平台"], 行云科技: ["AI应用", "数字营销/互联网平台"],
  中钨高新: ["有色", "稀土/钨/钼"], 铜冠铜箔: ["北美算力", "PCB/覆铜板/电子材料"],
  厦门钨业: ["有色", "稀土/钨/钼"], 华友钴业: ["新能源", "锂电材料"],
  北方稀土: ["有色", "稀土/钨/钼"], 德福科技: ["北美算力", "PCB/覆铜板/电子材料"],
  光库科技: ["北美算力", "光模块/光芯片/光通信"], 金安国纪: ["北美算力", "PCB/覆铜板/电子材料"],
  网宿科技: ["北美算力", "国产算力/IDC/CDN"], 信维通信: ["商业航天", "军工材料/连接器"],
  方正科技: ["北美算力", "PCB/覆铜板/电子材料"], 昊华科技: ["半导体", "半导体材料/特气"],
  宏景科技: ["AI应用", "大模型/办公软件"], 东材科技: ["北美算力", "PCB/覆铜板/电子材料"],
  罗博特科: ["北美算力", "光模块/光芯片/光通信"], 易点天下: ["AI应用", "数字营销/互联网平台"],
  西部矿业: ["有色", "黄金/铜"], 江西铜业: ["有色", "黄金/铜"],
  中巨芯: ["半导体", "半导体材料/特气"], 康龙化成: ["医药", "CRO/CDMO"],
  光智科技: ["半导体", "半导体材料/特气"], 仕佳光子: ["北美算力", "光模块/光芯片/光通信"],
  烽火通信: ["北美算力", "光模块/光芯片/光通信"], 昆仑万维: ["AI应用", "大模型/办公软件"],
  科翔股份: ["北美算力", "PCB/覆铜板/电子材料"], 三安光电: ["半导体", "芯片设计/晶圆制造"],
  金风科技: ["新能源", "光伏/风电/储能"], 天通股份: ["半导体", "半导体材料/特气"],
  利欧股份: ["AI应用", "数字营销/互联网平台"], 菲利华: ["半导体", "半导体材料/特气"],
  绿的谐波: ["机器人与高端制造", "机器人/工控"], 鹏鼎控股: ["北美算力", "PCB/覆铜板/电子材料"],
  铜陵有色: ["有色", "黄金/铜"], 江钨装备: ["有色", "稀土/钨/钼"],
  金山办公: ["AI应用", "大模型/办公软件"], 太辰光: ["北美算力", "光模块/光芯片/光通信"],
  九安医疗: ["医药", "医疗器械/服务"], 博迁新材: ["北美算力", "PCB/覆铜板/电子材料"],
  长芯博创: ["北美算力", "光模块/光芯片/光通信"], 盛达资源: ["有色", "银/锡/铅锌/其他金属"],
  沪硅产业: ["半导体", "半导体材料/特气"], 中国卫星: ["商业航天", "卫星/航天电子"],
  深信服: ["北美算力", "国产算力/IDC/CDN"], 百济神州: ["医药", "创新药"],
  士兰微: ["半导体", "芯片设计/晶圆制造"], 中国稀土: ["有色", "稀土/钨/钼"],
  兴业银锡: ["有色", "银/锡/铅锌/其他金属"], 鼎龙股份: ["半导体", "半导体材料/特气"],
  芯碁微装: ["半导体", "半导体设备"], 有研硅: ["半导体", "半导体材料/特气"],
  卧龙电驱: ["机器人与高端制造", "机器人/工控"], 南亚新材: ["北美算力", "PCB/覆铜板/电子材料"],
  赤峰黄金: ["有色", "黄金/铜"], 联讯仪器: ["半导体", "半导体设备"],
  泰晶科技: ["消费电子", "电子元件/射频/光学"], 盛和资源: ["有色", "稀土/钨/钼"],
  晓程科技: ["有色", "黄金/铜"], 锡业股份: ["有色", "银/锡/铅锌/其他金属"],
  联特科技: ["北美算力", "光模块/光芯片/光通信"], 天娱数科: ["AI应用", "游戏/传媒"],
  通鼎互联: ["北美算力", "光模块/光芯片/光通信"], 国科微: ["半导体", "芯片设计/晶圆制造"],
  唯特偶: ["半导体", "半导体材料/特气"], 汇绿生态: ["北美算力", "光模块/光芯片/光通信"],
  天赐材料: ["新能源", "锂电材料"], 鼎泰高科: ["北美算力", "PCB/覆铜板/电子材料"],
  杭电股份: ["电力", "电网/电缆/变压器"],
  中金黄金: ["有色", "黄金/铜"], 英维克: ["AIDC能源温控", "液冷/制冷"],
  联创光电: ["消费电子", "电子元件/射频/光学"], 昭衍新药: ["医药", "CRO/CDMO"],
  正帆科技: ["半导体", "半导体材料/特气"], 埃斯顿: ["机器人与高端制造", "机器人/工控"],
  中文在线: ["AI应用", "游戏/传媒"], 联瑞新材: ["北美算力", "PCB/覆铜板/电子材料"],
  创世纪: ["机器人与高端制造", "机床/工程机械/先进制造"], 五粮液: ["消费", "白酒/饮料/食品"],
  万华化学: ["化工", "基础化工/新材料"], 大唐发电: ["电力", "电力运营"],
  TCL科技: ["消费电子", "面板/显示"], 润泽科技: ["AIDC能源温控", "IDC/算力租赁"],
  巨人网络: ["AI应用", "游戏/传媒"], 中京电子: ["北美算力", "PCB/覆铜板/电子材料"],
  泛微网络: ["AI应用", "大模型/办公软件"], 翔鹭钨业: ["有色", "稀土/钨/钼"],
  东方钽业: ["有色", "银/锡/铅锌/其他金属"], 冰轮环境: ["AIDC能源温控", "液冷/制冷"],
  生益电子: ["北美算力", "PCB/覆铜板/电子材料"], 黄河旋风: ["机器人与高端制造", "机床/工程机械/先进制造"],
  盛合晶微: ["半导体", "先进封装/封测"], 甬矽电子: ["半导体", "先进封装/封测"],
  天齐锂业: ["新能源", "锂电材料"], 华丰科技: ["北美算力", "服务器/交换机/电源"],
  株冶集团: ["有色", "银/锡/铅锌/其他金属"], 亿纬锂能: ["新能源", "电池/整车"],
  东芯股份: ["半导体", "存储芯片/模组"], 炬光科技: ["消费电子", "电子元件/射频/光学"],
  睿创微纳: ["商业航天", "卫星/航天电子"], 精测电子: ["半导体", "半导体设备"],
  先导基电: ["半导体", "半导体设备"], 远东股份: ["电力", "电网/电缆/变压器"],
  山东黄金: ["有色", "黄金/铜"], 江淮汽车: ["消费", "汽车/其他消费"],
};

function parseStock(text) {
  const match = String(text || "").match(/^#(\d+)\s+(?:▲新\s+)?(.+?)\s+([\d.]+)亿\s*([+\-]?\d+(?:\.\d+)?)%/);
  if (!match) return null;
  return { rank: Number(match[1]), name: match[2], reason: text.split("→").slice(1).join("→").trim() };
}

function subtypeForTemplate(channel, current) {
  if (current?.[0] === channel) return current[1];
  const defaults = {
    北美算力: "服务器/交换机/电源", 半导体: "芯片设计/晶圆制造", 红利: "高股息资产",
    新能源: "电池/整车", 消费电子: "智能终端/结构件", 券商: "券商", AI应用: "数字营销/互联网平台",
    医药: "创新药", 有色: "银/锡/铅锌/其他金属", 电力: "电力运营", 特种气体: "电子特气/工业气体",
    安防: "机器视觉/安防", 消费: "家电/品牌消费", 船舶: "船舶制造/航运",
  };
  return defaults[channel] || channelSubtypes[channel]?.[0] || "待持续复核";
}

function resolvePlacement(item) {
  const code = String(item.ifindCode || item.code || "").trim();
  const name = normalizeName(item.name);
  const category = categoryReference.get(code);
  const manual = manualPlacements[name];
  if (category && channelOrder.includes(category)) return [category, subtypeForTemplate(category, manual)];
  if (manual) return manual;
  return null;
}

const channelCatalysts = {
  北美算力: "AI基础设施扩张驱动高速互连与服务器链需求",
  半导体: "国产替代与晶圆厂扩产驱动产业链景气修复",
  有色: "资源价格与供给约束强化业绩弹性",
  新能源: "新能源需求修复与产品升级推动出货增长",
  AI应用: "大模型落地与商业化提速提升应用侧预期",
  消费电子: "终端创新与备货周期改善推动需求回升",
  医药: "研发兑现、出海授权与医疗需求释放形成催化",
  红利: "稳定现金流与高股息属性吸引配置资金",
  券商: "市场活跃度提升带动经纪与投行业务弹性",
  电力: "电网投资与算力用电增长拉动电力链需求",
  商业航天: "卫星互联网建设与商业发射提速形成催化",
  机器人与高端制造: "自动化升级与设备更新推动订单预期",
  AIDC能源温控: "算力密度提升推动供电与液冷需求扩张",
  消费: "消费复苏与品牌渠道改善推动经营预期",
  船舶: "造船周期与航运需求改善推动订单景气",
  化工: "产品价差修复与新材料放量改善盈利预期",
  安防: "视觉智能升级与行业数字化拉动产品需求",
  特种气体: "半导体扩产与国产替代推动特气需求",
  其他事件驱动: "公司事件与资金博弈共同形成阶段性催化",
};

function reasonFor(channel, subtype) {
  return `主营业务位于${subtype}环节；${channelCatalysts[channel] || channelCatalysts.其他事件驱动}；当日成交额进入前列并形成资金关注`;
}

export function buildTurnoverTemplate(top100, tradeDate) {
  const groups = new Map(channelOrder.map(channel => [channel, []]));
  const unresolved = [];
  for (const [index, item] of top100.entries()) {
    const placement = resolvePlacement(item);
    if (!placement) {
      unresolved.push({ rank: index + 1, code: item.ifindCode || item.code, name: item.name });
      continue;
    }
    const [channel, subtype] = placement;
    if (!groups.has(channel)) groups.set(channel, []);
    groups.get(channel).push({
      rank: index + 1,
      code: item.ifindCode || item.code,
      name: item.name,
      price: item.price,
      change: item.change,
      turnover: item.turnover / 1e8,
      subtype,
    });
  }
  const channels = channelOrder
    .map(name => ({ name, sourceCount: groups.get(name).length, stocks: groups.get(name) }))
    .filter(channel => channel.stocks.length);
  return {
    snapshotDate: tradeDate,
    sourceFile: "iFinD成交额前100",
    generatedAt: new Date().toISOString(),
    channels,
    unclassified: unresolved,
  };
}

export function reclassifyAttribution(attribution, top200) {
  const current = new Map();
  for (const theme of attribution?.themes || []) {
    for (const subtype of theme.subtypes || []) {
      for (const stock of subtype.stocks || []) {
        const parsed = parseStock(stock.text);
        if (parsed) current.set(normalizeName(parsed.name), { ...parsed, status: stock.status, theme: theme.header, subtype: subtype.name });
      }
    }
  }
  const groups = new Map(channelOrder.map(channel => [channel, new Map(channelSubtypes[channel].map(subtype => [subtype, []]))]));
  const unresolved = [];
  for (const [index, item] of top200.entries()) {
    const key = normalizeName(item.name);
    const old = current.get(key);
    const placement = resolvePlacement(item);
    if (!placement) {
      unresolved.push({ rank: index + 1, code: item.ifindCode || item.code, name: item.name });
      continue;
    }
    const [channel, subtype] = placement;
    if (!groups.has(channel)) groups.set(channel, new Map([[subtype, []]]));
    if (!groups.get(channel).has(subtype)) groups.get(channel).set(subtype, []);
    const reason = reasonFor(channel, subtype);
    const status = old?.status === "held" ? "held" : "new";
    groups.get(channel).get(subtype).push({
      status,
      text: `#${index + 1} ${status === "new" ? "▲新 " : ""}${item.name} ${(item.turnover / 1e8).toFixed(1)}亿 ${item.change >= 0 ? "+" : ""}${item.change.toFixed(2)}% → ${reason}`,
    });
  }
  const themes = [];
  for (const channel of channelOrder) {
    const subtypes = [...groups.get(channel).entries()]
      .filter(([, stocks]) => stocks.length)
      .map(([name, stocks]) => ({ name: `${name} (${stocks.length}只)`, stocks }));
    if (!subtypes.length) continue;
    const count = subtypes.reduce((sum, subtype) => sum + subtype.stocks.length, 0);
    themes.push({ id: themes.length, header: `${channel} (${count}只)`, subtypes });
  }
  return {
    ...attribution,
    meta: `数据源：iFinD成交额排名 | ${top200.length}只标的 · ${themes.length}条渠道 · 成交前100与前200共用代码分类体系`,
    generatedAt: new Date().toISOString(),
    unclassified: unresolved,
    themes,
  };
}
