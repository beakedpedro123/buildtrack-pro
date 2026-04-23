Based on the video provided, here is an analysis focusing on the Schedule tab and a description of all the screens shown:

**1) What does the week selector look like at the top?**
Within the **Schedule** tab, when you select a specific job and navigate to its **Calendar** sub-tab (visible around 01:00 and 01:10), the week selector appears as follows:
*   It features a date range in the center (e.g., "Apr 20 – Apr 26").
*   There are left (`<`) and right (`>`) navigation arrows on either side of the date range to move between weeks.
*   Directly below the date range, there is smaller text indicating the relative time, such as "This Week".
*   Below this header, there is a row displaying the days of the week (M, T, W, T, F, S, S) with their corresponding dates (20, 21, 22, etc.). The currently selected day is highlighted with a yellow circle.

**2) Are any words being cut off or smushed together right below the 'Schedule' title?**
Yes. When the user first navigates to the **Schedule** tab (at 00:47), before selecting a specific job, there is a noticeable UI rendering issue. Right below the main "Schedule" title at the top of the screen, and just above the list of jobs, there is a very thin, dark horizontal band. In this band, it appears that a row of text or icons has been severely compressed vertically, showing only the very top pixels, making it completely illegible.

**3) What is the overall layout and any visual issues you can see?**
*   **Layout:** The Schedule tab has two main states.
    *   **Initial State:** A simple list view showing all jobs and their overall schedule completion percentage (0%).
    *   **Detailed State:** When a job is tapped, the layout becomes more complex. It features the main "Schedule" title, action buttons ("Generate", "+ Task") on the right, a horizontally scrollable list of all jobs to quickly switch between them, three sub-tabs ("Phases", "Calendar", "Progress"), and finally, the main content area for the selected sub-tab.
*   **Visual Issues:** The primary visual issue is the smushed, cut-off row of text/icons on the initial Schedule screen, as described in point 2. The detailed state's layout, while functional, feels a bit dense with multiple layers of navigation (horizontal job list + sub-tabs) stacked on top of each other.

**4) Describe each tab/screen shown in the recording:**
Throughout the video, the user navigates through several different screens in the app:

*   **Dashboard/Home Screen:** The initial screen showing a greeting ("Good evening, Pedro"), high-level metrics (Active Jobs, On Site Now, Employees), Budget Alerts, and various financial and labor summaries (Hourly Job Profit, Labor Costs, Weekly Trend, Cost by Job, By Employee).
*   **Jobs:** A screen listing all projects. It has sub-tabs for "Active", "All", and "Completed" jobs. Each card shows the job name, client/company, address, hourly rate, and revenue.
*   **Goals & Tasks:** A section for managing work, containing three sub-tabs:
    *   **Goals:** Shows a weekly view of tasks, categorized by priority and assignee.
    *   **Calendar:** Offers both a monthly and weekly calendar view to see when tasks are scheduled.
    *   **Punch List:** Provides a list of active jobs; tapping one would presumably open its specific punch list.
*   **Team:** A directory listing all employees, displaying their initials, full name, role (e.g., Laborer, Foreman), and their hourly wage.
*   **My Profile:** A settings screen for the current user, showing their name, role (Owner), display name, an option to change the login PIN, and app language preferences (English/Español).
*   **Schedule:** The scheduling tool, which includes:
    *   An initial list of jobs showing schedule progress.
    *   A detailed view for a selected job with sub-tabs for **Phases** (showing an empty state prompting to use AI to generate a schedule), **Calendar** (a weekly view for scheduling tasks for that specific job), and **Progress** (showing overall completion percentage).