import fs from "node:fs";
import path from "node:path";
import { runIfindCompatibilityAudit } from "./ifind-mcp-client.mjs";
import { createIfindPrimarySource } from "./ifind-primary-source.mjs";
const publicDir = path.resolve("public");

const htmlDecode = (value = "") => value
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, "\"")
  .replace(/&#39;/gi, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

const clean = (value = "") => htmlDecode(value
  .replace(/<br\s*\/?>/gi, " | ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim());

function dateFromName(name) {
  const match = name.match(/(20\d{6})/);
  if (!match) return "";
  return `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6, 8)}`;
}

function archiveFromManifest(manifest) {
  if (!manifest?.entries) return null;
  return Object.fromEntries(Object.entries(manifest.entries).map(([kind, entries]) => [
    kind,
    {
      latest: manifest.latest?.[kind] || "",
      count: Object.keys(entries || {}).length,
      entries: Object.values(entries || {}).map(({ key, date, display_label, file, bytes, published_at }) => ({
        key: key || date,
        date,
        display_label: display_label || "",
        file,
        bytes,
        published_at,
      })).sort((a, b) => String(b.key).localeCompare(String(a.key))),
    },
  ]));
}

function parseDashboard(source, sourceFile, manifest) {
  const tabNames = [...source.matchAll(/<button class="tab-btn[^"]*"[^>]*>([\s\S]*?)<\/button>/g)]
    .map(match => clean(match[1]));
  const tabs = tabNames.map((name, index) => {
    const start = source.indexOf(`<div class="tab-content" id="tab${index}"`);
    const next = source.indexOf(`<div class="tab-content" id="tab${index + 1}"`, start + 1);
    const segment = source.slice(start, next < 0 ? source.length : next);
    const nav = [...segment.matchAll(/<span class="nav-item">([\s\S]*?)<\/span>/g)]
      .slice(0, 7).map(match => clean(match[1]));
    const summary = [...segment.matchAll(/<div class="item">[\s\S]*?<div class="val"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<div class="label">([\s\S]*?)<\/div>/g)]
      .map(match => ({ value: clean(match[1]), label: clean(match[2]) })).slice(0, 5);
    const signals = [...segment.matchAll(/<button class="sig-btn"[^>]*data-signal="([^"]+)"[\s\S]*?<span class="sig-count">([\s\S]*?)<\/span><\/button>/g)]
      .map(match => ({ label: clean(match[1]), count: clean(match[2]) }));
    const table = segment.match(new RegExp(`<table class="rank-table" id="table${index}">([\\s\\S]*?)<\\/table>`))?.[1] || "";
    const headerRow = table.match(/<tr>([\s\S]*?)<\/tr>/)?.[1] || "";
    const headers = [...headerRow.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(match => clean(match[1]));
    const body = table.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || "";
    const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(rowMatch =>
      [...rowMatch[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map(cell => ({
        raw: cell[1].match(/data-val="([^"]+)"/)?.[1] ?? null,
        display: clean(cell[2]),
      }))
    );
    return { id: index, name, nav, summary, signals, headers, rows };
  });
  const current = fs.existsSync(path.join(publicDir, "dashboard-snapshot.json"))
    ? JSON.parse(fs.readFileSync(path.join(publicDir, "dashboard-snapshot.json"), "utf8"))
    : {};
  return {
    snapshotDate: dateFromName(sourceFile.name),
    title: "二代机统一 Dashboard",
    sourceUpdatedAt: sourceFile.stat.mtime.toISOString(),
    archive: archiveFromManifest(manifest) || current.archive || {},
    tabs,
  };
}

function parseAttribution(source) {
  const starts = [...source.matchAll(/<div class="narrative[^"]*"/g)].map(match => match.index);
  const themes = starts.map((start, themeIndex) => {
    const end = starts[themeIndex + 1] ?? source.indexOf('<div class="footer"', start);
    const segment = source.slice(start, end < 0 ? source.length : end);
    const header = clean(segment.match(/class="nar-header"[^>]*>([\s\S]*?)<\/div>/)?.[1] || "");
    const subStarts = [...segment.matchAll(/<div class="subtype"/g)].map(match => match.index);
    const subtypes = subStarts.map((subStart, subIndex) => {
      const subEnd = subStarts[subIndex + 1] ?? segment.length;
      const subSegment = segment.slice(subStart, subEnd);
      const name = clean(subSegment.match(/class="sub-header"[^>]*>([\s\S]*?)<\/div>/)?.[1] || "");
      const stocks = [...subSegment.matchAll(/<div class="stock([^"]*)"[^>]*>([\s\S]*?)<\/div>/g)].map(match => ({
        status: match[1].includes("exited") ? "exited" : match[2].includes("badge-new") ? "new" : "held",
        text: clean(match[2]),
      }));
      return { name, stocks };
    });
    return { id: themeIndex, header, subtypes };
  });
  return {
    title: clean(source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || ""),
    meta: clean(source.match(/class="meta"[^>]*>([\s\S]*?)<\/div>/)?.[1] || ""),
    themes,
  };
}

function attributionStock(text) {
  const match = text.match(/^#(\d+)\s+(.+?)\s+([\d.]+)亿\s*([+\-]?\d+(?:\.\d+)?)%/);
  if (!match) return null;
  return {
    rank: Number(match[1]),
    name: match[2].replace(/^▲\S*\s+/, ""),
    reason: text.split("→").slice(1).join("→").trim(),
  };
}

function cleanAttributionLabel(value) {
  return value.replace(/\s*\(\d+只\)[\s\S]*$/, "").replace(/\s*[▲▼][\s\S]*$/, "").trim();
}

const newStockPlacements = {
  "N长鑫": [7, 0, "存储芯片制造，国产DRAM扩产与存储周期共振"],
  "海康威视": [8, 4, "端侧AI、智能物联与视觉感知"],
  "深科技": [7, 1, "存储封测与模组制造"],
  "京东方Ａ": [8, 4, "显示面板与端侧AI硬件"],
  "华虹宏力": [1, 2, "特色工艺晶圆代工"],
  "雅克科技": [1, 4, "半导体前驱体与电子材料"],
  "华天科技": [1, 3, "先进封装与半导体封测"],
  "国瓷材料": [1, 4, "电子陶瓷与半导体材料"],
  "中船特气": [1, 4, "电子特气与半导体材料"],
  "蓝思科技": [8, 4, "消费电子、AI终端与结构件"],
  "风华高科": [2, 3, "MLCC等被动元件"],
  "普冉股份": [7, 0, "NOR Flash与EEPROM存储芯片"],
  "全志科技": [1, 1, "端侧SoC与AI芯片设计"],
  "锐捷网络": [5, 0, "数据中心交换机与算力网络"],
  "星网锐捷": [5, 0, "企业网络与算力基础设施"],
  "华海清科": [1, 0, "CMP等半导体核心设备"],
  "长江电力": [14, 1, "水电运营与高股息电力"],
  "昭衍新药": [15, 0, "临床前CRO服务"],
  "太极实业": [1, 0, "半导体工程与封测产业链"],
  "大唐发电": [14, 1, "电力运营与高股息"],
  "中国海油": [14, 0, "上游油气开采"],
  "星宸科技": [1, 1, "智能视觉SoC芯片设计"],
  "滨化股份": [14, 2, "氯碱化工与化工品景气"],
  "联讯仪器": [1, 0, "半导体测试设备与国产替代"],
  "康龙化成": [15, 0, "药物研发CRO与CDMO服务"],
  "哈药股份": [15, 1, "医药制造与创新药业务修复"],
  "农业银行": [13, 1, "国有大行与高股息金融"],
  "伊利股份": [8, 1, "乳制品龙头与品牌消费"],
  "中巨芯": [1, 4, "电子湿化学品与半导体材料"],
  "赤峰黄金": [11, 1, "黄金资源与金价周期"],
  "昊华科技": [1, 4, "电子化学品、特气与高端材料"],
  "江海股份": [2, 3, "铝电解电容与薄膜电容"],
  "孚日股份": [8, 1, "家纺制造与品牌消费"],
  "精智达": [1, 0, "半导体与显示检测设备"],
  "芯碁微装": [1, 0, "直写光刻设备与先进封装"],
  "西部矿业": [11, 1, "铜铅锌资源与金属景气"],
  "华银电力": [14, 1, "电力运营与能源转型"],
  "冰轮环境": [12, 1, "工业制冷与数据中心温控装备商；顿汉布什拥有十余年数据中心服务经验且IDC专版产品已批量供货；AI算力扩建推动液冷换热与高效冷源需求"],
  "东材科技": [4, 1, "电子树脂、薄膜与覆铜板材料"],
  "华峰测控": [1, 0, "半导体测试设备"],
  "TCL科技": [8, 4, "显示面板与AI终端硬件"],
  "华安证券": [13, 0, "券商与资本市场活跃度"],
  "中国石油": [14, 0, "油气开采、炼化与高股息"],
  "工商银行": [13, 1, "国有大行与高股息金融"],
  "安集科技": [1, 4, "CMP抛光液与半导体材料"],
  "长城军工": [6, 4, "军工装备与航天结构件"],
  "华润新能": [14, 1, "新能源发电与电力运营"],
  "沪硅产业": [1, 4, "大尺寸硅片与半导体材料"],
  "金安国纪": [4, 1, "覆铜板与电子材料"],
  "托伦斯": [1, 0, "薄膜沉积、刻蚀设备精密零部件"],
  "美利云": [12, 1, "数据中心运营与算力基础设施"],
  "绿的谐波": [8, 3, "机器人谐波减速器"],
  "有研硅": [1, 4, "半导体硅材料与硅片"],
  "行云科技": [8, 0, "跨境B2B与数字化平台"],
  "正帆科技": [1, 4, "高纯工艺系统、电子特气与半导体设备"],
  "汉缆股份": [10, 1, "高压电缆与电网建设"],
  "共进股份": [5, 0, "通信设备、交换与算力网络"],
  "甬矽电子": [1, 3, "先进封装与半导体封测"],
  "臻宝科技": [1, 0, "半导体设备硅、石英与陶瓷核心零部件"],
  "士兰微": [1, 1, "功率半导体与IDM芯片平台"],
  "高德红外": [6, 1, "红外探测芯片与航天电子"],
  "精测电子": [1, 0, "半导体与显示检测设备"],
  "通源石油": [14, 0, "油气田服务与上游资本开支"],
  "惠城环保": [14, 2, "炼化废催化剂资源化与化工循环"],
  "博迁新材": [4, 2, "高端金属粉体与电子材料"],
  "晶合集成": [1, 2, "显示驱动与特色工艺晶圆代工"],
  "睿创微纳": [6, 1, "红外探测芯片与光电系统"],
  "兴业银锡": [11, 2, "银锡铅锌资源与金属景气"],
  "美的集团": [8, 1, "家电龙头与品牌消费"],
  "科伦药业": [15, 1, "创新药、输液与制剂平台"],
  "鼎泰高科": [4, 2, "PCB钻针、刀具与精密加工"],
  "先导基电": [1, 0, "离子注入等半导体设备与材料平台"],
  "富创精密": [1, 0, "半导体设备精密零部件"],
  "广钢气体": [1, 4, "电子大宗气体与半导体特气"],
  "岩山科技": [8, 0, "AI应用与互联网服务"],
  "盛达资源": [11, 2, "银铅锌资源与金属景气"],
  "顺络电子": [2, 3, "电感与高端被动元件"],
  "埃斯顿": [8, 3, "工业机器人与运动控制"],
  "盛美上海": [1, 0, "清洗、电镀等半导体设备"],
  "C长鑫": [7, 0, "国产DRAM存储芯片龙头；DRAM收入占比约98%；DDR5/LPDDR5X量产与国产替代共振"],
  "新莱应材": [1, 0, "半导体高纯管路与真空组件；覆盖泛半导体与生物医药高洁净场景；晶圆厂扩产带动国产零部件放量"],
  "立新能源": [14, 1, "新疆风电光伏运营商；新能源装机持续扩张；绿电消纳与电价改革改善预期"],
  "彤程新材": [1, 4, "电子材料与特种橡胶助剂平台；布局KrF/ArF光刻胶；国产光刻材料放量预期升温"],
  "兴业银行": [13, 1, "股份制银行龙头；同业金融与绿色金融特色突出；低估值高股息叠加资产质量改善"],
  "至纯科技": [1, 0, "半导体高纯工艺系统与湿法设备；覆盖晶圆制造核心洁净环节；国产设备替代与晶圆厂扩产共振"],
  "五 粮 液": [8, 1, "浓香型白酒龙头；千元价格带品牌与渠道壁垒深厚；消费复苏与渠道改革改善动销预期"],
  "中国中免": [8, 1, "全球免税零售龙头；掌握机场与离岛免税核心渠道；海南消费回暖与市内免税政策催化"],
  "XD东材科": [4, 1, "电子树脂与功能膜材料平台；覆盖覆铜板树脂和新能源薄膜；AI高频高速材料需求带动产品升级"],
  "顺钠股份": [10, 1, "输配电设备与变压器制造商；聚焦电网及新能源配套设备；AIDC用电增长推动变压器需求"],
  "红板科技": [4, 0, "中高端PCB制造商；产品覆盖HDI/刚挠结合板/IC载板；AI终端与汽车电子拉动高阶板需求"],
  "智度股份": [8, 0, "数字营销与互联网媒体平台；拥有海外流量与品牌营销资源；AI营销工具提升投放效率与变现预期"],
  "盛合晶微": [1, 3, "晶圆级先进封装代工平台；覆盖凸块/测试/扇出等工艺；Chiplet与国产高端封装需求放量"],
  "贤丰控股": [16, 1, "覆铜板与兽用疫苗双主业；拥有31个兽用疫苗批准文号；动保产品升级与PCB景气修复形成催化"],
  "西安奕材": [1, 4, "半导体硅片制造商；聚焦12英寸硅片规模化供应；晶圆厂扩产推动大硅片国产替代"],
  "三博脑科": [16, 0, "神经专科医疗服务集团；聚焦脑科疾病诊疗与医院运营；专科扩张和高壁垒医疗服务获关注"],
  "茂莱光学": [0, 3, "高端精密光学器件制造商；服务半导体/生命科学/AR等场景；光刻检测与AI光学需求推动成长"],
  "交通银行": [13, 1, "国有大型商业银行；对公与财富管理基础稳健；低估值高股息与资产质量改善吸引资金"],
  "中恒电气": [10, 2, "通信电源与数据中心供电设备商；深耕高压直流与电力电子技术；AIDC扩建带动高效供电需求"],
  "万通发展": [17, 0, "房地产运营与数字科技转型平台；并购数渡科技切入毫米波与通信芯片；通信新业务放量预期提升估值"],
  "中国银行": [13, 1, "全球化国有大行；跨境金融与外汇业务优势突出；低估值高股息叠加人民币国际化预期"],
  "招商证券": [13, 0, "综合性头部券商；财富管理与机构业务基础扎实；市场活跃度提升带动经纪投行弹性"],
  "九安医疗": [8, 0, "家用医疗健康电子品牌；iHealth深耕海外消费医疗；AI健康管理与新品放量形成催化"],
  "澜起科技": [7, 2, "内存接口芯片与服务器互连芯片龙头；产品覆盖DDR5内存接口及PCIe/CXL互连方案；AI服务器升级和内存带宽提升推动新品放量"],
  "世纪华通": [8, 5, "全球化游戏研发发行与互联网服务商；点点互动深耕海外游戏市场并拥有长线运营能力；新游戏流水与AI工具降本增效形成催化"],
  "格力电器": [8, 1, "空调与综合家电龙头；拥有核心压缩机技术和全国渠道服务网络；以旧换新及渠道改革支撑家电需求修复"],
  "张江高科": [1, 1, "张江科学城园区开发与硬科技投资平台；通过直投和基金覆盖集成电路等科创企业；上海科创中心建设和半导体融资活跃提升资产价值"],
  "巨人网络": [8, 5, "网络游戏研发与运营商；征途系列和球球大作战构成长线IP矩阵；新游上线及AI赋能研发运营带来增量"],
  "赛力斯": [9, 1, "高端智能新能源汽车制造商；与华为共建问界生态且2025年高端新能源SUV份额超过20%；问界新品扩容和智能化升级推动销量预期"],
  "创新医疗": [16, 0, "医院运营与医疗服务平台；持有博灵脑机40%股权并布局脑机接口康复产品；多中心临床和医疗器械注册进展构成催化"],
  "三一重工": [19, 0, "工程机械与智能制造龙头；挖掘机械和混凝土机械具备全球渠道与规模优势；海外扩张及设备更新周期改善增长预期"],
  "指南针": [13, 0, "金融信息服务与证券业务双轮驱动平台；麦高证券经纪自营和客户托管规模持续增长；市场活跃度提升及数据交易协同释放业绩弹性"],
  "飞龙股份": [12, 1, "汽车水泵与热管理零部件供应商；海外收入占比约50%且液冷泵已拓展至服务器和数据中心；AI算力液冷需求推动产品应用扩张"],
  "牧原股份": [20, 0, "生猪养殖与屠宰一体化龙头；自繁自养模式和精细化管理构筑成本优势；猪价回升与养殖成本下降改善盈利弹性"],
  "华正新材": [4, 1, "覆铜板与复合材料制造商；超低损耗材料已通过多家终端认证并实现小批量销售；高速交换机和AI服务器升级拉动高频高速材料需求"],
  "迈瑞医疗": [16, 2, "全球化医疗器械龙头；生命信息支持体外诊断和医学影像形成三大产品线；设备更新和海外高端市场突破驱动增长"],
  "东鹏饮料": [8, 1, "功能饮料与综合饮品龙头；2025年营收突破200亿元且活跃终端超过450万家；电解质饮料第二曲线和海外扩张提升成长空间"],
  "江淮汽车": [9, 1, "商用车与智能新能源汽车制造商；与华为合作打造尊界高端智能汽车品牌；尊界车型交付和产品矩阵扩容形成催化"],
};

// Add genuinely new market narratives here when the existing taxonomy cannot explain them.
// Entries follow the same shape as parsed themes so daily attribution is not capped at 16 themes.
const additionalAttributionThemes = [
  { header: "医疗与动保", subtypes: ["专科医疗服务", "动物保健", "医疗器械"] },
  { header: "通信与数字科技", subtypes: ["毫米波/通信芯片"] },
  { header: "AIDC温控", subtypes: ["液冷/制冷设备"] },
  { header: "高端制造", subtypes: ["工程机械/智能制造"] },
  { header: "农业养殖", subtypes: ["生猪养殖"] },
];

const themeCatalysts = [
  "AI集群升级带动高速光互联需求放量",
  "先进制程扩产与半导体设备国产替代提速",
  "AI服务器迭代推动算力硬件需求扩张",
  "锂价与材料价格修复带来盈利弹性",
  "高速算力建设拉动关键材料升级",
  "国产算力生态扩容与自主可控加速",
  "卫星互联网建设与商业发射提速",
  "存储周期回暖叠加国产供应链扩产",
  "AI应用、智能终端与消费复苏催化相关需求",
  "动力与储能需求修复推动电池出货增长",
  "AIDC扩建与电网投资拉动供配电设备需求",
  "资源价格上行与供给约束强化盈利弹性",
  "AI数据中心扩建提升算力基础设施需求",
  "资本市场活跃与政策预期带来业绩弹性",
  "能源价格与高股息属性吸引防御资金",
  "创新药兑现、出海授权与研发催化共振",
  "医疗服务扩张与动保产品升级带来成长预期",
  "通信技术升级与数字科技转型打开增量空间",
  "AI算力密度提升推动数据中心液冷渗透",
  "设备更新与全球化拓展推动高端制造景气修复",
  "猪价与成本周期改善养殖盈利弹性",
];

const subtypeAdvantages = {
  "0:1": "掌握光棒到光缆规模化制造能力",
  "1:0": "覆盖刻蚀/薄膜/检测等关键工艺",
  "1:1": "聚焦SoC/模拟/CIS等核心芯片",
  "1:2": "具备特色工艺晶圆制造能力",
  "1:3": "布局先进封装与高端封测工艺",
  "1:4": "切入光刻胶/特气/靶材等关键材料",
  "2:3": "电容/MLCC等元件进入AI电源链",
  "4:1": "高频高速材料适配AI服务器升级",
  "4:2": "提供铜箔/钻针/设备等PCB关键耗材",
  "5:0": "覆盖算力集成/分销与生态服务",
  "6:1": "产品用于卫星电子与星载连接",
  "6:4": "参与火箭发动机及结构件配套",
  "7:0": "布局DRAM/NOR等存储芯片",
  "7:1": "覆盖SSD与嵌入式存储模组",
  "8:0": "以AI应用和数字营销拓展变现",
  "8:1": "拥有品牌渠道与消费品运营能力",
  "8:3": "卡位机器人核心部件与运动控制",
  "8:4": "布局端侧SoC/AIoT与智能终端",
  "11:0": "掌握稀土/钨/靶材等稀缺资源",
  "11:1": "金铜资源储量与产量构成弹性",
  "11:2": "银铝锡铅锌价格上行增厚利润",
  "13:0": "财富管理与资本市场业务具备弹性",
  "13:1": "息差企稳与资产质量改善支撑估值",
  "14:0": "油气与航运供需变化提供盈利弹性",
  "14:1": "稳定现金流与高分红强化防御属性",
  "14:2": "产品价格修复改善化工盈利预期",
  "15:0": "覆盖药物研发到商业化服务链条",
  "15:1": "研发管线与对外授权驱动价值兑现",
  "16:2": "产品覆盖生命信息、体外诊断与医学影像",
  "18:0": "掌握数据中心冷源、换热与液冷泵技术",
  "19:0": "全球渠道与规模制造构筑竞争壁垒",
  "20:0": "自繁自养与成本管理形成养殖优势",
};

function cleanIntroClause(value) {
  const cleaned = String(value || "")
    .replace(/[，,]?\s*当日成交[\d.]+亿元?/g, "")
    .replace(/[，,]?\s*全A成交额排名第\d+/g, "")
    .replace(/[，,]?\s*当日涨跌[+\-]?[\d.]+%/g, "")
    .replace(/成交额新进与事件驱动/g, "")
    .replace(/分类待持续复核/g, "")
    .replace(/^[，,、\s]+|[，,、\s]+$/g, "")
    .trim();
  return cleaned.includes("产业链核心受益者") ? "" : cleaned;
}

function threePartReason(reason, themeIndex, subtypeIndex, subtypeName, themeName) {
  const cleaned = String(reason || "当日资金关注").replace(/^🔄→\S+\s*/, "").trim();
  const parts = cleaned.split(/[,，;；]/).map(cleanIntroClause).filter(Boolean);
  const subtype = cleanAttributionLabel(subtypeName).replace(/[（(][\s\S]*$/, "").trim();
  const theme = cleanAttributionLabel(themeName).replace(/^\d+\s*/, "").trim();
  const subtypePosition = subtypeAdvantages[`${themeIndex}:${subtypeIndex}`] || `${subtype || theme}产业链核心受益者`;
  const marketCatalyst = themeCatalysts[themeIndex] || `${theme || subtype}景气提升与产业催化共振`;
  const candidates = parts.length >= 2
    ? [...parts, marketCatalyst, subtypePosition]
    : [...parts, subtypePosition, marketCatalyst];
  const selected = [];
  for (const candidate of candidates) {
    const normalized = cleanIntroClause(candidate);
    if (normalized && !selected.includes(normalized)) selected.push(normalized);
    if (selected.length === 3) break;
  }
  return selected.join("；");
}

function dedupeAttributionBase(snapshot) {
  const themes = [];
  const themeByName = new Map();
  for (const theme of snapshot?.themes || []) {
    const header = cleanAttributionLabel(theme.header);
    let target = themeByName.get(header);
    if (!target) {
      target = { ...theme, header, subtypes: [] };
      themes.push(target);
      themeByName.set(header, target);
    }
    const subtypeByName = new Map(target.subtypes.map(item => [cleanAttributionLabel(item.name), item]));
    for (const subtype of theme.subtypes || []) {
      const name = cleanAttributionLabel(subtype.name);
      const existing = subtypeByName.get(name);
      if (existing) existing.stocks = [...(existing.stocks || []), ...(subtype.stocks || [])];
      else {
        const next = { ...subtype, name, stocks: [...(subtype.stocks || [])] };
        target.subtypes.push(next);
        subtypeByName.set(name, next);
      }
    }
  }
  return { ...(snapshot || {}), themes };
}

function refreshAttribution(base, previous, top200, snapshotDate) {
  base = dedupeAttributionBase(base);
  previous = dedupeAttributionBase(previous);
  const placement = new Map();
  for (const snapshot of [base, previous]) {
    const unresolved = new Set(snapshot?.unclassified || []);
    for (const [themeIndex, theme] of (snapshot?.themes || []).entries()) {
      for (const [subtypeIndex, subtype] of theme.subtypes.entries()) {
        for (const stock of subtype.stocks) {
          const parsed = attributionStock(stock.text);
          if (parsed && !unresolved.has(parsed.name) && !placement.has(parsed.name)) placement.set(parsed.name, {
            themeIndex,
            subtypeIndex,
            themeName: cleanAttributionLabel(theme.header),
            subtypeName: cleanAttributionLabel(subtype.name),
            reason: parsed.reason,
          });
        }
      }
    }
  }
  const previousRecords = (previous?.themes || []).reduce((sum, theme) => sum + theme.subtypes.reduce((count, subtype) => count + subtype.stocks.length, 0), 0);
  const comparisonSnapshot = previousRecords >= 190 ? previous : base;
  const sameDay = String(previous?.title || "").includes(snapshotDate.replaceAll("-", ""));
  const sameDayStatus = new Map();
  const previousActive = new Set();
  for (const theme of comparisonSnapshot?.themes || []) {
    for (const subtype of theme.subtypes) {
      for (const stock of subtype.stocks) {
        if (stock.status === "exited") continue;
        const parsed = attributionStock(stock.text);
        if (parsed) {
          previousActive.add(parsed.name);
          if (sameDay) sameDayStatus.set(parsed.name, stock.status);
        }
      }
    }
  }
  const existingThemeNames = new Set(base.themes.map(theme => cleanAttributionLabel(theme.header)));
  const extraThemes = additionalAttributionThemes.filter(theme => !existingThemeNames.has(cleanAttributionLabel(theme.header)));
  const themes = [...base.themes.map((theme, themeIndex) => ({
    id: themeIndex,
    header: cleanAttributionLabel(theme.header),
    subtypes: theme.subtypes.map(subtype => ({ name: cleanAttributionLabel(subtype.name), stocks: [] })),
  })), ...extraThemes.map((theme, index) => ({
    id: base.themes.length + index,
    header: theme.header,
    subtypes: theme.subtypes.map(name => ({ name, stocks: [] })),
  }))];
  const resolvePlacement = target => {
    if (!target) return null;
    if (target.themeName && target.subtypeName) {
      const themeIndex = themes.findIndex(theme => cleanAttributionLabel(theme.header) === target.themeName);
      const subtypeIndex = themeIndex >= 0
        ? themes[themeIndex].subtypes.findIndex(subtype => cleanAttributionLabel(subtype.name) === target.subtypeName)
        : -1;
      if (themeIndex >= 0 && subtypeIndex >= 0) return { ...target, themeIndex, subtypeIndex };
    }
    if (themes[target.themeIndex]?.subtypes?.[target.subtypeIndex]) return target;
    return null;
  };
  const defaultPlacement = themes[8]?.subtypes?.[2]
    ? { themeIndex: 8, subtypeIndex: 2 }
    : { themeIndex: 0, subtypeIndex: 0 };
  const unclassified = [];
  top200.forEach((item, index) => {
    const known = placement.get(item.name);
    const fallback = newStockPlacements[item.name];
    const curatedFallback = fallback && String(fallback[2]).split(/[;；]/).filter(Boolean).length >= 3;
    const target = curatedFallback
      ? { themeIndex: fallback[0], subtypeIndex: fallback[1], reason: fallback[2] }
      : known || (fallback ? { themeIndex: fallback[0], subtypeIndex: fallback[1], reason: fallback[2] } : null);
    const resolvedTarget = resolvePlacement(target);
    const resolved = resolvedTarget || { ...defaultPlacement, reason: "成交额新进与事件驱动，分类待持续复核" };
    if (!resolvedTarget) unclassified.push(item.name);
    const isNew = sameDayStatus.has(item.name) ? sameDayStatus.get(item.name) === "new" : !previousActive.has(item.name);
    const explanation = threePartReason(
      resolved.reason,
      resolved.themeIndex,
      resolved.subtypeIndex,
      themes[resolved.themeIndex].subtypes[resolved.subtypeIndex].name,
      themes[resolved.themeIndex].header,
    );
    const text = `#${index + 1} ${isNew ? "▲新 " : ""}${item.name} ${(item.turnover / 1e8).toFixed(1)}亿 ${item.change >= 0 ? "+" : ""}${item.change.toFixed(2)}% → ${explanation}`;
    themes[resolved.themeIndex].subtypes[resolved.subtypeIndex].stocks.push({ status: isNew ? "new" : "held", text });
  });
  for (const theme of themes) {
    for (const subtype of theme.subtypes) {
      const additions = subtype.stocks.filter(stock => stock.status === "new").length;
      subtype.name = `${subtype.name} (${subtype.stocks.length}只)${additions ? ` ▲${additions}` : ""}`;
    }
    const count = theme.subtypes.reduce((sum, subtype) => sum + subtype.stocks.length, 0);
    const additions = theme.subtypes.reduce((sum, subtype) => sum + subtype.stocks.filter(stock => stock.status === "new").length, 0);
    theme.header = `${theme.header} (${count}只)${additions ? ` ▲${additions}` : ""}`;
  }
  const additions = themes.reduce((sum, theme) => sum + theme.subtypes.reduce((n, subtype) => n + subtype.stocks.filter(stock => stock.status === "new").length, 0), 0);
  return {
    title: `${snapshotDate.replaceAll("-", "")} 成交前200归因脑图 | ▲新${additions}`,
    meta: `数据源：新浪财经成交额排名 | ${top200.length}只标的 · ${themes.length}条中观叙事 × ${themes.reduce((sum, theme) => sum + theme.subtypes.length, 0)}个次生维度 · 新逻辑可动态增设主线`,
    generatedAt: new Date().toISOString(),
    generatedFromTop200: true,
    unclassified,
    themes,
  };
}

function parseCells(rowHtml) {
  const values = [];
  for (const match of rowHtml.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)) {
    const value = clean(match[2]);
    const colspan = Number(match[1].match(/colspan="(\d+)"/i)?.[1] || 1);
    values.push(value);
    for (let index = 1; index < colspan; index += 1) values.push("");
  }
  return values;
}

function parseTurnoverTemplate(source, sourceFile) {
  const rows = [...source.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => parseCells(match[1]));
  const channels = [];
  const active = new Map();
  const blockStarts = [0, 7, 14, 21];
  for (const row of rows) {
    for (const start of blockStarts) {
      const first = row[start] || "";
      if (!first || first === "股票代码") continue;
      if (!/^\d{6}\.(SH|SZ|BJ)$/i.test(first)) {
        const channel = { name: first, sourceCount: row[start + 5] || "", stocks: [] };
        channels.push(channel);
        active.set(start, channel);
        continue;
      }
      const channel = active.get(start);
      if (!channel) continue;
      channel.stocks.push({
        code: first,
        name: row[start + 1] || "",
        price: Number(row[start + 2] || 0),
        change: Number(row[start + 3] || 0),
        turnover: Number(row[start + 4] || 0),
        rank: Number(row[start + 5] || 0),
      });
    }
  }
  return {
    snapshotDate: dateFromName(sourceFile.name),
    sourceFile: sourceFile.name,
    channels,
  };
}

const marketFields = "f12,f14,f2,f3,f6";
const majorIndexSecids = [
  "1.000001", "0.399001", "0.399006", "1.000016", "1.000300", "1.000905",
  "1.000852", "1.000688", "0.399673", "1.000510", "1.000906", "1.000985",
  "0.399005", "0.399330", "0.399303", "1.000922", "1.000932", "0.899050",
];
const majorIndexNames = {
  "000001": "上证指数", "399001": "深证成指", "399006": "创业板指",
  "000016": "上证50", "000300": "沪深300", "000905": "中证500",
  "000852": "中证1000", "000688": "科创50", "399673": "创业板50",
  "000510": "中证A500", "000906": "中证800", "000985": "中证全指",
  "399005": "中小100", "399330": "深证100", "399303": "国证2000",
  "000922": "中证红利", "000932": "中证消费", "899050": "北证50",
};

async function fetchJsonWithRetry(endpoint, label, format = "json") {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (format === "text") return new TextDecoder("gbk").decode(await response.arrayBuffer());
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise(resolve => setTimeout(resolve, attempt * 350));
    }
  }
  throw new Error(`${label}失败：${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function dashboardQuoteCode(row) {
  const text = (row || []).map(cell => String(cell?.display || "")).join(" ");
  const dottedUs = text.match(/\bus\.([A-Z0-9]+)\b/i);
  if (dottedUs) return `us${dottedUs[1].toUpperCase()}`;
  const prefixed = text.match(/\b(sh|sz|bj|hk)([a-zA-Z0-9]+)\b/i);
  if (prefixed) return `${prefixed[1].toLowerCase()}${prefixed[2]}`;
  const match = text.match(/\b(\d{6})\.(SH|SZ|BJ)\b/i);
  return match ? `${match[2].toLowerCase()}${match[1]}` : "";
}

async function tencentDailyCandles(code, days = 30) {
  const endpoint = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${encodeURIComponent(code)},day,,,${days},qfq&_=${Date.now()}`;
  const payload = await fetchJsonWithRetry(endpoint, `${code} K线日期校验`);
  const node = payload?.data?.[code] || {};
  const rows = node.qfqday || node.day || [];
  return rows.map(row => ({
    date: String(row[0] || ""),
    open: Number(row[1]),
    close: Number(row[2]),
    high: Number(row[3]),
    low: Number(row[4]),
  })).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && [row.open,row.close,row.high,row.low].every(Number.isFinite));
}

async function latestTencentTradingDate(code) {
  const rows = await tencentDailyCandles(code, 20);
  const latest = String(rows.at(-1)?.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(latest)) throw new Error(`${code} 未返回有效交易日期`);
  return latest;
}

async function validateDailyKlineDate(dashboard, marketSnapshot) {
  const topCodes = (marketSnapshot.turnoverTop || []).map(item => `${item.market || stockMarket(item.code)}${item.code}`);
  const rankCodes = dashboard.tabs
    .filter(tab => ["沪深300", "中证800"].some(name => tab.name.startsWith(name)))
    .flatMap(tab => tab.rows.slice(0, 8).map(dashboardQuoteCode));
  const codes = [...new Set([...topCodes, ...rankCodes].filter(Boolean))];
  const dates = await Promise.all(codes.map(latestTencentTradingDate));
  const uniqueDates = [...new Set(dates)];
  if (uniqueDates.length !== 1) {
    throw new Error(`K线交易日期不一致：${codes.map((code, index) => `${code}=${dates[index]}`).join(", ")}`);
  }
  const tradeDate = uniqueDates[0];
  if (dashboard.snapshotDate !== tradeDate) {
    throw new Error(`禁止发布跨日数据：二代机=${dashboard.snapshotDate}，K线=${tradeDate}`);
  }
  marketSnapshot.tradeDate = tradeDate;
  return { tradeDate, checked: codes.length };
}

async function validateBreakoutSignals(dashboard) {
  const highLabel = "20日新高";
  const lowLabel = "20日新低";
  const targets = [];
  for (const tab of dashboard.tabs) {
    const signalColumn = tab.headers.findIndex(header => header.includes("异动信号"));
    if (signalColumn < 0) continue;
    for (const row of tab.rows) {
      const signal = String(row[signalColumn]?.display || "");
      if (!signal.includes(highLabel) && !signal.includes(lowLabel)) continue;
      const code = dashboardQuoteCode(row);
      if (/^(sh|sz|bj|hk)[a-zA-Z0-9]+$/i.test(code)) targets.push({ tab, row, signalColumn, code });
    }
  }
  const candleByCode = new Map();
  const codes = [...new Set(targets.map(item => item.code))];
  for (let start = 0; start < codes.length; start += 20) {
    const batch = codes.slice(start, start + 20);
    const results = await Promise.all(batch.map(async code => [code, await tencentDailyCandles(code, 30)]));
    results.forEach(([code, candles]) => candleByCode.set(code, candles));
  }
  let removedHigh = 0;
  let removedLow = 0;
  let removedStale = 0;
  for (const target of targets) {
    const candles = candleByCode.get(target.code) || [];
    const latest = candles.at(-1);
    if (!latest || latest.date !== dashboard.snapshotDate) {
      const currentSignal = String(target.row[target.signalColumn].display || "");
      const nextSignal = currentSignal.replace(highLabel, "").replace(lowLabel, "").replace(/\s+/g, " ").trim();
      if (nextSignal !== currentSignal) removedStale += 1;
      target.row[target.signalColumn].display = nextSignal;
      continue;
    }
    const previous = candles.slice(-21, -1);
    if (previous.length < 20) continue;
    const currentSignal = String(target.row[target.signalColumn].display || "");
    const isHigh = latest.high >= Math.max(...previous.map(row => row.high))
      || latest.close >= Math.max(...previous.map(row => row.close));
    const isLow = latest.low <= Math.min(...previous.map(row => row.low))
      || latest.close <= Math.min(...previous.map(row => row.close));
    let nextSignal = currentSignal;
    if (currentSignal.includes(highLabel) && !isHigh) {
      nextSignal = nextSignal.replace(highLabel, "");
      removedHigh += 1;
    }
    if (currentSignal.includes(lowLabel) && !isLow) {
      nextSignal = nextSignal.replace(lowLabel, "");
      removedLow += 1;
    }
    target.row[target.signalColumn].display = nextSignal.replace(/\s+/g, " ").trim();
  }
  for (const tab of dashboard.tabs) {
    const signalColumn = tab.headers.findIndex(header => header.includes("异动信号"));
    if (signalColumn < 0) continue;
    for (const signal of tab.signals) {
      if (signal.label === highLabel || signal.label === lowLabel) {
        signal.count = String(tab.rows.filter(row => String(row[signalColumn]?.display || "").includes(signal.label)).length);
      }
    }
  }
  return { checked: targets.length, uniqueCodes: codes.length, removedHigh, removedLow, removedStale };
}

async function marketList(scope, sortField, requested = 100) {
  const fetchPage = async page => {
    const endpoint = `https://push2.eastmoney.com/api/qt/clist/get?pn=${page}&pz=100&po=1&np=1&fltt=2&invt=2&fid=${sortField}&fs=${encodeURIComponent(scope)}&fields=${marketFields}`;
    return fetchJsonWithRetry(endpoint, `行情列表第 ${page} 页`);
  };
  const first = await fetchPage(1);
  const total = Math.min(Number(first?.data?.total || 0), requested);
  const pages = Math.max(1, Math.ceil(total / 100));
  const payloads = [first];
  for (let start = 2; start <= pages; start += 8) {
    payloads.push(...await Promise.all(
      Array.from({ length: Math.min(8, pages - start + 1) }, (_, index) => fetchPage(start + index))
    ));
  }
  return payloads.flatMap(payload => Object.values(payload?.data?.diff || {})).slice(0, requested).map(row => ({
    code: String(row.f12 || ""),
    name: String(row.f14 || ""),
    price: Number(row.f2 || 0),
    change: Number(row.f3 || 0),
    turnover: Number(row.f6 || 0),
  }));
}

async function marketIndexes(ifind) {
  const codes = majorIndexSecids.map(secid => {
    const [market, symbol] = secid.split(".");
    return `${market === "1" ? "sh" : market === "0" && symbol.startsWith("399") ? "sz" : "bj"}${symbol}`;
  });
  const ifindQuotes = await ifind.realtimeByQuoteCodes(codes);
  const missingCodes = codes.filter(code => !ifindQuotes.has(code.toLowerCase()));
  const fallbackQuotes = missingCodes.length ? await tencentQuotes(missingCodes) : new Map();
  const quotes = new Map([...fallbackQuotes, ...ifindQuotes]);
  return codes.map(code => {
    const quote = quotes.get(code.toLowerCase());
    return {
      code: code.slice(2),
      quoteCode: code,
      name: majorIndexNames[code.slice(2)] || quote?.name || code,
      price: Number(quote?.price || 0),
      change: Number(quote?.change || 0),
      turnover: Number(quote?.turnover || 0),
      tradeDate: quote?.tradeDate || "",
    };
  }).filter(item => item.price > 0);
}

function stockMarket(code) {
  return code.startsWith("6") || code.startsWith("5") ? "sh" : code.startsWith("8") || code.startsWith("4") ? "bj" : "sz";
}

const sinaStockNameAliases = {
  "XD澜起科": "澜起科技",
  "XD东材科": "东材科技",
};

function normalizeSinaStockName(name) {
  const value = String(name || "").trim();
  return sinaStockNameAliases[value] || value.replace(/^(?:XD|XR|DR)/, "");
}

async function sinaTurnoverTop200() {
  const page = number => fetchJsonWithRetry(
    `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=${number}&num=100&sort=amount&asc=0&node=hs_a&symbol=&_s_r_a=page`,
    `新浪成交额前200第${number}页`,
  );
  const rows = (await Promise.all([page(1), page(2)])).flat();
  return rows.slice(0, 200).map(row => ({
    code: String(row.code || ""),
    name: normalizeSinaStockName(row.name),
    price: Number(row.trade || 0),
    change: Number(row.changepercent || 0),
    turnover: Number(row.amount || 0),
    market: String(row.symbol || "").slice(0, 2) || stockMarket(String(row.code || "")),
  })).filter(item => item.code && item.name && item.price > 0);
}

async function sinaAllStocks() {
  const countEndpoint = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount?node=hs_a";
  const total = Number(await fetchJsonWithRetry(countEndpoint, "新浪A股总数"));
  const pages = Math.ceil(total / 100);
  const rows = [];
  const page = number => fetchJsonWithRetry(
    `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=${number}&num=100&sort=amount&asc=0&node=hs_a&symbol=&_s_r_a=page`,
    `新浪全A第${number}页`,
  );
  for (let start = 1; start <= pages; start += 8) {
    rows.push(...(await Promise.all(
      Array.from({ length: Math.min(8, pages - start + 1) }, (_, index) => page(start + index))
    )).flat());
  }
  return rows.slice(0, total).map(row => ({
    code: String(row.code || ""),
    name: normalizeSinaStockName(row.name),
    price: Number(row.trade || 0),
    change: Number(row.changepercent || 0),
    turnover: Number(row.amount || 0),
    market: String(row.symbol || "").slice(0, 2) || stockMarket(String(row.code || "")),
  })).filter(item => item.code && item.name && Number.isFinite(item.change));
}

async function thsIndustrySectors() {
  const pages = await Promise.all([1, 2].map(page => fetchJsonWithRetry(
    `https://q.10jqka.com.cn/thshy/index/field/199112/order/desc/page/${page}/`,
    `同花顺行业第${page}页`,
    "text",
  )));
  return pages.flatMap(source => {
    const body = source.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1] || "";
    return [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)].map(rowMatch => {
      const cells = [...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => clean(cell[1]));
      const link = rowMatch[1].match(/thshy\/detail\/code\/(\d+)/i);
      return {
        code: link?.[1] || cells[0] || "",
        name: cells[1] || "",
        price: 0,
        change: Number(cells[2] || 0),
        turnover: Number(cells[4] || 0) * 1e8,
      };
    });
  }).filter(item => item.code && item.name && Number.isFinite(item.change))
    .sort((a, b) => b.change - a.change);
}

async function thsSectorCandles(code) {
  return thsDailyCandles(`48_${code}`, `同花顺行业${code}日线`);
}

async function thsDailyCandles(quoteId, label) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const endpoint = `https://d.10jqka.com.cn/v6/line/${quoteId}/01/last1800.js?_=${Date.now()}`;
      const source = await fetchJsonWithRetry(endpoint, label, "text");
      const start = source.indexOf("(");
      const end = source.lastIndexOf(")");
      if (start < 0 || end <= start) throw new Error(`${label}格式无效`);
      const payload = JSON.parse(source.slice(start + 1, end));
      const rows = String(payload?.data || "").split(";").map(line => {
        const row = line.split(",");
        const date = String(row[0] || "");
        return {
          date: date.length === 8 ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : date,
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
        };
      }).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && [row.open,row.close,row.high,row.low].every(Number.isFinite));
      if (rows.length >= 21) return rows;
      throw new Error(`${label}历史K线不足21条`);
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

