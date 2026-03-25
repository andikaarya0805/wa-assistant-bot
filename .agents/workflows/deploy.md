---
description: Deploys the current working directory to Cloud Run.
---

1. Detect the service name:
   - Check `.env` for `DEFAULT_SERVICE_NAME`.
   - If not found, use the current directory name `wa-gemini-bot`.
2. Get the Google Cloud Project ID:
   - Ask the user for the project ID or list available projects using `mcp_cloudrun_list_projects`.
3. Deploy the local folder:
   - Use `mcp_cloudrun_deploy_local_folder` with `folderPath='d:\dika\tugas\wa-gemini-bot'`.
   - Use the detected service name and the confirmed project ID.
