Act as a Senior Frontend Web Developer. I need you to build a single-page React application using Vite and Tailwind CSS. The app is a minimalist, mobile-first Birthday Tracker focusing on "Essentialism" - no fluff, just core value.

Tech Stack: React, Vite, Tailwind CSS, and a Hebrew calendar library (like 'hebcal' or '@hebcal/core').

Key Requirements & Logic:

Data Fetching: The app will communicate with a Google Apps Script Webhook (GET to fetch data, POST to add data). The exact URL will be provided later, use a placeholder constant.

Authentication: On first load, prompt the user for a 4-digit PIN. Save it to LocalStorage. Attach this PIN as an 'Authorization' header or payload in all API requests. Skip the PIN screen on future visits if it exists in LocalStorage.

Data Model: A person can have: Name (string), DateType ('Hebrew', 'Gregorian', or 'Both'), GregorianDate (string/date), HebrewDate (string - e.g., '14 Adar'), and Notes (string).

Core Logic (CRITICAL): When data is fetched, the app must calculate the next upcoming occurrence for every birthday relative to today's date. For Hebrew dates, convert the upcoming Hebrew birthday to a Gregorian Date to calculate the "days remaining".

UI Layout: A single vertically scrolling feed. Sort the list of people strictly by "Days remaining until next birthday" (ascending, 0 to 365).

Add Feature: A Floating Action Button (FAB) that opens a clean modal/drawer. The modal should have a form to add a new person, allowing them to select the DateType and input the relevant dates and notes.

Write clean, modular components. Provide the complete code for App.jsx, the API service, and the date calculation utility.