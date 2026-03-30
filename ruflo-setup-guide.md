# Ruflo Setup Guide + iPhone Integration
*Your complete guide to installing Ruflo, connecting it to your iPhone, and getting the most out of AI agent swarms*

---

## Prerequisites Checklist
- [x] Node.js 20+ installed
- [x] Claude Code CLI installed
- [ ] Ruflo installed (Step 1 below)
- [ ] iPhone notification app (Step 3 below)

---

## Part 1: Install & Configure Ruflo

### Step 1 — Install Ruflo

Open your terminal and run the full installer (includes MCP + diagnostics):

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/ruvnet/ruflo@main/scripts/install.sh | bash -s -- --full
```

Verify it installed correctly:

```bash
npx ruflo@latest --version
```

---

### Step 2 — Connect Ruflo to Claude Code as an MCP Server

This is what makes Ruflo available inside every Claude Code session automatically:

```bash
# Register Ruflo as an MCP server
claude mcp add ruflo -- npx -y ruflo@latest mcp start

# Confirm it shows up
claude mcp list
```

You should see `ruflo` listed. From now on, when you open Claude Code in any project, Ruflo's full agent toolkit is available.

---

### Step 3 — Initialize Ruflo in Your Project

Navigate to any project you want to work with and run:

```bash
cd /path/to/your/project
npx ruflo@latest init
```

This scaffolds Ruflo config, memory, and agent definitions inside the project.

---

### Step 4 — Test Your First Swarm

```bash
# Spawn a hive-mind swarm with a real objective
npx ruflo@latest hive-mind spawn "Analyze this codebase and list the top 3 improvements"
```

Watch the agents coordinate in real-time. When done, you'll see the consolidated output.

---

## Part 2: Connect Ruflo to Your iPhone

There are two approaches depending on what you want — pick one or use both.

---

### Option A: Push Notifications via ntfy (Free, Simple)

**What it does:** Your iPhone gets a push notification whenever a Ruflo agent finishes a task, hits an error, or needs your attention.

**Setup:**

1. On your iPhone, go to the App Store and download **ntfy**
2. Open the app and subscribe to a topic — make it unique, e.g. `ruflo-isaac-alerts`
3. On your Mac, test it works:

```bash
curl -d "Ruflo agent finished!" ntfy.sh/ruflo-isaac-alerts
```

You should see the notification arrive on your phone instantly.

4. Now wire it into Ruflo by creating a notification helper script:

```bash
# Create a notify helper in your home directory
cat > ~/ruflo-notify.sh << 'EOF'
#!/bin/bash
TOPIC="ruflo-isaac-alerts"   # <-- change to your ntfy topic
MESSAGE="${1:-Ruflo task complete}"
curl -s -d "$MESSAGE" "ntfy.sh/$TOPIC"
EOF
chmod +x ~/ruflo-notify.sh
```

5. Use it after any Ruflo command:

```bash
npx ruflo@latest hive-mind spawn "Build login page" && ~/ruflo-notify.sh "✅ Login page complete!"
```

Now you can kick off a long agent task from your Mac, walk away, and get pinged on your iPhone when it's done.

---

### Option B: Telegram Bot (Free, Bidirectional — Recommended)

**What it does:** Notifications TO your phone AND the ability to trigger Ruflo agents FROM your phone. This is the most powerful setup.

**Setup:**

**On your iPhone:**
1. Download **Telegram** from the App Store (free)

**Create your bot:**
1. Open Telegram and search for `@BotFather`
2. Send: `/newbot`
3. Follow the prompts — give it a name like "Ruflo Agent Bot"
4. BotFather gives you a **Bot Token** — copy it (looks like `123456789:ABCdef...`)

**Get your Chat ID:**
1. Start a chat with your new bot (search for it by the username you gave it)
2. Send it any message (e.g., "hello")
3. In your terminal, run (replace YOUR_TOKEN):

```bash
curl https://api.telegram.org/botYOUR_TOKEN/getUpdates
```

4. In the JSON response, find `"chat":{"id":XXXXXXXX}` — that number is your **Chat ID**

**Create the notification helper:**

```bash
cat > ~/ruflo-telegram.sh << 'EOF'
#!/bin/bash
BOT_TOKEN="YOUR_BOT_TOKEN_HERE"
CHAT_ID="YOUR_CHAT_ID_HERE"
MESSAGE="${1:-Ruflo task complete}"
curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -d chat_id="${CHAT_ID}" \
  -d text="${MESSAGE}"
