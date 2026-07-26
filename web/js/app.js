// UltraTransfer JavaScript Engine - High-Performance Parallel Uploads & Auto Cloud Sync
let speedData = new Array(30).fill(0);
let speedChartCtx = null;

const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB Optimal Chunk Size
const MAX_CONCURRENT_UPLOADS = 6;   // 6 Optimal Upload Streams (Avoids TCP Throttling)

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

// High-Speed Multi-Threaded Parallel Chunk Upload Algorithm
async function uploadFiles(files) {
  for (let i = 0; i < files.length; i++) {
    await uploadSingleFile(files[i]);
  }
}

async function uploadSingleFile(file) {
  const totalSize = file.size;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
  
  document.getElementById('transferStatusBadge').innerText = `Uploading ${file.name}...`;

  // Init Upload Session
  const initRes = await fetch('/api/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, totalSize: totalSize, totalChunks: totalChunks })
  });
  const session = await initRes.json();
  const sessionId = session.sessionId;

  let bytesUploaded = 0;
  let startTime = Date.now();
  let lastTime = startTime;
  let lastBytes = 0;

  // Queue up chunk indices
  const chunkQueue = [];
  for (let c = 0; c < totalChunks; c++) chunkQueue.push(c);

  async function worker() {
    while (chunkQueue.length > 0) {
      const chunkIndex = chunkQueue.shift();
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      const chunkBlob = file.slice(start, end);

      await fetch('/api/upload/chunk', {
        method: 'POST',
        headers: {
          'X-Session-Id': sessionId,
          'X-Chunk-Index': chunkIndex,
          'X-Offset': start
        },
        body: chunkBlob
      });

      bytesUploaded += (end - start);

      // Real-time speed & progress updates
      const now = Date.now();
      const timeDiff = (now - lastTime) / 1000;
      if (timeDiff >= 0.3 || bytesUploaded === totalSize) {
        const speedBps = (bytesUploaded - lastBytes) / timeDiff;
        const speedMBps = (speedBps / (1024 * 1024)).toFixed(2);
        
        const progressPct = Math.round((bytesUploaded / totalSize) * 100);
        const remainingBytes = totalSize - bytesUploaded;
        const etaSec = speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0;

        document.getElementById('statSpeed').innerText = `${speedMBps} MB/s`;
        document.getElementById('statProgress').innerText = `${progressPct}%`;
        document.getElementById('statEta').innerText = `${etaSec}s`;
        document.getElementById('progressBarFill').style.width = `${progressPct}%`;

        pushSpeedData(parseFloat(speedMBps));

        lastTime = now;
        lastBytes = bytesUploaded;
      }
    }
  }

  // Run workers concurrently
  const workers = [];
  const activeWorkerCount = Math.min(MAX_CONCURRENT_UPLOADS, totalChunks);
  for (let w = 0; w < activeWorkerCount; w++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  document.getElementById('transferStatusBadge').innerText = 'Finalizing Upload...';
  document.getElementById('transferStatusBadge').style.color = '#00e676';
  document.getElementById('statProgress').innerText = '100%';
  document.getElementById('progressBarFill').style.width = '100%';

  // Complete Upload Session
  try {
    await fetch('/api/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId })
    });
  } catch (err) {}

  document.getElementById('transferStatusBadge').innerText = 'Completed ✓';
  setTimeout(() => {
    document.getElementById('transferStatusBadge').innerText = 'Ready';
  }, 4000);
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
