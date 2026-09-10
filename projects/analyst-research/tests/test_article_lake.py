from pathlib import Path

from analyst_team.article_lake import ArticleLake
from analyst_team.config import Settings


def test_reads_markdown_and_skips_indexes(tmp_path: Path) -> None:
    settings = Settings(data_root=tmp_path)
    lake = ArticleLake("sample", settings)
    (lake.root / "markdown" / "a.md").write_text(
        "---\ntitle: 测试\narticle_id: a-1\ndate: 2026-01-01\nurl: https://example.com/a\n---\n正文",
        encoding="utf-8",
    )
    (lake.root / "markdown" / "_索引.md").write_text("索引", encoding="utf-8")
    documents = lake.documents()
    assert len(documents) == 1
    assert documents[0].article_id == "a-1"
    assert documents[0].content == "正文"

