#!/usr/bin/env python3
"""Replace all remaining empty emoji Text elements with MaterialIcons across the app."""
import os
import re

os.chdir("/home/ubuntu/construction-manager")

# Map of file -> list of (find, replace) tuples
# Each replacement adds MaterialIcons where an empty emoji Text was left behind

def ensure_import(filepath, content):
    """Ensure MaterialIcons import exists in file."""
    if 'import MaterialIcons' not in content:
        # Add after last import
        if 'import * as Haptics' in content:
            content = content.replace(
                'import * as Haptics from "expo-haptics";',
                'import * as Haptics from "expo-haptics";\nimport MaterialIcons from "@expo/vector-icons/MaterialIcons";'
            )
        elif 'from "react-native"' in content:
            # Find last react-native import and add after
            lines = content.split('\n')
            for i in range(len(lines)-1, -1, -1):
                if 'from "react-native"' in lines[i] or 'from "react-native-' in lines[i]:
                    lines.insert(i+1, 'import MaterialIcons from "@expo/vector-icons/MaterialIcons";')
                    content = '\n'.join(lines)
                    break
    return content


REPLACEMENTS = {
    "app/(tabs)/clock.tsx": [
        # Empty state icon
        ('<Text style={{ fontSize: 40, marginBottom: 12 }}></Text>', '<MaterialIcons name="schedule" size={40} color={colors.muted} style={{ marginBottom: 12 }} />'),
    ],
    "app/(tabs)/index.tsx": [
        # Remaining calculator icon in laborer view
        ('<Text style={{ fontSize: 24, marginRight: 12 }}></Text>', '<MaterialIcons name="calculate" size={22} color={colors.primary} style={{ marginRight: 12 }} />'),
    ],
    "app/(tabs)/jobs.tsx": [
        # Empty state construction icon
        ('<Text style={{ fontSize: 40, marginBottom: 12 }}></Text>', '<MaterialIcons name="business" size={40} color={colors.muted} style={{ marginBottom: 12 }} />'),
        # Camera icon
        ('<Text style={{ fontSize: 24 }}></Text>', '<MaterialIcons name="photo-camera" size={22} color={colors.foreground} />'),
    ],
    "app/(tabs)/labor-costs.tsx": [
        ('<Text style={{ fontSize: 40, marginBottom: 12 }}></Text>', '<MaterialIcons name="lock" size={40} color={colors.muted} style={{ marginBottom: 12 }} />'),
    ],
    "app/(tabs)/meetings.tsx": [
        # Microphone empty state
        ('<Text style={{ fontSize: 32 }}></Text>', '<MaterialIcons name="mic" size={32} color={colors.primary} />'),
    ],
    "app/(tabs)/payroll.tsx": [
        ('<Text style={{ fontSize: 48, marginBottom: 16 }}></Text>', '<MaterialIcons name="lock" size={48} color={colors.muted} style={{ marginBottom: 16 }} />'),
    ],
    "app/(tabs)/reports.tsx": [
        ('<Text style={{ fontSize: 40, marginBottom: 12 }}></Text>', '<MaterialIcons name="description" size={40} color={colors.muted} style={{ marginBottom: 12 }} />'),
    ],
    "app/(tabs)/team.tsx": [
        ('<Text style={{ fontSize: 40, marginBottom: 12 }}></Text>', '<MaterialIcons name="people" size={40} color={colors.muted} style={{ marginBottom: 12 }} />'),
        ('<Text style={{ fontSize: 48, marginBottom: 16 }}></Text>', '<MaterialIcons name="person-add" size={48} color={colors.muted} style={{ marginBottom: 16 }} />'),
    ],
    "app/(tabs)/schedule.tsx": [
        ('<Text style={{ fontSize: 32 }}></Text>', '<MaterialIcons name="event" size={32} color={colors.muted} />'),
    ],
    "app/invite/[token].tsx": [
        ('<Text style={{ fontSize: 48, marginBottom: 16 }}></Text>', '<MaterialIcons name="link" size={48} color={colors.muted} style={{ marginBottom: 16 }} />'),
    ],
    "components/compass-modal.tsx": [
        ('<Text style={{ fontSize: 48, marginBottom: 16 }}></Text>', '<MaterialIcons name="explore" size={48} color={colors.muted} style={{ marginBottom: 16 }} />'),
    ],
    "components/goals-calendar.tsx": [
        ('<Text style={{ fontSize: 32 }}></Text>', '<MaterialIcons name="event" size={32} color={colors.muted} />'),
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
    
    # Ensure MaterialIcons import
    content = ensure_import(filepath, content)
    
    count = 0
    for old, new in replacements:
        if old in content:
            occurrences = content.count(old)
            content = content.replace(old, new)
            count += occurrences
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"  OK {filepath}: {count} icon replacements + import check")
        total += count
    else:
        print(f"  - {filepath}: no changes")

print(f"\nTotal: {total} replacements")
