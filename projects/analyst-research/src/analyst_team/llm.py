from __future__ import annotations

import json

from agents import Agent, Runner

from .article_lake import ArticleDocument, ArticleLake
from .config import Settings
from .schemas import AnalystAnswer, AnalystDNA, ArticleDistillation

DISTILLATION_INSTRUCTIONS = """你是研究文章证据蒸馏器。只提取正文明确支持的内容。
保留作者的因果方向、约束条件和时间尺度。证据字段写可定位的简短释义。
正文缺失的字段返回空数组。禁止补充外部事实，禁止把修辞风格当作研究观点。"""

DNA_INSTRUCTIONS = """你是分析师方法论归纳器。输入是多篇带 article_id 的观点对象。
归纳作者如何思考问题，每条规则必须列出至少一篇直接支持文章。
相互冲突或只有一次出现的材料保持为弱证据，规则使用准确、可证伪的肯定句。"""


class AnalystLLM:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings()

    def distill(self, document: ArticleDocument) -> ArticleDistillation:
        agent = Agent(
            name="Article Distiller",
            instructions=DISTILLATION_INSTRUCTIONS,
            model=self.settings.openai_model,
            output_type=ArticleDistillation,
        )
        prompt = json.dumps({
            "article_id": document.article_id,
            "title": document.title,
            "published_at": document.published_at,
            "content": document.content,
        }, ensure_ascii=False)
        return Runner.run_sync(agent, prompt).final_output

    def synthesize_dna(self, lake: ArticleLake) -> AnalystDNA:
        objects = [json.loads(path.read_text(encoding="utf-8")) for path in sorted((lake.root / "distilled").glob("*.json"))]
        if not objects:
            raise RuntimeError("DNA synthesis requires at least one distilled article")
        agent = Agent(
            name="Analyst DNA Synthesizer",
            instructions=DNA_INSTRUCTIONS,
            model=self.settings.openai_model,
            output_type=AnalystDNA,
        )
        return Runner.run_sync(agent, json.dumps(objects, ensure_ascii=False)).final_output

    def answer(self, question: str, context: str, dna: AnalystDNA) -> AnalystAnswer:
        agent = Agent(
            name="Evidence-backed Analyst",
            instructions=(
                "严格区分历史相关观点与基于框架的新推演。historical_views 只写检索材料明确支持的观点；"
                "model_inference 只写当前推演，并明确其模型属性。sources 只列实际提供的文章。"
            ),
            model=self.settings.openai_model,
            output_type=AnalystAnswer,
        )
        payload = {"question": question, "dna": dna.model_dump(), "retrieved_articles": context}
        return Runner.run_sync(agent, json.dumps(payload, ensure_ascii=False)).final_output
