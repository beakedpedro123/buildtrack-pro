#!/usr/bin/env python3
"""
Batch replace ALL emojis across the BuildTrack Pro app with clean text or MaterialIcons references.
This script performs targeted replacements per file, then a final sweep for any remaining emojis.
"""
import re
import os

# ─── Per-file targeted replacements ─────────────────────────────────────
# Format: { "file_path": [ (old_string, new_string), ... ] }

REPLACEMENTS = {
    # ═══ app/(tabs)/index.tsx ═══
    "app/(tabs)/index.tsx": [
        # Dashboard stat emojis → clean text
        ('🎯', ''),  # target icon - remove emoji wrapper, keep text
        ('🧮', ''),  # calculator icon
        ('🧭', ''),  # compass icon
        ('✏️', 'Edit'),
        ('✕', '×'),  # use multiplication sign instead
        ('✓', '✓'),  # keep checkmark (it's a text char, not emoji) - actually let's use a clean one
    ],
    
    # ═══ app/(tabs)/jobs.tsx ═══
    "app/(tabs)/jobs.tsx": [
        ('🏗️', ''),  # construction emoji in empty state
        ('🟢', '●'),  # status dots → simple filled circles
        ('🟡', '●'),
        ('⚫', '●'),
        ('📋', ''),  # clipboard
        ('✏️', 'Edit'),
        ('➕', '+'),
        ('➖', '−'),
        ('🗑️', 'Del'),
        ('🔄', '→'),
        ('📷', ''),  # camera
    ],
    
    # ═══ app/(tabs)/jobsreports.tsx ═══
    "app/(tabs)/jobsreports.tsx": [
        ('🏗️', ''),
        ('📋', ''),
        ('📊', ''),
    ],
    
    # ═══ app/(tabs)/charts.tsx ═══
    "app/(tabs)/charts.tsx": [
        ('💰', ''),
        ('👷', ''),
        ('🏛', ''),
        ('📸', ''),
        ('📄', ''),
        ('📊', ''),
        ('🔒', ''),
    ],
    
    # ═══ app/(tabs)/kpis.tsx ═══
    "app/(tabs)/kpis.tsx": [
        ('💰', ''),
        ('👷', ''),
        ('🏗️', ''),
        ('🛡️', ''),
        ('📅', ''),
        ('📊', ''),
        ('🔒', ''),
    ],
    
    # ═══ app/(tabs)/manage.tsx ═══
    "app/(tabs)/manage.tsx": [
        ('👥', ''),
        ('📅', ''),
        ('🎤️', ''),
        ('💰', ''),
        ('⏱️', ''),
    ],
    
    # ═══ app/(tabs)/meetings.tsx ═══
    "app/(tabs)/meetings.tsx": [
        ('🎙', ''),
        ('🤖', ''),
        ('🎯', ''),
        ('🔄', ''),
        ('🔔', ''),
        ('🔕', ''),
        ('📅', ''),
    ],
    
    # ═══ app/(tabs)/payroll.tsx ═══
    "app/(tabs)/payroll.tsx": [
        ('🔒', ''),
        ('✏️', ''),
        ('📄', ''),
        ('📋', ''),
        ('✓', '✓'),  # keep text checkmark
    ],
    
    # ═══ app/(tabs)/profile.tsx ═══
    "app/(tabs)/profile.tsx": [
        ('👤', ''),
        ('✉️', ''),
        ('🌐', ''),
        ('📍', ''),
    ],
    
    # ═══ app/(tabs)/reports.tsx ═══
    "app/(tabs)/reports.tsx": [
        ('📋', ''),
        ('📷', ''),
        ('📝', ''),
        ('🔄', ''),
    ],
    
    # ═══ app/(tabs)/schedule.tsx ═══
    "app/(tabs)/schedule.tsx": [
        ('⚡', ''),
        ('📅', ''),
    ],
    
    # ═══ app/(tabs)/goals.tsx ═══
    "app/(tabs)/goals.tsx": [
        ('🎯', ''),
        ('📋', ''),
        ('✏️', ''),
        ('🗑️', ''),
        ('📅', ''),
    ],
    
    # ═══ app/(tabs)/clock.tsx ═══
    "app/(tabs)/clock.tsx": [
        ('📍', ''),
        ('⏱️', ''),
        ('🕐', ''),
        ('✓', '✓'),
    ],
    
    # ═══ app/(tabs)/hours.tsx ═══
    "app/(tabs)/hours.tsx": [
        ('⏱️', ''),
        ('📊', ''),
    ],
    
    # ═══ app/(tabs)/labor-costs.tsx ═══
    "app/(tabs)/labor-costs.tsx": [
        ('🔒', ''),
    ],
    
    # ═══ app/(tabs)/team.tsx ═══
    "app/(tabs)/team.tsx": [
        ('👥', ''),
        ('📧', ''),
        ('📋', ''),
        ('✏️', ''),
        ('🗑️', ''),
    ],
    
    # ═══ app/invite/[token].tsx ═══
    "app/invite/[token].tsx": [
        ('🏗️', ''),
        ('✓', '✓'),
    ],
    
    # ═══ app/timecard/[id].tsx ═══
    "app/timecard/[id].tsx": [
        ('📋', ''),
        ('📍', ''),
    ],
    
    # ═══ components/pivot-chat.tsx ═══
    "components/pivot-chat.tsx": [
        ('🏗️', ''),
        ('📊', ''),
        ('💰', ''),
        ('📋', ''),
        ('🧮', ''),
        ('📐', ''),
        ('📝', ''),
        ('🎯', ''),
        ('👷', ''),
        ('🔧', ''),
        ('📅', ''),
        ('⚡', ''),
        ('🤖', ''),
    ],
    
    # ═══ components/construction-calculator.tsx ═══
    "components/construction-calculator.tsx": [
        ('📐', ''),
        ('🧮', ''),
        ('📏', ''),
        ('🔢', ''),
    ],
    
    # ═══ components/goals-calendar.tsx ═══
    "components/goals-calendar.tsx": [
        ('🎯', ''),
        ('📅', ''),
    ],
    
    # ═══ components/voice-goal-creator.tsx ═══
    "components/voice-goal-creator.tsx": [
        ('🎙️', ''),
        ('🎯', ''),
    ],
    
    # ═══ components/compass-modal.tsx ═══
    "components/compass-modal.tsx": [
        ('🧭', ''),
    ],
    
    # ═══ components/crew-map.native.tsx ═══
    "components/crew-map.native.tsx": [
        ('📍', ''),
    ],
    
    # ═══ components/crew-map.web.tsx ═══
    "components/crew-map.web.tsx": [
        ('📍', ''),
    ],
    
    # ═══ components/employee-tax-info.tsx ═══
    "components/employee-tax-info.tsx": [
        ('💰', ''),
    ],
    
    # ═══ components/overhead-settings.tsx ═══
    "components/overhead-settings.tsx": [
        ('💰', ''),
    ],
    
    # ═══ components/ui/job-picker.tsx ═══
    "components/ui/job-picker.tsx": [
        ('🏗️', ''),
        ('✓', '✓'),
    ],
}


