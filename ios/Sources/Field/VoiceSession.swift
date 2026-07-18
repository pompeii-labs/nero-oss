import Foundation
import AVFoundation

/// A live voice call to Nero over `/v1/voice`: mic -> 48k mono Int16 PCM (binary up),
/// TTS PCM (binary down) -> playback, plus JSON control (turn/transcript/activity).
/// Half-duplex: the mic is gated while Nero speaks. Not @MainActor — the audio tap
/// runs on the audio thread; UI state is published on main.
final class VoiceSession: ObservableObject {
    enum Phase: String { case idle, connecting, listening, thinking, speaking }

    @Published var phase: Phase = .idle
    @Published var transcript = ""
    @Published var activity: String?
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
    private var speaking = false      // half-duplex gate (benign cross-thread read)
    private var running = false

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
        set { $0.phase = .idle; $0.transcript = ""; $0.activity = nil }
    }

    // MARK: audio graph
    private func configureAudio() throws {
        let session = AVAudioSession.sharedInstance()
        // Plain .default mode (no voiceChat/videoChat): voiceChat ignores the speaker
        // override (always earpiece) and videoChat produced silence on-device. We don't
        // need hardware echo cancellation because the mic is gated while Nero speaks
        // (half-duplex). No .defaultToSpeaker so override(.none) gives a real earpiece.
        try session.setCategory(.playAndRecord, mode: .default,
                                options: [.allowBluetooth, .allowBluetoothA2DP])
        try session.setActive(true)
        applyOutput()

        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: playFormat)

        let input = engine.inputNode
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
        guard let converter, !speaking, !muted, let ws else { return }
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
        let data = Data(bytes: ch[0], count: Int(out.frameLength) * 2)
        ws.send(.data(data)) { _ in }
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
            set { $0.phase = Phase(rawValue: state) ?? .listening; if state != "speaking" { $0.activity = nil } }
        case "transcript":
            let text = obj["text"] as? String ?? ""
            set { $0.transcript = text }
        case "activity":
            let a = obj["activity"] as? [String: Any]
            let name = (a?["displayName"] as? String) ?? (a?["tool"] as? String)
            set { $0.activity = name }
        case "error":
            set { $0.errorText = obj["message"] as? String }
        default: break
        }
    }

    private func set(_ mutate: @escaping (VoiceSession) -> Void) {
        DispatchQueue.main.async { mutate(self) }
    }
}
