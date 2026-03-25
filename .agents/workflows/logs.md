---
description: Gets the logs for a Cloud Run service.
---

1. Detect the service name:
   - Check `.env` for `DEFAULT_SERVICE_NAME`.
   - If not found, use the current directory name `wa-gemini-bot`.
2. Get the Google Cloud Project ID:
   - Ask the user for the project ID or list available projects using `mcp_cloudrun_list_projects`.
3. Fetch logs:
   - Use `mcp_cloudrun_get_service_log` with the detected service name and the confirmed project ID.
