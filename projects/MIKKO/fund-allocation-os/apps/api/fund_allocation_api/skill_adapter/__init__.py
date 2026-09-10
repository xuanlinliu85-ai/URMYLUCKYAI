"""Versioned Skill Adapter layer."""

from .contracts import SkillContext, SkillResult
from .registry import registry
from .service import run_skill

__all__ = ["SkillContext", "SkillResult", "registry", "run_skill"]

