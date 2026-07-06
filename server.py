#!/usr/bin/env python3
"""JARWO Assistant local CPU backend.

Full-local voice pipeline:
- Frontend: MediaRecorder -> Flask backend
- ASR: faster-whisper base (CPU, local, no cloud)
- TTS: espeak-ng (local, no cloud)
- Command router: deterministic intent matching
- Server-side voice activity detection (energy threshold)
"""
from __future__ import annotations

import json
import math
import os
import re
import hashlib
import shutil
import struct
import subprocess
import tempfile
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, request, send_from_directory

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("JARWO_PORT", "8098"))
WAKE_WORDS = ("jarwo", "jarwoe", "jaro", "jaru", "yarwo", "yaru", "ya awal", "awal")
MODEL_SIZE = os.environ.get("JARWO_WHISPER_MODEL", "base")
COMPUTE_TYPE = os.environ.get("JARWO_WHISPER_COMPUTE", "int8")
ENERGY_THRESHOLD = float(os.environ.get("JARWO_ENERGY_THRESHOLD", "0.01"))
# Gateway colocated on ECS GPU with ASR (8096) and TTS (8000) -> talk over loopback.
REMOTE_ASR_URL = os.environ.get("JARWO_REMOTE_ASR_URL", "http://127.0.0.1:8096/transcribe")
REMOTE_TTS_URL = os.environ.get("JARWO_REMOTE_TTS_URL", "http://127.0.0.1:8000/tts")
REMOTE_TTS_REFERENCE_AUDIO = os.environ.get(
    "JARWO_TTS_REFERENCE_AUDIO",
    "/root/tts-indonesia/samples/baseline/baseline_03.wav",
)
REMOTE_TTS_REFERENCE_TEXT = os.environ.get(
    "JARWO_TTS_REFERENCE_TEXT",
    "Total pembayaran hari ini adalah seratus dua puluh lima ribu rupiah.",
)
DEFAULT_RECORDING_SECONDS = int(os.environ.get("JARWO_DEFAULT_RECORDING_SECONDS", "30"))
MAX_RECORDING_SECONDS = int(os.environ.get("JARWO_MAX_RECORDING_SECONDS", "300"))
TTS_CACHE_DIR = ROOT / "cache" / "tts"

app = Flask(__name__, static_folder=str(ROOT), static_url_path="")
_whisper_model = None


def _get_whisper_model():
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model
    import faster_whisper

    _whisper_model = faster_whisper.WhisperModel(
        MODEL_SIZE,
        device="cpu",
        compute_type=COMPUTE_TYPE,
        download_root=str(ROOT / "models" / "whisper"),
    )
    return _whisper_model


def _has_cmd(name: str) -> bool:
    return shutil.which(name) is not None


def _convert_to_wav(src: Path, dst: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", "-f", "wav", str(dst)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        check=True,
    )


def _has_voice(wav_path: Path) -> tuple[bool, float]:
    """Simple energy-based VAD. Returns (has_voice, energy)."""
    try:
        with open(wav_path, "rb") as f:
            # skip WAV header (44 bytes for PCM)
            f.seek(44)
            raw = f.read()
        if len(raw) < 160:  # less than 10ms of audio
            return False, 0.0
        samples = struct.unpack(f"<{len(raw)//2}h", raw[: len(raw) - len(raw) % 2])
        n = len(samples)
        if n == 0:
            return False, 0.0
        energy = sum(abs(s) for s in samples) / (n * 32768.0)
        return energy > ENERGY_THRESHOLD, energy
    except Exception:
        return False, 0.0


def _remote_transcribe(wav_path: Path) -> tuple[str, str, str]:
    """Returns (transcript, status, detected_lang) using GPU ASR service."""
    import requests

    with wav_path.open("rb") as f:
        res = requests.post(
            REMOTE_ASR_URL,
            files={"audio": ("input.wav", f, "audio/wav")},
            data={"language": "id", "beam_size": "5"},
            timeout=25,
        )
    payload = res.json()
    if not res.ok or not payload.get("ok"):
        return "", f"remote_error:{payload.get('error', res.status_code)}", ""
    return payload.get("text", "").strip(), "remote_ok", payload.get("language", "")


