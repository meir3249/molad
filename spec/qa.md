Act as a Senior QA Automation Engineer. We are developing a serverless Birthday Tracker application (React frontend, Google Sheets backend via Apps Script).

Please write a comprehensive test plan and edge-case checklist based on the following context:
The app stores dates in Gregorian, Hebrew, or Both. It sorts all birthdays in a single view from the closest upcoming date to the furthest, based on calculating the days remaining.

I need you to map out test cases focusing specifically on:

Date Math Edge Cases: Leap years in Gregorian (Feb 29) and leap years in Hebrew (Adar I vs Adar II). How does the app handle a birthday that only exists in a leap year?

Sorting Wrap-around: Ensure a birthday happening in January next year is sorted after a birthday happening in December this year.

Security/Auth: The app uses a simple 4-digit PIN saved in LocalStorage. What are the vulnerabilities and how should we test the backend rejection of invalid PINs?

CRUD Operations: Flow for creating a new record and ensuring the UI updates immediately without a hard refresh.

Provide a step-by-step manual testing script for a user to verify the core functionality on their mobile browser.