EOF
chmod +x ~/ruflo-telegram.sh
```

**Test it:**

```bash
~/ruflo-telegram.sh "🤖 Ruflo is connected to your iPhone!"
```

You'll receive the message in Telegram on your iPhone immediately.

**Use it with Ruflo:**

```bash
npx ruflo@latest hive-mind spawn "Implement dark mode" && \
  ~/ruflo-telegram.sh "✅ Dark mode implementation complete! Check your code."
```

**Trigger agents FROM your phone (advanced):**
Set up a simple webhook receiver on your Mac using ngrok:

```bash
# Install ngrok (one-time)
brew install ngrok

# Start a local server that receives Telegram commands
npx ruflo@latest mcp start &
ngrok http 3000
```

Then configure your Telegram bot to forward messages to this URL — letting you type a command on your phone and have it execute on your Mac.

---

## Part 3: Best Use Cases for Ruflo

These are the highest-value ways to use Ruflo, especially with iPhone integration:

---

### 1. 🚀 Full Feature Implementation (Your #1 Use Case)
Instead of prompting back and forth, describe the outcome and walk away.

```bash
npx ruflo@latest hive-mind spawn "Add Stripe payment integration with webhook handling and error states" && \
  ~/ruflo-telegram.sh "💳 Payment feature ready for review"
```

Multiple specialized agents (architect, coder, tester, security reviewer) tackle it in parallel. You get notified on your iPhone when it's done.

---

### 2. 🔍 Automated Code Review & Security Audit
Run this on any repo before shipping:

```bash
npx ruflo@latest agent spawn -t security --name auditor
npx ruflo@latest agent spawn -t reviewer --name reviewer
npx ruflo@latest hive-mind spawn "Security audit + code review of /src directory" && \
  ~/ruflo-telegram.sh "🔐 Security audit complete — check terminal for report"
```

---

### 3. 🌙 Overnight Background Builds
Kick off a complex task before bed, wake up to results on your phone:

```bash
# Before you sleep:
npx ruflo@latest hive-mind spawn "Refactor the entire data layer to use TypeScript strict mode" && \
  ~/ruflo-telegram.sh "🌅 Overnight refactor complete! Ready for your review."
```

---

### 4. 📊 Codebase Analysis on Any Repo
Point Ruflo at any repo for an instant diagnosis:

```bash
cd /path/to/any/repo
npx ruflo@latest hive-mind spawn "Analyze architecture, identify tech debt, and suggest top 5 improvements" && \
  ~/ruflo-telegram.sh "📊 Analysis done — check terminal for report"
```

---

### 5. 🧪 Full Test Suite Generation
```bash
npx ruflo@latest hive-mind spawn "Generate comprehensive unit and integration tests for all untested functions" && \
  ~/ruflo-telegram.sh "✅ Test suite generated"
```

---

### 6. 📝 Documentation on Demand
```bash
npx ruflo@latest hive-mind spawn "Write complete API documentation for all public functions and endpoints" && \
  ~/ruflo-telegram.sh "📝 Docs written and saved"
```

---

### 7. 💰 Cost-Optimized Multi-Model Workflows
Ruflo automatically routes simple tasks to cheaper/faster models and handles micro-transforms in WASM (no LLM call at all). For heavy workloads this cuts API costs 30-85% with no extra effort on your part.

---

## Part 4: Upgrading Ruflo

Keep Ruflo current without losing your settings:

```bash
# Update helpers and statusline (preserves your data)
npx ruflo@latest init upgrade

# Update AND install any new skills/agents added since your last update
npx ruflo@latest init upgrade --add-missing
```

---

## Quick Reference Cheat Sheet

| Task | Command |
|------|---------|
| Spawn a swarm | `npx ruflo@latest hive-mind spawn "your objective"` |
| List agent types | `npx ruflo@latest agent list` |
| Spawn specific agent | `npx ruflo@latest agent spawn -t coder --name my-coder` |
| Start MCP server | `npx ruflo@latest mcp start` |
| Notify iPhone (ntfy) | `~/ruflo-notify.sh "message"` |
| Notify iPhone (Telegram) | `~/ruflo-telegram.sh "message"` |
| Upgrade Ruflo | `npx ruflo@latest init upgrade --add-missing` |

---

*Built for Isaac — March 2026*
