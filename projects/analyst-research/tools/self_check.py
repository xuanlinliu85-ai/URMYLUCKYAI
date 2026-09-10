#!/usr/bin/env python3
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
errors = []

required_root = [
    "AGENTS.md",
    "CODEX_START_HERE.md",
    "FRAMEWORK.md",
    "CORPUS_POLICY.md",
    "CORPUS_AUDIT_V2.1.json",
    "EXTENDING.md",
    "EXTENSION_API.md",
    "ANALYST_REGISTRY.json",
    "manifest.json",
    "CHANGELOG.md",
]
for f in required_root:
    if not (root/f).exists():
        errors.append(f"missing root file: {f}")

registry = json.loads((root/"ANALYST_REGISTRY.json").read_text(encoding="utf-8"))
manifest = json.loads((root/"manifest.json").read_text(encoding="utf-8"))
json.loads((root/"CORPUS_AUDIT_V2.1.json").read_text(encoding="utf-8"))

registered_skills = {a["skill_name"] for a in registry.get("analysts", [])}
manifest_skills = {s["name"] for s in manifest.get("skills", [])}
expected_manifest_skills = registered_skills | {"analyst-dream-team-router"}
if manifest_skills != expected_manifest_skills:
    errors.append("manifest skills do not match Registry plus Router")

for a in registry.get("analysts", []):
    skill = a["skill_name"]
    d = root/".agents"/"skills"/skill
    for rel in [
        "SKILL.md",
        "agents/openai.yaml",
        "references/framework.md",
        "references/framework-evolution.md",
        "references/source-map.md",
        "references/article-schema.json",
        "references/corpus-audit.json",
        "scripts/normalize_article.py",
    ]:
        if not (d/rel).exists():
            errors.append(f"{skill}: missing {rel}")

    data_dir = root/a.get("data_dir", "")
    if not a.get("data_dir") or not data_dir.is_dir():
        errors.append(f"{skill}: missing independent data_dir")

    version_manifest = root/a.get("version_manifest", "")
    if not a.get("version_manifest") or not version_manifest.is_file():
        errors.append(f"{skill}: missing independent version manifest")
    else:
        try:
            json.loads(version_manifest.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            errors.append(f"{skill}: invalid version manifest: {exc}")

    audit_path = d/"references"/"corpus-audit.json"
    if audit_path.is_file():
        audit = json.loads(audit_path.read_text(encoding="utf-8"))
        audit_grade = audit.get("corpus_grade", audit.get("grade"))
        if audit_grade != a.get("corpus_grade"):
            errors.append(
                f"{skill}: Registry grade {a.get('corpus_grade')} != audit grade {audit_grade}"
            )

    evidence_candidates = [
        d/"references"/"dna-evidence.json",
        d/"references"/"dna-evidence.md",
        d/"references"/"analyst-dna.md",
        data_dir/"dna-evidence.json",
        data_dir/"analysis"/"dna-evidence.json",
        data_dir/"analysis"/"DNA_V3.md",
    ]
    if not any(path.is_file() for path in evidence_candidates):
        errors.append(f"{skill}: missing DNA evidence ledger")

router = root/".agents"/"skills"/"analyst-dream-team-router"/"SKILL.md"
if not router.exists():
    errors.append("missing analyst-dream-team-router")

routes_path = root/"config"/"router-routes.json"
if not routes_path.is_file():
    errors.append("missing config/router-routes.json")
else:
    routes = json.loads(routes_path.read_text(encoding="utf-8"))
    maximum = routes.get("max_default_analysts", 3)
    for route in routes.get("routes", []):
        selected = [route["primary"], *route.get("support", [])]
        unknown = set(selected) - registered_skills
        if unknown:
            errors.append(f"route {route.get('topic')}: unknown skills {sorted(unknown)}")
        if len(selected) > maximum or len(selected) != len(set(selected)):
            errors.append(f"route {route.get('topic')}: invalid analyst selection")

zhang = next((a for a in registry.get("analysts", []) if a["skill_name"] == "yiyuzhongde-zhangyu-analyst"), None)
qin = next((a for a in registry.get("analysts", []) if a["skill_name"] == "qinhan-fixed-income-analyst"), None)
if not zhang or not qin:
    errors.append("Zhang Yu and Qin Han must both be registered")
elif Path(zhang["data_dir"]) == Path(qin["data_dir"]):
    errors.append("Zhang Yu and Qin Han must use independent data directories")

template = root/"EXTENSION_KIT"/"skill-template"
for rel in [
    "SKILL.md",
    "agents/openai.yaml",
    "references/framework.md",
    "references/framework-evolution.md",
    "references/source-map.md",
    "references/article-schema.json",
    "references/corpus-audit.json",
    "scripts/normalize_article.py",
]:
    if not (template/rel).exists():
        errors.append(f"skill-template: missing {rel}")

if errors:
    print("SELF-CHECK FAILED")
    for e in errors:
        print("-", e)
    sys.exit(1)

print("SELF-CHECK PASSED")
print("Analysts:", len(registry.get("analysts", [])))
print("Router: ready")
print("Corpus Gate: ready")
print("Analyst DNA evolution: ready")
print("Extension interface: ready")
