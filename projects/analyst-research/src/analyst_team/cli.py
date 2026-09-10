from __future__ import annotations

import asyncio
import json
import subprocess

import typer

from .account_resolver import AccountResolver
from .article_lake import ArticleLake
from .config import Settings
from .upstreams import ARCHIVER_COMMIT, ARCHIVER_REPO, WechatArchiver

app = typer.Typer(help="Evidence-backed Analyst Team V1")
account_app = typer.Typer()
upstream_app = typer.Typer()
app.add_typer(account_app, name="account")
app.add_typer(upstream_app, name="upstream")


@upstream_app.command("install")
def install_upstream() -> None:
    settings = Settings()
    target = settings.third_party_root / "wechat-mp-obsidian-archiver"
    settings.third_party_root.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        subprocess.run(["git", "clone", ARCHIVER_REPO, str(target)], check=True)
    subprocess.run(["git", "fetch", "origin", ARCHIVER_COMMIT], cwd=target, check=True)
    subprocess.run(["git", "checkout", "--detach", ARCHIVER_COMMIT], cwd=target, check=True)
    typer.echo(f"archiver ready: {ARCHIVER_COMMIT}")


@account_app.command("resolve")
def resolve_account(name: str) -> None:
    typer.echo(json.dumps([item.model_dump() for item in AccountResolver().resolve(name)], ensure_ascii=False, indent=2))


@account_app.command("confirm")
def confirm_account(analyst_id: str, article_url: str, public_id: str) -> None:
    result = AccountResolver().confirm(analyst_id, article_url, public_id)
    typer.echo(result.model_dump_json(indent=2))


@app.command("collect")
def collect(analyst_id: str = "canghai-yitugou", since: str = "2020-01-01") -> None:
    config = Settings().analyst_config(analyst_id)
    if not config["verified"]:
        raise typer.BadParameter("confirm the account with a real article URL first")
    archiver = WechatArchiver()
    result = archiver.add(
        analyst_id,
        config["display_name"],
        config["verified_article_url"],
        since,
        config.get("wechat_mp_id"),
    )
    already_subscribed = "already subscribed" in (result.stderr or result.stdout)
    if result.returncode and not already_subscribed:
        typer.echo(result.stderr or result.stdout, err=True)
        raise typer.Exit(result.returncode)
    if already_subscribed:
        archiver.update_since(config["display_name"], since)
    lake = ArticleLake(analyst_id)
    if not lake.documents():
        stats = archiver.backfill(config["display_name"], min_articles=100)
        typer.echo(json.dumps(stats, ensure_ascii=False, indent=2))
        return
    sync = archiver.sync(config["display_name"])
    typer.echo(sync.stdout)
    if sync.returncode:
        typer.echo(sync.stderr, err=True)
        raise typer.Exit(sync.returncode)


@app.command("index")
def index_articles(analyst_id: str = "canghai-yitugou") -> None:
    from .retrieval import LightRAGIndex

    lake = ArticleLake(analyst_id)
    count = asyncio.run(LightRAGIndex(analyst_id).index(lake))
    typer.echo(f"indexed {count} articles")


@app.command("distill")
def distill_articles(analyst_id: str = "canghai-yitugou", limit: int = 100) -> None:
    from .llm import AnalystLLM

    lake = ArticleLake(analyst_id)
    llm = AnalystLLM()
    for document in lake.documents()[:limit]:
        output_path = lake.root / "distilled" / f"{document.article_id}.json"
        if output_path.exists():
            typer.echo(f"already distilled {document.article_id}")
            continue
        output = llm.distill(document)
        lake.write_distillation(document.article_id, output.model_dump(mode="json"))
        typer.echo(f"distilled {document.article_id}: {document.title}")


@app.command("dna")
def build_dna(analyst_id: str = "canghai-yitugou") -> None:
    from .llm import AnalystLLM

    lake = ArticleLake(analyst_id)
    dna = AnalystLLM().synthesize_dna(lake)
    path = lake.root / "dna" / "dna.json"
    path.write_text(dna.model_dump_json(indent=2) + "\n", encoding="utf-8")
    typer.echo(str(path))


@app.command("ask")
def ask(question: str, analyst_id: str = "canghai-yitugou") -> None:
    from .llm import AnalystLLM
    from .retrieval import LightRAGIndex
    from .schemas import AnalystDNA

    lake = ArticleLake(analyst_id)
    dna = AnalystDNA.model_validate_json((lake.root / "dna" / "dna.json").read_text(encoding="utf-8"))
    context = asyncio.run(LightRAGIndex(analyst_id).query(question))
    answer = AnalystLLM().answer(question, context, dna)
    typer.echo(answer.model_dump_json(indent=2))


@app.command("eval-retrieval")
def eval_retrieval(analyst_id: str = "canghai-yitugou") -> None:
    from .retrieval import LightRAGIndex

    settings = Settings()
    questions_path = settings.root / "config" / "retrieval_questions" / f"{analyst_id}.json"
    questions = json.loads(questions_path.read_text(encoding="utf-8"))
    retriever = LightRAGIndex(analyst_id)

    async def run() -> list[dict[str, str]]:
        results = []
        for question in questions:
            answer = await retriever.query(question)
            results.append({"question": question, "answer": answer})
        return results

    results = asyncio.run(run())
    output_dir = settings.analyst_dir(analyst_id) / "evaluations"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "retrieval.json"
    output_path.write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    typer.echo(str(output_path))


@app.command("status")
def status(analyst_id: str = "canghai-yitugou") -> None:
    settings = Settings()
    config = settings.analyst_config(analyst_id)
    lake = ArticleLake(analyst_id)
    payload = {
        "analyst_id": analyst_id,
        "identity_verified": config["verified"],
        "markdown_articles": len(lake.documents()),
        "distillations": len(list((lake.root / "distilled").glob("*.json"))),
        "dna_ready": (lake.root / "dna" / "dna.json").exists(),
        "skill_ready": (settings.root / "skills" / analyst_id / "SKILL.md").exists(),
        "retrieval_eval_ready": (lake.root / "evaluations" / "retrieval.json").exists(),
    }
    typer.echo(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    app()
