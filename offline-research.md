# Offline-First Research Notes

## ClockShark Patterns:
- Clock in/out works fully offline - punches stored locally
- GPS tracking works offline (uses GPS satellites, not cellular)
- Unsynced time shows in a "Sync Queue" tab with count badge ("1 Unsynced Time")
- Big banner shows "No Network Connection" when offline
- Manual "Sync" button to push queued entries when back online
- Auto-sync also happens when connection returns

## Jibble Patterns:
- Offline entries captured locally, synced to timesheets once connection restored
- Offline entries can bypass certain restrictions (work schedule limits, project/activity requirements)
- Desktop and mobile both support offline mode
- Entries marked as "offline" until synced

## Key Implementation Patterns for BuildTrack Pro:
1. **Offline Banner**: Show persistent banner when offline (like ClockShark's "No Network Connection")
2. **Sync Queue**: Queue all mutations (clock in/out, messages, expenses, goals) locally
3. **Sync Badge**: Show count of unsynced items
4. **Auto-Sync**: Automatically replay queue when connection returns
5. **Manual Sync**: Also provide manual "Sync Now" button
6. **Cache All Reads**: Every API query result cached to AsyncStorage
7. **Stale-While-Revalidate**: Show cached data immediately, refresh in background
8. **Conflict Resolution**: Last-write-wins for simple fields, append-only for logs

## Screens Needing Offline Cache:
- Home (labor dashboard, active jobs, budget alerts)
- Jobs (job list, job details, budget, change orders)
- Goals (goal list, goal details)
- Messages (message list, conversations)
- Manage (team, payroll, hours)
- Charts (profitability, labor trends, taxes, burn-down)
- Profile (employee info)
- Clock (time entries, current status)

## Mutations Needing Offline Queue:
- Clock in/out
- Send message
- Create/update expense
- Update goal progress
- Add change order
- Edit budget