def _transcribe(wav_path: Path) -> tuple[str, str, str]:
    """Returns (transcript, status, detected_lang)."""
    has_voice, energy = _has_voice(wav_path)
    if not has_voice:
        return "", "silence", ""

    try:
        return _remote_transcribe(wav_path)
    except Exception as exc:
        app.logger.warning("Remote ASR failed: %s", exc)

    # Fallback: local CPU whisper. Disabled by default (slow); enable with
    # JARWO_ALLOW_CPU_FALLBACK=1. Colocated on ECS GPU the remote path should
    # almost always win, so this only guards against ASR service downtime.
    if os.environ.get("JARWO_ALLOW_CPU_FALLBACK", "0") != "1":
        return "", "remote_unavailable", ""
    try:
        model = _get_whisper_model()
        segments, info = model.transcribe(
            str(wav_path),
            language="id",
            beam_size=1,
            condition_on_previous_text=False,
            no_speech_threshold=0.6,
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        return text, "local_fallback_ok" if text else "no_speech_detected", info.language
    except Exception as exc:
        app.logger.error("Whisper transcribe failed: %s", exc)
        return "", f"error:{exc}", ""


def _parse_recording_duration(text: str) -> int:
    """Parse simple Indonesian duration phrases. Defaults to 30s, capped."""
    seconds = DEFAULT_RECORDING_SECONDS
    number_words = {
        "satu": 1,
        "dua": 2,
        "tiga": 3,
        "empat": 4,
        "lima": 5,
        "enam": 6,
        "tujuh": 7,
        "delapan": 8,
        "sembilan": 9,
        "sepuluh": 10,
        "sebelas": 11,
        "dua belas": 12,
        "lima belas": 15,
        "tiga puluh": 30,
    }
    text = text.replace("10d", "10 detik").replace("10 d", "10 detik")
    numeric = re.findall(r"\d+", text)
    if numeric and any(unit in text for unit in ("detik", "dtk", "sekon", "second", "seconds")):
        seconds = int(numeric[0])
    else:
        match = re.search(r"(\d+)\s*(menit|minute|minutes|m)\b", text)
        if match:
            seconds = int(match.group(1)) * 60
        else:
            for phrase, value in number_words.items():
                if re.search(rf"\b{re.escape(phrase)}\s*(detik|dtk|sekon)\b", text):
                    seconds = value
                    break
                if re.search(rf"\b{re.escape(phrase)}\s*(menit)\b", text):
                    seconds = value * 60
                    break
    return max(1, min(seconds, MAX_RECORDING_SECONDS))


def _has_wake(text: str) -> bool:
    normalized = " ".join(text.lower().split())
    return any(word in normalized for word in WAKE_WORDS) or any(
        phrase in normalized for phrase in ("halo jarwo", "hallo jarwo", "hello jarwo")
    )


def _command_response(
    text: str,
) -> tuple[str, str, dict[str, Any]]:
    if not text:
        return "no_speech", "Saya belum mendengar suara.", {}
    normalized = " ".join(text.lower().split())
    has_wake = any(word in normalized for word in WAKE_WORDS)
    command = normalized
    for word in WAKE_WORDS:
        command = command.replace(word, "", 1).strip()

    # Practical mode: if ASR misses the wake word but clearly hears a known command,
    # execute it. This avoids "Jarwo" recognition becoming a hard blocker.
    candidate = command if has_wake else normalized

    if not has_wake and not any(
        key in candidate for key in ("jam", "tanggal", "hari", "rekam", "mati", "tidur", "nonaktif")
    ):
        return "wake_word_missing", "", {}
    if has_wake and not command:
        return "wake", "Iya, saya mendengarkan.", {}

    now = datetime.now(ZoneInfo("Asia/Jakarta"))
    if "jam" in candidate:
        return "time", f"Sekarang pukul {now.strftime('%H:%M')}.", {}
    if "tanggal" in candidate or "hari" in candidate:
        return "date", now.strftime("Hari ini %A, %d %B %Y."), {}
    if "rekam" in candidate and not any(
        x in candidate for x in ("stop", "berhenti", "henti", "selesai")
    ):
        seconds = _parse_recording_duration(candidate)
        return "start_recording", f"Recording dimulai {seconds} detik.", {"duration_seconds": seconds}
    if any(
        x in candidate
        for x in ("stop rekam", "berhenti rekam", "hentikan rekaman", "selesai rekam")
    ):
        return "stop_recording", "Recording dihentikan.", {}
    if any(x in candidate for x in ("mati", "tidur", "nonaktif", "berhenti mendengarkan")):
        return "deactivate", "Baik, saya standby.", {}
    return "unknown", "Maaf, perintah belum saya kenali.", {}


def _tts_wav(text: str) -> tuple[bytes | None, str]:
    import requests

    TTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_key = hashlib.sha256(
        json.dumps(
            {
                "text": text,
                "url": REMOTE_TTS_URL,
                "reference_audio": REMOTE_TTS_REFERENCE_AUDIO,
            },
            ensure_ascii=False,
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()
    cached = TTS_CACHE_DIR / f"{cache_key}.wav"
    if cached.exists() and cached.stat().st_size > 44:
        return cached.read_bytes(), "cached-remote-tts-indonesia"

    try:
        payload: dict[str, Any] = {"text": text}
        if REMOTE_TTS_REFERENCE_AUDIO:
            payload["reference_audio"] = REMOTE_TTS_REFERENCE_AUDIO
        res = requests.post(REMOTE_TTS_URL, json=payload, timeout=120)
        res.raise_for_status()
        cached.write_bytes(res.content)
        return res.content, "remote-tts-indonesia"
    except Exception as exc:
        app.logger.warning("remote TTS failed: %s", exc)
        return None, f"remote_tts_failed:{exc}"


@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.get("/healthz")
def healthz():
    return jsonify({"ok": True, "service": "jarwo-assistant", "mode": "local-cpu"})


@app.get("/api/capabilities")
def capabilities():
    try:
        import faster_whisper

        v = getattr(faster_whisper, "__version__", "?")
        fallback = f"local-faster-whisper-{MODEL_SIZE} (v{v})"
    except Exception:
        fallback = "disabled (faster-whisper not installed)"
    return jsonify(
        {
            "mode": "local-cpu",
            "cloud_api": False,
            "wake_word": "local-command-gate",
            "asr": "remote-gpu-faster-whisper-medium",
            "asr_remote_url": REMOTE_ASR_URL,
            "asr_fallback": fallback,
            "tts": "remote-tts-indonesia",
            "tts_remote_url": REMOTE_TTS_URL,
            "tts_reference_audio": REMOTE_TTS_REFERENCE_AUDIO,
            "ffmpeg": _has_cmd("ffmpeg"),
        }
    )


@app.post("/api/voice-command")
def voice_command():
    if "audio" not in request.files:
        return jsonify({"ok": False, "error": "audio file is required"}), 400
    upload = request.files["audio"]
    with tempfile.TemporaryDirectory(prefix="jarwo-audio-") as tmp:
        raw = Path(tmp) / "input.webm"
        wav = Path(tmp) / "input.wav"
        upload.save(raw)
        try:
            _convert_to_wav(raw, wav)
            transcript, asr_status, detected_lang = _transcribe(wav)
        except subprocess.CalledProcessError as exc:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "ffmpeg_failed",
                        "detail": exc.stderr.decode(errors="ignore")[-500:],
                    }
                ),
                500,
            )
        intent, reply, args = _command_response(transcript)
        app.logger.info(
            "ASR status=%s lang=%s text=%r intent=%s args=%r reply=%r",
            asr_status,
            detected_lang,
            transcript,
            intent,
            args,
            reply,
        )
        return jsonify(
            {
                "ok": True,
                "transcript": transcript,
                "asr_status": asr_status,
                "detected_lang": detected_lang,
                "intent": intent,
                "args": args,
                "reply": reply,
            }
        )


