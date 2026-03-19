#!/usr/bin/env bun
/**
 * Enhanced Music-Reactive LIFX Visualizer
 * 
 * Uses Spotify's Audio Analysis API for precise beat/bar detection.
 * Syncs LIFX lights to actual musical structure, not just guesses.
 * 
 * Features:
 * - Beat-precise pulsing (quarter notes)
 * - Bar-level color cycling (measures)
 * - Tatum-level micro-pulses (eighth/sixteenth notes)
 * - Section-based mood shifts (verse/chorus/bridge)
 * - Multiple effect modes: Pulse, Strobe, Flow, Ambient
 */

import { spawn } from "child_process";

// Types from Spotify Audio Analysis API
interface AudioAnalysis {
  track: {
    duration: number;
    tempo: number;
    time_signature: number;
    key: number;
    mode: number;
    loudness: number;
  };
  bars: TimeInterval[];      // Measures
  beats: TimeInterval[];     // Quarter notes
  tatums: TimeInterval[];    // Subdivisions
  sections: Section[];       // Verse, chorus, etc.
  segments: Segment[];       // Timbral changes
}

interface TimeInterval {
  start: number;
  duration: number;
  confidence: number;
}

interface Section extends TimeInterval {
  loudness: number;
  tempo: number;
  key: number;
  mode: number;
  time_signature: number;
}

interface Segment extends TimeInterval {
  loudness_start: number;
  loudness_max: number;
  pitches: number[];    // 12-element chroma vector
  timbre: number[];     // 12-element timbre vector
}

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

interface LightState {
  brightness: number;
  hue: number;
  saturation: number;
  kelvin: number;
  transition: number;
}

type EffectMode = "pulse" | "flow" | "strobe" | "ambient" | "off";

// Color palettes for different moods
const PALETTES = {
  energetic: { hue: 15, saturation: 0.9, kelvin: 3500 },     // Warm red-orange
  intense: { hue: 0, saturation: 1.0, kelvin: 3000 },        // Deep red
  chill: { hue: 45, saturation: 0.5, kelvin: 2700 },         // Warm amber
  moody: { hue: 240, saturation: 0.7, kelvin: 6500 },        // Cool blue-purple
  neutral: { hue: 35, saturation: 0.3, kelvin: 3500 },       // Soft white
  party: { hue: 300, saturation: 1.0, kelvin: 4000 },        // Magenta
};

// Key to color mapping (musical key → hue)
const KEY_COLORS: Record<number, number> = {
  0: 0,    // C → Red
  1: 30,   // C# → Orange-red
  2: 60,   // D → Yellow
  3: 90,   // D# → Yellow-green
  4: 120,  // E → Green
  5: 150,  // F → Cyan-green
  6: 180,  // F# → Cyan
  7: 210,  // G → Blue-cyan
  8: 240,  // G# → Blue
  9: 270,  // A → Purple-blue
  10: 300, // A# → Purple
  11: 330, // B → Magenta-red
};

class BeatSyncEngine {
  private analysis: AudioAnalysis | null = null;
  private trackStartTime: number = 0;
  private currentTrackId: string = "";
  private effectMode: EffectMode = "pulse";
  
  // Effect state
  private lastBeatIndex = -1;
  private lastBarIndex = -1;
  private lastSectionIndex = -1;
  private currentPalette = PALETTES.neutral;
  private baseHue = 35;
  
  setAnalysis(analysis: AudioAnalysis, trackId: string) {
    this.analysis = analysis;
    this.currentTrackId = trackId;
    this.trackStartTime = Date.now();
    this.lastBeatIndex = -1;
    this.lastBarIndex = -1;
    this.lastSectionIndex = -1;
    
    // Set base hue from musical key
    this.baseHue = KEY_COLORS[analysis.track.key] ?? 35;
    
    console.log(`🎵 Analysis loaded: ${analysis.track.tempo.toFixed(1)} BPM, ${analysis.beats.length} beats`);
  }
  
  setEffectMode(mode: EffectMode) {
    this.effectMode = mode;
    console.log(`🎨 Effect mode: ${mode}`);
  }
  
