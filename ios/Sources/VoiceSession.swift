import Foundation
import AVFoundation

/// Native voice session over `/v1/voice`:
///   mic (AVAudioEngine tap) -> 48kHz mono Int16 PCM -> binary WS frames
///   binary WS frames (48kHz mono Int16 TTS) -> AVAudioEngine player node
///   text WS frames (JSON) -> turn state / transcript / activity / error
/// Half-duplex: the mic tap is muted while Nero is speaking.
final class VoiceSession: NSObject, ObservableObject {
    enum State: String {
        case idle, connecting, thinking, listening, speaking
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var transcript: String = ""
    @Published private(set) var isActive = false
    @Published private(set) var errorMessage: String?

    private let baseURL: URL
    private var task: URLSessionWebSocketTask?
    private var urlSession: URLSession?

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var converter: AVAudioConverter?
    private var micMuted = false

    private let targetFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16, sampleRate: 48_000, channels: 1, interleaved: true)!
    private let playFormat = AVAudioFormat(
        commonFormat: .pcmFormatFloat32, sampleRate: 48_000, channels: 1, interleaved: false)!

    init(baseURL: URL) {
        self.baseURL = baseURL
        super.init()
    }

    // MARK: - Public control

    func toggle() {
        if isActive { stop() } else { start() }
    }

    func start() {
        guard !isActive else { return }
        setState(.connecting)
        isActive = true
        errorMessage = nil
        AVAudioApplication.requestRecordPermission { [weak self] granted in
            guard let self else { return }
            guard granted else {
                self.fail("Microphone permission denied")
                return
            }
            DispatchQueue.main.async { self.beginSession() }
        }
    }

    func stop() {
        isActive = false
        micMuted = false
        engine.inputNode.removeTap(onBus: 0)
        player.stop()
        engine.stop()
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        setState(.idle)
        setTranscript("")
    }

    // MARK: - Session setup

    private func beginSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat,
                                    options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)
        } catch {
            fail("Audio session error: \(error.localizedDescription)")
            return
        }

        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 3600
        let urlSession = URLSession(configuration: cfg)
        self.urlSession = urlSession
        guard let wsURL = voiceURL() else { fail("Bad server URL"); return }
        let task = urlSession.webSocketTask(with: wsURL)
        self.task = task
        task.resume()
        receive()

        do {
            try startAudio()
        } catch {
            fail("Audio engine error: \(error.localizedDescription)")
            return
        }
        setState(.listening)
    }

    private func startAudio() throws {
        let input = engine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        converter = AVAudioConverter(from: inputFormat, to: targetFormat)

        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: playFormat)

        input.installTap(onBus: 0, bufferSize: 2048, format: inputFormat) { [weak self] buffer, _ in
            self?.handleMic(buffer, inputFormat: inputFormat)
        }

        engine.prepare()
        try engine.start()
        player.play()
    }

    // MARK: - Mic capture -> WS

    private func handleMic(_ buffer: AVAudioPCMBuffer, inputFormat: AVAudioFormat) {
        if micMuted { return }
        guard let converter else { return }

        let ratio = targetFormat.sampleRate / inputFormat.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1024
        guard let out = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: capacity) else { return }

        var fed = false
        var err: NSError?
        let status = converter.convert(to: out, error: &err) { _, inStatus in
            if fed {
                inStatus.pointee = .noDataNow
                return nil
            }
            fed = true
            inStatus.pointee = .haveData
            return buffer
        }
        guard status != .error, out.frameLength > 0, let ch = out.int16ChannelData else { return }
        let data = Data(bytes: ch[0], count: Int(out.frameLength) * 2)
        task?.send(.data(data)) { _ in }
    }

    // MARK: - WS receive

    private func receive() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let message):
                switch message {
                case .data(let d): self.playPCM(d)
                case .string(let s): self.handleText(s)
                @unknown default: break
                }
                self.receive()
            case .failure:
                if self.isActive { self.fail("Connection lost") }
            }
        }
    }

    private func handleText(_ string: String) {
        guard let data = string.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = obj["type"] as? String else { return }
        switch type {
        case "turn":
            if let s = obj["state"] as? String {
                switch s {
                case "thinking": setState(.thinking)
                case "speaking": micMuted = true; setState(.speaking)
                case "listening": micMuted = false; setState(.listening)
                default: break
                }
            }
        case "transcript":
            if let text = obj["text"] as? String { setTranscript(text) }
        case "error":
            let msg = (obj["message"] as? String) ?? "Voice error"
            fail(msg)
        default:
            break
        }
    }

    // MARK: - Playback

    private func playPCM(_ data: Data) {
        let frames = data.count / 2
        guard frames > 0,
              let buf = AVAudioPCMBuffer(pcmFormat: playFormat, frameCapacity: AVAudioFrameCount(frames)),
              let out = buf.floatChannelData else { return }
        buf.frameLength = AVAudioFrameCount(frames)
        data.withUnsafeBytes { raw in
            let src = raw.bindMemory(to: Int16.self)
            let dst = out[0]
            for i in 0..<frames {
                dst[i] = Float(Int16(littleEndian: src[i])) / 32768.0
            }
        }
        if !engine.isRunning { return }
        player.scheduleBuffer(buf, completionHandler: nil)
        if !player.isPlaying { player.play() }
    }

    // MARK: - Helpers

    private func voiceURL() -> URL? {
        guard var comps = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else { return nil }
        comps.scheme = (comps.scheme == "https") ? "wss" : "ws"
        var path = comps.path
        while path.hasSuffix("/") { path.removeLast() }
        comps.path = path + "/v1/voice"
        return comps.url
    }

    private func fail(_ message: String) {
        DispatchQueue.main.async {
            self.errorMessage = message
            if self.isActive { self.stop() }
        }
    }

    private func setState(_ s: State) {
        DispatchQueue.main.async { self.state = s }
    }

    private func setTranscript(_ t: String) {
        DispatchQueue.main.async { self.transcript = t }
    }
}
