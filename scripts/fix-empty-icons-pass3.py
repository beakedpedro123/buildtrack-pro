#!/usr/bin/env python3
"""Pass 3: Replace ALL remaining empty emoji Text elements with MaterialIcons."""
import os

os.chdir("/home/ubuntu/construction-manager")

def ensure_import(content):
    if 'import MaterialIcons' not in content:
        if 'import * as Haptics' in content:
            content = content.replace(
                'import * as Haptics from "expo-haptics";',
                'import * as Haptics from "expo-haptics";\nimport MaterialIcons from "@expo/vector-icons/MaterialIcons";'
            )
        elif 'from "react-native"' in content:
            lines = content.split('\n')
            for i in range(len(lines)-1, -1, -1):
                if 'from "react-native"' in lines[i]:
                    lines.insert(i+1, 'import MaterialIcons from "@expo/vector-icons/MaterialIcons";')
                    content = '\n'.join(lines)
                    break
    return content

REPLACEMENTS = {
    "app/(tabs)/clock.tsx": [
        ('<Text style={{ fontSize: 14 }}></Text>', ''),  # was a refresh icon, just remove
    ],
    "app/(tabs)/goals.tsx": [
        ('<Text style={{ fontSize: 18 }}></Text>', '<MaterialIcons name="edit" size={18} color={colors.primary} />'),
        ('<Text style={{ fontSize: 40 }}></Text>', '<MaterialIcons name="flag" size={40} color={colors.muted} />'),
    ],
    "app/(tabs)/hours.tsx": [
        ('<Text style={{ fontSize: 40 }}></Text>', '<MaterialIcons name="schedule" size={40} color={colors.muted} />'),
    ],
    "app/(tabs)/jobs.tsx": [
        ('<Text style={{ fontSize: 18 }}></Text>', '<MaterialIcons name="description" size={18} color={colors.foreground} />'),
    ],
    "app/(tabs)/meetings.tsx": [
        ('<Text style={{ fontSize: 40 }}></Text>', '<MaterialIcons name="event" size={40} color={colors.muted} />'),
    ],
    "app/(tabs)/payroll.tsx": [
        ('<Text style={{ fontSize: 40 }}></Text>', '<MaterialIcons name="description" size={40} color={colors.muted} />'),
    ],
    "app/(tabs)/profile.tsx": [
        # Sub-tab icons (14px) - profile and messages tabs
        # These are in pairs: first pair is messages tab, second pair is profile tab
        ('<Text style={{ fontSize: 14 }}></Text>', '<MaterialIcons name="person" size={14} color={colors.muted} />'),
        # Section icons (18px)
        ('<Text style={{ fontSize: 18 }}></Text>', '<MaterialIcons name="settings" size={18} color={colors.foreground} />'),
    ],
    "app/(tabs)/team.tsx": [
        ('<Text style={{ fontSize: 40, marginBottom: 16 }}></Text>', '<MaterialIcons name="lock" size={40} color={colors.muted} style={{ marginBottom: 16 }} />'),
    ],
    "app/(tabs)/charts.tsx": [
        ('<Text style={{ fontSize: 40 }}></Text>', '<MaterialIcons name="bar-chart" size={40} color={colors.muted} />'),
    ],
    "app/timecard/[id].tsx": [
        ('<Text style={{ fontSize: 40 }}></Text>', '<MaterialIcons name="receipt" size={40} color={colors.muted} />'),
    ],
    "components/pivot-chat.tsx": [
        # Attach menu icons
        ('<View style={s.attachMenuIcon}><Text style={{ fontSize: 20 }}></Text></View>', '<View style={s.attachMenuIcon}><MaterialIcons name="photo-camera" size={20} color={colors.primary} /></View>'),
    ],
    "components/voice-goal-creator.tsx": [
        ('<Text style={{ fontSize: 60, marginBottom: 16 }}></Text>', '<MaterialIcons name="check-circle" size={60} color={colors.success} style={{ marginBottom: 16 }} />'),
    ],
    "components/compass-modal.tsx": [
        ('<Text style={{ fontSize: 28 }}></Text>', '<MaterialIcons name="smartphone" size={28} color={colors.muted} />'),
    ],
    "components/crew-map.native.tsx": [
        ('<Text style={{ fontSize: 28, marginBottom: 8 }}></Text>', '<MaterialIcons name="location-on" size={28} color={colors.muted} style={{ marginBottom: 8 }} />'),
    ],
    "components/crew-map.web.tsx": [
        ('<Text style={{ fontSize: 28, marginBottom: 8 }}></Text>', '<MaterialIcons name="location-on" size={28} color={colors.muted} style={{ marginBottom: 8 }} />'),
    ],
}

total = 0
for filepath, replacements in REPLACEMENTS.items():
    if not os.path.exists(filepath):
        print(f"  SKIP: {filepath}")
        continue
    with open(filepath, 'r') as f:
        content = f.read()
    original = content
    content = ensure_import(content)
    count = 0
    for old, new in replacements:
        while old in content:
            content = content.replace(old, new, 1)
            count += 1
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"  OK {filepath}: {count}")
        total += count
    else:
        print(f"  - {filepath}: no changes")

print(f"\nTotal: {total}")
