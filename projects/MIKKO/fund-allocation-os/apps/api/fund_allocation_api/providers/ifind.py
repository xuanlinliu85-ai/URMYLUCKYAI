import asyncio
import json
import os
from pathlib import Path
from typing import Any

from ..config import Settings


class IfindBridgeError(RuntimeError):
    pass


def _parse_json_output(stdout: bytes) -> dict[str, Any]:
    text = stdout.decode("utf-8", errors="replace").strip()
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise IfindBridgeError("iFinD 健康检查返回了非 JSON 输出") from exc
    if not isinstance(payload, dict):
        raise IfindBridgeError("iFinD 健康检查返回格式无效")
    return payload


async def check_ifind_health(settings: Settings) -> dict[str, Any]:
    script = Path(settings.ifind_health_script)
    if not script.is_file():
        raise IfindBridgeError(f"iFinD 健康检查脚本不存在：{script}")

    # Inherit the credential without reading, logging, or copying its value.
    env = os.environ.copy()
    process = await asyncio.create_subprocess_exec(
        settings.node_executable,
        str(script),
        cwd=str(script.parents[1]),
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(), timeout=settings.ifind_health_timeout_seconds
        )
    except TimeoutError as exc:
        process.kill()
        await process.communicate()
        raise IfindBridgeError("iFinD 健康检查超时") from exc

    payload = _parse_json_output(stdout)
    if process.returncode not in (0, None):
        message = payload.get("message") or stderr.decode("utf-8", errors="replace").strip()
        raise IfindBridgeError(message or "iFinD 健康检查失败")
    return payload


async def run_ifind_data_command(settings: Settings, *arguments: str) -> dict[str, Any]:
    script = Path(settings.ifind_data_script)
    if not script.is_file():
        raise IfindBridgeError(f"iFinD 数据脚本不存在：{script}")
    process = await asyncio.create_subprocess_exec(
        settings.node_executable,
        str(script),
        *arguments,
        cwd=str(script.parents[1]),
        env=os.environ.copy(),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(), timeout=settings.ifind_health_timeout_seconds
        )
    except TimeoutError as exc:
        process.kill()
        await process.communicate()
        raise IfindBridgeError("iFinD 数据请求超时") from exc
    if process.returncode not in (0, None):
        error_text = stderr.decode("utf-8", errors="replace").strip()
        try:
            error_payload = json.loads(error_text)
            message = error_payload.get("message", error_text)
        except json.JSONDecodeError:
            message = error_text
        raise IfindBridgeError(message or "iFinD 数据请求失败")
    return _parse_json_output(stdout)


async def get_ifind_universe(settings: Settings, limit: int = 20) -> dict[str, Any]:
    if limit < 1 or limit > 200:
        raise IfindBridgeError("Universe 预览 limit 必须在 1 到 200 之间")
    return await run_ifind_data_command(settings, "universe", str(limit))
