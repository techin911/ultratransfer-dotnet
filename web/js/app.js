// UltraTransfer JavaScript Engine - High-Performance Parallel Uploads & WebRTC P2P
let currentMode = 'lan';
let speedData = new Array(30).fill(0);
let speedChartCtx = null;
let currentRoomId = null;
let peerConnection = null;
let dataChannel = null;

const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB Chunk Size for Maximum Throughput
const MAX_CONCURRENT_UPLOADS = 6;   // 6 Parallel Upload Streams

document.addEventListener('DOMContentLoaded', () => {
  initChart();
  fetchServerInfo();
  setupDropzone();
  createInternetRoom();
});

// Mode Switching
function switchMode(mode) {
  currentMode = mode;
  document.getElementById('btnModeLan').classList.toggle('active', mode === 'lan');
  document.getElementById('btnModeInternet').classList.toggle('active', mode === 'internet');
  
  document.getElementById('lanPairingSection').style.display = mode === 'lan' ? 'flex' : 'none';
  document.getElementById('internetPairingSection').style.display = mode === 'internet' ? 'flex' : 'none';
}

// Server Info & QR Code Setup
async function fetchServerInfo() {
  try {
    const res = await fetch('/api/info');
    const data = await res.json();
    
    const ipContainer = document.getElementById('ipListContainer');
    ipContainer.innerHTML = '';
    
    const hostUrl = `http://localhost:${data.port}`;
    let firstNetworkUrl = hostUrl;
    
    data.ips.forEach(ip => {
      const url = `http://${ip}:${data.port}`;
      if (firstNetworkUrl === hostUrl) firstNetworkUrl = url;
      
      const btn = document.createElement('button');
      btn.className = 'ip-btn';
      btn.innerHTML = `<span>${ip}:${data.port}</span> <span>📋 Copy</span>`;
      btn.onclick = () => {
        navigator.clipboard.writeText(url);
        btn.querySelector('span:last-child').innerText = '✓ Copied!';
        setTimeout(() => btn.querySelector('span:last-child').innerText = '📋 Copy', 2000);
      };
      ipContainer.appendChild(btn);
    });

    // Render LAN QR Code
    if (window.QRCode) {
      new QRCode(document.getElementById('qrcodeLan'), {
        text: firstNetworkUrl,
        width: 150,
        height: 150
      });
    }
  } catch (err) {
    console.error('Failed to fetch server info:', err);
  }
}

// Internet P2P Room Creation & Signaling
async function createInternetRoom() {
  try {
    const res = await fetch('/api/room/create', { method: 'POST' });
    const data = await res.json();
    currentRoomId = data.roomId;
    
    document.getElementById('roomCodeDisplay').innerText = `${currentRoomId.slice(0,3)}-${currentRoomId.slice(3)}`;

    const roomUrl = `${window.location.origin}?room=${currentRoomId}`;
    if (window.QRCode) {
      new QRCode(document.getElementById('qrcodeInternet'), {
        text: roomUrl,
        width: 140,
        height: 140
      });
    }

    startWebRTCListener();
  } catch (err) {
    console.error('Failed to create internet room:', err);
  }
}

// WebRTC Signaling Poll
async function startWebRTCListener() {
  setInterval(async () => {
    if (!currentRoomId) return;
    try {
      const res = await fetch('/api/room/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: currentRoomId, action: 'poll' })
      });
      const data = await res.json();
      if (data.signals && data.signals.length > 0) {
        data.signals.forEach(sig => handleIncomingSignal(JSON.parse(sig)));
      }
    } catch (err) {}
  }, 2000);
}

function handleIncomingSignal(sig) {
  if (sig.type === 'offer') {
    initWebRTCPeer(false);
    peerConnection.setRemoteDescription(new RTCSessionDescription(sig.sdp));
    peerConnection.createAnswer().then(answer => {
      peerConnection.setLocalDescription(answer);
      sendSignal({ type: 'answer', sdp: answer });
    });
  } else if (sig.type === 'candidate' && peerConnection) {
    peerConnection.addIceCandidate(new RTCIceCandidate(sig.candidate));
  }
}

function sendSignal(data) {
  fetch('/api/room/signal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId: currentRoomId, action: 'send', signal: JSON.stringify(data) })
  });
}

function initWebRTCPeer(isInitiator) {
  const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  peerConnection = new RTCPeerConnection(config);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal({ type: 'candidate', candidate: event.candidate });
    }
  };

  if (isInitiator) {
    dataChannel = peerConnection.createDataChannel('fileTransfer');
    setupDataChannel(dataChannel);
    peerConnection.createOffer().then(offer => {
      peerConnection.setLocalDescription(offer);
      sendSignal({ type: 'offer', sdp: offer });
    });
  } else {
    peerConnection.ondatachannel = (event) => {
      dataChannel = event.channel;
      setupDataChannel(dataChannel);
    };
  }
}

function setupDataChannel(channel) {
  channel.onopen = () => {
    document.getElementById('transferStatusBadge').innerText = 'P2P Connected';
    document.getElementById('transferStatusBadge').style.color = '#00e676';
  };
}

function joinRoomByCode() {
  const code = document.getElementById('inputJoinRoom').value.trim().replace('-', '');
  if (code.length === 6) {
    currentRoomId = code;
    initWebRTCPeer(true);
    alert(`Connecting to Room ${code}...`);
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

  // Complete Upload Session
  await fetch('/api/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: sessionId })
  });

  document.getElementById('transferStatusBadge').innerText = 'Completed ✓';
  document.getElementById('statProgress').innerText = '100%';
  document.getElementById('progressBarFill').style.width = '100%';
  setTimeout(() => {
    document.getElementById('transferStatusBadge').innerText = 'Ready';
  }, 3000);
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
