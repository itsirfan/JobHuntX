# JobHuntX - An AI Job Companion 

**The Offline LLM + Creative Suite (100% Local, 100% Free)**

AgentX is a local AI desktop/web app by **WapVenture**.
It runs directly on your PC with no cloud dependency for chat and no subscription fees.

![AgentX Chat](assets/screenshots/chat.png)

## Why AgentX

- Runs locally on your computer (privacy-first workflow)
- No monthly subscription required
- Multi-tab AI workspace: **Chat**, **Music**, **Image Studio**, **Video Studio**
- Built for speed, control, and everyday productivity

## Model Modes for Chat

AgentX supports multiple local Ollama models and groups them into practical usage tiers:

| Mode | Best For | Typical Examples |
|---|---|---|
| **Fast** | Quick replies, lightweight tasks, everyday Q&A | `llama3.2:1b`, `llama3.2:3b`, `phi3:mini` |
| **Balanced** | General-purpose coding, writing, research | `qwen2.5:7b`, `mistral:7b`, `gemma2:9b` |
| **Experienced** | Deeper reasoning, longer and complex prompts | `deepseek-r1:14b`, `deepseek-r1:32b` |

## What You Can Do

### 1) Offline AI Chat

- Streamed responses with conversation history
- File and image attachments in chat
- Code-friendly markdown rendering
- Local conversation storage

### 2) Music Generation

- Text-to-music generation using MusicGen
- Style presets and duration controls
- Tracks saved locally on your machine
- In-app playback and track management

### 3) Image Studio

- Included in the UI for image workflows
- Designed for local text-to-image pipelines
- Current build status: **Coming Soon**

### 4) Video Studio

- Included in the UI for video workflows
- Designed for local text/image-to-video pipelines
- Current build status: **Coming Soon**

## Screenshots

### Chat Workspace
![Chat Workspace](assets/screenshots/chat.png)

### Music Studio
![Music Studio](assets/screenshots/music.png)

### Image Studio
![Image Studio](assets/screenshots/image.png)

### Video Studio
![Video Studio](assets/screenshots/video.png)

## Local-First Promise

AgentX is built for users who want AI power without handing data to paid cloud tools.
Your workflows stay on your PC, and you remain in control of your models and outputs.

## Quick Start (Windows)

```bash
run.bat
```

Or manual setup:

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python app.py
```

Then open:

```text
http://localhost:8000
```

## Tech Stack

- FastAPI + Jinja2
- Ollama (local LLM serving)
- Transformers + MusicGen (music)
- Vanilla JS frontend
- SQLite for local data

## License

Private project by WapVenture.

