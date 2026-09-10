from analyst_team.account_resolver import AccountResolver, normalize_name


def test_normalize_name() -> None:
    assert normalize_name(" 沧海 一土狗 ") == normalize_name("沧海一土狗")


def test_resolve_known_account() -> None:
    results = AccountResolver().resolve("沧海一土狗")
    assert len(results) == 1
    assert results[0].wechat_public_id == "canghaiyitugou"


def test_resolve_unknown_account() -> None:
    assert AccountResolver().resolve("不存在的账号") == []