  getCurrentState(): LightState | null {
    if (!this.analysis) return null;
    
    const now = Date.now();
    const trackPosition = (now - this.trackStartTime) / 1000; // seconds
    
    // Find current musical position
    const beatIndex = this.findCurrentIndex(this.analysis.beats, trackPosition);
    const barIndex = this.findCurrentIndex(this.analysis.bars, trackPosition);
    const sectionIndex = this.findCurrentIndex(this.analysis.sections, trackPosition);
    const segmentIndex = this.findCurrentIndex(this.analysis.segments, trackPosition);
    
    // Detect changes
    const newBeat = beatIndex !== this.lastBeatIndex;
    const newBar = barIndex !== this.lastBarIndex;
    const newSection = sectionIndex !== this.lastSectionIndex;
    
    this.lastBeatIndex = beatIndex;
    this.lastBarIndex = barIndex;
    this.lastSectionIndex = sectionIndex;
    
    // Get current segment for timbre
    const segment = segmentIndex >= 0 ? this.analysis.segments[segmentIndex] : null;
    const section = sectionIndex >= 0 ? this.analysis.sections[sectionIndex] : null;
    
    // Calculate lighting based on effect mode
    switch (this.effectMode) {
      case "pulse":
        return this.calculatePulseState(beatIndex, barIndex, trackPosition, section, segment, newBeat);
      case "flow":
        return this.calculateFlowState(trackPosition, section, segment);
      case "strobe":
        return this.calculateStrobeState(beatIndex, trackPosition, newBeat);
      case "ambient":
        return this.calculateAmbientState(section, segment);
      case "off":
        return { brightness: 0.1, hue: 35, saturation: 0, kelvin: 3500, transition: 2.0 };
      default:
        return this.calculatePulseState(beatIndex, barIndex, trackPosition, section, segment, newBeat);
    }
  }
  
  private findCurrentIndex(intervals: TimeInterval[], position: number): number {
    for (let i = 0; i < intervals.length; i++) {
      if (position >= intervals[i].start && position < intervals[i].start + intervals[i].duration) {
        return i;
      }
    }
    return -1;
  }
  
  private calculatePulseState(
    beatIndex: number,
    barIndex: number,
    position: number,
    section: Section | null,
    segment: Segment | null,
    newBeat: boolean
  ): LightState {
    if (!this.analysis) return PALETTES.neutral as LightState;
    
    // Determine palette from section characteristics
    let palette = this.currentPalette;
    if (section) {
      if (section.loudness > -5) palette = PALETTES.energetic;
      else if (section.loudness > -10) palette = PALETTES.chill;
      else palette = PALETTES.moody;
      this.currentPalette = palette;
    }
    
    // Calculate brightness based on beat phase
    const beat = this.analysis.beats[beatIndex];
    if (!beat) return { ...palette, brightness: 0.5, transition: 0.1 } as LightState;
    
    const beatPhase = (position - beat.start) / beat.duration;
    // Sine wave pulse on beat
    const pulseIntensity = Math.sin(beatPhase * Math.PI);
    const baseBrightness = 0.3 + (this.analysis.track.loudness + 60) / 60 * 0.4;
    const brightness = Math.min(1.0, baseBrightness + pulseIntensity * 0.3);
    
    // Bar-level color cycling
    const barHueShift = (barIndex * 30) % 60; // Shift hue every bar
    const hue = (this.baseHue + palette.hue + barHueShift) % 360;
    
    // Segment timbre affects saturation
    let saturation = palette.saturation;
    if (segment) {
      // Higher timbre variance = more saturation
      const timbreVariance = segment.timbre.reduce((a, b) => a + Math.abs(b), 0) / 12;
      saturation = Math.min(1.0, palette.saturation + timbreVariance * 0.2);
    }
    
    return {
      hue,
      saturation,
      brightness,
      kelvin: palette.kelvin,
      transition: 0.05, // Fast transition for beat sync
    };
  }
  
  private calculateFlowState(
    position: number,
    section: Section | null,
    segment: Segment | null
  ): LightState {
    if (!this.analysis) return PALETTES.neutral as LightState;
    
    // Continuous color flow based on track position
    const flowSpeed = this.analysis.track.tempo / 60; // cycles per minute
    const hue = (this.baseHue + position * flowSpeed * 10) % 360;
    
    const baseBrightness = 0.4 + (this.analysis.track.loudness + 60) / 60 * 0.3;
    
    return {
      hue,
      saturation: 0.7,
      brightness: baseBrightness,
      kelvin: 4000,
      transition: 0.5,
    };
  }
  
  private calculateStrobeState(
    beatIndex: number,
    position: number,
    newBeat: boolean
  ): LightState {
    if (!this.analysis || !newBeat) return null as unknown as LightState; // No update between beats
    
    // Only flash on strong beats (every 2 beats = half notes)
    const isStrongBeat = beatIndex % 2 === 0;
    
    return {
      hue: isStrongBeat ? 0 : 60, // Red on strong, yellow on weak
      saturation: 1.0,
      brightness: isStrongBeat ? 1.0 : 0.3,
      kelvin: 3500,
      transition: 0.01, // Instant
    };
  }
  
  private calculateAmbientState(
    section: Section | null,
    segment: Segment | null
  ): LightState {
    if (!this.analysis) return PALETTES.neutral as LightState;
    
    // Slow, subtle changes based on section
    let palette = PALETTES.neutral;
    if (section) {
      if (section.tempo > 120) palette = PALETTES.energetic;
      else if (section.mode === 0) palette = PALETTES.moody; // Minor key
      else palette = PALETTES.chill;
    }
    
    const brightness = 0.2 + (this.analysis.track.loudness + 60) / 60 * 0.3;
    
    return {
      hue: (this.baseHue + palette.hue) % 360,
      saturation: palette.saturation * 0.6, // Muted
      brightness,
      kelvin: palette.kelvin,
      transition: 3.0, // Very slow transitions
    };
  }
  
