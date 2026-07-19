import Foundation
import AVFoundation

/// A live voice call to Nero over `/v1/voice`: mic -> 48k mono Int16 PCM (binary up),
/// TTS PCM (binary down) -> playback, plus JSON control (turn/transcript/activity).
/// Full-duplex with barge-in: the mic streams even while Nero speaks (hardware AEC keeps
/// his own voice out of it), and talking over him flushes playout + sends `{type:'barge'}`.
/// Not @MainActor — the audio tap runs on the audio thread; UI state is published on main.
final class VoiceSession: ObservableObject {
    enum Phase: String { case idle, connecting, listening, thinking, speaking }

    @Published var phase: Phase = .idle
    @Published var transcript = ""
    @Published var activities: [Activity] = []
    @Published var errorText: String?
    @Published var muted = false
    @Published var output: Output = .speaker
    enum Output { case speaker, receiver }

    private let base: URL
    private var ws: URLSessionWebSocketTask?
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var converter: AVAudioConverter?
    private let sendFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 48000, channels: 1, interleaved: true)!
    private let playFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 48000, channels: 1, interleaved: false)!
    private var speaking = false      // true while Nero's TTS is playing (drives barge VAD)
    private var running = false
    /// Int16 RMS above which mic energy during playout counts as the user barging in.
    /// AEC removes most of Nero's own voice from the mic, so real speech clears this.
    private let bargeThreshold: Double = 2200

    init(base: URL) { self.base = base }

    func start() {
        guard !running else { return }
        running = true
        set { $0.phase = .connecting }
        AVAudioApplication.requestRecordPermission { [weak self] granted in
            guard let self else { return }
            guard granted else {
                self.set { $0.errorText = "Microphone access denied"; $0.phase = .idle }
                self.running = false
                return
            }
            do { try self.configureAudio(); self.connect() }
            catch { self.set { $0.errorText = "\(error)"; $0.phase = .idle }; self.running = false }
        }
    }

    func stop() {
        running = false
        ws?.cancel(with: .goingAway, reason: nil)
        ws = nil
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        set { $0.phase = .idle; $0.transcript = ""; $0.activities = [] }
    }

    // MARK: audio graph
    private func configureAudio() throws {
        let session = AVAudioSession.sharedInstance()
        // Plain .default mode (not .voiceChat, which forces the earpiece and ignores the
        // speaker override). Echo cancellation comes from the engine's voice-processing
        // I/O unit below instead of the session mode, so `overrideOutputAudioPort(.speaker)`
        // keeps working while AEC lets the mic stay open during playout (barge-in).
        try session.setCategory(.playAndRecord, mode: .default,
                                options: [.allowBluetooth, .allowBluetoothA2DP])
        try session.setActive(true)
        applyOutput()

        let input = engine.inputNode
        // Enable AEC/AGC/noise-suppression on the input node (references the engine's
        // output as the echo source) before wiring the graph or reading the input format.
        try? input.setVoiceProcessingEnabled(true)

        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: playFormat)

        let inFormat = input.inputFormat(forBus: 0)
        converter = AVAudioConverter(from: inFormat, to: sendFormat)
        input.installTap(onBus: 0, bufferSize: 4800, format: inFormat) { [weak self] buf, _ in
            self?.handleMic(buf)
        }
        engine.prepare()
        try engine.start()
        player.play()
    }

    func toggleMute() { DispatchQueue.main.async { self.muted.toggle() } }

    /// Toggle built-in speaker vs earpiece. Bluetooth/AirPlay is handled separately by
    /// the system route picker (which overrides this while a headset is connected).
    func toggleOutput() {
        DispatchQueue.main.async {
            self.output = self.output == .speaker ? .receiver : .speaker
            self.applyOutput()
        }
    }
    private func applyOutput() {
        let port: AVAudioSession.PortOverride = output == .speaker ? .speaker : .none
        try? AVAudioSession.sharedInstance().overrideOutputAudioPort(port)
    }

    private func handleMic(_ buffer: AVAudioPCMBuffer) {
        guard let converter, !muted, let ws else { return }
        let ratio = sendFormat.sampleRate / buffer.format.sampleRate
        let cap = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1024
        guard let out = AVAudioPCMBuffer(pcmFormat: sendFormat, frameCapacity: cap) else { return }
        var err: NSError?
        var fed = false
        converter.convert(to: out, error: &err) { _, status in
            if fed { status.pointee = .noDataNow; return nil }
            fed = true
            status.pointee = .haveData
            return buffer
        }
        guard err == nil, out.frameLength > 0, let ch = out.int16ChannelData else { return }
        let n = Int(out.frameLength)
        let data = Data(bytes: ch[0], count: n * 2)
        ws.send(.data(data)) { _ in }
        // Barge-in: if the user's own voice (post-AEC) is loud while Nero is speaking,
        // flush playout locally and tell the server to abort, without a round-trip wait.
        if speaking {
            var sum = 0.0
            for i in 0..<n { let v = Double(ch[0][i]); sum += v * v }
            if (sum / Double(max(1, n))).squareRoot() > bargeThreshold { bargeLocally() }
        }
    }

    private func flushPlayout() {
        player.stop()
        player.play()
    }

    private func bargeLocally() {
        guard speaking else { return }
        speaking = false
        flushPlayout()
        ws?.send(.string("{\"type\":\"barge\"}")) { _ in }
        set { $0.phase = .listening }
    }

    private func playPCM(_ data: Data) {
        let frames = AVAudioFrameCount(data.count / 2)
        guard frames > 0, let buf = AVAudioPCMBuffer(pcmFormat: playFormat, frameCapacity: frames) else { return }
        buf.frameLength = frames
        data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            let src = raw.bindMemory(to: Int16.self)
            let dst = buf.floatChannelData![0]
            for i in 0..<Int(frames) { dst[i] = max(-1, min(1, Float(src[i]) / 32768)) }
        }
        player.scheduleBuffer(buf, completionHandler: nil)
        if !player.isPlaying { player.play() }
    }

    // MARK: socket
    private func connect() {
        var comps = URLComponents(url: base, resolvingAgainstBaseURL: false)
        comps?.scheme = base.scheme == "http" ? "ws" : "wss"
        comps?.path = "/v1/voice"
        guard let url = comps?.url else { return }
        let task = URLSession.shared.webSocketTask(with: url)
        ws = task
        task.resume()
        receive()
    }

    private func receive() {
        ws?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure:
                self.set { $0.phase = .idle }
            case .success(let msg):
                switch msg {
                case .data(let d): self.playPCM(d)
                case .string(let s): self.handleControl(s)
                @unknown default: break
                }
                if self.running { self.receive() }
            }
        }
    }

    private func handleControl(_ s: String) {
        guard let d = s.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let type = obj["type"] as? String else { return }
        switch type {
        case "ready":
            set { $0.phase = .listening }
        case "turn":
            let state = obj["state"] as? String ?? "listening"
            speaking = (state == "speaking")
            set {
                $0.phase = Phase(rawValue: state) ?? .listening
                // A new turn begins at "thinking"; keep tool cards through speaking so the
                // user can see what he did, then clear them when the next turn starts.
                if state == "thinking" { $0.activities = [] }
            }
        case "barge":
            speaking = false
            flushPlayout()
            set { $0.phase = .listening }
        case "transcript":
            let text = obj["text"] as? String ?? ""
            set { $0.transcript = text }
        case "activity":
            guard let a = obj["activity"] as? [String: Any], let id = a["id"] as? String else { break }
            let details = a["details"] as? [String: Any]
            let act = Activity(
                id: id,
                tool: details?["fn_name"] as? String,
                displayName: details?["display_name"] as? String,
                status: a["status"] as? String,
                result: details?["result"] as? String
            )
            set {
                if let i = $0.activities.firstIndex(where: { $0.id == id }) { $0.activities[i] = act }
                else { $0.activities.append(act) }
            }
        case "error":
            set { $0.errorText = obj["message"] as? String }
        default: break
        }
    }

    private func set(_ mutate: @escaping (VoiceSession) -> Void) {
        DispatchQueue.main.async { mutate(self) }
    }
}
