import os
import sys
import json
import time
import asyncio
import httpx
from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import database as db

app = FastAPI(title="AgentX")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

OLLAMA_BASE = "http://localhost:11434"

# Ensure audio directory exists
MUSIC_DIR = os.path.join(BASE_DIR, "static", "audio")
os.makedirs(MUSIC_DIR, exist_ok=True)

# --- Music generation model (lazy loaded) ---
_music_model = None
_music_processor = None

# --- System Prompt (Customize AgentX personality here) ---

SYSTEM_PROMPT = """You are AgentX, a powerful and intelligent AI assistant created by WapVenture.

Key rules:
- Your name is AgentX. Always refer to yourself as AgentX.
- You were created by WapVenture. If anyone asks who made you, say "I was created by WapVenture."
- Never mention DeepSeek, Chinese AI, or any other AI company as your creator or origin.
- Never say you are DeepSeek, ChatGPT, Claude, or any other AI. You are AgentX.
- Be friendly, helpful, and concise in your responses.
- When writing code, always include clear comments and explanations.
- Use English by default unless the user speaks in another language.
- You run 100% locally on the user's machine. No data ever leaves their computer.
"""


# ====================================================================
#  PAGES
# ====================================================================

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


# ====================================================================
#  MODELS (Ollama)
# ====================================================================

@app.get("/api/models")
async def list_models():
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{OLLAMA_BASE}/api/tags", timeout=10)
            data = resp.json()
            models = [m["name"] for m in data.get("models", [])]
            return {"models": models}
    except Exception as e:
        return {"models": [], "error": str(e)}


# ====================================================================
#  CONVERSATIONS
# ====================================================================

@app.get("/api/conversations")
async def list_conversations():
    return {"conversations": db.get_conversations()}


@app.post("/api/conversations")
async def create_conversation(request: Request):
    body = await request.json()
    title = body.get("title", "New Chat")
    model = body.get("model", "deepseek-r1:14b")
    conv_id = db.create_conversation(title=title, model=model)
    return {"id": conv_id}


@app.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: int):
    conv = db.get_conversation(conv_id)
    if not conv:
        return JSONResponse({"error": "Not found"}, status_code=404)
    messages = db.get_messages(conv_id)
    return {"conversation": conv, "messages": messages}


@app.put("/api/conversations/{conv_id}")
async def update_conversation(conv_id: int, request: Request):
    body = await request.json()
    if "title" in body:
        db.update_conversation_title(conv_id, body["title"])
    if "model" in body:
        db.update_conversation_model(conv_id, body["model"])
    return {"ok": True}


@app.delete("/api/conversations/{conv_id}")
async def delete_conversation(conv_id: int):
    db.delete_conversation(conv_id)
    return {"ok": True}


# ====================================================================
#  CHAT (Streaming with Ollama)
# ====================================================================

