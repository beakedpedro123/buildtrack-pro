# Video Analysis Notes - Apr 29, 2026

## UI Issues
1. **Grey area at bottom** - When Pivot chat is open and keyboard dismissed, large empty grey rectangle at bottom below action chips (Roof Pitch, Rafter, Compound)
2. **Overlapping elements** - Chat messages scroll behind the input field and action chips. Input area lacks solid background causing text bleed-through.

## Critical Data Leak
- User is logged in as "Pablo" with email "pcrcleaningservices1@gmail.com" (PCR Cleaning Services account)
- Pivot is calling them "Pablo" and referencing "Carranza Custom Construction" 
- Pivot shows goals that belong to another company (clock in/out goals)
- The system pre-populated goals from another company's data into this new account

## Key Screens
- Settings: Shows PCR Cleaning Services email, Owner role, Employee #570009
- Home: "Good evening, Pablo" - 0 Active Jobs, 0 On Site, 1 Employee
- Pivot Chat: References "Carranza Custom Construction" which is WRONG company name for PCR Cleaning
- Goals shown are from another company's data (clock in/out mandatory goals)

## Root Cause Analysis
- Pivot's system prompt likely hardcodes "Carranza Custom Construction" or pulls from wrong company
- Goals auto-creation may be pulling from a template or another company's goals
- The company name in Pivot responses doesn't match the logged-in user's company
