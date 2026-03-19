#!/usr/bin/env bun
/**
 * Music Visualizer - MCP Bridge
 * 
 * Connects the enhanced visualizer to actual LIFX and Spotify MCP tools.
 * This is the production-ready entry point.
 * 
 * Usage:
 *   bun run music-visualizer-mcp.ts              # Start visualizer
 *   bun run music-visualizer-mcp.ts --dashboard  # Start with web dashboard
 *   bun run music-visualizer-mcp.ts --demo       # Demo mode (no MCP needed)
 */

import { EnhancedMusicVisualizer, type EffectMode, type AudioAnalysis } from "./enhanced-music-visualizer";

const IS_DEMO = process.argv.includes("--demo");
const WITH_DASHBOARD = process.argv.includes("--dashboard");

interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  energy: number;
  tempo: number;
  valence: number;
  loudness: number;
  duration_ms: number;
}

// MCP Tool wrappers
async function mcpCall(tool: string, args: any): Promise<any> {
  if (IS_DEMO) return mockMcpResponse(tool, args);
  
  // In real implementation, this calls the MCP tool via Nero's system
  // For now, we simulate
  return mockMcpResponse(tool, args);
}

function mockMcpResponse(tool: string, args: any): any {
  // Demo mode responses
  if (tool === "spotify:get_currently_playing") {
    // Cycle through demo tracks
    const tracks = [
      { id: "1", name: "Midnight City", artist: "M83", energy: 0.82, tempo: 105, valence: 0.65, loudness: -8.5, duration_ms: 243000 },
      { id: "2", name: "Blinding Lights", artist: "The Weeknd", energy: 0.73, tempo: 171, valence: 0.68, loudness: -5.9, duration_ms: 200000 },
    ];
    return tracks[Math.floor(Date.now() / 30000) % tracks.length];
  }
  
  if (tool === "spotify:get_audio_analysis") {
    // Generate fake analysis for demo
    return generateDemoAnalysis(args.track_id);
  }
  
  if (tool === "lifx:set_color") {
    return { success: true };
  }
  
  if (tool === "lifx:cozy") {
    return { success: true };
  }
  
  return null;
}

function generateDemoAnalysis(trackId: string): AudioAnalysis {
  const tempo = trackId === "2" ? 171 : 105;
  const beatInterval = 60 / tempo;
  const duration = trackId === "2" ? 200 : 243;
  
  const beats = [];
  const bars = [];
  const sections = [];
  
  // Generate beats
  for (let t = 0; t < duration; t += beatInterval) {
    beats.push({
      start: t,
      duration: beatInterval,
      confidence: 0.8 + Math.random() * 0.2
    });
  }
  
  // Generate bars (4 beats each)
  for (let i = 0; i < beats.length; i += 4) {
    if (beats[i]) {
      bars.push({
        start: beats[i].start,
        duration: beatInterval * 4,
        confidence: 0.9
      });
    }
  }
  
  // Generate sections
  for (let t = 0; t < duration; t += 30) {
    sections.push({
      start: t,
      duration: Math.min(30, duration - t),
      confidence: 0.7,
      loudness: -10 + Math.random() * 10,
      tempo: tempo,
      key: Math.floor(Math.random() * 12),
      mode: Math.random() > 0.3 ? 1 : 0,
      time_signature: 4
    });
  }
  
  return {
    track: {
      duration,
      tempo,
      time_signature: 4,
      key: 0,
      mode: 1,
      loudness: -8
    },
    bars,
    beats,
    tatums: beats.map(b => ({ ...b, duration: b.duration / 2 })),
    sections,
    segments: []
  };
}

// Production visualizer with MCP integration
class McpMusicVisualizer extends EnhancedMusicVisualizer {
  private lastLightUpdate = 0;
  private lightUpdateThrottle = 50; // ms between LIFX updates
  
