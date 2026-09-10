from analyst_team.config import Settings
from analyst_team.upstreams import CommandResult, WechatArchiver


def test_archiver_uses_pinned_upstream_contract(tmp_path, monkeypatch) -> None:
    settings = Settings(
        data_root=tmp_path / "data",
        third_party_root=tmp_path / "third-party",
        wechat_archiver_base_url="https://trusted.example",
    )
    archiver = WechatArchiver(settings)
    captured: list[list[str]] = []

    def fake_run(args: list[str]) -> CommandResult:
        captured.append(args)
        return CommandResult(0, "{}", "")

    monkeypatch.setattr(archiver, "_run", fake_run)
    archiver.add(
        "canghai-yitugou",
        "沧海一土狗",
        "https://mp.weixin.qq.com/s/example",
        "2020-01-01",
        "MP_WXS_3516156250",
    )
    archiver.sync("沧海一土狗")
    archiver.status()

    assert "wewe-rss" in captured[0]
    assert captured[0][1:3] == ["--mp-id", "MP_WXS_3516156250"]
    assert "--article-url" not in captured[0]
    assert "--base-url" not in captured[0]
    assert captured[1] == ["run", "沧海一土狗", "--force"]
    assert captured[2] == ["list", "--verbose"]
