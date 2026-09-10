#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-.}"
SOURCE="$(cd "$(dirname "$0")" && pwd)"
TARGET="$(cd "$TARGET" && pwd)"

echo "Installing Analyst Dream Team into: $TARGET"
mkdir -p "$TARGET/.agents/skills"
cp -R "$SOURCE/.agents/skills/." "$TARGET/.agents/skills/"

for f in CODEX_START_HERE.md RELEASE_TO_CODEX.md INSTALL.md FRAMEWORK.md CORPUS_POLICY.md EXTENDING.md EXTENSION_API.md ANALYST_REGISTRY.json CORPUS_AUDIT_V2.1.json manifest.json CHANGELOG.md; do
  cp "$SOURCE/$f" "$TARGET/$f"
done

cp -R "$SOURCE/EXTENSION_KIT" "$TARGET/EXTENSION_KIT"
mkdir -p "$TARGET/tools"
cp "$SOURCE/tools/self_check.py" "$TARGET/tools/self_check.py"

if [ -f "$TARGET/AGENTS.md" ]; then
  echo "AGENTS.md already exists; leaving it unchanged."
  echo "Merge the Analyst Dream Team instructions manually from this package's AGENTS.md."
else
  cp "$SOURCE/AGENTS.md" "$TARGET/AGENTS.md"
fi

echo "Installed."