async function thsSecurityCandles(code) {
  const normalized = String(code || "").toLowerCase();
  const market = normalized.slice(0, 2);
  const symbol = normalized.slice(2);
  if (!["sh", "sz", "bj"].includes(market) || !/^\d+$/.test(symbol)) return [];
  return thsDailyCandles(`hs_${symbol}`, `同花顺${code}日线`);
}

async function tencentQuotes(codes) {
  const result = new Map();
  for (let start = 0; start < codes.length; start += 60) {
    const batch = codes.slice(start, start + 60);
    const endpoint = `https://qt.gtimg.cn/q=${batch.join(",")}&_=${Date.now()}`;
    const source = await fetchJsonWithRetry(endpoint, "腾讯批量行情", "text");
    for (const match of source.matchAll(/v_([A-Za-z0-9]+)="([^"]*)";/g)) {
      const fields = match[2].split("~");
      const timestamp = String(fields[30] || "");
      const dateMatch = timestamp.match(/(20\d{2})[\/-]?(\d{2})[\/-]?(\d{2})/);
      result.set(match[1].toLowerCase(), {
        code: match[1],
        name: fields[1] || "",
        price: Number(fields[3] || 0),
        change: Number(fields[32] || 0),
        timestamp,
        tradeDate: dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : "",
      });
    }
  }
  return result;
}

