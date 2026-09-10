from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from dataclasses import dataclass

from .config import Settings

ARCHIVER_REPO = "https://github.com/halohazhang/wechat-mp-obsidian-archiver.git"
ARCHIVER_COMMIT = "1578159ef9c3208ca9ee6cf1ca1cc2a6e3652a20"


@dataclass(frozen=True)
class CommandResult:
    returncode: int
    stdout: str
    stderr: str


class WechatArchiver:
    """Thin command adapter around the pinned upstream archiver."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings()
        self.repo_dir = self.settings.third_party_root / "wechat-mp-obsidian-archiver"
        self.script = self.repo_dir / "skill" / "scripts" / "wechat_subscriptions.py"

    def require_installed(self) -> None:
        if not self.script.exists():
            raise RuntimeError("archiver is missing; run `analyst-team upstream install`")

    @staticmethod
    def _utf8_env() -> dict[str, str]:
        env = os.environ.copy()
        env["PYTHONUTF8"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        return env

    def _run(self, args: list[str]) -> CommandResult:
        self.require_installed()
        completed = subprocess.run(
            [sys.executable, str(self.script), *args],
            cwd=self.repo_dir,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=self._utf8_env(),
            check=False,
        )
        return CommandResult(completed.returncode, completed.stdout, completed.stderr)

    def _run_exporter(self, upstream: object, subscription: dict, manifest_path: object) -> dict:
        command = [
            sys.executable,
            str(upstream.FULLTEXT_EXPORTER),
            "--manifest",
            str(manifest_path),
            "--vault-dir",
            subscription["vaultDir"],
            "--subdir",
            subscription["subdir"],
            "--image-mode",
            subscription.get("imageMode", "local"),
            "--attachments-dir-name",
            subscription.get("attachmentsDirName", "_assets"),
            "--image-fallback",
            subscription.get("imageFallback", "remote"),
        ]
        if subscription.get("imageUploaderCmd"):
            command.extend(["--image-uploader-cmd", subscription["imageUploaderCmd"]])
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=self._utf8_env(),
            check=False,
        )
        if result.returncode:
            raise RuntimeError(f"exporter failed: {result.stderr.strip()[-500:]}")
        last_line = result.stdout.strip().splitlines()[-1] if result.stdout.strip() else "{}"
        try:
            return json.loads(last_line)
        except json.JSONDecodeError:
            return {"raw": last_line}

    def add(
        self,
        analyst_id: str,
        account_name: str,
        article_url: str,
        since: str = "2020-01-01",
        mp_id: str | None = None,
    ) -> CommandResult:
        output_dir = self.settings.analyst_dir(analyst_id) / "markdown"
        output_dir.mkdir(parents=True, exist_ok=True)
        identity_args = ["--mp-id", mp_id] if mp_id else ["--article-url", article_url]
        return self._run(
            [
                "add",
                *identity_args,
                "--source",
                "wewe-rss",
                "--account-name",
                account_name,
                "--vault-dir",
                str(output_dir),
                "--subdir",
                ".",
                "--image-mode",
                "remote",
                "--interval",
                "360",
                "--since",
                since,
            ]
        )

    def sync(self, account_name: str) -> CommandResult:
        return self._run(["run", account_name, "--force"])

    def update_since(self, account_name: str, since: str) -> bool:
        """Apply a collection window change to an existing subscription."""
        self.require_installed()
        spec = importlib.util.spec_from_file_location("wechat_subscriptions", self.script)
        if spec is None or spec.loader is None:
            raise RuntimeError("could not load the pinned archiver module")
        upstream = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(upstream)
        config = upstream.load_config()
        subscription = upstream.find_subscription(config, account_name)
        if subscription.get("since") == since:
            return False
        subscription["since"] = since
        state = subscription.setdefault("state", {})
        for key in (
            "lastSyncAt",
            "lastPublishTime",
            "recentPublishTimes",
            "seenIds",
            "lastResult",
            "lastError",
        ):
            state.pop(key, None)
        upstream.save_config(config)
        return True

    def backfill(self, account_name: str, min_articles: int = 100) -> dict:
        """Commit the first manifest only after a complete-enough discovery pass."""
        self.require_installed()
        spec = importlib.util.spec_from_file_location("wechat_subscriptions", self.script)
        if spec is None or spec.loader is None:
            raise RuntimeError("could not load the pinned archiver module")
        upstream = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(upstream)

        config = upstream.load_config()
        subscription = upstream.find_subscription(config, account_name)
        manifest = upstream.load_or_init_manifest(subscription, config)
        state = subscription.setdefault("state", {})
        manifest_articles = manifest.get("articles", [])
        if not manifest_articles:
            state.pop("lastSyncAt", None)
            state.pop("lastResult", None)

        work_dir = upstream.WORK_DIR / upstream.sub_key(subscription)
        work_dir.mkdir(parents=True, exist_ok=True)
        if len(manifest_articles) >= min_articles:
            items: list[dict] = []
            source = "manifest-resume"
            added: list[dict] = []
        else:
            items, source = upstream.collect_new_items(config, subscription)
            combined_count = len(manifest_articles) + len(items)
            if combined_count < min_articles:
                raise RuntimeError(
                    f"discovery and manifest contain {combined_count} articles; "
                    f"required at least {min_articles}"
                )
            added = upstream.append_new_articles(manifest, items, work_dir)
        manifest_path = upstream.manifest_path_for(subscription)
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        export_stats = self._run_exporter(upstream, subscription, manifest_path)

        if items:
            seen = [str(item["id"]) for item in items]
            state["seenIds"] = seen[-upstream.SEEN_IDS_CAP :]
            times = sorted(
                {item.get("publishTime", 0) for item in items},
                reverse=True,
            )
            state["recentPublishTimes"] = times[: upstream.RECENT_TIMES_CAP]
            if times:
                state["lastPublishTime"] = times[0]
        state["lastSyncAt"] = upstream.now_iso()
        state["lastResult"] = {
            "newArticles": len(added),
            "source": source,
            "export": export_stats,
        }
        state.pop("lastError", None)
        upstream.save_config(config)
        return {
            "account": account_name,
            "discovered": len(manifest.get("articles", [])),
            "added": len(added),
            "source": source,
            "export": export_stats,
        }

    def status(self) -> dict:
        result = self._run(["list", "--verbose"])
        if result.returncode:
            raise RuntimeError(result.stderr or result.stdout)
        return json.loads(result.stdout)
