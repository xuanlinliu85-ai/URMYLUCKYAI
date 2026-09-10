from __future__ import annotations

from .article_lake import ArticleLake
from .config import Settings


class LightRAGIndex:
    """Namespace-isolated LightRAG adapter; all retrieval mechanics stay upstream."""

    def __init__(self, analyst_id: str, settings: Settings | None = None) -> None:
        self.settings = settings or Settings()
        self.analyst_id = analyst_id
        self.working_dir = self.settings.analyst_dir(analyst_id) / "lightrag"

    async def _rag(self):
        from lightrag import LightRAG
        from lightrag.kg.shared_storage import initialize_pipeline_status
        from lightrag.llm.openai import openai_complete_if_cache, openai_embed

        self.working_dir.mkdir(parents=True, exist_ok=True)

        async def llm_func(prompt, system_prompt=None, history_messages=None, **kwargs):
            return await openai_complete_if_cache(
                self.settings.openai_model,
                prompt,
                system_prompt=system_prompt,
                history_messages=history_messages or [],
                **kwargs,
            )

        rag = LightRAG(working_dir=str(self.working_dir), llm_model_func=llm_func, embedding_func=openai_embed)
        await rag.initialize_storages()
        await initialize_pipeline_status()
        return rag

    async def index(self, lake: ArticleLake) -> int:
        rag = await self._rag()
        documents = lake.documents()
        for document in documents:
            await rag.ainsert(
                f"article_id: {document.article_id}\ntitle: {document.title}\nsource_url: {document.source_url or ''}\n\n{document.content}"
            )
        return len(documents)

    async def query(self, question: str, mode: str = "hybrid") -> str:
        from lightrag import QueryParam

        rag = await self._rag()
        return await rag.aquery(question, param=QueryParam(mode=mode))

