// UltraTransfer JavaScript Engine - High-Performance Parallel Uploads & Firebase Cloud Engine
let speedData = new Array(30).fill(0);
let speedChartCtx = null;

// Firebase Cloud Storage Configuration
const firebaseConfig = {
  apiKey: "AIzaSyChTSdK6lfETouESw7q98LQcCBbX-biYLU",
  authDomain: "ultra-transfer-5ac31.firebaseapp.com",
  projectId: "ultra-transfer-5ac31",
  storageBucket: "ultra-transfer-5ac31.firebasestorage.app",
  messagingSenderId: "688779242699",
  appId: "1:688779242699:web:982df4562568dbadbf7f4e",
  measurementId: "G-WDWJ44DWHS"
};

if (window.firebase) {
  try {
    firebase.initializeApp(firebaseConfig);
  } catch (e) {}
}

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

    if (window.firebase && firebase.storage) {
      const storageRef = firebase.storage().ref(`uploads/${file.name}`);
      const uploadTask = storageRef.put(file);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          const progressPct = Math.round(progress);

          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000;
          if (timeDiff >= 0.2 || snapshot.bytesTransferred === snapshot.totalBytes) {
            const speedBps = timeDiff > 0 ? (snapshot.bytesTransferred - lastBytes) / timeDiff : 0;
            const speedMBps = (speedBps / (1024 * 1024)).toFixed(2);
            const remainingBytes = snapshot.totalBytes - snapshot.bytesTransferred;
            const etaSec = speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0;

            document.getElementById('statSpeed').innerText = `${speedMBps} MB/s`;
            document.getElementById('statProgress').innerText = `${progressPct}%`;
            document.getElementById('statEta').innerText = `${etaSec}s`;
            document.getElementById('progressBarFill').style.width = `${progressPct}%`;

            pushSpeedData(parseFloat(speedMBps));
            lastTime = now;
            lastBytes = snapshot.bytesTransferred;
          }
        },
        (error) => {
          console.error("Firebase Storage Upload Error:", error);
          document.getElementById('transferStatusBadge').innerText = 'Upload Error';
          reject(error);
        },
        async () => {
          document.getElementById('transferStatusBadge').innerText = 'Uploaded to Firebase Cloud ✓';
          document.getElementById('transferStatusBadge').style.color = '#00e676';
          document.getElementById('statProgress').innerText = '100%';
          document.getElementById('progressBarFill').style.width = '100%';

          setTimeout(() => {
            document.getElementById('transferStatusBadge').innerText = 'Ready';
          }, 4000);
          resolve();
        }
      );
    } else {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload', true);
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      xhr.onload = () => resolve();
      xhr.send(file);
    }
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