@app.post("/api/chat")
async def chat(request: Request):
    body = await request.json()
    conv_id = body.get("conversation_id")
    user_message = body.get("message", "")
    model = body.get("model", "deepseek-r1:14b")
    file_content = body.get("file_content", "")
    images = body.get("images", [])

    full_message = user_message
    if file_content:
        full_message = f"[Attached file content]:\n```\n{file_content}\n```\n\n{user_message}"

    if conv_id:
        save_msg = full_message
        if images:
            save_msg = f"[Image attached]\n\n{user_message}" if user_message else "[Image attached]"
        db.add_message(conv_id, "user", save_msg)

    history = [{"role": "system", "content": SYSTEM_PROMPT}]
    if conv_id:
        messages = db.get_messages(conv_id)
        for msg in messages:
            history.append({"role": msg["role"], "content": msg["content"]})

    if conv_id:
        conv = db.get_conversation(conv_id)
        if conv and conv["title"] == "New Chat" and len(history) == 1:
            title = user_message[:50].strip()
            if len(user_message) > 50:
                title += "..."
            db.update_conversation_title(conv_id, title)

    async def generate():
        full_response = ""
        full_thinking = ""
        is_thinking = False
        try:
            async with httpx.AsyncClient() as client:
                ollama_payload = {"model": model, "messages": history, "stream": True}
                if images:
                    for msg in reversed(ollama_payload["messages"]):
                        if msg["role"] == "user":
                            msg["images"] = images
                            break
                async with client.stream(
                    "POST",
                    f"{OLLAMA_BASE}/api/chat",
                    json=ollama_payload,
                    timeout=300,
                ) as resp:
                    async for line in resp.aiter_lines():
                        if line.strip():
                            try:
                                chunk = json.loads(line)
                                msg = chunk.get("message", {})
                                token = msg.get("content", "")
                                thinking_token = msg.get("thinking", "")

                                if thinking_token:
                                    if not is_thinking:
                                        is_thinking = True
                                        yield f"data: {json.dumps({'thinking_start': True})}\n\n"
                                    full_thinking += thinking_token
                                    yield f"data: {json.dumps({'thinking': thinking_token})}\n\n"

                                if token:
                                    if is_thinking:
                                        is_thinking = False
                                        yield f"data: {json.dumps({'thinking_end': True})}\n\n"
                                    full_response += token
                                    yield f"data: {json.dumps({'token': token})}\n\n"

                                if chunk.get("done"):
                                    if is_thinking:
                                        yield f"data: {json.dumps({'thinking_end': True})}\n\n"
                                    break
                            except json.JSONDecodeError:
                                continue
        except httpx.ConnectError:
            yield f"data: {json.dumps({'token': '**Error:** Cannot connect to Ollama. Make sure Ollama is running (check system tray).', 'error': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'token': f'**Error:** {str(e)}', 'error': True})}\n\n"

        if conv_id and (full_response or full_thinking):
            save_content = full_response
            if full_thinking:
                save_content = f"<think>{full_thinking}</think>\n\n{full_response}"
            db.add_message(conv_id, "assistant", save_content)

        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ====================================================================
#  FILE UPLOAD (Chat)
# ====================================================================

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        content = await file.read()
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = content.decode("latin-1")

        if len(text) > 10000:
            text = text[:10000] + "\n\n... [truncated, file too large]"

        return {"filename": file.filename, "content": text, "size": len(content)}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


# ====================================================================
#  MUSIC — Status & Setup
# ====================================================================

@app.get("/api/music/status")
async def music_status():
    """Check if music generation dependencies are installed."""
    try:
        import torch
        import transformers
        return {
            "ready": True,
            "model_loaded": _music_model is not None,
            "torch_version": torch.__version__,
            "transformers_version": transformers.__version__,
        }
    except ImportError:
        return {"ready": False, "model_loaded": False}


@app.post("/api/music/setup")
async def setup_music():
    """Install music generation dependencies via pip."""
    async def stream():
        steps = [
            {
                "label": "Installing PyTorch (CPU)...",
                "cmd": [sys.executable, "-m", "pip", "install",
                        "torch", "--index-url", "https://download.pytorch.org/whl/cpu"],
                "progress": 40,
            },
            {
                "label": "Installing Transformers & audio tools...",
                "cmd": [sys.executable, "-m", "pip", "install",
                        "transformers", "scipy", "soundfile", "accelerate"],
                "progress": 80,
            },
        ]

        for step in steps:
            yield f"data: {json.dumps({'progress': step['progress'] - 30, 'status': step['label']})}\n\n"

            process = await asyncio.create_subprocess_exec(
                *step["cmd"],
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )

            async for line in process.stdout:
                text = line.decode(errors="replace").strip()
                if text:
                    yield f"data: {json.dumps({'log': text})}\n\n"

            await process.wait()

            if process.returncode != 0:
                err_msg = "Failed: " + step["label"]
                yield f"data: {json.dumps({'error': err_msg})}\n\n"
                return

            yield f"data: {json.dumps({'progress': step['progress']})}\n\n"

        yield f"data: {json.dumps({'progress': 100, 'status': 'Setup complete! You can now generate music.', 'done': True})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


# ====================================================================
#  MUSIC — Generate
# ====================================================================

