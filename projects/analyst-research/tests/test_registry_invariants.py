import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_json(relative_path: str) -> dict:
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))


def test_manifest_and_registry_have_the_same_skills() -> None:
    registry = load_json("ANALYST_REGISTRY.json")
    manifest = load_json("manifest.json")
    registered = {item["skill_name"] for item in registry["analysts"]}
    packaged = {item["name"] for item in manifest["skills"]}
    assert packaged == registered | {"analyst-dream-team-router"}


def test_every_analyst_has_independent_data_and_version_state() -> None:
    registry = load_json("ANALYST_REGISTRY.json")
    data_dirs = []
    version_manifests = []
    for analyst in registry["analysts"]:
        data_dir = ROOT / analyst["data_dir"]
        version_manifest = ROOT / analyst["version_manifest"]
        assert data_dir.is_dir()
        assert version_manifest.is_file()
        load_json(analyst["version_manifest"])
        data_dirs.append(data_dir.resolve())
        version_manifests.append(version_manifest.resolve())
    assert len(data_dirs) == len(set(data_dirs))
    assert len(version_manifests) == len(set(version_manifests))


def test_router_contract_uses_registered_analysts_without_default_overload() -> None:
    registry = load_json("ANALYST_REGISTRY.json")
    routes = load_json("config/router-routes.json")
    registered = {item["skill_name"] for item in registry["analysts"]}
    for route in routes["routes"]:
        selected = [route["primary"], *route["support"]]
        assert set(selected) <= registered
        assert len(selected) == len(set(selected))
        assert len(selected) <= routes["max_default_analysts"]


def test_zhangyu_and_qinhan_are_isolated_and_only_router_combines_them() -> None:
    registry = load_json("ANALYST_REGISTRY.json")
    by_skill = {item["skill_name"]: item for item in registry["analysts"]}
    zhang = by_skill["yiyuzhongde-zhangyu-analyst"]
    qin = by_skill["qinhan-fixed-income-analyst"]
    assert zhang["data_dir"] != qin["data_dir"]
    assert zhang["version_manifest"] != qin["version_manifest"]
    zhang_manifest = load_json(zhang["version_manifest"])
    qin_manifest = load_json(qin["version_manifest"])
    assert zhang_manifest["skill"] == zhang["skill_name"]
    assert qin_manifest["skill"] == qin["skill_name"]


def test_registry_grade_matches_each_corpus_audit() -> None:
    registry = load_json("ANALYST_REGISTRY.json")
    for analyst in registry["analysts"]:
        audit = load_json(
            f".agents/skills/{analyst['skill_name']}/references/corpus-audit.json"
        )
        assert audit.get("corpus_grade", audit.get("grade")) == analyst["corpus_grade"]
