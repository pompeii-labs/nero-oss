#!/usr/bin/env bun
/**
 * Green Room Visualizer Bridge
 * 
 * Makes LIFX lights react to currently playing music via Spotify.
 * Connects Matty's music world to his smart home obsession.
 * 
 * Run on the Pi 5 for always-on ambient lighting control.
 */

import { spawn } from "child_process";

interface SpotifyTrack {
  name: string;
  artist: string;
  energy: number;      // 0.0 - 1.0
  tempo: number;       // BPM
  valence: number;     // 0.0 (sad) - 1.0 (happy)
  loudness: number;    // dB
}

interface LightState {
  brightness: number;
  hue: number;         // 0-360
  saturation: number;  // 0-1
  kelvin: number;      // 2500-9000
}

// Color palettes mapped to audio features
const PALETTES = {
  // High energy + high valence = warm, bright, energetic
  energetic: { hue: 30, saturation: 0.8, kelvin: 4000 },
  // High energy + low valence = intense, red, dramatic
  intense: { hue: 0, saturation: 1.0, kelvin: 3000 },
  // Low energy + high valence = soft, warm, cozy
  chill: { hue: 45, saturation: 0.4, kelvin: 2700 },
  // Low energy + low valence = cool, blue, moody
  moody: { hue: 220, saturation: 0.6, kelvin: 6500 },
  // Neutral fallback
  neutral: { hue: 35, saturation: 0.2, kelvin: 3500 }
};

class MusicReactiveLighting {
  private currentTrack: SpotifyTrack | null = null;
  private isRunning = false;
  private checkInterval: number = 5000; // 5 seconds
  private lastTrackId: string = "";
  private beatPhase: number = 0;

  async start() {
    console.log("🎵 Green Room Visualizer Bridge starting...");
    console.log("   Polling Spotify every 5s, adjusting LIFX lights");
    
    this.isRunning = true;
    
    // Initial setup - dim lights to prep
    await this.setCozyMode();
    
    while (this.isRunning) {
      try {
        await this.checkAndUpdate();
      } catch (err) {
        console.error("Error in update loop:", err);
      }
      await this.sleep(this.checkInterval);
    }
  }

  stop() {
    this.isRunning = false;
    console.log("\n👋 Stopping visualizer...");
  }

  private async checkAndUpdate() {
    // Get current playback via MCP spotify tool
    const track = await this.getCurrentTrack();
    
    if (!track) {
      // No music playing - return to cozy neutral
      if (this.currentTrack) {
        console.log("⏸️  Music paused - returning to ambient");
        await this.setCozyMode();
        this.currentTrack = null;
      }
      return;
    }

    // New track detected
    const trackId = `${track.name}-${track.artist}`;
    if (trackId !== this.lastTrackId) {
      console.log(`\n🎶 Now playing: ${track.name} by ${track.artist}`);
      console.log(`   Energy: ${(track.energy * 100).toFixed(0)}% | Tempo: ${track.tempo.toFixed(0)} BPM | Valence: ${(track.valence * 100).toFixed(0)}%`);
      this.lastTrackId = trackId;
    }

    this.currentTrack = track;
    
    // Calculate lighting based on audio features
    const state = this.calculateLightState(track);
    await this.applyLightState(state);
  }

  private async getCurrentTrack(): Promise<SpotifyTrack | null> {
    // This would call the spotify:get_currently_playing MCP tool
    // For now, simulating with a shell call to a helper script
    try {
      // In real implementation, this queries Spotify API
      // Return null if nothing playing
      return null; // Placeholder - real implementation would fetch
    } catch {
      return null;
    }
  }

  private calculateLightState(track: SpotifyTrack): LightState {
    // Determine palette based on energy + valence
    let palette = PALETTES.neutral;
    
    if (track.energy > 0.6 && track.valence > 0.5) {
      palette = PALETTES.energetic;
    } else if (track.energy > 0.6 && track.valence <= 0.5) {
      palette = PALETTES.intense;
    } else if (track.energy <= 0.6 && track.valence > 0.5) {
      palette = PALETTES.chill;
    } else if (track.energy <= 0.6 && track.valence <= 0.5) {
      palette = PALETTES.moody;
    }

    // Brightness based on energy and loudness
    // Higher energy = brighter, but clamp between 0.2 and 1.0
    const baseBrightness = 0.2 + (track.energy * 0.6);
    const loudnessFactor = Math.min(1, Math.max(0, (track.loudness + 60) / 60));
    const brightness = Math.min(1.0, baseBrightness + (loudnessFactor * 0.2));

    // Subtle hue shift based on tempo (faster = warmer)
    const tempoFactor = Math.min(1, Math.max(0, (track.tempo - 60) / 120));
    const hueShift = tempoFactor * 30; // Max 30 degree shift
    const hue = (palette.hue + hueShift) % 360;

    return {
      brightness,
      hue,
      saturation: palette.saturation,
      kelvin: palette.kelvin
    };
  }

  private async applyLightState(state: LightState) {
    // This would call lifx:set_color MCP tool
    // For now, log what we would do
    console.log(`   💡 Lights → H:${state.hue.toFixed(0)}° S:${(state.saturation * 100).toFixed(0)}% B:${(state.brightness * 100).toFixed(0)}%`);
    
    // Real implementation:
    // await mcpCall("lifx:set_color", {
    //   selector: "group:Living Room",
    //   color: `hue:${state.hue} saturation:${state.saturation}`,
    //   brightness: state.brightness,
    //   duration: 2.0 // Smooth transition
    // });
  }

  private async setCozyMode() {
    console.log("   🕯️  Setting cozy ambient mode");
    // await mcpCall("lifx:cozy", { selector: "group:Living Room" });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Beat detection for pulsing effects
class BeatDetector {
  private lastBeatTime: number = 0;
  private tempo: number = 120;
  
  onAudioFrame(energy: number, tempo: number) {
    this.tempo = tempo;
    const beatInterval = 60000 / tempo;
    const now = Date.now();
    
    // Simple beat detection based on energy spikes
    if (energy > 0.7 && now - this.lastBeatTime > beatInterval * 0.8) {
      this.lastBeatTime = now;
      return true; // Beat detected
    }
    return false;
  }
  
  getBeatPhase(): number {
    const beatInterval = 60000 / this.tempo;
    const elapsed = Date.now() - this.lastBeatTime;
    return (elapsed % beatInterval) / beatInterval;
  }
}

// CLI
if (import.meta.main) {
  const visualizer = new MusicReactiveLighting();
  
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

export { MusicReactiveLighting, BeatDetector };