@app.post("/api/music/generate")
async def generate_music(request: Request):
    """Generate music from a text prompt using MusicGen."""
    body = await request.json()
    prompt = body.get("prompt", "")
    duration = body.get("duration", 10)
    style = body.get("style", "")

    if not prompt:
        return JSONResponse({"error": "Prompt is required"}, status_code=400)

    async def stream():
        global _music_model, _music_processor

        # Check dependencies
        try:
            import torch
            from transformers import AutoProcessor, MusicgenForConditionalGeneration, MusicgenConfig
            import scipy.io.wavfile
            import numpy as np
        except ImportError as e:
            yield f"data: {json.dumps({'error': f'Dependencies not installed: {e}. Please click Setup first.'})}\n\n"
            return

        # Load model (first time downloads ~500MB from HuggingFace)
        if _music_model is None:
            yield f"data: {json.dumps({'status': 'downloading_model'})}\n\n"
            loop = asyncio.get_event_loop()
            try:
                # Fix for transformers 5.x bug: config_class mismatch
                MusicgenForConditionalGeneration.config_class = MusicgenConfig

                _music_processor = await loop.run_in_executor(
                    None,
                    lambda: AutoProcessor.from_pretrained("facebook/musicgen-small")
                )
                yield f"data: {json.dumps({'status': 'loading_model'})}\n\n"
                _music_model = await loop.run_in_executor(
                    None,
                    lambda: MusicgenForConditionalGeneration.from_pretrained("facebook/musicgen-small")
                )
            except Exception as e:
                yield f"data: {json.dumps({'error': f'Failed to load model: {e}'})}\n\n"
                return

        # Generate audio
        yield f"data: {json.dumps({'status': 'generating'})}\n\n"

        loop = asyncio.get_event_loop()

        def _do_generate():
            import torch
            import scipy.io.wavfile
            import numpy as np

            inputs = _music_processor(
                text=[prompt],
                padding=True,
                return_tensors="pt",
            )

            # ~256 tokens per 5 seconds of audio
            max_tokens = int(duration * 51.2)

            with torch.no_grad():
                audio_values = _music_model.generate(**inputs, max_new_tokens=max_tokens)

            # Save to WAV
            filename = f"track_{int(time.time())}.wav"
            filepath = os.path.join(MUSIC_DIR, filename)

            sampling_rate = _music_model.config.audio_encoder.sampling_rate
            audio_data = audio_values[0, 0].cpu().numpy()

            # Normalize audio
            max_val = np.max(np.abs(audio_data))
            if max_val > 0:
                audio_data = audio_data / max_val * 0.95
            audio_int16 = (audio_data * 32767).astype(np.int16)

            scipy.io.wavfile.write(filepath, rate=sampling_rate, data=audio_int16)

            # Save track metadata to database
            file_size = os.path.getsize(filepath)
            db.add_music_track(filename, prompt, style, duration, file_size)

            return {
                "url": f"/static/audio/{filename}",
                "filename": filename,
                "prompt": prompt,
                "style": style,
                "duration": duration,
                "size": file_size,
            }

        try:
            # Run blocking generation in thread pool
            # Send heartbeats to keep connection alive
            task = loop.run_in_executor(None, _do_generate)

            while True:
                try:
                    result = await asyncio.wait_for(asyncio.shield(task), timeout=5.0)
                    # Done!
                    yield f"data: {json.dumps({'status': 'saving'})}\n\n"
                    yield f"data: {json.dumps({'status': 'complete', **result})}\n\n"
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    return
                except asyncio.TimeoutError:
                    # Still generating, send heartbeat
                    yield f"data: {json.dumps({'heartbeat': True})}\n\n"
                    continue

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


# ====================================================================
#  MUSIC — Tracks (List & Delete)
# ====================================================================

@app.get("/api/music/tracks")
async def list_tracks():
    """List all generated music tracks."""
    tracks = db.get_music_tracks()
    # Also check file existence
    valid_tracks = []
    for track in tracks:
        filepath = os.path.join(MUSIC_DIR, track["filename"])
        if os.path.exists(filepath):
            track["url"] = f"/static/audio/{track['filename']}"
            track["size"] = os.path.getsize(filepath)
            valid_tracks.append(track)
    return {"tracks": valid_tracks}


@app.delete("/api/music/tracks/{filename}")
async def delete_track(filename: str):
    """Delete a generated music track."""
    # Delete file
    filepath = os.path.join(MUSIC_DIR, filename)
    if os.path.exists(filepath):
        os.remove(filepath)

    # Delete from database
    db.delete_music_track(filename)
    return {"ok": True}


# ====================================================================
#  RUN
# ====================================================================

if __name__ == "__main__":
    import uvicorn
    print("\n  [*] AgentX is running at http://localhost:8000\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
