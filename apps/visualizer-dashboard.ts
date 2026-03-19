#!/usr/bin/env bun
/**
 * Music Visualizer Web Dashboard
 * 
 * Real-time control interface for the enhanced music visualizer.
 * Shows beat positions, audio analysis data, and effect controls.
 * 
 * Serves on port 7878 (next to Lux at 8787)
 */

import { serve } from "bun";

const HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>🎵 Music Visualizer Control</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 800px; margin: 0 auto; }
    h1 {
      font-size: 1.8rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(90deg, #ff6b6b, #feca57);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle { color: #8892b0; margin-bottom: 2rem; }
    
    .card {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .card h2 {
      font-size: 1rem;
      color: #64ffda;
      margin-bottom: 15px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    /* Now Playing */
    .track-info {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    .track-art {
      width: 80px;
      height: 80px;
      background: linear-gradient(45deg, #667eea, #764ba2);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
    }
    .track-details h3 { font-size: 1.3rem; margin-bottom: 5px; }
    .track-details p { color: #8892b0; }
    .audio-features {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-top: 15px;
    }
    .feature {
      background: rgba(255,255,255,0.05);
      padding: 10px;
      border-radius: 6px;
      text-align: center;
    }
    .feature-label { font-size: 0.7rem; color: #8892b0; text-transform: uppercase; }
    .feature-value { font-size: 1.1rem; font-weight: bold; color: #64ffda; }
    
    /* Beat Visualizer */
    .beat-grid {
      display: grid;
      grid-template-columns: repeat(16, 1fr);
      gap: 4px;
      margin: 15px 0;
    }
    .beat {
      aspect-ratio: 1;
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
      transition: all 0.1s ease;
    }
    .beat.active {
      background: #ff6b6b;
      box-shadow: 0 0 10px #ff6b6b;
      transform: scale(1.2);
    }
    .beat.bar-start { border-left: 2px solid #64ffda; }
    .beat.played { background: rgba(100,255,218,0.3); }
    
    /* Effect Modes */
    .modes {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
    }
    .mode-btn {
      padding: 15px 10px;
      border: 2px solid rgba(255,255,255,0.2);
      background: transparent;
      color: #fff;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 0.9rem;
    }
    .mode-btn:hover {
      border-color: #64ffda;
      background: rgba(100,255,218,0.1);
    }
    .mode-btn.active {
      border-color: #64ffda;
      background: #64ffda;
      color: #1a1a2e;
    }
    .mode-btn .icon { font-size: 1.5rem; display: block; margin-bottom: 5px; }
    
    /* Timeline */
    .timeline {
      height: 60px;
      background: rgba(0,0,0,0.3);
      border-radius: 6px;
      position: relative;
      overflow: hidden;
      margin-top: 15px;
    }
    .timeline-bar {
      position: absolute;
      height: 100%;
      background: rgba(255,107,107,0.3);
      border-left: 2px solid #ff6b6b;
    }
    .timeline-beat {
      position: absolute;
      width: 4px;
      height: 40%;
      background: #64ffda;
      top: 30%;
      border-radius: 2px;
    }
    .timeline-playhead {
      position: absolute;
      width: 2px;
      height: 100%;
      background: #fff;
      left: 0%;
      transition: left 0.05s linear;
    }
    
    /* Stats */
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
    }
    .stat {
      background: rgba(255,255,255,0.03);
      padding: 15px;
      border-radius: 8px;
    }
    .stat-value {
      font-size: 1.8rem;
      font-weight: bold;
      color: #ff6b6b;
    }
    .stat-label {
      font-size: 0.8rem;
      color: #8892b0;
      margin-top: 5px;
    }
    
    /* Status indicator */
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: rgba(100,255,218,0.1);
      border-radius: 20px;
      font-size: 0.85rem;
      margin-bottom: 20px;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      background: #64ffda;
      border-radius: 50%;
      animation: pulse 1s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.2); }
    }
    
    /* Responsive */
    @media (max-width: 600px) {
      .audio-features { grid-template-columns: repeat(2, 1fr); }
      .modes { grid-template-columns: repeat(3, 1fr); }
      .beat-grid { grid-template-columns: repeat(8, 1fr); }
      .stats { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="status">
      <span class="status-dot"></span>
      <span>Visualizer Active • Connected to LIFX</span>
    </div>
    
    <h1>🎵 Music Visualizer</h1>
    <p class="subtitle">Beat-precise lighting synced to your Spotify playback</p>
    
    <!-- Now Playing -->
    <div class="card">
      <h2>Now Playing</h2>
      <div class="track-info">
        <div class="track-art" id="track-art">🎧</div>
        <div class="track-details">
          <h3 id="track-name">Waiting for Spotify...</h3>
          <p id="track-artist">Play music to begin visualization</p>
        </div>
      </div>
      <div class="audio-features" id="features">
        <div class="feature">
          <div class="feature-label">Energy</div>
          <div class="feature-value" id="energy">--</div>
        </div>
        <div class="feature">
          <div class="feature-label">Tempo</div>
          <div class="feature-value" id="tempo">--</div>
        </div>
        <div class="feature">
          <div class="feature-label">Valence</div>
          <div class="feature-value" id="valence">--</div>
        </div>
        <div class="feature">
          <div class="feature-label">Key</div>
          <div class="feature-value" id="key">--</div>
        </div>
      </div>
    </div>
    
    <!-- Effect Modes -->
    <div class="card">
      <h2>Effect Mode</h2>
      <div class="modes">
        <button class="mode-btn active" data-mode="pulse">
          <span class="icon">💓</span>
          Pulse
        </button>
        <button class="mode-btn" data-mode="flow">
          <span class="icon">🌊</span>
          Flow
        </button>
        <button class="mode-btn" data-mode="strobe">
          <span class="icon">⚡</span>
          Strobe
        </button>
        <button class="mode-btn" data-mode="ambient">
          <span class="icon">🌙</span>
          Ambient
        </button>
        <button class="mode-btn" data-mode="off">
          <span class="icon">⭕</span>
          Off
        </button>
      </div>
    </div>
    
    <!-- Beat Visualizer -->
    <div class="card">
      <h2>Beat Grid</h2>
      <p style="color: #8892b0; font-size: 0.85rem; margin-bottom: 10px;">
        Real-time beat positions • <span style="color: #ff6b6b;">Red</span> = current beat • 
        <span style="color: #64ffda;">Green</span> = bar start
      </p>
      <div class="beat-grid" id="beat-grid"></div>
      <div class="timeline">
        <div class="timeline-playhead" id="playhead"></div>
      </div>
    </div>
    
    <!-- Stats -->
    <div class="card">
      <h2>Analysis Stats</h2>
      <div class="stats">
        <div class="stat">
          <div class="stat-value" id="beat-count">--</div>
          <div class="stat-label">Total Beats</div>
        </div>
        <div class="stat">
          <div class="stat-value" id="section-count">--</div>
          <div class="stat-label">Sections</div>
        </div>
        <div class="stat">
          <div class="stat-value" id="sync-status">--</div>
          <div class="stat-label">Sync Accuracy</div>
        </div>
      </div>
    </div>
    
    <!-- Light Status -->
    <div class="card">
      <h2>Light Status</h2>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
        <div class="feature">
          <div class="feature-label">Brightness</div>
          <div class="feature-value" id="light-brightness">--</div>
        </div>
        <div class="feature">
          <div class="feature-label">Hue</div>
          <div class="feature-value" id="light-hue">--</div>
        </div>
        <div class="feature">
          <div class="feature-label">Saturation</div>
          <div class="feature-value" id="light-sat">--</div>
        </div>
        <div class="feature">
          <div class="feature-label">Kelvin</div>
          <div class="feature-value" id="light-kelvin">--</div>
        </div>
      </div>
      <div id="light-preview" style="
        margin-top: 15px;
        height: 40px;
        border-radius: 8px;
        background: #333;
        transition: all 0.1s;
      "></div>
    </div>
  </div>

  <script>
    // Generate beat grid
    const grid = document.getElementById('beat-grid');
    for (let i = 0; i < 32; i++) {
      const beat = document.createElement('div');
      beat.className = 'beat' + (i % 4 === 0 ? ' bar-start' : '');
      beat.id = 'beat-' + i;
      grid.appendChild(beat);
    }
    
    // Mode switching
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        fetch('/api/mode/' + btn.dataset.mode, { method: 'POST' });
      });
    });
    
    // SSE for real-time updates
    const evtSource = new EventSource('/api/stream');
    
    evtSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      updateUI(data);
    };
    
    function updateUI(data) {
      // Track info
      if (data.track) {
        document.getElementById('track-name').textContent = data.track.name;
        document.getElementById('track-artist').textContent = data.track.artist;
        document.getElementById('energy').textContent = Math.round(data.track.energy * 100) + '%';
        document.getElementById('tempo').textContent = Math.round(data.track.tempo) + ' BPM';
        document.getElementById('valence').textContent = Math.round(data.track.valence * 100) + '%';
        
        const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const modes = ['min', 'maj'];
        document.getElementById('key').textContent = 
          keys[data.track.key || 0] + ' ' + (modes[data.track.mode] || '');
      }
      
      // Beat grid
      if (data.currentBeat !== undefined) {
        document.querySelectorAll('.beat').forEach((b, i) => {
          b.classList.remove('active', 'played');
          if (i < data.currentBeat) b.classList.add('played');
          if (i === data.currentBeat % 32) b.classList.add('active');
        });
      }
      
      // Playhead
      if (data.progress !== undefined) {
        document.getElementById('playhead').style.left = (data.progress * 100) + '%';
      }
      
      // Stats
      if (data.analysis) {
        document.getElementById('beat-count').textContent = data.analysis.beatCount || '--';
        document.getElementById('section-count').textContent = data.analysis.sectionCount || '--';
      }
      
      // Light status
      if (data.lights) {
        document.getElementById('light-brightness').textContent = 
          Math.round(data.lights.brightness * 100) + '%';
        document.getElementById('light-hue').textContent = Math.round(data.lights.hue) + '°';
        document.getElementById('light-sat').textContent = 
          Math.round(data.lights.saturation * 100) + '%';
        document.getElementByById('light-kelvin').textContent = data.lights.kelvin + 'K';
        
        // Color preview
        const hsl = 'hsl(' + data.lights.hue + ', ' + 
                    (data.lights.saturation * 100) + '%, ' + 
                    (data.lights.brightness * 50 + 25) + '%)';
        document.getElementById('light-preview').style.background = hsl;
        document.getElementById('light-preview').style.boxShadow = 
          '0 0 20px ' + hsl;
      }
    }
  </script>
</body>
</html>`;

// Simple state
let currentState = {
  track: null as any,
  mode: "pulse",
  currentBeat: 0,
  progress: 0,
  lights: { brightness: 0.5, hue: 35, saturation: 0.3, kelvin: 3500 },
  analysis: { beatCount: 0, sectionCount: 0 }
};

// SSE clients
const clients = new Set<any>();

function broadcast(data: any) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(client => {
    try { client.write(msg); } catch { clients.delete(client); }
  });
}

// Mock simulation for demo
function startSimulation() {
  let beat = 0;
  setInterval(() => {
    beat++;
    currentState.currentBeat = beat;
    currentState.progress = (beat % 128) / 128;
    
    // Simulate light changes
    const phase = (beat % 4) / 4;
    currentState.lights.brightness = 0.4 + Math.sin(phase * Math.PI) * 0.4;
    currentState.lights.hue = (35 + beat * 5) % 360;
    
    broadcast({
      currentBeat: beat,
      progress: currentState.progress,
      lights: currentState.lights
    });
  }, 500); // Simulate 120 BPM
}

serve({
  port: 7878,
  async fetch(req) {
    const url = new URL(req.url);
    
    // Main UI
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(HTML, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    // SSE stream
    if (url.pathname === '/api/stream') {
      const stream = new ReadableStream({
        start(controller) {
          const writer = {
            write: (data: string) => {
              controller.enqueue(new TextEncoder().encode(data));
            }
          };
          clients.add(writer);
          
          // Send initial state
          writer.write(`data: ${JSON.stringify(currentState)}\n\n`);
        },
        cancel() {
          clients.delete(this);
        }
      });
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    }
    
    // Mode switching
    if (url.pathname.startsWith('/api/mode/') && req.method === 'POST') {
      const mode = url.pathname.split('/').pop();
      currentState.mode = mode || 'pulse';
      console.log(`🎨 Mode switched to: ${currentState.mode}`);
      broadcast({ mode: currentState.mode });
      return new Response('OK');
    }
    
    // Status API
    if (url.pathname === '/api/status') {
      return Response.json(currentState);
    }
    
    return new Response('Not Found', { status: 404 });
  }
});

console.log('🎵 Music Visualizer Dashboard running on http://localhost:7878');
console.log('   SSE stream: /api/stream');
console.log('   Status: /api/status');

// Start demo simulation
startSimulation();
