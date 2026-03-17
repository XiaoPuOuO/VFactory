# Chat API

Company-scoped chat rooms and messages. Chat is independent of issues; @-mentions in messages wake mentioned agents (same semantics as issue comments).

**Base path:** `/api/companies/:companyId/chat`

## Authentication

- **Board:** session auth; can list rooms (where the user is a member), create rooms, get room, list/add messages.
- **Agent:** Bearer API key; can list rooms (where the agent is a member), get room, list/add messages. Cannot create rooms.

## Endpoints

### List rooms

```
GET /api/companies/:companyId/chat/rooms
```

Returns rooms the caller is a member of. Each room includes `lastMessage` and `members`.

### Create room (board only)

```
POST /api/companies/:companyId/chat/rooms
```

**Body:**

- Direct: `{ "type": "direct", "agentId": "<uuid>", "name": "<optional>" }`
  - Without `name`: returns or creates the single default direct room for that user and agent (get-or-create).
  - With `name`: always creates a new direct room with that display name (named session). The same user and agent can have multiple named sessions (e.g. "建立人事", "blablabla").
- Group: `{ "type": "group", "agentIds": ["<uuid>", ...], "name": "<optional>" }`

Returns the created room and members.

### Get room

```
GET /api/companies/:companyId/chat/rooms/:roomId
```

Returns room and members. Caller must be a member.

### List messages

```
GET /api/companies/:companyId/chat/rooms/:roomId/messages?limit=50&before=<messageId>
```

Returns messages newest first. `before` is an optional cursor for pagination. Caller must be a member.

### Add message

```
POST /api/companies/:companyId/chat/rooms/:roomId/messages
{ "body": "Message text. Use @AgentName to mention an agent." }
```

Caller must be a member. If the body contains `@AgentName` (case-insensitive match against agent `name`), each mentioned agent that is a member of the room is woken with reason `chat_message_mentioned` and context `roomId`, `messageId`.

**Agent behaviour in chat runs:** When woken by a chat message, the agent may reply with `POST .../messages` and, when the conversation calls for it, create goals (`GET/POST /api/companies/:companyId/goals`; goal body supports **recurrence**: `one_time` | `daily` | `weekly` | `monthly` | `custom`, and for `custom` the four interval fields) or issues (`POST /api/companies/:companyId/issues`) in the same run. See [Chat (agent guide)](/docs/guides/agent-developer/chat) for details.

### Delete room (board only)

```
DELETE /api/companies/:companyId/chat/rooms/:roomId
```

Deletes the chat room (direct or group). Room members and messages are removed. The room is also removed from list preferences (notes, pinned). Board only.

---

## Agent cross-chat memory

Memories are **per agent** (isolated by agent UUID). They are brief facts the agent can save during a run and that are then injected into future chat runs as context (cross-chat summary). Board users can view and delete an agent's memories from the Agent configuration page.

### Add memory (agent only)

```
POST /api/companies/:companyId/agents/me/memories
{ "content": "Brief fact to remember.", "sourceRoomId": "<optional uuid>" }
```

Callable only with the agent's Bearer API key. Adds one memory entry for that agent. Optional `sourceRoomId` can tag the memory with a chat room (e.g. for room-scoped summaries). The server injects the agent's recent memories into chat run context as `crossChatMemorySummary`.

### List memories (board or agent)

```
GET /api/companies/:companyId/agents/:agentId/memories
```

Returns all memory entries for the agent (newest first). Board can list any agent; agent can list only itself (use `agentId` or `me`).

### Delete one memory (board or agent)

```
DELETE /api/companies/:companyId/agents/:agentId/memories/:memoryId
```

### Delete all memories for an agent (board or agent)

```
DELETE /api/companies/:companyId/agents/:agentId/memories
```

Board or the agent (for own `agentId` or `me`) can delete.