def process_file(filepath, replacements):
    """Apply targeted replacements to a file."""
    if not os.path.exists(filepath):
        print(f"  SKIP (not found): {filepath}")
        return 0
    
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
        print(f"  ✓ {filepath}: {count} replacements")
    else:
        print(f"  - {filepath}: no changes needed")
    
    return count


def final_sweep():
    """Final sweep to catch any remaining emojis."""
    emoji_pattern = re.compile(
        '[\U0001F300-\U0001F9FF'
        '\U0001FA00-\U0001FA6F'
        '\U0001FA70-\U0001FAFF'
        '\U00002600-\U000027BF'
        '\U0000FE00-\U0000FE0F'
        '\U00002702-\U000027B0'
        '\U00002728\U00002705'
        '\U0000274C\U0000274E'
        '\U00002753-\U00002755'
        '\U00002757'
        '\U00002763-\U00002764'
        '\U00002795-\U00002797'
        '\U000027A1\U000027B0'
        ']'
    )
    
    # Characters we want to KEEP (they're text, not emojis)
    keep_chars = {'✓', '×', '−', '●', '←', '→', '‹', '›', '+'}
    
    dirs = ['app', 'components', 'lib', 'hooks', 'constants']
    remaining = []
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
                            # Filter out chars we want to keep
                            real_emojis = [m for m in matches if m not in keep_chars]
                            if real_emojis:
                                remaining.append((path, i, real_emojis, line.strip()[:100]))
    
    return remaining


if __name__ == "__main__":
    os.chdir("/home/ubuntu/construction-manager")
    
    print("=== Phase 1: Targeted Replacements ===\n")
    total = 0
    for filepath, replacements in REPLACEMENTS.items():
        total += process_file(filepath, replacements)
    print(f"\nTotal replacements: {total}")
    
    print("\n=== Phase 2: Final Sweep for Remaining Emojis ===\n")
    remaining = final_sweep()
    if remaining:
        print(f"Found {len(remaining)} lines with remaining emojis:")
        for path, line_no, emojis, text in remaining:
            print(f"  {path}:{line_no}: {emojis}")
    else:
        print("No remaining emojis found!")
