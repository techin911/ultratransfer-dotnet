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
    var data = JSON.parse(e.postData.contents);
    var fileName = data.name || "uploaded_file_" + new Date().getTime();
    var chunkIndex = data.chunkIndex !== undefined ? data.chunkIndex : 0;
    var totalChunks = data.totalChunks !== undefined ? data.totalChunks : 1;
    var bytes = Utilities.base64Decode(data.content);

    if (totalChunks === 1) {
      var blob = Utilities.newBlob(bytes, "application/octet-stream", fileName);
      var file = DriveApp.createFile(blob);
      return ContentService.createTextOutput(JSON.stringify({ status: "success", fileId: file.getId(), fileUrl: file.getUrl() })).setMimeType(ContentService.MimeType.JSON);
    }

    var folder = getOrCreateTempFolder();
    folder.createFile("chunk_" + fileName + "_" + chunkIndex, bytes, "application/octet-stream");

    if (chunkIndex === totalChunks - 1) {
      Utilities.sleep(1000);
      var combinedBytes = [];
      for (var i = 0; i < totalChunks; i++) {
        var files = folder.getFilesByName("chunk_" + fileName + "_" + i);
        if (files.hasNext()) {
          var f = files.next();
          var b = f.getBlob().getBytes();
          combinedBytes = combinedBytes.concat(b);
          f.setTrashed(true);
        }
      }
      var finalBlob = Utilities.newBlob(combinedBytes, "application/octet-stream", fileName);
      var finalFile = DriveApp.createFile(finalBlob);
      return ContentService.createTextOutput(JSON.stringify({ status: "success", fileId: finalFile.getId(), fileUrl: finalFile.getUrl() })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "chunk_received", chunkIndex: chunkIndex })).setMimeType(ContentService.MimeType.JSON);
  } catch (ex) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: ex.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateTempFolder() {
  var folders = DriveApp.getFoldersByName("UltraTransfer_Temp");
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder("UltraTransfer_Temp");
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