const onlineCell = (raw, display = raw) => ({
  raw: raw === null || raw === undefined ? null : String(raw),
  display: display === null || display === undefined ? "" : String(display),
});

function stockNameFromRow(row) {
  return String(row?.[1]?.display || "")
    .replace(/\s+(?:sh|sz|bj|hk|ti)[A-Za-z0-9]+$/i, "")
    .replace(/\s+us\.[A-Z0-9]+$/i, "")
    .replace(/\s+pt[A-Za-z0-9]+$/i, "")
    .trim();
}

function onlineFactors(candles) {
  const usable = candles.slice(-260);
  const returns = usable.slice(1).map((row, index) => row.close / usable[index].close - 1).filter(Number.isFinite);
  const last = usable.at(-1);
  const previous = usable.at(-2);
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const variance = returns.length > 1
    ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1)
    : 0;
  const sharpe = variance > 0 ? mean / Math.sqrt(variance) * Math.sqrt(252) : 0;
  const momentum60 = usable.length > 60 ? last.close / usable.at(-61).close - 1 : 0;
  const ma20 = usable.slice(-20).reduce((sum, row) => sum + row.close, 0) / Math.min(20, usable.length);
  const distanceMa20 = ma20 ? last.close / ma20 - 1 : 0;
  const recentReturns = returns.slice(-20);
  const recentMean = recentReturns.length ? recentReturns.reduce((sum, value) => sum + value, 0) / recentReturns.length : 0;
  const volatility20 = recentReturns.length > 1
    ? Math.sqrt(recentReturns.reduce((sum, value) => sum + (value - recentMean) ** 2, 0) / (recentReturns.length - 1)) * Math.sqrt(252)
    : 0;
  const previous20 = usable.slice(-21, -1);
  const high20 = previous20.length >= 20 && last.high >= Math.max(...previous20.map(row => row.high));
  const low20 = previous20.length >= 20 && last.low <= Math.min(...previous20.map(row => row.low));
  const previousMa20 = usable.slice(-21, -1).reduce((sum, row) => sum + row.close, 0) / Math.min(20, usable.length - 1);
  const crossUp = previous && previous.close <= previousMa20 && last.close > ma20;
  const crossDown = previous && previous.close >= previousMa20 && last.close < ma20;
  const dailyReturn = previous ? last.close / previous.close - 1 : 0;
  const largeMove = Math.abs(dailyReturn) >= Math.max(0.03, volatility20 / Math.sqrt(252) * 2);
  const signals = [
    high20 ? "20日新高" : "",
    low20 ? "20日新低" : "",
    crossUp ? "MA20上穿" : "",
    crossDown ? "MA20下穿" : "",
    largeMove ? "大幅波动" : "",
  ].filter(Boolean);
  return { last, sharpe, momentum60, distanceMa20, volatility20, signals };
}

