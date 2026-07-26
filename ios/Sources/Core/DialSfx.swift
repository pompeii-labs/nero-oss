import AVFoundation

/// Interface sound for the dial. The app had no sound effects at all before this;
/// `VoiceSession` owns the only other engine and configures the shared audio session,
/// so this deliberately touches neither — it just plays into its own engine and stays
/// out of the way of a live call.
///
/// Tones are synthesized into small PCM buffers and cached, the same design as the
/// web's lib/audio/sfx.ts: a detent tick fires dozens of times per drag, so it has to
/// be a buffer schedule and not a fresh graph each time.
@MainActor
final class DialSfx {
    static let shared = DialSfx()

    /// Eight pitches, one per slot, rising clockwise from twelve o'clock. Major
    /// pentatonic over C5, so sweeping the ring is an arpeggio rather than a buzzer.
    private static let semitones: [Double] = [0, 2, 4, 7, 9, 12, 14, 16]
    private static let root: Double = 523.25 // C5

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
    private var cache: [String: AVAudioPCMBuffer] = [:]
    private var started = false

    /// Mirrors the web's localStorage flag so muting is per-device.
    var enabled: Bool {
        get { UserDefaults.standard.object(forKey: "nero.sfx") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "nero.sfx") }
    }

    private init() {
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        engine.mainMixerNode.outputVolume = 0.5
    }

    private func start() {
        guard !started else { return }
        do {
            try engine.start()
            player.play()
            started = true
        } catch {
            started = false
        }
    }

    private static func hz(_ semitone: Double) -> Double {
        root * pow(2, semitone / 12)
    }

    /// One enveloped partial. Fast attack and an exponential tail reads as a struck
    /// object rather than a beep.
    private func buffer(freq: Double, dur: Double, peak: Double, glideTo: Double? = nil)
        -> AVAudioPCMBuffer? {
        let key = "\(freq)-\(dur)-\(peak)-\(glideTo ?? 0)"
        if let hit = cache[key] { return hit }

        let rate = format.sampleRate
        let frames = AVAudioFrameCount(dur * rate)
        guard frames > 0,
              let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames),
              let data = buf.floatChannelData?[0] else { return nil }
        buf.frameLength = frames

        let attack = 0.006
        var phase = 0.0
        for i in 0..<Int(frames) {
            let t = Double(i) / rate
            // linear attack, exponential decay
            let env: Double = t < attack
                ? (t / attack) * peak
                : peak * pow(0.0001 / peak, (t - attack) / max(dur - attack, 0.0001))
            let f = glideTo.map { freq * pow($0 / freq, t / dur) } ?? freq
            phase += 2 * .pi * f / rate
            data[i] = Float(sin(phase) * env)
        }
        cache[key] = buf
        return buf
    }

    private func play(_ buf: AVAudioPCMBuffer?) {
        guard enabled, let buf else { return }
        start()
        guard started else { return }
        player.scheduleBuffer(buf, at: nil, options: [], completionHandler: nil)
    }

    /// The ring blooming open: a low swell with a fifth and octave over it.
    func open() {
        play(buffer(freq: 174, dur: 0.34, peak: 0.10, glideTo: 349))
        play(buffer(freq: 523, dur: 0.26, peak: 0.045))
        play(buffer(freq: 784, dur: 0.22, peak: 0.03))
    }

    /// Crossing into a wedge. Pitched by slot so the ring is playable. Pairs with the
    /// selection haptic rather than replacing it.
    func tick(_ slot: Int) {
        let f = Self.hz(Self.semitones[slot % Self.semitones.count])
        play(buffer(freq: f, dur: 0.075, peak: 0.055))
        play(buffer(freq: f * 2, dur: 0.045, peak: 0.018))
    }

    /// Committing to a wedge: the slot's note plus a fifth above it.
    func fire(_ slot: Int) {
        let f = Self.hz(Self.semitones[slot % Self.semitones.count])
        play(buffer(freq: f, dur: 0.10, peak: 0.07))
        play(buffer(freq: f * 1.5, dur: 0.20, peak: 0.06))
    }

    /// Dismissed without choosing: the open swell, reversed and quieter.
    func close() {
        play(buffer(freq: 349, dur: 0.20, peak: 0.05, glideTo: 174))
    }

    /// A confirm wedge arming. Deliberately less pleasant than `fire`.
    func arm() {
        play(buffer(freq: 330, dur: 0.09, peak: 0.06))
        play(buffer(freq: 247, dur: 0.12, peak: 0.06))
    }
}
