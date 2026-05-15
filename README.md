# 🎯 Job Shark Setup Guide

A tool to find fresh jobs automatically from ReKrute and other platforms via Tavily.

## 🚀 Quick Start

1.  **Get a Tavily API Key**: Sign up for free at [tavily.com](https://tavily.com) to get your API key.
2.  **Set Environment Variables**:
    ```bash
    export TAVILY_API_KEY="your_key_here"
    ```
3.  **Install Dependencies**:
    ```bash
    npm install
    ```
4.  **Run the Script**:
    ```bash
    node job-hunter-v3.mjs
    ```

## ⚙️ Customization

Open `job-hunter-v3.mjs` and modify the `CONFIG` object at the top:

```javascript
const CONFIG = {
  SEARCH_KEYWORDS: ["Java", "Spring Boot"],
  LOCATION: "Morocco",
  CONTRACT_TYPE: "CDI",
  // ... update queries and stack keywords here
};
```

## 🛠️ Optional Features

*   **Google Sheets**: Set `GOOGLE_SHEETS_WEBHOOK` to a Google Apps Script URL to log jobs automatically.
*   **GitHub Actions**: Add your secrets to the repository to run it on a schedule.