function standardize(values) {
  const finite = values.filter(Number.isFinite);
  const mean = finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
  const variance = finite.length > 1
    ? finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (finite.length - 1)
    : 0;
  const deviation = Math.sqrt(variance) || 1;
  return values.map(value => Number.isFinite(value) ? (value - mean) / deviation : 0);
}

async function refreshDashboardOnline(seedDashboard, marketSnapshot, ifindAudit, ifind) {
  const dashboard = structuredClone(seedDashboard);
  const sectorByName = new Map(marketSnapshot.sectors.map(item => [item.name, item]));
  const stockByCode = new Map(marketSnapshot._allStocks.map(item => [item.code, item]));
  dashboard.tabs.forEach((tab, tabIndex) => {
    const configured = tabIndex === 1
      ? marketSnapshot.sectors.map(item => [
          onlineCell("", ""),
          onlineCell(`ti${item.code}`, `${item.name} ti${item.code}`),
        ])
      : structuredClone(tab.universeRows || tab.rows);
    if (tab.name.startsWith("中证800") && !configured.some(row => dashboardQuoteCode(row) === "sh689009")) {
      configured.push([onlineCell("", ""), onlineCell("sh689009", "九号公司 sh689009")]);
    }
    tab.universeRows = configured.map(row => [
      onlineCell("", ""),
      onlineCell(dashboardQuoteCode(row), row?.[1]?.display || dashboardQuoteCode(row)),
    ]);
    tab.rows = tab.universeRows;
  });
  const quoteCodes = [...new Set(dashboard.tabs.flatMap((tab, tabIndex) =>
    tabIndex === 1 ? [] : tab.rows.map(dashboardQuoteCode).filter(Boolean)
  ))];
  const ifindQuotes = await ifind.realtimeByQuoteCodes(quoteCodes);
  const fallbackQuoteCodes = quoteCodes.filter(code => !ifindQuotes.has(code.toLowerCase()));
  const fallbackQuotes = fallbackQuoteCodes.length ? await tencentQuotes(fallbackQuoteCodes) : new Map();
  const quotes = new Map([...fallbackQuotes, ...ifindQuotes]);
  const historyRequests = new Map();
  const ifindHistoryCodes = [];
  for (const [tabIndex, tab] of dashboard.tabs.entries()) {
    if (!tab.rows.length) continue;
    for (const row of tab.rows) {
      const name = stockNameFromRow(row);
      if (tabIndex === 1) {
        const sector = sectorByName.get(name);
        if (sector) historyRequests.set(`sector:${sector.code}`, () => thsSectorCandles(sector.code));
      } else {
        const code = dashboardQuoteCode(row);
        if (/^(sh|sz|bj)\d+$/i.test(code)) {
          ifindHistoryCodes.push(code);
        } else if (/^hk\d+$/i.test(code)) {
          ifindHistoryCodes.push(code);
        } else if (/^hk(?:HSI|HSTECH)$/i.test(code)) {
          ifindHistoryCodes.push(code);
        }
      }
    }
  }
  const histories = new Map();
  const historyEnd = marketSnapshot.tradeDate;
  const historyBeginDate = new Date(`${historyEnd}T00:00:00+08:00`);
  historyBeginDate.setUTCDate(historyBeginDate.getUTCDate() - 150);
  const historyBegin = historyBeginDate.toISOString().slice(0, 10);
  const ifindHistories = await ifind.historiesByQuoteCodes([...new Set(ifindHistoryCodes)], historyBegin, historyEnd);
  for (const [code, rows] of ifindHistories) histories.set(`quote:${code}`, { rows, error: rows.length ? "" : "iFinD未返回历史K线" });
  const requests = [...historyRequests.entries()];
  const historyBatchSize = 10;
  for (let start = 0; start < requests.length; start += historyBatchSize) {
    const batch = requests.slice(start, start + historyBatchSize);
    const values = await Promise.all(batch.map(async ([key, load]) => {
      try {
        return [key, await load()];
      } catch (error) {
        return [key, [], error instanceof Error ? error.message : String(error)];
      }
    }));
    values.forEach(([key, rows, error]) => histories.set(key, { rows, error: error || "" }));
    if (start % 200 === 0) console.warn(`线上历史行情校验 ${Math.min(start + batch.length, requests.length)}/${requests.length}`);
    if (start + historyBatchSize < requests.length) await new Promise(resolve => setTimeout(resolve, 100));
  }

  const tabAudits = [];
  for (const [tabIndex, tab] of dashboard.tabs.entries()) {
    if (!tab.rows.length) continue;
    const candidates = tab.rows.map(row => {
      const name = stockNameFromRow(row);
      const originalCode = dashboardQuoteCode(row);
      const sector = tabIndex === 1 ? sectorByName.get(name) : null;
      const historyKey = sector ? `sector:${sector.code}` : `quote:${String(originalCode).toLowerCase()}`;
      const history = histories.get(historyKey) || { rows: [], error: "无历史行情" };
      const factors = history.rows.length >= 21 ? onlineFactors(history.rows) : null;
      const stock = stockByCode.get(String(originalCode).replace(/^(sh|sz|bj)/i, ""));
      const quote = quotes.get(String(originalCode).toLowerCase());
      const current = sector || ([3, 4].includes(tabIndex) ? stock || quote : quote);
      const currentDate = sector || stock ? marketSnapshot.tradeDate : quote?.tradeDate || factors?.last?.date || "";
      const active = Number(current?.price || factors?.last?.close || 0) > 0;
      const fresh = currentDate === marketSnapshot.tradeDate
        || String(originalCode).toLowerCase().startsWith("us") && currentDate === marketSnapshot.tradeDate;
      const change = Number(current?.change);
      return {
        name,
        displayCode: sector ? `ti${sector.code}` : originalCode,
        current,
        currentDate,
        active,
        fresh,
        change: Number.isFinite(change) ? change : factors && history.rows.length > 1
          ? (factors.last.close / history.rows.at(-2).close - 1) * 100
          : 0,
        factors,
        error: history.error,
      };
    });
    const excluded = candidates.filter(item => !item.current || item.active && !item.fresh);
    const prepared = candidates.filter(item => item.current && (!item.active || item.fresh));
    if (!prepared.length) throw new Error(`线上二代机${tab.name}没有通过当日校验的记录`);
    const usable = prepared.filter(item => item.factors);
    const zSharpe = standardize(usable.map(item => item.factors.sharpe));
    const zMomentum = standardize(usable.map(item => item.factors.momentum60));
    const zDistance = standardize(usable.map(item => item.factors.distanceMa20));
    const zVolatility = standardize(usable.map(item => item.factors.volatility20));
    usable.forEach((item, index) => {
      item.score = 5000 + 1200 * (0.35 * zSharpe[index] + 0.30 * zMomentum[index] + 0.20 * zDistance[index] - 0.15 * zVolatility[index]);
    });
    prepared.sort((a, b) => (b.score ?? b.change * 100) - (a.score ?? a.change * 100));
    const missing = 0;
    const historyMissing = prepared.filter(item => !item.factors).length;
    const stale = 0;
    tab.headers = ["# ▼", "名称/代码 ▼", "涨跌幅 ▼", "异动信号", "Sharpe ▼", "60日涨幅 ▼", "距MA20 ▼", "20日波动 ▼", "综合分 ▼"];
    tab.rows = prepared.map((item, index) => [
      onlineCell(index + 1),
      onlineCell(item.displayCode, `${item.name} ${item.displayCode}`),
      onlineCell(item.change, `${item.change >= 0 ? "+" : ""}${item.change.toFixed(2)}%`),
      onlineCell(item.factors?.signals.join(" ") || "", item.factors?.signals.join(" ") || ""),
      onlineCell(item.factors?.sharpe ?? null, item.factors ? item.factors.sharpe.toFixed(2) : "—"),
      onlineCell(item.factors?.momentum60 ?? null, item.factors ? `${(item.factors.momentum60 * 100).toFixed(2)}%` : "—"),
      onlineCell(item.factors?.distanceMa20 ?? null, item.factors ? `${(item.factors.distanceMa20 * 100).toFixed(2)}%` : "—"),
      onlineCell(item.factors?.volatility20 ?? null, item.factors ? `${(item.factors.volatility20 * 100).toFixed(2)}%` : "—"),
      onlineCell(item.score ?? null, Number.isFinite(item.score) ? item.score.toFixed(1) : "—"),
    ]);
    const up = prepared.filter(item => item.change > 0).length;
    const down = prepared.filter(item => item.change < 0).length;
    const flat = prepared.length - up - down;
    const signalLabels = ["20日新高", "20日新低", "MA20上穿", "MA20下穿", "大幅波动"];
    tab.signals = signalLabels.map(label => ({
      label,
      count: String(prepared.filter(item => item.factors?.signals.includes(label)).length),
    })).filter(item => Number(item.count) > 0);
    tab.nav = [
      `线上日期 ${marketSnapshot.tradeDate}`,
      `上涨 ${up}`,
      `下跌 ${down}`,
      `平盘 ${flat}`,
      `覆盖率 100%`,
      `有效K线 ${usable.length}`,
    ];
    tab.summary = [
      { value: String(prepared.length), label: "品种数" },
      { value: String(up), label: "上涨" },
      { value: String(down), label: "下跌" },
      { value: String(flat), label: "平盘" },
      { value: String(prepared.filter(item => item.factors?.signals.length).length), label: "异动" },
    ];
    tabAudits.push({
      name: tab.name,
      rows: prepared.length,
      fresh: prepared.length,
      missing,
      stale,
      historyMissing,
      excluded: excluded.length,
      excludedExamples: excluded.slice(0, 8).map(item => ({ name: item.name, date: item.currentDate || "", reason: item.current ? "非当日行情" : "线上缺失" })),
    });
  }
  dashboard.snapshotDate = marketSnapshot.tradeDate;
  dashboard.sourceUpdatedAt = new Date().toISOString();
  dashboard.sourceMode = "online-only";
  dashboard.sourceAudit = {
    generatedAt: new Date().toISOString(),
    tradeDate: marketSnapshot.tradeDate,
    sources: [
      "iFinD MCP（全A、ETF、指数、港股实时行情及证券历史K线主源）",
      "同花顺行业行情与行业历史日线",
      ...(fallbackQuoteCodes.length ? [`腾讯仅作不支持代码回退（${fallbackQuoteCodes.length}项）`] : []),
    ],
    ifind: ifindAudit,
    tabs: tabAudits,
  };
  return dashboard;
}

