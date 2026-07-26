# 📁 Free Google Drive Auto-Save Setup Guide

Follow these 3 simple steps to make all files uploaded on `https://ultratransfer-dotnet.onrender.com` automatically save to your personal **Google Drive**:

---

### Step 1: Create a Google Apps Script

1. Open your browser and go to: **[script.google.com](https://script.google.com)**
2. Click **New Project** in the top-left corner.
3. Replace all existing code in the editor with this script:

```javascript
function doPost(e) {
  try {
    var fileName = "uploaded_file_" + new Date().getTime();
    var fileBytes = null;

    if (e.postData && e.postData.contents) {
      try {
        var parsed = JSON.parse(e.postData.contents);
        if (parsed.name) fileName = parsed.name;
        if (parsed.content) fileBytes = Utilities.base64Decode(parsed.content);
      } catch (errJson) {
        fileBytes = e.postData.contents;
      }
    }
    
    if (e.parameter && e.parameter.name) {
      fileName = e.parameter.name;
    }

    if (!fileBytes) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No content received" })).setMimeType(ContentService.MimeType.JSON);
    }

    var blob = Utilities.newBlob(fileBytes, "application/octet-stream", fileName);
    var file = DriveApp.createFile(blob);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      fileId: file.getId(),
      fileName: file.getName(),
      fileUrl: file.getUrl()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (ex) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: ex.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
```

---

### Step 2: Deploy as Web App

1. In the top-right corner, click **Deploy** -> **New deployment**.
2. Click the gear icon ⚙️ next to *Select type* -> Choose **Web app**.
3. Set the options:
   - **Execute as**: `Me`
   - **Who has access**: `Anyone` *(Crucial so Render server can post uploaded files)*
4. Click **Deploy**.
5. Grant access when prompted by Google.
6. Copy the **Web App URL** (looks like: `https://script.google.com/macros/s/AKfycb.../exec`).

---

### Step 3: Add to Render.com

1. Go to your Render dashboard: **[dashboard.render.com](https://dashboard.render.com)**
2. Click your service **`ultratransfer-dotnet`**.
3. On the left sidebar menu, click **Environment**.
4. Click **Add Environment Variable**:
   - **Key**: `GDRIVE_WEBHOOK_URL`
   - **Value**: *(Paste your Google Web App URL from Step 2)*
5. Click **Save Changes**.

---

🎉 **Done!** Every file uploaded from a phone or browser online will now automatically save directly into your **Google Drive**!