@app.post("/api/text-command")
def text_command():
    payload = request.get_json(silent=True) or {}
    text = str(payload.get("text") or "")[:500]
    intent, reply, args = _command_response(text)
    app.logger.info("TEXT text=%r intent=%s args=%r reply=%r", text, intent, args, reply)
    return jsonify({"ok": True, "transcript": text, "detected_lang": "id", "intent": intent, "args": args, "reply": reply})


@app.post("/api/wake-check")
def wake_check():
    if "audio" not in request.files:
        return jsonify({"ok": False, "error": "audio file is required"}), 400
    upload = request.files["audio"]
    with tempfile.TemporaryDirectory(prefix="jarwo-wake-") as tmp:
        raw = Path(tmp) / "wake.webm"
        wav = Path(tmp) / "wake.wav"
        upload.save(raw)
        try:
            _convert_to_wav(raw, wav)
            transcript, asr_status, detected_lang = _transcribe(wav)
        except subprocess.CalledProcessError as exc:
            return jsonify({"ok": False, "error": "ffmpeg_failed", "detail": exc.stderr.decode(errors="ignore")[-500:]}), 500
        wake = _has_wake(transcript)
        app.logger.info("WAKE status=%s lang=%s text=%r wake=%s", asr_status, detected_lang, transcript, wake)
        return jsonify(
            {
                "ok": True,
                "wake": wake,
                "transcript": transcript,
                "asr_status": asr_status,
                "detected_lang": detected_lang,
            }
        )


@app.get("/api/tts")
def tts():
    text = request.args.get("text", "")[:400]
    if not text:
        return jsonify({"ok": False, "error": "text is required"}), 400
    data, status = _tts_wav(text)
    if data is None:
        return jsonify({"ok": False, "error": status, "text": text}), 503
    return Response(data, mimetype="audio/wav")


@app.route("/<path:path>")
def static_files(path: str):
    return send_from_directory(ROOT, path)


if __name__ == "__main__":
    app.logger.info(
        "JARWO starting :%d | whisper=%s | compute=%s | energy=%.3f",
        PORT,
        MODEL_SIZE,
        COMPUTE_TYPE,
        ENERGY_THRESHOLD,
    )
    app.run(host="0.0.0.0", port=PORT, threaded=True)