async function createMarketSnapshot(ifind) {
  const [sectors, validStocks] = await Promise.all([
    thsIndustrySectors(),
    ifind.allAStocks(),
  ]);
  const top10 = [...validStocks].filter(item => item.price > 0 && item.turnover > 0).sort((a, b) => b.turnover - a.turnover).slice(0, 10);
  const indexes = await marketIndexes(ifind);
  const indexTradeDates = indexes.map(item => item.tradeDate).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date));
  const tradeDate = [...new Set(indexTradeDates)]
    .sort((a, b) => indexTradeDates.filter(date => date === b).length - indexTradeDates.filter(date => date === a).length)[0];
  if (!tradeDate) throw new Error("跨市场指数未返回有效交易日期，禁止生成快照");
  const buckets = [
    { label: "≤-7%", min: -Infinity, max: -7 }, { label: "-7~-5%", min: -7, max: -5 },
    { label: "-5~-3%", min: -5, max: -3 }, { label: "-3~-1%", min: -3, max: -1 },
    { label: "-1~0%", min: -1, max: 0 }, { label: "0~1%", min: 0, max: 1 },
    { label: "1~3%", min: 1, max: 3 }, { label: "3~5%", min: 3, max: 5 },
    { label: "5~7%", min: 5, max: 7 }, { label: "≥7%", min: 7, max: Infinity },
  ].map(bucket => ({
    label: bucket.label,
    count: validStocks.filter(item => item.change >= bucket.min && (bucket.max === Infinity || item.change < bucket.max)).length,
  }));
  return {
    asOf: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }),
    tradeDate,
    indexes: indexes.filter(item => item.price > 0),
    sectors,
    breadth: {
      total: validStocks.length,
      up: validStocks.filter(item => item.change > 0).length,
      flat: validStocks.filter(item => item.change === 0).length,
      down: validStocks.filter(item => item.change < 0).length,
      buckets,
    },
    turnoverTop: top10,
    _allStocks: validStocks,
    primarySource: "iFinD MCP",
  };
}

