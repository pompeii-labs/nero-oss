import SwiftUI
import SceneKit

enum SphereStatus {
    case idle
    case connecting
    case connected
    case error
}

struct NeroSphereView: UIViewRepresentable {
    let status: SphereStatus
    let rmsLevel: Float
    let outputRms: Float
    let isTalking: Bool
    let isProcessing: Bool
    let isMuted: Bool
    let onTap: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onTap: onTap)
    }

    func makeUIView(context: Context) -> SCNView {
        let scnView = SCNView()
        scnView.backgroundColor = .clear
        scnView.antialiasingMode = .multisampling4X
        scnView.isUserInteractionEnabled = true
        scnView.delegate = context.coordinator
        scnView.isPlaying = true
        scnView.preferredFramesPerSecond = 60

        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap))
        scnView.addGestureRecognizer(tap)

        context.coordinator.setupScene(scnView: scnView)
        return scnView
    }

    func updateUIView(_ scnView: SCNView, context: Context) {
        context.coordinator.status = status
        context.coordinator.rmsLevel = rmsLevel
        context.coordinator.outputRms = outputRms
        context.coordinator.isTalking = isTalking
        context.coordinator.isProcessing = isProcessing
        context.coordinator.isMuted = isMuted
        context.coordinator.onTap = onTap
    }

    class Coordinator: NSObject, SCNSceneRendererDelegate {
        var status: SphereStatus = .idle
        var rmsLevel: Float = 0
        var outputRms: Float = 0
        var isTalking: Bool = false
        var isProcessing: Bool = false
        var isMuted: Bool = false
        var onTap: () -> Void

        private let nodeCount = 80
        private let baseColor = SIMD3<Float>(0.302, 0.580, 1.0)
        private let firingColor = SIMD3<Float>(0.2, 0.8, 1.0)
        private let errorColor = SIMD3<Float>(1.0, 0.267, 0.267)

        private var nodes: [NodeData] = []
        private var edges: [(Int, Int)] = []
        private var displacedPositions: [SIMD3<Float>] = []
        private var depthFades: [Float] = []
        private var waves: [Wave] = []
        private var lastWaveTime: TimeInterval = 0
        private let maxWaves = 20

        private var sphereGroup: SCNNode!
        private var cameraNode: SCNNode!
        private var nodeGeometries: [SCNNode] = []
        private var linesNode: SCNNode!
        private var innerGlow: SCNNode!
        private var pointLight: SCNLight!

        private var smoothedOutputRms: Float = 0
        private var smoothedRms: Float = 0
        private var ambientBrightness: Float = 0.7
        private var ambientRotSpeed: Float = 1
        private var ambientGlowBase: Float = 0.03
        private var ambientScaleBase: Float = 1
        private var accRotY: Float = 0
        private var currentColor = SIMD3<Float>(0.302, 0.580, 1.0)
        private var currentMuteDim: Float = 1

        private let lerpSlow: Float = 0.03
        private let lerpMed: Float = 0.06
        private let lerpFast: Float = 0.1
        private let nodeSmooth: Float = 0.08

        private var startTime: TimeInterval = 0
        private var linePositions: [Float] = []
        private var lineColors: [Float] = []

        struct NodeData {
            var position: SIMD3<Float>
            var neighbors: [Int]
            var waveIntensity: Float
            var displayIntensity: Float
        }

        struct Wave {
            var startTime: TimeInterval
            var speed: Float
            var strength: Float
            var distances: [Int]
        }

        init(onTap: @escaping () -> Void) {
            self.onTap = onTap
            super.init()
        }

        @objc func handleTap() {
            onTap()
        }

        func setupScene(scnView: SCNView) {
            let scene = SCNScene()
            scnView.scene = scene

            let camera = SCNCamera()
            camera.fieldOfView = 50
            camera.zNear = 0.1
            camera.zFar = 100
            cameraNode = SCNNode()
            cameraNode.camera = camera
            cameraNode.position = SCNVector3(0, 0, 3)
            scene.rootNode.addChildNode(cameraNode)

            let ambient = SCNLight()
            ambient.type = .ambient
            ambient.intensity = 50
            ambient.color = UIColor.white
            let ambientNode = SCNNode()
            ambientNode.light = ambient
            scene.rootNode.addChildNode(ambientNode)

            sphereGroup = SCNNode()
            scene.rootNode.addChildNode(sphereGroup)

            let positions = fibonacciSphere(count: nodeCount)
            nodes = buildNodes(positions: positions)
            displacedPositions = nodes.map { $0.position }
            depthFades = [Float](repeating: 1, count: nodeCount)

            let nodeSphere = SCNSphere(radius: 0.02)
            nodeSphere.segmentCount = 8
            let nodeMat = SCNMaterial()
            nodeMat.lightingModel = .constant
            nodeMat.diffuse.contents = UIColor.white
            nodeSphere.materials = [nodeMat]

            for i in 0..<nodeCount {
                let node = SCNNode(geometry: nodeSphere.copy() as? SCNGeometry)
                node.position = SCNVector3(nodes[i].position.x, nodes[i].position.y, nodes[i].position.z)
                sphereGroup.addChildNode(node)
                nodeGeometries.append(node)
            }

            buildEdges()
            buildLines()

            let glowSphere = SCNSphere(radius: 0.35)
            glowSphere.segmentCount = 24
            let glowMat = SCNMaterial()
            glowMat.lightingModel = .constant
            glowMat.diffuse.contents = UIColor(red: 0.302, green: 0.580, blue: 1.0, alpha: 0.04)
            glowMat.isDoubleSided = true
            glowMat.blendMode = .add
            glowMat.writesToDepthBuffer = false
            glowSphere.materials = [glowMat]
            innerGlow = SCNNode(geometry: glowSphere)
            sphereGroup.addChildNode(innerGlow)

            let pLight = SCNLight()
            pLight.type = .omni
            pLight.intensity = 50
            pLight.color = UIColor(red: 0.302, green: 0.580, blue: 1.0, alpha: 1)
            pLight.attenuationStartDistance = 0
            pLight.attenuationEndDistance = 5
            pointLight = pLight
            let lightNode = SCNNode()
            lightNode.light = pLight
            sphereGroup.addChildNode(lightNode)

            startTime = CACurrentMediaTime()
            lastWaveTime = CACurrentMediaTime()
            spawnWave(strength: 0.4, speed: 2.5)
        }

        private func fibonacciSphere(count: Int) -> [SIMD3<Float>] {
            var points: [SIMD3<Float>] = []
            let goldenRatio = (1.0 + sqrtf(5.0)) / 2.0
            for i in 0..<count {
                let theta = (2.0 * Float.pi * Float(i)) / goldenRatio
                let phi = acosf(1.0 - (2.0 * (Float(i) + 0.5)) / Float(count))
                points.append(SIMD3<Float>(
                    sinf(phi) * cosf(theta),
                    sinf(phi) * sinf(theta),
                    cosf(phi)
                ))
            }
            return points
        }

        private func buildNodes(positions: [SIMD3<Float>]) -> [NodeData] {
            var result = positions.map { NodeData(position: $0, neighbors: [], waveIntensity: 0, displayIntensity: 0) }
            for i in 0..<result.count {
                var distances: [(idx: Int, dist: Float)] = []
                for j in 0..<result.count {
                    if i == j { continue }
                    let d = simd_distance(result[i].position, result[j].position)
                    distances.append((idx: j, dist: d))
                }
                distances.sort { $0.dist < $1.dist }
                result[i].neighbors = Array(distances.prefix(4).map { $0.idx })
            }
            return result
        }

        private func bfsDistances(source: Int) -> [Int] {
            var dist = [Int](repeating: -1, count: nodeCount)
            dist[source] = 0
            var queue = [source]
            var head = 0
            while head < queue.count {
                let curr = queue[head]
                head += 1
                for neighbor in nodes[curr].neighbors {
                    if dist[neighbor] == -1 {
                        dist[neighbor] = dist[curr] + 1
                        queue.append(neighbor)
                    }
                }
            }
            for i in 0..<dist.count {
                if dist[i] == -1 { dist[i] = 999 }
            }
            return dist
        }

        private func spawnWave(strength: Float = 1, speed: Float = 4) {
            let wave = Wave(
                startTime: CACurrentMediaTime(),
                speed: speed,
                strength: strength,
                distances: bfsDistances(source: Int.random(in: 0..<nodeCount))
            )
            if waves.count >= maxWaves {
                var oldestIdx = 0
                var oldestTime = waves[0].startTime
                for i in 1..<waves.count {
                    if waves[i].startTime < oldestTime {
                        oldestTime = waves[i].startTime
                        oldestIdx = i
                    }
                }
                waves[oldestIdx] = wave
            } else {
                waves.append(wave)
            }
        }

        private func buildEdges() {
            var edgeSet = Set<String>()
            edges = []
            for i in 0..<nodes.count {
                for j in nodes[i].neighbors {
                    let key = "\(min(i, j))-\(max(i, j))"
                    if edgeSet.contains(key) { continue }
                    edgeSet.insert(key)
                    edges.append((i, j))
                }
            }
        }

        private func buildLines() {
            linePositions = []
            lineColors = []

            for (i, j) in edges {
                linePositions.append(contentsOf: [
                    nodes[i].position.x, nodes[i].position.y, nodes[i].position.z,
                    nodes[j].position.x, nodes[j].position.y, nodes[j].position.z
                ])
                lineColors.append(contentsOf: [
                    baseColor.x, baseColor.y, baseColor.z, 1.0,
                    baseColor.x, baseColor.y, baseColor.z, 1.0
                ])
            }

            updateLinesGeometry()
        }

        private func updateLinesGeometry() {
            let vertexSource = SCNGeometrySource(
                data: Data(bytes: linePositions, count: linePositions.count * MemoryLayout<Float>.size),
                semantic: .vertex,
                vectorCount: edges.count * 2,
                usesFloatComponents: true,
                componentsPerVector: 3,
                bytesPerComponent: MemoryLayout<Float>.size,
                dataOffset: 0,
                dataStride: MemoryLayout<Float>.size * 3
            )

            let colorSource = SCNGeometrySource(
                data: Data(bytes: lineColors, count: lineColors.count * MemoryLayout<Float>.size),
                semantic: .color,
                vectorCount: edges.count * 2,
                usesFloatComponents: true,
                componentsPerVector: 4,
                bytesPerComponent: MemoryLayout<Float>.size,
                dataOffset: 0,
                dataStride: MemoryLayout<Float>.size * 4
            )

            var indices: [UInt32] = []
            for i in 0..<(edges.count * 2) {
                indices.append(UInt32(i))
            }
            let indexData = Data(bytes: indices, count: indices.count * MemoryLayout<UInt32>.size)
            let element = SCNGeometryElement(
                data: indexData,
                primitiveType: .line,
                primitiveCount: edges.count,
                bytesPerIndex: MemoryLayout<UInt32>.size
            )

            let geometry = SCNGeometry(sources: [vertexSource, colorSource], elements: [element])
            let lineMat = SCNMaterial()
            lineMat.lightingModel = .constant
            lineMat.diffuse.contents = UIColor.white
            lineMat.isDoubleSided = true
            lineMat.transparency = 0.35
            geometry.materials = [lineMat]

            if linesNode == nil {
                linesNode = SCNNode(geometry: geometry)
                sphereGroup.addChildNode(linesNode)
            } else {
                linesNode.geometry = geometry
            }
        }

        private func lerpF(_ current: Float, _ target: Float, _ rate: Float) -> Float {
            current + (target - current) * rate
        }

        private func lerpColor(_ a: SIMD3<Float>, _ b: SIMD3<Float>, _ t: Float) -> SIMD3<Float> {
            a + (b - a) * t
        }

        func renderer(_ renderer: SCNSceneRenderer, updateAtTime time: TimeInterval) {
            let t = Float(time - startTime) * 1000

            smoothedOutputRms = lerpF(smoothedOutputRms, outputRms, lerpFast)
            smoothedRms = lerpF(smoothedRms, rmsLevel, lerpFast)

            waves.removeAll { (time - $0.startTime) > 6.0 }

            var targetBrightness: Float = 0.7
            var targetRotSpeed: Float = 1
            var targetGlowBase: Float = 0.03
            var targetScaleBase: Float = 1
            let targetMuteDim: Float = isMuted ? 0.5 : 1
            var targetColor = baseColor

            if status == .error {
                targetColor = errorColor
                targetBrightness = 0.5
                targetRotSpeed = 0.5
            }

            if status == .connected {
                if isTalking {
                    let orm = min(smoothedOutputRms * 7.5, 1)
                    targetBrightness = 1.2 + orm * 0.5
                    targetRotSpeed = 1.3 + orm * 0.6
                    targetGlowBase = 0.1 + orm * 0.15
                    targetScaleBase = 1.04 + orm * 0.1
                    let interval = TimeInterval(0.25 + (1 - orm) * 0.3)
                    if (time - lastWaveTime) > interval {
                        spawnWave(strength: 0.6 + orm * 2.5, speed: 4 + orm * 5)
                        lastWaveTime = time
                    }
                } else if isProcessing {
                    let pulse = sinf(t * 0.002) * 0.5 + 0.5
                    targetBrightness = 0.95 + pulse * 0.2
                    targetRotSpeed = 1.0
                    targetGlowBase = 0.05 + pulse * 0.06
                    targetScaleBase = 1.01 + pulse * 0.02
                    if (time - lastWaveTime) > TimeInterval(0.8 + pulse * 0.5) {
                        spawnWave(strength: 0.5 + pulse * 0.4, speed: 3 + pulse * 2)
                        lastWaveTime = time
                    }
                } else if smoothedRms > 0.01 {
                    let rm = min(smoothedRms * 4, 1)
                    targetBrightness = 0.85 + rm * 0.2
                    targetRotSpeed = 0.5 + rm * 0.2
                    targetGlowBase = 0.03 + rm * 0.04
                    targetScaleBase = 1 + rm * 0.02
                    let interval = TimeInterval(0.5 - rm * 0.2)
                    if (time - lastWaveTime) > interval {
                        spawnWave(strength: 0.4 + rm * 0.7, speed: 3)
                        lastWaveTime = time
                    }
                } else {
                    targetBrightness = 0.85
                    targetRotSpeed = 1
                    targetGlowBase = 0.03
                    if (time - lastWaveTime) > 3.5 {
                        spawnWave(strength: 0.4, speed: 2.5)
                        lastWaveTime = time
                    }
                }
            } else if status == .connecting {
                targetBrightness = 0.8
                targetRotSpeed = 1.4
                targetGlowBase = 0.05
                if (time - lastWaveTime) > 0.5 {
                    spawnWave(strength: 0.7, speed: 5)
                    lastWaveTime = time
                }
            } else {
                if (time - lastWaveTime) > 4.0 {
                    spawnWave(strength: 0.35, speed: 2)
                    lastWaveTime = time
                }
            }

            ambientBrightness = lerpF(ambientBrightness, targetBrightness, lerpMed)
            ambientRotSpeed = lerpF(ambientRotSpeed, targetRotSpeed, lerpMed)
            ambientGlowBase = lerpF(ambientGlowBase, targetGlowBase, lerpMed)
            ambientScaleBase = lerpF(ambientScaleBase, targetScaleBase, lerpSlow)
            currentColor = lerpColor(currentColor, targetColor, lerpMed)
            currentMuteDim = lerpF(currentMuteDim, targetMuteDim, lerpMed)

            for i in 0..<nodes.count {
                var activation: Float = 0
                for wave in waves {
                    let elapsed = Float(time - wave.startTime)
                    let nodeDelay = Float(wave.distances[i]) / wave.speed
                    let age = elapsed - nodeDelay
                    if age > 0 {
                        activation += wave.strength * expf(-age * 2.5)
                    }
                }
                nodes[i].waveIntensity = min(activation, 1.5)
                nodes[i].displayIntensity = lerpF(nodes[i].displayIntensity, nodes[i].waveIntensity, nodeSmooth)
            }

            var avgDisplay: Float = 0
            for i in 0..<nodes.count { avgDisplay += nodes[i].displayIntensity }
            avgDisplay /= Float(nodes.count)

            let baseSpeed: Float = 0.003 + sinf(t * 0.00017) * 0.0008
            accRotY += baseSpeed * ambientRotSpeed
            sphereGroup.eulerAngles.y = accRotY
            sphereGroup.eulerAngles.x = sinf(t * 0.00023) * 0.12 + sinf(t * 0.00041) * 0.08

            let breathe = ambientScaleBase + sinf(t * 0.0008) * 0.015 + avgDisplay * 0.05
            sphereGroup.scale = SCNVector3(breathe, breathe, breathe)

            let brightDim = ambientBrightness * currentMuteDim

            let cosY = cosf(accRotY)
            let sinY = sinf(accRotY)

            for i in 0..<nodes.count {
                let fire = nodes[i].displayIntensity
                let displacement: Float = 1 + fire * 0.07
                let px = nodes[i].position.x * displacement
                let py = nodes[i].position.y * displacement
                let pz = nodes[i].position.z * displacement
                displacedPositions[i] = SIMD3<Float>(px, py, pz)

                let scale = 1 + fire * 0.6
                let nodeObj = nodeGeometries[i]
                nodeObj.position = SCNVector3(px, py, pz)
                nodeObj.scale = SCNVector3(scale, scale, scale)

                let rotatedZ = -px * sinY + pz * cosY
                let df = max(Float(0.3), min(Float(1.0), 0.65 + rotatedZ * 0.35))
                depthFades[i] = df

                let nodeColor = lerpColor(currentColor, firingColor, min(fire, 1))
                let finalColor = nodeColor * df * brightDim
                if let mat = nodeObj.geometry?.firstMaterial {
                    mat.diffuse.contents = UIColor(
                        red: CGFloat(finalColor.x),
                        green: CGFloat(finalColor.y),
                        blue: CGFloat(finalColor.z),
                        alpha: 1
                    )
                }
            }

            for e in 0..<edges.count {
                let (ni, nj) = edges[e]
                let pi = displacedPositions[ni]
                let pj = displacedPositions[nj]

                linePositions[e * 6] = pi.x
                linePositions[e * 6 + 1] = pi.y
                linePositions[e * 6 + 2] = pi.z
                linePositions[e * 6 + 3] = pj.x
                linePositions[e * 6 + 4] = pj.y
                linePositions[e * 6 + 5] = pj.z

                let edgeFire = (nodes[ni].displayIntensity + nodes[nj].displayIntensity) * 0.5
                let fadei = depthFades[ni] * brightDim
                let fadej = depthFades[nj] * brightDim
                let edgeColor = lerpColor(currentColor, firingColor, min(edgeFire, 1))

                lineColors[e * 8] = edgeColor.x * fadei
                lineColors[e * 8 + 1] = edgeColor.y * fadei
                lineColors[e * 8 + 2] = edgeColor.z * fadei
                lineColors[e * 8 + 3] = 1.0
                lineColors[e * 8 + 4] = edgeColor.x * fadej
                lineColors[e * 8 + 5] = edgeColor.y * fadej
                lineColors[e * 8 + 6] = edgeColor.z * fadej
                lineColors[e * 8 + 7] = 1.0
            }

            updateLinesGeometry()

            let glowOpacity = (ambientGlowBase + avgDisplay * 0.15) * currentMuteDim
            if let glowMat = innerGlow.geometry?.firstMaterial {
                glowMat.diffuse.contents = UIColor(
                    red: CGFloat(currentColor.x),
                    green: CGFloat(currentColor.y),
                    blue: CGFloat(currentColor.z),
                    alpha: CGFloat(glowOpacity)
                )
            }

            if let lineMat = linesNode?.geometry?.firstMaterial {
                lineMat.transparency = CGFloat((0.2 + avgDisplay * 0.3) * currentMuteDim)
            }

            pointLight.color = UIColor(
                red: CGFloat(currentColor.x),
                green: CGFloat(currentColor.y),
                blue: CGFloat(currentColor.z),
                alpha: 1
            )
            pointLight.intensity = CGFloat(30 + avgDisplay * 300)
        }
    }
}
