#!/usr/bin/env python3
"""Second pass: remove ALL remaining emojis across the app."""
import os

REPLACEMENTS = {
    "app/(tabs)/clock.tsx": [
        ('★', '*'),
        ('✏️', 'Edit'),
        ('🔄', ''),
    ],
    "app/(tabs)/goals.tsx": [
        ('✕', '×'),
        ('🔁', ''),
        ('🔄', ''),
    ],
    "app/(tabs)/hours.tsx": [
        ('⚡', ''),
        ('🕐', ''),
    ],
    "app/(tabs)/index.tsx": [
        ('📋', ''),
        ('🛡️', ''),
    ],
    "app/(tabs)/profile.tsx": [
        ('💰', ''),
    ],
    "app/(tabs)/reports.tsx": [
        ('🖼', ''),
        ('✕', '×'),
    ],
    "app/(tabs)/team.tsx": [
        ('🔒', ''),
        ('📍', ''),
        ('👷', ''),
        ('✅', ''),
    ],
    "app/(tabs)/charts.tsx": [
        ('📉', ''),
        ('📅', ''),
    ],
    "app/invite/[token].tsx": [
        ('🔗', ''),
        ('✅', ''),
    ],
    "app/timecard/[id].tsx": [
        ('📄', ''),
        ('🗑', ''),
        ('⚡', ''),
    ],
    "components/construction-calculator.tsx": [
        ('🏗️', ''),
        ('🪵', ''),
        ('💰', ''),
        ('🪜', ''),
    ],
    "components/pivot-chat.tsx": [
        ('🖼️', ''),
        ('📄', ''),
        ('🔗', ''),
        ('📎', ''),
        ('✕', '×'),
        ('🎤', ''),
        ('🔴', ''),
        ('📷', ''),
    ],
    "components/voice-goal-creator.tsx": [
        ('🎤', ''),
        ('✕', '×'),
        ('✅', ''),
    ],
    "components/compass-modal.tsx": [
        ('📱', ''),
    ],
    "components/overhead-settings.tsx": [
        ('✕', '×'),
    ],
    "components/employee-tax-info.tsx": [
        ('✅', ''),
    ],
    "components/goals-calendar.tsx": [
        ('✕', '×'),
    ],
}

os.chdir("/home/ubuntu/construction-manager")
total = 0
for filepath, replacements in REPLACEMENTS.items():
    if not os.path.exists(filepath):
        print(f"  SKIP: {filepath}")
        continue
    with open(filepath, 'r') as f:
        content = f.read()
    original = content
    count = 0
    for old, new in replacements:
        if old in content:
            occurrences = content.count(old)
            content = content.replace(old, new)
            count += occurrences
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"  OK {filepath}: {count} replacements")
        total += count
    else:
        print(f"  - {filepath}: no changes")

print(f"\nTotal pass 2 replacements: {total}")

# Also clean up any stray variation selectors (️ = \uFE0F)
import re
emoji_pattern = re.compile(
    '[\U0001F300-\U0001F9FF\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF'
    '\U00002600-\U000027BF\U0000FE0F'
    '\U00002702-\U000027B0\U00002728\U00002705'
    '\U0000274C\U0000274E\U00002753-\U00002755\U00002757'
    '\U00002763-\U00002764\U00002795-\U00002797\U000027A1\U000027B0]'
)
keep = {'✓', '×', '−', '●', '←', '→', '‹', '›', '+', '*'}

dirs = ['app', 'components', 'lib', 'hooks', 'constants']
remaining = 0
for d in dirs:
    for root, _, files in os.walk(d):
        if 'node_modules' in root or '.expo' in root:
            continue
        for f in files:
            if f.endswith(('.tsx', '.ts')):
                path = os.path.join(root, f)
                with open(path) as fh:
                    for i, line in enumerate(fh, 1):
                        matches = emoji_pattern.findall(line)
                        real = [m for m in matches if m not in keep]
                        if real:
                            remaining += 1
                            print(f"  REMAINING: {path}:{i}: {[hex(ord(c)) for c in real]} -> {line.strip()[:80]}")

if remaining == 0:
    print("\nAll emojis removed successfully!")
else:
    print(f"\n{remaining} lines still have emojis")
