# Message template placeholders

When sending messages (email, SMS, WhatsApp), these placeholders in the template body are replaced per recipient.

| Placeholder | Description |
|-------------|-------------|
| `{{Name}}` | Recipient’s display name |
| `{{Team}}` / `{{TeamName}}` | Team name (first team, or comma-separated if in multiple) |
| `{{YourName}}` | Sender’s display name |
| `{{EventName}}` | Event name (when an event is selected) |
| `{{TeamMembers}}` | Comma-separated list of members in the first team |
| `{{TeamLeaders}}` | Comma-separated list of leaders for the first team |
| `{{TeamsList}}` | **All teams** the recipient is in: team name + members on one line, "Leads: …" on the next line, with a blank line between each team. |

## People in multiple teams

If a person is in more than one team (e.g. “Entire team” for an event with 3 teams and they’re in all 3):

- They receive **one message** (not one per team).
- `{{Team}}` / `{{TeamName}}` is set to all their team names (e.g. `Team A, Team B, Team C`).
- `{{TeamMembers}}` and `{{TeamLeaders}}` are for the **first** team only (backward compatible).
- Use **`{{TeamsList}}`** to show every team and its members in that single message.

### Example template for multi-team reminders

**Name:** Reminder – all my teams

**Body (email/SMS):**

```
Hi {{Name}},

Reminder for {{EventName}}.

You are in the following teams and members:

{{TeamsList}}

If you have questions, contact {{YourName}}.
```

Example of what `{{TeamsList}}` might look like for someone in 3 teams:

```
Team Alpha: Alice, Bob, Carol, You
Leads: Jane

Team Beta: Alice, Dave, Eve
Leads: John

Team Gamma: Alice, Frank, Grace
Leads: Jane, John
```

So each recipient sees **each team they are in** and **all members for each of those teams** in one message.

### Short SMS version

```
{{Name}}, reminder for {{EventName}}. Your teams: {{TeamsList}} — {{YourName}}
```

SMS will show one line per team (e.g. `Team Alpha: A, B, C` then newline `Team Beta: A, D, E`).
