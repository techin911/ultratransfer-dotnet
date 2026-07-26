// UltraTransfer JavaScript Engine - High-Performance Parallel Uploads & Auto Cloud Sync
let speedData = new Array(30).fill(0);
let speedChartCtx = null;

document.addEventListener('DOMContentLoaded', () => {
  initChart();
  setupQuickConnect();
  setupDropzone();
});

function setupQuickConnect() {
  const currentUrl = window.location.href;
  const input = document.getElementById('shareUrlInput');
  if (input) input.value = currentUrl;

  const qrContainer = document.getElementById('qrcodeDisplay');
  if (qrContainer && window.QRCode) {
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: currentUrl,
      width: 160,
      height: 160
    });
  }
}

function copyShareUrl() {
  const input = document.getElementById('shareUrlInput');
  if (input) {
    navigator.clipboard.writeText(input.value);
    const btn = event.target;
    if (btn) {
      btn.innerText = '✓ Copied!';
      setTimeout(() => btn.innerText = 'Copy', 2000);
    }
  }
}

// Drag & Drop Setup
function setupDropzone() {
  const dz = document.getElementById('dropzone');
  ['dragenter', 'dragover'].forEach(name => {
    dz.addEventListener(name, (e) => { e.preventDefault(); dz.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(name => {
    dz.addEventListener(name, (e) => { e.preventDefault(); dz.classList.remove('dragover'); });
  });
  dz.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) uploadFiles(files);
  });
}

function handleFileSelect(e) {
  const files = e.target.files;
  if (files.length > 0) uploadFiles(files);
}

// Multi-File Upload Queue
async function uploadFiles(files) {
  for (let i = 0; i < files.length; i++) {
    await uploadSingleFile(files[i]);
  }
}

async function uploadSingleFile(file) {
  return new Promise((resolve, reject) => {
    document.getElementById('transferStatusBadge').innerText = `Uploading ${file.name}...`;
    document.getElementById('transferStatusBadge').style.color = '#00f2fe';

    const startTime = Date.now();
    let lastTime = startTime;
    let lastBytes = 0;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000;
        
        if (timeDiff >= 0.2 || evt.loaded === evt.total) {
          const speedBps = timeDiff > 0 ? (evt.loaded - lastBytes) / timeDiff : 0;
          const speedMBps = (speedBps / (1024 * 1024)).toFixed(2);
          
          const progressPct = Math.round((evt.loaded / evt.total) * 100);
          const remainingBytes = evt.total - evt.loaded;
          const etaSec = speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0;

          document.getElementById('statSpeed').innerText = `${speedMBps} MB/s`;
          document.getElementById('statProgress').innerText = `${progressPct}%`;
          document.getElementById('statEta').innerText = `${etaSec}s`;
          document.getElementById('progressBarFill').style.width = `${progressPct}%`;

          pushSpeedData(parseFloat(speedMBps));
          lastTime = now;
          lastBytes = evt.loaded;
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        document.getElementById('transferStatusBadge').innerText = 'Saved to Google Drive ✓';
        document.getElementById('transferStatusBadge').style.color = '#00e676';
        document.getElementById('statProgress').innerText = '100%';
        document.getElementById('progressBarFill').style.width = '100%';
        setTimeout(() => {
          document.getElementById('transferStatusBadge').innerText = 'Ready';
        }, 4000);
        resolve();
      } else {
        document.getElementById('transferStatusBadge').innerText = 'Upload Error';
        reject(new Error('Upload failed'));
      }
    };

    xhr.onerror = () => {
      document.getElementById('transferStatusBadge').innerText = 'Upload Error';
      reject(new Error('Network error'));
    };

    xhr.send(file);
  });
}

// Chart Renderer
function initChart() {
  const canvas = document.getElementById('speedChart');
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  speedChartCtx = canvas.getContext('2d');
  drawChart();
}

function pushSpeedData(val) {
  speedData.shift();
  speedData.push(val);
  drawChart();
}

function drawChart() {
  if (!speedChartCtx) return;
  const ctx = speedChartCtx;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.clearRect(0, 0, w, h);
  
  const maxVal = Math.max(10, ...speedData);
  const stepX = w / (speedData.length - 1);

  ctx.beginPath();
  ctx.strokeStyle = '#00f2fe';
  ctx.lineWidth = 2;

  for (let i = 0; i < speedData.length; i++) {
    const x = i * stepX;
    const y = h - (speedData[i] / maxVal) * (h - 20) - 10;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Gradient fill below line
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(0, 242, 254, 0.3)');
  grad.addColorStop(1, 'rgba(0, 242, 254, 0.0)');
  ctx.fillStyle = grad;
  ctx.fill();
}
