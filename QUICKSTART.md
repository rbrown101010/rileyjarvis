# Jarvis Companion — Quick Start

Built from [Riley Brown's rileyjarvis](https://github.com/rbrown101010/rileyjarvis) + your Prompt 1 spec:

- GPT Realtime 2 voice (interrupt, natural speech)
- Minimal animated face (eyes + mouth, moods, lip sync)
- Small companion window + artifact panel
- Tools: web search, Mermaid, images, computer use, thumbnails

## 1. Add your API key

Edit `.env.local`:

```
OPENAI_API_KEY=sk-...your key...
EXA_API_KEY=...optional for web search...
```

## 2. Run

```bash
cd ~/Projects/jarvis-companion
npm run dev
```

Logistics dashboard (Thunderbolt / drive health): `npm run logistics` or **⌘⇧L**.

## 3. First use

1. If the window is buried: press **⌘⇧J** to summon Jarvis on top
2. Click the **microphone** button **once** to connect voice (not every sentence)
3. Talk naturally — status under the buttons should say **Live**
4. Ask for web search, charts, images, or "enter computer use mode"

## StudioStack disks (preview first)

```bash
bash scripts/optimize-studiostack.sh --dry-run
```

That prints every move and changes nothing. Do not run `scripts/Run StudioStack Setup.command` until you have reviewed the dry-run — the `.command` file copies AI folders and deletes the Lexar-ARES originals with no prompts.

Restart cleanly: `~/jarvis/scripts/stack.sh jarvis restart`

## macOS permissions

Grant **Microphone**, **Accessibility**, and **Screen Recording** when macOS asks.

## Video reference

https://www.youtube.com/watch?v=4WBOmhI11rQ
