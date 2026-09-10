#!/usr/bin/env python3
"""Build the independent public-source corpus ledger for tantu-macro-analyst.

The script stores metadata and distilled evidence only. It never mirrors article bodies.
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "corpus" / "index.jsonl"
UA = "Mozilla/5.0 (compatible; AnalystCorpusAudit/2.1; +local-research)"
INDEX_URL = "https://www.jintiankansha.com/column/4zPjhwNTu7?page={}"
ANNUAL_2024_URL = "https://www.weibo.com/2453509265/P7B3xg5lp"
REQUEST_LOCK = threading.Lock()
LAST_REQUEST = 0.0


CURATED_2024 = [
    ("deep", "BOJ退出负利率的背景、现状和对全球套息交易的影响", "fx_rates"),
    ("market", "为什么8月初全球市场巨震并非完全因为Carry Trade逆转", "fx_rates"),
    ("market", "5句话理解CIP和UIP以及Carry trade和basis trade的差异", "fx_rates"),
    ("literature", "跨境美元贷款如何影响美元汇率", "fx_rates"),
    ("literature", "理解全球外汇交易市场（上）", "fx_rates"),
    ("literature", "理解全球外汇交易市场（下）", "fx_rates"),
    ("literature", "除了银行监管以外，还有哪些原因导致了抛补利率平价背离", "fx_rates"),
    ("deep", "理解Carry Trade", "fx_rates"),
    ("deep", "金价由何决定", "gold"),
    ("literature", "理解美元地位——一个文献综述", "dollar_system"),
    ("literature", "全球美元体系何去何从", "dollar_system"),
    ("literature", "17美分背后的故事——人类金融史上的主导货币变迁与原因", "dollar_system"),
    ("literature", "如何估算中国硬着陆对全球的外溢效应", "china_spillover"),
    ("literature", "理解美国的对华制裁", "trade_policy"),
    ("deep", "我国房贷-国债利差与其他经济体相比显著偏低吗", "china_rates"),
    ("deep", "为什么某些经济体的银行系统那么大", "banking"),
    ("market", "6月社融数据显示我国企业与家庭的财务状况冰火两重天", "china_macro"),
    ("market", "7月M1的下降中到底有多少来自于挤水分", "china_macro"),
    ("deep", "人民币结汇前景究竟多少——一个量化估计", "fx_rates"),
    ("market", "9月金融数据中与股票市场相关的几点观察", "china_macro"),
    ("deep", "中国疫情后的GDP数据存在显著高估吗", "china_macro"),
    ("market", "11月银行涉外收付款-证券净流出是否意味着外资正在疯狂抛售A股", "capital_flows"),
    ("market", "FXI购沽比和A股前景", "positioning"),
    ("market", "为什么逐步增加国债购买不意味着QE，YCC更不是MMT", "central_banking"),
    ("deep", "如果PBOC开始购债——基于1990至2008年间美联储公开市场操作经验的分析", "central_banking"),
    ("market", "降息必然会导致人民币贬值吗", "fx_rates"),
    ("market", "对央行9月末一揽子政策的详细讨论", "central_banking"),
    ("deep", "对SFISF的几点技术讨论（上）", "central_banking"),
    ("deep", "对SFISF的几点技术讨论（下）", "central_banking"),
    ("market", "聊聊央行推出的买断式逆回购工具", "central_banking"),
    ("literature", "为什么疫情后欧元区特别是德国的经济表现如此低迷", "europe"),
    ("market", "应当对法国政治风险感到担忧吗", "europe"),
    ("literature", "泡沫/通缩时期的日本经济与经济政策读书笔记（一）", "japan"),
    ("literature", "泡沫/通缩时期的日本经济与经济政策读书笔记（二）", "japan"),
    ("literature", "泡沫/通缩时期的日本经济与经济政策读书笔记（三）", "japan"),
    ("literature", "泡沫/通缩时期的日本经济与经济政策读书笔记（四）", "japan"),
    ("literature", "泡沫/通缩时期的日本经济与经济政策读书笔记（五）", "japan"),
    ("literature", "BOJ购买日股ETF的文献笔记", "japan"),
    ("literature", "打破藩篱——重构印度经济未来读书笔记", "india"),
    ("literature", "新兴市场外债新原罪与美元薅羊毛的幕后黑手", "emerging_markets"),
    ("deep", "如何理解近期SOFR的跳升——兼论SOFR-ONRRP利差的决定因素", "dollar_liquidity"),
    ("deep", "大选追踪系列（十六）——回顾2017年特朗普减税的背景与三点共识", "us_fiscal"),
]


SEEDS = [
    ("2023-09-25", "美国财政分析手册 I——美国预算审批的法律流程与相关词汇详解", "us_fiscal", "https://weibo.com/ttarticle/p/show?id=2309404949982980735577", "deep"),
    ("2024-03-27", "《泡沫/通缩时期的日本经济与经济政策》读书笔记（二）", "japan", "https://weibo.com/ttarticle/p/show?id=2309405016649970352617", "literature"),
    ("2024-10-03", "如何理解近期SOFR的跳升——兼论SOFR-ONRRP利差的决定因素", "dollar_liquidity", "https://weibo.com/ttarticle/p/show?id=2309405085530042794191", "deep"),
    ("2024-12-18", "大选追踪系列（十六）——回顾2017年特朗普减税的背景与三点共识", "us_fiscal", "https://weibo.com/ttarticle/p/show?id=2309405113068102484626", "deep"),
    ("2025-01-12", "“离谱”的美债期限溢价", "us_rates", "https://weibo.com/ttarticle/p/show?id=2309405122102721380586", "deep"),
    ("2025-03-28", "海湖庄园协议：内容、评价与市场含义", "trade_policy", "https://weibo.com/ttarticle/p/show?id=2309405149291894407373", "deep"),
    ("2025-04-06", "关税冲击下的美元流动性状况", "dollar_liquidity", "https://www.weibo.com/ttarticle/p/show?id=2309405152381334585482", "deep"),
    ("2025-05-08", "新台币大幅升值的原因与前景展望", "fx_rates", "https://weibo.com/ttarticle/p/show?id=2309405163961732694078", "deep"),
    ("2025-05-26", "稳定币能救美债吗？", "stablecoins", "https://www.weibo.com/ttarticle/p/show?id=2309405170608668803173", "deep"),
    ("2025-06-20", "如何理解近期香港市场流动性的变化（上）", "hong_kong", "https://www.weibo.com/ttarticle/p/show?id=2309405179745422934383", "deep"),
    ("2026-01-01", "美日长端债券风波", "us_rates", "https://www.scribd.com/document/1026416250/", "deep"),
    ("2026-04-02", "从“故事”到“配置”——一个在混乱中寻找确定性的资产配置框架", "allocation", "https://www.bitget.com/zh-CN/news/detail/12560605330350", "deep"),
]


CURATED_2025_2026 = [
    ("2025", "关税冲击下的美元流动性评估与展望"),
    ("2025", "跟几个外贸行业朋友聊了一下对等关税对他们的影响"),
    ("2025", "翻译一下《关于中美经贸关系若干问题的中方立场》白皮书"),
    ("2025", "对等关税新一轮豁免的7个问题"),
    ("2025", "美债的风险不在短期，而在长期"),
    ("2025", "美英贸易框架性协议的细节及启示"),
    ("2025", "美联储放弃2%通胀目标了？——鲍威尔发言到底是什么意思"),
    ("2025", "美联储悄悄重启QE了？"),
    ("2025", "美国国际贸易法庭驳回特朗普IEEPA关税的分析和判断"),
    ("2025", "资本税降临？——Section 899的十个问题"),
    ("2025", "理解稳定币"),
    ("2025", "马斯克列传"),
    ("2025", "The Great Rebalance?——2025H2展望（1）"),
    ("2025", "如何理解近期香港市场流动性的变化（上）"),
    ("2025", "如何理解近期香港市场流动性的变化（下）"),
    ("2025", "霍尔木兹海峡封锁的5个问题"),
    ("2025", "减持还是对冲？——从台湾省险资的最新数据看近期美元贬值原因"),
    ("2025", "更新一下参议院版本OBBB法案的情况"),
    ("2025", "去中心化金融、稳定币与三次区块链革命"),
    ("2025", "对等关税2.0的七个问题"),
    ("2025", "稳定币：规则重塑还是新瓶旧酒（slides）"),
    ("2025", "GDP、棉花与承兑汇票——论港元稳定币如何破局"),
    ("2025", "特朗普要解雇鲍威尔？——进展、法律争议与市场含义"),
    ("2025", "401(k)入局加密货币的5个问题"),
    ("2025", "聊聊最近参加各种稳定币会议的感受"),
    ("2025", "怎样的“反内卷”才能提振总需求？——从罗斯福到凯恩斯"),
    ("2025", "回答6个关于铜关税的问题"),
    ("2025", "大超预期的PPI值得担忧吗？"),
    ("2025", "如何理解回购市场“危机”"),
    ("2025", "从2000年美国电信业崩盘看今天AI领域的泡沫风险"),
    ("2025", "10月FOMC速评：似鹰实鸽"),
    ("2025", "对Bessent和Greer记者会的总结和全文翻译"),
    ("2026-01-31", "只有时代的Warsh，没有Warsh的时代"),
    ("2026", "关于Kevin Warsh、贵金属和美联储的几个问题"),
    ("2026", "如何理解特朗普和贝森特在美元汇率问题上的矛盾发言？"),
    ("2026", "万物暴涨：复盘人类200年历史上的5次大宗商品超级周期"),
    ("2026", "“斩杀线”在哪——从SCF看美国贫困家庭的财务状况"),
    ("2026", "关于白银保证金上调导致银行破产传言的点评"),
    ("2026-02-09", "快速更新美元流动性数据情况和市场评论"),
    ("2026", "关于美国私募信贷市场风险事件的几个问题"),
    ("2026-03-04", "关于油价、通胀、美联储货币政策和大类资产流动性冲击"),
    ("2026-03-20", "美伊局势更新（2026/3/20）"),
    ("2026", "一场停火、各自表述"),
    ("2026", "累了。毁灭吧。"),
    ("2026-04-16", "霍尔木兹海峡危机会终结美元霸权吗？"),
    ("2026", "美联储主席换届=美股大跌？"),
    ("2026", "美国AI泡沫正处于“三期叠加态”"),
    ("2026", "déjà vu——写在10y美债破4.5%+全球资产普跌之际"),
    ("2026-05-28", "黄金怎么了？"),
    ("2026", "强非农就业源于世界杯吗？"),
    ("2026", "6月FOMC：Kevin Warsh的变与不变"),
    ("2026", "镜像1996——韩国会重演亚洲金融危机吗（万字长文）"),
    ("2026", "从故事到估值：AI是价值创造还是价值毁灭"),
    ("2026", "不是增加发行是增加回购，翻译反了"),
    ("2026-08-30", "Jackson Hole：框架变更清晰，薛定谔的加息（附发言原文）"),
]


def fetch(url: str) -> str:
    global LAST_REQUEST
    with REQUEST_LOCK:
        delay = 0.8 - (time.monotonic() - LAST_REQUEST)
        if delay > 0:
            time.sleep(delay)
        LAST_REQUEST = time.monotonic()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def clean(value: str) -> str:
    value = re.sub(r"<[^>]+>", "", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def infer_type(title: str) -> str:
    if re.search(r"翻译|编译|转载|嘉宾", title):
        return "translation_or_guest"
    if re.search(r"祝|活动|课程|招聘|简单介绍", title):
        return "promotion_or_notice"
    if re.search(r"深研|深度|框架|万字|手册|复盘", title):
        return "original_depth"
    if re.search(r"市场追踪|市场评论|速评|FOMC|展望|资产配置", title, re.IGNORECASE):
        return "original_market"
    return "original_research"


def infer_topic(title: str) -> str:
    rules = [
        (r"SOFR|回购|流动性|ONRRP|RRP|eSLR", "dollar_liquidity"),
        (r"美债|利率|期限溢价|长端债", "us_rates"),
        (r"财政|赤字|OBBB|债务|减税|Section 899", "us_fiscal"),
        (r"关税|贸易|外贸", "trade_policy"),
        (r"港元|香港|HIBOR", "hong_kong"),
        (r"稳定币|加密|区块链|401\(k\)", "stablecoins"),
        (r"黄金|白银|贵金属", "gold"),
        (r"日本|日债|BOJ|日元", "japan"),
        (r"汇率|美元|台币|人民币|CIP|Carry", "fx_rates"),
        (r"油价|原油|OPEC|霍尔木兹|伊朗", "geopolitics_energy"),
        (r"AI|科技|电信泡沫", "ai_valuation"),
        (r"FOMC|美联储|鲍威尔|Warsh", "fed"),
    ]
    for pattern, topic in rules:
        if re.search(pattern, title, re.IGNORECASE):
            return topic
    return "global_macro"


def article_id(title: str) -> str:
    return "tantu-" + hashlib.sha1(title.encode("utf-8")).hexdigest()[:12]


def record(*, title: str, published: str, source_url: str, source_kind: str,
           content_type: str, topic: str, fulltext: bool, longform: bool,
           date_precision: str = "day") -> dict:
    type_weight = {
        "original_depth": 1.0,
        "original_research": 1.0,
        "original_market": 0.85,
        "literature_distillation": 0.7,
        "translation_or_guest": 0.1,
        "promotion_or_notice": 0.05,
    }.get(content_type, 0.35)
    length_weight = 1.0 if longform else (0.85 if fulltext else 0.05)
    return {
        "id": article_id(title),
        "analyst": "tantu-macro",
        "title": title,
        "published_at": published,
        "date_precision": date_precision,
        "source_url": source_url,
        "source_kind": source_kind,
        "authorship": "GMF Research / 坦途宏观",
        "content_type": content_type,
        "topic": topic,
        "fulltext_verified": fulltext,
        "longform": longform,
        "body_retained": False,
        "copyright_note": "metadata and distilled evidence only",
        "weight": round(length_weight * type_weight * 0.95 * 0.9, 4),
    }


def parse_index_page(page: int) -> list[tuple[str, str]]:
    body = fetch(INDEX_URL.format(page))
    found: list[tuple[str, str]] = []
    for match in re.finditer(r'<a[^>]+href="(/t/[A-Za-z0-9]+)"[^>]*>(.*?)</a>', body, re.DOTALL):
        title = clean(match.group(2))
        if title and title not in {"坦途宏观", "上一页", "下一页"}:
            found.append((title, "https://www.jintiankansha.com" + match.group(1)))
    return list(dict.fromkeys(found))


def enrich_index(item: tuple[str, str]) -> dict:
    title, url = item
    published = "2025"
    try:
        body = fetch(url)
        match = re.search(r"(20\d{2}-\d{2}-\d{2})\s+\d{2}:\d{2}", body)
        if match:
            published = match.group(1)
    except Exception:
        pass
    content_type = infer_type(title)
    fulltext = content_type in {"original_depth", "original_research", "original_market"}
    longform = content_type == "original_depth" or (
        fulltext and bool(re.search(r"手册|框架|展望|五个问题|5个问题|十个问题|系列|深研|研究", title))
    )
    return record(
        title=title,
        published=published,
        source_url=url,
        source_kind="official-account index with original-article pointer",
        content_type=content_type,
        topic=infer_topic(title),
        fulltext=fulltext,
        longform=longform,
        date_precision="day" if len(published) == 10 else "year",
    )


def main() -> None:
    rows: dict[str, dict] = {}
    for published, title, topic, url, kind in SEEDS:
        rows[title] = record(
            title=title,
            published=published,
            source_url=url,
            source_kind="public full article or report mirror",
            content_type="original_depth" if kind == "deep" else "literature_distillation",
            topic=topic,
            fulltext=True,
            longform=True,
        )

    for kind, title, topic in CURATED_2024:
        rows.setdefault(
            title,
            record(
                title=title,
                published="2024",
                source_url=ANNUAL_2024_URL,
                source_kind="official 2024 annual report directory",
                content_type={
                    "deep": "original_depth",
                    "market": "original_market",
                    "literature": "literature_distillation",
                }[kind],
                topic=topic,
                fulltext=True,
                longform=kind in {"deep", "literature"},
                date_precision="year",
            ),
        )

    for published, title in CURATED_2025_2026:
        content_type = infer_type(title)
        fulltext = content_type not in {"translation_or_guest", "promotion_or_notice"}
        longform = fulltext and bool(re.search(
            r"深度|深研|框架|复盘|展望|问题|万字|手册|理解|原因|风险|周期|评估|影响|泡沫",
            title,
        ))
        rows.setdefault(
            title,
            record(
                title=title,
                published=published,
                source_url="https://www.jintiankansha.com/column/4zPjhwNTu7",
                source_kind="official-account archive index; original pointer retained by index",
                content_type=content_type,
                topic=infer_topic(title),
                fulltext=fulltext,
                longform=longform,
                date_precision="day" if len(published) == 10 else "year",
            ),
        )

    discovered: list[tuple[str, str]] = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(parse_index_page, page) for page in range(1, 5)]
        for future in as_completed(futures):
            try:
                discovered.extend(future.result())
            except Exception as exc:
                print(f"index warning: {exc}")
    discovered = list(dict.fromkeys(discovered))

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(enrich_index, item) for item in discovered]
        for future in as_completed(futures):
            row = future.result()
            rows.setdefault(row["title"], row)

    ordered = sorted(rows.values(), key=lambda row: (row["published_at"], row["title"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in ordered), encoding="utf-8")
    print(json.dumps({"written": len(ordered), "path": str(OUT), "as_of": date.today().isoformat()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