  reset() {
    this.analysis = null;
    this.currentTrackId = "";
    this.lastBeatIndex = -1;
    this.lastBarIndex = -1;
    this.lastSectionIndex = -1;
  }
}

class EnhancedMusicVisualizer {
  private beatEngine = new BeatSyncEngine();
  private isRunning = false;
  private updateInterval: Timer | null = null;
  private currentTrack: SpotifyTrack | null = null;
  private lastTrackId = "";
  
  // Config
  private config = {
    pollIntervalMs: 5000,
    updateIntervalMs: 50, // 20fps for smooth effects
    lifxSelector: "group:Living Room",
    defaultMode: "pulse" as EffectMode,
  };
  
  async start() {
    console.log("🎵 Enhanced Music Visualizer starting...");
    console.log("   Using Spotify Audio Analysis API for beat-precise sync");
    console.log(`   Update rate: ${1000/this.config.updateIntervalMs}fps`);
    
    this.isRunning = true;
    
    // Initial cozy state
    await this.setCozyMode();
    
    // Start main loops
    this.startPlaybackMonitor();
    this.startEffectLoop();
  }
  
  stop() {
    this.isRunning = false;
    if (this.updateInterval) clearInterval(this.updateInterval);
    console.log("\n👋 Stopping visualizer...");
  }
  
  setEffectMode(mode: EffectMode) {
    this.beatEngine.setEffectMode(mode);
  }
  
  private startPlaybackMonitor() {
    // Check for track changes every 5 seconds
    const monitor = async () => {
      if (!this.isRunning) return;
      
      try {
        const track = await this.getCurrentTrack();
        
        if (!track) {
          if (this.currentTrack) {
            console.log("⏸️  Music paused");
            this.beatEngine.reset();
            this.currentTrack = null;
            await this.setCozyMode();
          }
        } else if (track.id !== this.lastTrackId) {
          // New track detected
          console.log(`\n🎶 Now playing: ${track.name} by ${track.artist}`);
          this.currentTrack = track;
          this.lastTrackId = track.id;
          
          // Fetch audio analysis
          const analysis = await this.getAudioAnalysis(track.id);
          if (analysis) {
            this.beatEngine.setAnalysis(analysis, track.id);
            this.beatEngine.setEffectMode(this.config.defaultMode);
            console.log(`   ✓ Audio analysis loaded: ${analysis.beats.length} beats`);
          }
        }
      } catch (err) {
        console.error("Monitor error:", err);
      }
      
      if (this.isRunning) {
        setTimeout(monitor, this.config.pollIntervalMs);
      }
    };
    
    monitor();
  }
  
  private startEffectLoop() {
    // Run effects at 20fps
    this.updateInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      const state = this.beatEngine.getCurrentState();
      if (state) {
        await this.applyLightState(state);
      }
    }, this.config.updateIntervalMs);
  }
  
  private async getCurrentTrack(): Promise<SpotifyTrack | null> {
    // Would call: spotify:get_currently_playing MCP tool
    // Returns null if nothing playing
    return null;
  }
  
  private async getAudioAnalysis(trackId: string): Promise<AudioAnalysis | null> {
    // Would call Spotify API: GET /v1/audio-analysis/{trackId}
    // Requires additional scope: user-read-playback-state
    return null;
  }
  
  private async applyLightState(state: LightState) {
    // Would call: lifx:set_color MCP tool
    console.log(`💡 H:${state.hue.toFixed(0)}° S:${(state.saturation*100).toFixed(0)}% B:${(state.brightness*100).toFixed(0)}% T:${state.transition}s`);
  }
  
  private async setCozyMode() {
    console.log("   🕯️  Cozy ambient mode");
    // Would call lifx:cozy
  }
}

// CLI
if (import.meta.main) {
  const visualizer = new EnhancedMusicVisualizer();
  
  // Handle mode switching via stdin
  process.stdin.on("data", (data) => {
    const cmd = data.toString().trim();
    switch (cmd) {
      case "pulse":
      case "flow":
      case "strobe":
      case "ambient":
      case "off":
        visualizer.setEffectMode(cmd as EffectMode);
        break;
      case "help":
        console.log("Commands: pulse, flow, strobe, ambient, off");
        break;
    }
  });
  
  process.on("SIGINT", () => {
    visualizer.stop();
    process.exit(0);
  });
  
  process.on("SIGTERM", () => {
    visualizer.stop();
    process.exit(0);
  });
  
  visualizer.start().catch(console.error);
}

export { EnhancedMusicVisualizer, BeatSyncEngine, type EffectMode, type AudioAnalysis };
