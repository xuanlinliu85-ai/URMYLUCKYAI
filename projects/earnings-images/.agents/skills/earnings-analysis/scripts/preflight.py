#!/usr/bin/env python3
"""Local runtime preflight for Earnings Analyst OS V1.4 Research Only.

Checks only local executable/package capabilities.
MCP capabilities (iFinD) and Codex skills (TianTuan/PPT) must be discovered by Codex itself.
"""
import importlib.util

def has_module(name):
    return importlib.util.find_spec(name) is not None

checks = {
    "python": True,
    "edgar_module": has_module("edgar"),
    "jsonschema_optional": has_module("jsonschema"),
}

print("Earnings & Company Research V1.5 — preflight")
print("=" * 48)
for k, v in checks.items():
    print(f"{'OK' if v else 'MISS':4} {k}")

print("\nCodex must separately discover:")
print("- iFinD MCP tools")
print("- existing Analyst TianTuan skill")
print("- existing PPT/presentation skill (optional)")

if not checks["edgar_module"]:
    print("\nNOTE: EdgarTools is not installed. For US companies, install the free MIT package or use another official SEC path.")

print("\nNo video/TTS dependencies are required in V1.5.")
print("Preflight complete.")
