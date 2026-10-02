# Prompt 1 — Jarvis Companion (from Riley Brown video description)

Paste this into **Cursor Agent** with your **OpenAI API key** at the bottom.

---

Build a Jarvis-like desktop AI companion named **Jarvis**. The goal is to create a desktop AI companion that I can talk to naturally while it does useful work in the background. It should feel like a personal Jarvis — conversational, fast, visual, and able to use tools.

Read the docs on **GPT Realtime 2**. This is a desktop application. Use **GPT Realtime 2** for live voice conversation — let me interrupt, ask questions, etc.

Give Jarvis a **minimal animated face** with high-quality animations: **eyes and mouth only**, nothing else. Natural blinking, expressive moods, and **speech-synced mouth movement**.

Keep the UI simple:
- A **small companion window**
- Plus an **artifact panel** for anything visual and structured

When using GPT Realtime 2, it is a voice model that can use tools. Ask Cursor to create and add tools to the agent.

**Tools to include:**
- **Web search** — use [Exa](https://exa.ai) API
- **Image generation/editing** — GPT Image models
- **Mermaid charts** — render diagrams in the artifact panel

---

```
OPENAI_API_KEY=sk-your-key-here
EXA_API_KEY=your-exa-key-optional
```

---

## Already built in this folder

This project (`~/Projects/jarvis-companion`) was cloned from Riley's reference implementation. **Prompt 1 is done.**

Run: `npm run dev` after adding keys to `.env.local`

## Artifact panel — what goes there

| Kind | Example voice command |
|------|------------------------|
| `markdown` | "Search the web for World Cup news" |
| `mermaid` | "Create a mermaid chart of how AI works" |
| `image` | "Generate a photo of a fox" |
| `thumbnailBoard` | "Generate a thumbnail of me in front of a tree" |
| `notes` | Saved local notes |
| `table` | Structured data / records |
| `progress` | "Working on it…" status |
| Menu | "Show me the menu" |

Right side of the window in **display mode**. Hidden when you enter **computer use mode** (mini bubble only).
