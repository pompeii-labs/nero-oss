#!/usr/bin/env bun
/**
 * Music Reactive Lights - Demo Mode
 * 
 * Simulates the visualizer with sample tracks.
 * Run this to see how different songs would affect your lights.
 */

import { MusicReactiveLighting, type SpotifyTrack } from "./music-reactive-lights";

// Sample tracks that demonstrate different moods
const DEMO_TRACKS: SpotifyTrack[] = [
  {
    name: "Midnight City",
    artist: "M83",
    energy: 0.82,
    tempo: 105,
    valence: 0.65,
    loudness: -8.5
  },
  {
    name: "Bohemian Rhapsody",
    artist: "Queen",
    energy: 0.41,
    tempo: 72,
    valence: 0.22,
    loudness: -9.8
  },
  {
    name: "Can't Stop",
    artist: "Red Hot Chili Peppers",
    energy: 0.91,
    tempo: 92,
    valence: 0.78,
    loudness: -5.2
  },
  {
    name: "Weightless",
    artist: "Marconi Union",
    energy: 0.12,
    tempo: 65,
    valence: 0.15,
    loudness: -18.5
  },
  {
    name: "Blinding Lights",
    artist: "The Weeknd",
    energy: 0.73,
    tempo: 171,
    valence: 0.68,
    loudness: -5.9
  }
];

console.log("🎵 Green Room Visualizer - Demo Mode\n");
console.log("This shows how different songs would affect your LIFX lights.\n");

for (let i = 0; i < DEMO_TRACKS.length; i++) {
  const track = DEMO_TRACKS[i];
  
  console.log(`\n${"=".repeat(50)}`);
  console.log(`🎶 Track ${i + 1}/${DEMO_TRACKS.length}`);
  console.log(`   "${track.name}" by ${track.artist}`);
  console.log(`   Energy: ${(track.energy * 100).toFixed(0)}% | Tempo: ${track.tempo} BPM | Valence: ${(track.valence * 100).toFixed(0)}%`);
  
  // Calculate what the lighting would be
  let mood = "Neutral";
  let colorDesc = "Soft white";
  
  if (track.energy > 0.6 && track.valence > 0.5) {
    mood = "Energetic & Happy";
    colorDesc = "Bright orange-red, warm and alive";
  } else if (track.energy > 0.6 && track.valence <= 0.5) {
    mood = "Intense & Dramatic";
    colorDesc = "Deep crimson, high contrast";
  } else if (track.energy <= 0.6 && track.valence > 0.5) {
    mood = "Chill & Positive";
    colorDesc = "Warm amber, soft glow";
  } else if (track.energy <= 0.6 && track.valence <= 0.5) {
    mood = "Moody & Atmospheric";
    colorDesc = "Cool blue-purple, dimmed";
  }
  
  const brightness = 0.2 + (track.energy * 0.6);
  
  console.log(`   Mood: ${mood}`);
  console.log(`   Lighting: ${colorDesc}`);
  console.log(`   Brightness: ${(brightness * 100).toFixed(0)}%`);
  
  // Visual bar
  const barLength = 30;
  const filled = Math.floor(track.energy * barLength);
  const bar = "█".repeat(filled) + "░".repeat(barLength - filled);
  console.log(`   Energy [${bar}]`);
  
  // Wait before next track
  if (i < DEMO_TRACKS.length - 1) {
    console.log("\n⏭️  Next track in 3 seconds...");
    await new Promise(r => setTimeout(r, 3000));
  }
}

console.log(`\n${"=".repeat(50)}`);
console.log("\n✨ Demo complete!");
console.log("\nTo run the actual visualizer:");
console.log("  1. Set up Spotify API credentials");
console.log("  2. Run: bun run music-reactive-lights.ts");
console.log("  3. Play music and watch your lights respond!");
console.log("\n🎧 Ready to make your living room a visualizer?");