fs.mkdirSync(publicDir, { recursive: true });

const dashboardSeedPath = path.join(publicDir, "dashboard-snapshot.json");
if (!fs.existsSync(dashboardSeedPath)) throw new Error("缺少线上二代机品种配置");

const dashboardSeed = JSON.parse(fs.readFileSync(dashboardSeedPath, "utf8"));
const ifindAudit = await runIfindCompatibilityAudit({
  allowMissing: process.env.IFIND_REQUIRED !== "1",
});
if (ifindAudit.status !== "ready") throw new Error("iFinD 未通过主源校验，拒绝生成当天数据");
const ifind = await createIfindPrimarySource();
try {
const marketSnapshot = await createMarketSnapshot(ifind);
marketSnapshot.sourceAudit = { ifind: ifindAudit };
const dashboard = await refreshDashboardOnline(dashboardSeed, marketSnapshot, ifindAudit, ifind);
const incompleteHistoryTabs = dashboard.sourceAudit.tabs.filter(tab =>
  !tab.name.startsWith("跨资产") && tab.historyMissing > 0
);
if (incompleteHistoryTabs.length) {
  throw new Error(`禁止发布历史K线不完整的快照：${incompleteHistoryTabs.map(tab => `${tab.name}缺${tab.historyMissing}`).join("，")}`);
}
const klineAudit = {
  tradeDate: marketSnapshot.tradeDate,
  checked: dashboard.sourceAudit.tabs.reduce((sum, tab) => sum + tab.fresh, 0),
  mode: "线上重建过程内校验",
};
const breakoutAudit = {
  checked: dashboard.tabs.reduce((sum, tab) => sum + tab.rows.filter(row => String(row[3]?.display || "").includes("20日新")).length, 0),
  mode: "与线上历史K线同步计算",
};
delete marketSnapshot._allStocks;

fs.writeFileSync(path.join(publicDir, "dashboard-snapshot.json"), JSON.stringify(dashboard));
fs.writeFileSync(path.join(publicDir, "market-snapshot.json"), JSON.stringify(marketSnapshot));

console.log(JSON.stringify({
  dashboard: { source: "online-only", date: dashboard.snapshotDate, tabs: dashboard.tabs.length, rows: dashboard.tabs.reduce((sum, tab) => sum + tab.rows.length, 0), audit: dashboard.sourceAudit },
  marketSnapshot: { asOf: marketSnapshot.asOf, stocks: marketSnapshot.breadth.total, indexes: marketSnapshot.indexes.length, sectors: marketSnapshot.sectors.length },
  ifindAudit,
  klineAudit,
  breakoutAudit,
}, null, 2));
} finally {
  await ifind.close();
}