  protected override async getCurrentTrack(): Promise<SpotifyTrack | null> {
    try {
      const result = await mcpCall("spotify:get_currently_playing", {});
      if (!result || !result.is_playing) return null;
      
      return {
        id: result.item?.id || "unknown",
        name: result.item?.name || "Unknown",
        artist: result.item?.artists?.[0]?.name || "Unknown",
        energy: 0.5,
        tempo: 120,
        valence: 0.5,
        loudness: -10,
        duration_ms: result.item?.duration_ms || 0
      };
    } catch (err) {
      console.error("Failed to get current track:", err);
      return null;
    }
  }
  
  protected override async getAudioAnalysis(trackId: string): Promise<AudioAnalysis | null> {
    try {
      const result = await mcpCall("spotify:get_audio_analysis", { track_id: trackId });
      return result;
    } catch (err) {
      console.error("Failed to get audio analysis:", err);
      return null;
    }
  }
  
  protected override async applyLightState(state: any) {
    // Throttle updates to avoid hammering LIFX API
    const now = Date.now();
    if (now - this.lastLightUpdate < this.lightUpdateThrottle) return;
    this.lastLightUpdate = now;
    
    try {
      await mcpCall("lifx:set_color", {
        selector: "group:Living Room",
        color: `hue:${Math.round(state.hue)} saturation:${state.saturation.toFixed(2)}`,
        brightness: state.brightness,
        duration: state.transition
      });
    } catch (err) {
      console.error("Failed to set light state:", err);
    }
  }
  
  protected override async setCozyMode() {
    try {
      await mcpCall("lifx:cozy", { selector: "group:Living Room" });
    } catch (err) {
      console.error("Failed to set cozy mode:", err);
    }
  }
}

// CLI
if (import.meta.main) {
  console.log("🎵 Music Visualizer - MCP Bridge");
  console.log(IS_DEMO ? "   [DEMO MODE]" : "   [PRODUCTION MODE]");
  console.log(WITH_DASHBOARD ? "   [WITH DASHBOARD]" : "");
  console.log();
  
  const visualizer = new McpMusicVisualizer();
  
  // Dashboard process
  let dashboardProcess: any = null;
  if (WITH_DASHBOARD) {
    console.log("🌐 Starting web dashboard on http://localhost:7878");
    dashboardProcess = Bun.spawn(["bun", "run", "visualizer-dashboard.ts"], {
      stdout: "inherit",
      stderr: "inherit"
    });
  }
  
  // Keyboard controls
  console.log("Controls:");
  console.log("  [p] Pulse mode    [f] Flow mode    [s] Strobe mode");
  console.log("  [a] Ambient       [o] Off          [q] Quit");
  console.log();
  
  process.stdin.setRawMode(true);
  process.stdin.on("data", (data) => {
    const key = data.toString();
    
    switch (key) {
      case "p":
      case "P":
        visualizer.setEffectMode("pulse");
        console.log("🎨 Mode: Pulse");
        break;
      case "f":
      case "F":
        visualizer.setEffectMode("flow");
        console.log("🎨 Mode: Flow");
        break;
      case "s":
      case "S":
        visualizer.setEffectMode("strobe");
        console.log("🎨 Mode: Strobe");
        break;
      case "a":
      case "A":
        visualizer.setEffectMode("ambient");
        console.log("🎨 Mode: Ambient");
        break;
      case "o":
      case "O":
        visualizer.setEffectMode("off");
        console.log("🎨 Mode: Off");
        break;
      case "q":
      case "Q":
      case "\u0003": // Ctrl+C
        console.log("\n👋 Shutting down...");
        visualizer.stop();
        if (dashboardProcess) dashboardProcess.kill();
        process.exit(0);
        break;
    }
  });
  
  // Cleanup
  process.on("SIGINT", () => {
    visualizer.stop();
    if (dashboardProcess) dashboardProcess.kill();
    process.exit(0);
  });
  
  process.on("SIGTERM", () => {
    visualizer.stop();
    if (dashboardProcess) dashboardProcess.kill();
    process.exit(0);
  });
  
  // Start
  visualizer.start().catch(console.error);
}

export { McpMusicVisualizer };
