import AVFoundation
import SwiftUI

enum VoiceStatus: Equatable {
    case idle
    case connecting
    case connected
    case listening
    case speaking
    case error(String)
}

@MainActor
class VoiceManager: ObservableObject {
    static let shared = VoiceManager()

    @Published var status: VoiceStatus = .idle
    @Published var transcript: String = ""
    @Published var activities: [ToolActivity] = []
    @Published var rmsLevel: Float = 0
    @Published var outputRms: Float = 0
    @Published var isMuted = false
    @Published var isProcessing = false

    private var webSocket: URLSessionWebSocketTask?
    private var audioEngine = AVAudioEngine()
    private var inputNode: AVAudioInputNode!
    private var playerNode = AVAudioPlayerNode()
    private var audioFormat: AVAudioFormat!
    private var audioSession = AVAudioSession.sharedInstance()

    private var dataBuffer = Data()
    private var bufferCount = 0
    private var isObservingRouteChanges = false

    private var baseURL: String {
        NeroManager.shared.serverURL
    }

    private var licenseKey: String {
        NeroManager.shared.licenseKey
    }

    private init() {}

    func connect() async {
        guard status == .idle else { return }

        status = .connecting

        do {
            try setupAudio()
            await connectWebSocket()
        } catch {
            status = .error(error.localizedDescription)
        }
    }

    func disconnect() {
        stopRecording()
        webSocket?.cancel(with: .normalClosure, reason: nil)
        webSocket = nil
        status = .idle
        transcript = ""
        activities = []
        rmsLevel = 0
        outputRms = 0
        isProcessing = false
        reset()
    }

    func toggleMute() {
        isMuted.toggle()
    }

    private func setupAudio() throws {
        guard !audioSession.isOtherAudioPlaying else {
            throw NSError(domain: "AudioManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "Another app is playing audio"])
        }

        try audioSession.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.defaultToSpeaker, .allowBluetooth]
        )
        try audioSession.setActive(true)
        try audioSession.setPreferredInputNumberOfChannels(1)
        try audioSession.setPreferredSampleRate(48000)
        try? audioSession.setPreferredInput(nil)

        try audioEngine.inputNode.setVoiceProcessingEnabled(true)

        audioFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: 48000,
            channels: 1,
            interleaved: false
        )!

        inputNode = audioEngine.inputNode
        audioEngine.attach(playerNode)
        audioEngine.connect(playerNode, to: audioEngine.mainMixerNode, format: audioFormat)

        if !isObservingRouteChanges {
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(handleRouteChange(_:)),
                name: AVAudioSession.routeChangeNotification,
                object: nil
            )
            isObservingRouteChanges = true
        }

        reinstallInputTap()
    }

    private func reinstallInputTap() {
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: nil) { [weak self] buffer, _ in
            guard let self = self, !self.isMuted else { return }

            let inputSampleRate = buffer.format.sampleRate

            if inputSampleRate == 48000.0 {
                if let pcmData = buffer.toInt16Data() {
                    self.sendAudioData(pcmData)
                    self.updateRMS(from: buffer)
                }
            } else if let audioFormat = self.audioFormat {
                guard let converter = AVAudioConverter(from: buffer.format, to: audioFormat) else { return }

                let frameCapacity = AVAudioFrameCount(Double(buffer.frameLength) * (48000.0 / inputSampleRate))
                guard let convertedBuffer = AVAudioPCMBuffer(pcmFormat: audioFormat, frameCapacity: frameCapacity) else { return }

                var error: NSError?
                let inputBlock: AVAudioConverterInputBlock = { _, outStatus in
                    outStatus.pointee = .haveData
                    return buffer
                }

                let conversionStatus = converter.convert(to: convertedBuffer, error: &error, withInputFrom: inputBlock)

                if conversionStatus == .haveData, let pcmData = convertedBuffer.toInt16Data() {
                    self.sendAudioData(pcmData)
                    self.updateRMS(from: convertedBuffer)
                }
            }
        }
    }

    @objc private func handleRouteChange(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
            return
        }

        switch reason {
        case .newDeviceAvailable, .oldDeviceUnavailable, .routeConfigurationChange:
            reinstallInputTap()
        default:
            break
        }
    }

    private func connectWebSocket() async {
        var urlString = baseURL.replacingOccurrences(of: "http://", with: "ws://")
        urlString = urlString.replacingOccurrences(of: "https://", with: "wss://")
        urlString += "/webhook/voice/stream"

        guard let url = URL(string: urlString) else {
            status = .error("Invalid WebSocket URL")
            return
        }

        var request = URLRequest(url: url)
        if !licenseKey.isEmpty {
            request.setValue(licenseKey, forHTTPHeaderField: "x-license-key")
        }

        let session = URLSession(configuration: .default)
        webSocket = session.webSocketTask(with: request)
        webSocket?.resume()

        status = .connected

        sendMediumMessage()
        startRecording()
        receiveMessages()
    }

    private func sendMediumMessage() {
        let message: [String: String] = ["type": "medium", "medium": "voice:ios"]
        if let data = try? JSONSerialization.data(withJSONObject: message),
           let json = String(data: data, encoding: .utf8) {
            webSocket?.send(.string(json)) { _ in }
        }
    }

    private func receiveMessages() {
        webSocket?.receive { [weak self] result in
            Task { @MainActor in
                guard let self = self else { return }

                switch result {
                case .success(let message):
                    switch message {
                    case .string(let text):
                        self.handleMessage(text)
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8) {
                            self.handleMessage(text)
                        }
                    @unknown default:
                        break
                    }
                    self.receiveMessages()

                case .failure(let error):
                    if self.status != .idle {
                        self.status = .error(error.localizedDescription)
                    }
                }
            }
        }
    }

    private func handleMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else {
            return
        }

        switch type {
        case "transcript":
            if let transcriptData = json["data"] as? [String: Any],
               let text = transcriptData["text"] as? String {
                transcript = text
                status = .listening
                isProcessing = true
            }

        case "audio":
            if let audioData = json["data"] as? [String: Any],
               let base64Audio = audioData["audio"] as? String,
               let pcmData = Data(base64Encoded: base64Audio) {
                computeOutputRms(pcmData)
                playAudioData(pcmData)
                status = .speaking
                isProcessing = false
            }

        case "activity":
            if let activityData = json["data"],
               let activityJson = try? JSONSerialization.data(withJSONObject: activityData),
               let activity = try? JSONDecoder().decode(ToolActivity.self, from: activityJson) {
                updateActivity(activity)
            }

        case "clear":
            clearPlayback()
            status = .listening
            isProcessing = false
            outputRms = 0

        default:
            break
        }
    }

    private func updateActivity(_ activity: ToolActivity) {
        if let index = activities.firstIndex(where: { $0.id == activity.id }) {
            activities[index] = activity
        } else {
            activities.append(activity)
        }

    }

    private func startRecording() {
        do {
            try audioEngine.start()
            status = .listening
        } catch {
            status = .error("Failed to start recording: \(error.localizedDescription)")
        }
    }

    private func sendAudioData(_ data: Data) {
        let base64 = data.base64EncodedString()
        let message: [String: Any] = [
            "type": "audio",
            "data": ["audio": base64]
        ]

        if let jsonData = try? JSONSerialization.data(withJSONObject: message),
           let json = String(data: jsonData, encoding: .utf8) {
            Task { @MainActor in
                self.webSocket?.send(.string(json)) { _ in }
            }
        }
    }

    private func updateRMS(from buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData else { return }

        let frameLength = Int(buffer.frameLength)
        var sum: Float = 0

        for i in 0..<frameLength {
            let sample = channelData[0][i]
            sum += sample * sample
        }

        let rms = sqrt(sum / Float(frameLength))
        Task { @MainActor in
            self.rmsLevel = min(rms * 5, 1.0)
        }
    }

    private func computeOutputRms(_ data: Data) {
        let sampleCount = data.count / 2
        guard sampleCount > 0 else { return }

        var sum: Float = 0
        data.withUnsafeBytes { rawBuffer in
            let int16Buffer = rawBuffer.bindMemory(to: Int16.self)
            for i in 0..<sampleCount {
                let s = Float(int16Buffer[i]) / 32768.0
                sum += s * s
            }
        }
        outputRms = sqrt(sum / Float(sampleCount))
    }

    private func stopRecording() {
        inputNode?.removeTap(onBus: 0)
        audioEngine.stop()
    }

    private func convertDataToPCMBuffer(data: Data) -> AVAudioPCMBuffer? {
        let frameCount = AVAudioFrameCount(data.count / 2)

        guard let pcmBuffer = AVAudioPCMBuffer(pcmFormat: audioFormat, frameCapacity: frameCount) else {
            return nil
        }
        pcmBuffer.frameLength = frameCount

        let channels = UnsafeBufferPointer(
            start: pcmBuffer.floatChannelData,
            count: Int(pcmBuffer.format.channelCount)
        )

        data.withUnsafeBytes { rawBufferPointer in
            if let int16Buffer = rawBufferPointer.bindMemory(to: Int16.self).baseAddress {
                let floatPointer = UnsafeMutablePointer<Float>(mutating: channels[0])
                for i in 0..<Int(frameCount) {
                    floatPointer[i] = Float(int16Buffer[i]) / 32768.0
                }
            }
        }

        return pcmBuffer
    }

    private func playAudioData(_ data: Data) {
        dataBuffer.append(data)

        let frameSize = 2
        let chunkSize = frameSize * 2048

        while dataBuffer.count >= chunkSize {
            let chunkData = dataBuffer.subdata(in: 0..<chunkSize)
            dataBuffer.removeSubrange(0..<chunkSize)

            guard let pcmBuffer = convertDataToPCMBuffer(data: chunkData) else {
                continue
            }

            bufferCount += 1
            scheduleAndPlayBuffer(pcmBuffer)
        }
    }

    private func scheduleAndPlayBuffer(_ buffer: AVAudioPCMBuffer) {
        playerNode.scheduleBuffer(buffer) { [weak self] in
            Task { @MainActor in
                self?.bufferCount -= 1
                if self?.bufferCount == 0 {
                    self?.status = .listening
                }
            }
        }

        if !audioEngine.isRunning {
            try? audioEngine.start()
        }

        if !playerNode.isPlaying {
            playerNode.play()
        }
    }

    private func clearPlayback() {
        playerNode.stop()
        dataBuffer.removeAll()
        bufferCount = 0
    }

    private func reset() {
        audioEngine.stop()
        playerNode.stop()
        bufferCount = 0
        dataBuffer.removeAll()
        isMuted = false
        if isObservingRouteChanges {
            NotificationCenter.default.removeObserver(
                self,
                name: AVAudioSession.routeChangeNotification,
                object: nil
            )
            isObservingRouteChanges = false
        }
    }
}

extension AVAudioPCMBuffer {
    func toInt16Data() -> Data? {
        guard let channelData = floatChannelData else { return nil }

        let frameLength = Int(self.frameLength)
        var int16Data = Data(count: frameLength * 2)

        int16Data.withUnsafeMutableBytes { rawBufferPointer in
            let int16Pointer = rawBufferPointer.bindMemory(to: Int16.self).baseAddress!
            for i in 0..<frameLength {
                let sample = channelData[0][i]
                let clampedSample = max(-1.0, min(1.0, sample))
                int16Pointer[i] = Int16(clampedSample * 32767.0)
            }
        }

        return int16Data
    }
}
