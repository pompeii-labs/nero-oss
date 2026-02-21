import SwiftUI
import SceneKit

struct GraphExplorerView: UIViewRepresentable {
    var graphData: GraphData?
    @Binding var selectedNodeId: Int?
    @Binding var focusNodeId: Int?
    var onSelectNode: (Int?) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onSelectNode: onSelectNode)
    }

    func makeUIView(context: Context) -> SCNView {
        let scnView = SCNView()
        scnView.backgroundColor = .clear
        scnView.antialiasingMode = .multisampling4X
        scnView.isUserInteractionEnabled = true
        scnView.allowsCameraControl = true
        scnView.delegate = context.coordinator
        scnView.isPlaying = true
        scnView.preferredFramesPerSecond = 60
        scnView.defaultCameraController.interactionMode = .orbitAngleMapping
        scnView.defaultCameraController.inertiaEnabled = true

        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap(_:)))
        scnView.addGestureRecognizer(tap)

        context.coordinator.setupScene(scnView: scnView)

        scnView.defaultCameraController.target = SCNVector3(0, 0, 0)

        return scnView
    }

    func updateUIView(_ scnView: SCNView, context: Context) {
        context.coordinator.pendingGraphData = graphData
        context.coordinator.onSelectNode = onSelectNode

        if context.coordinator.selectedNodeId != selectedNodeId {
            context.coordinator.selectedNodeId = selectedNodeId
            context.coordinator.updateSelectedIndices()

            if selectedNodeId == nil {
                context.coordinator.startResetAnimation()
            }
        }

        if context.coordinator.focusNodeId != focusNodeId {
            context.coordinator.focusNodeId = focusNodeId
            if let fid = focusNodeId {
                context.coordinator.startFocusAnimation(targetGraphId: fid)
            }
        }
    }

    class Coordinator: NSObject, SCNSceneRendererDelegate {
        var onSelectNode: (Int?) -> Void
        var pendingGraphData: GraphData?
        var selectedNodeId: Int?
        var focusNodeId: Int?
        var selectedIndices: Set<Int> = []

        private static let MIN_NODE_COUNT = 40
        private static let MAX_NODE_COUNT = 500

        private let baseColor = SIMD3<Float>(0.302, 0.580, 1.0)
        private let firingColor = SIMD3<Float>(0.2, 0.8, 1.0)
        private let coreColor = SIMD3<Float>(0.4, 0.6, 1.0)
        private let selectColor = SIMD3<Float>(0.4, 0.867, 1.0)

        private var nodeCount = 0
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
        private weak var scnView: SCNView?

        private var graphNodeIdToIndex: [Int: Int] = [:]

        private var startTime: TimeInterval = 0
        private var linePositions: [Float] = []
        private var lineColors: [Float] = []

        private var lastGraphNodeCount = -1
        private var lastGraphEdgeCount = -1

        private var focusAnimating = false
        private var focusProgress: Float = 0
        private var focusCameraStart = SIMD3<Float>(0, 0, 3)
        private var focusCameraEnd = SIMD3<Float>(0, 0, 3)
        private var focusTargetStart = SIMD3<Float>(0, 0, 0)
        private var focusTargetEnd = SIMD3<Float>(0, 0, 0)

        private var resetAnimating = false
        private var resetProgress: Float = 0
        private var resetCameraStart = SIMD3<Float>(0, 0, 3)
        private var resetTargetStart = SIMD3<Float>(0, 0, 0)

        private var autoRotateSpeed: Float = 0.001
        private var accRotY: Float = 0

        struct NodeData {
            var position: SIMD3<Float>
            var neighbors: [Int]
            var waveIntensity: Float
            var displayIntensity: Float
            var graphNodeId: Int?
            var isGhost: Bool
            var baseSize: Float
            var isCore: Bool
        }

        struct Wave {
            var startTime: TimeInterval
            var speed: Float
            var strength: Float
            var distances: [Int]
        }

        init(onSelectNode: @escaping (Int?) -> Void) {
            self.onSelectNode = onSelectNode
            super.init()
        }

        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard let scnView = gesture.view as? SCNView else { return }
            let point = gesture.location(in: scnView)

            let hitResults = scnView.hitTest(point, options: [
                .searchMode: SCNHitTestSearchMode.all.rawValue
            ])

            for hit in hitResults {
                if let name = hit.node.name, let index = Int(name) {
                    if index < nodes.count && nodes[index].graphNodeId != nil {
                        let graphId = nodes[index].graphNodeId!
                        onSelectNode(graphId)
                        spawnWave(strength: 1.2, speed: 5, sourceNode: index)
                        return
                    }
                }
            }

            let tapThreshold: CGFloat = 44
            var bestIdx: Int? = nil
            var bestDist: CGFloat = tapThreshold

            for i in 0..<nodes.count {
                guard nodes[i].graphNodeId != nil else { continue }
                let projected = scnView.projectPoint(nodeGeometries[i].worldPosition)
                let screenPt = CGPoint(x: CGFloat(projected.x), y: CGFloat(projected.y))
                let dist = hypot(point.x - screenPt.x, point.y - screenPt.y)
                if dist < bestDist {
                    bestDist = dist
                    bestIdx = i
                }
            }

            if let idx = bestIdx {
                let graphId = nodes[idx].graphNodeId!
                onSelectNode(graphId)
                spawnWave(strength: 1.2, speed: 5, sourceNode: idx)
            } else {
                onSelectNode(nil)
            }
        }

        func updateSelectedIndices() {
            selectedIndices = []
            guard let selId = selectedNodeId else { return }
            guard let selIdx = graphNodeIdToIndex[selId] else { return }
            selectedIndices.insert(selIdx)

            for (si, ti) in edges {
                let sId = nodes[si].graphNodeId
                let tId = nodes[ti].graphNodeId
                if sId == selId { selectedIndices.insert(ti) }
                if tId == selId { selectedIndices.insert(si) }
            }
        }

        func startFocusAnimation(targetGraphId: Int) {
            guard let idx = graphNodeIdToIndex[targetGraphId] else { return }
            let nodePos = nodes[idx].position
            let wt = sphereGroup.simdWorldTransform
            let sc = sphereGroup.simdScale
            let worldPos = SIMD3<Float>(
                wt.columns.3.x + nodePos.x * sc.x,
                wt.columns.3.y + nodePos.y * sc.y,
                wt.columns.3.z + nodePos.z * sc.z
            )

            let dir = simd_normalize(worldPos)
            let camTarget = worldPos + dir * 0.8

            focusCameraStart = cameraNode.simdPosition
            focusCameraEnd = camTarget
            focusTargetStart = SIMD3<Float>(0, 0, 0)
            focusTargetEnd = worldPos
            focusProgress = 0
            focusAnimating = true
            resetAnimating = false
            autoRotateSpeed = 0
        }

        func startResetAnimation() {
            guard cameraNode != nil else { return }
            resetCameraStart = cameraNode.simdPosition
            let camDist = simd_length(resetCameraStart)
            let camDir = camDist > 0.001 ? simd_normalize(resetCameraStart) : SIMD3<Float>(0, 0, 1)

            resetTargetStart = SIMD3<Float>(0, 0, 0)
            focusCameraEnd = camDir * camDist
            resetProgress = 0
            resetAnimating = true
            focusAnimating = false
        }

        func setupScene(scnView: SCNView) {
            self.scnView = scnView
            let scene = SCNScene()
            scnView.scene = scene

            let camera = SCNCamera()
            camera.fieldOfView = 50
            camera.zNear = 0.1
            camera.zFar = 100
            cameraNode = SCNNode()
            cameraNode.camera = camera
            cameraNode.simdPosition = SIMD3<Float>(0, 0, 3)
            scene.rootNode.addChildNode(cameraNode)

            scnView.pointOfView = cameraNode

            let ambient = SCNLight()
            ambient.type = .ambient
            ambient.intensity = 200
            ambient.color = UIColor.white
            let ambientNode = SCNNode()
            ambientNode.light = ambient
            scene.rootNode.addChildNode(ambientNode)

            sphereGroup = SCNNode()
            scene.rootNode.addChildNode(sphereGroup)

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
            innerGlow.categoryBitMask = 0
            sphereGroup.addChildNode(innerGlow)

            let pLight = SCNLight()
            pLight.type = .omni
            pLight.intensity = 150
            pLight.color = UIColor(red: 0.302, green: 0.580, blue: 1.0, alpha: 1)
            pLight.attenuationStartDistance = 0
            pLight.attenuationEndDistance = 5
            pointLight = pLight
            let lightNode = SCNNode()
            lightNode.light = pLight
            sphereGroup.addChildNode(lightNode)

            buildScene()

            startTime = CACurrentMediaTime()
            lastWaveTime = CACurrentMediaTime()
            spawnWave(strength: 0.4, speed: 2.5)
        }

        private func buildScene() {
            for node in nodeGeometries {
                node.removeFromParentNode()
            }
            nodeGeometries.removeAll()
            linesNode?.removeFromParentNode()
            linesNode = nil

            let useGraph = pendingGraphData != nil && (pendingGraphData!.nodes.count > 0)

            if useGraph {
                buildGraphNodes(data: pendingGraphData!)
            } else {
                let positions = fibonacciSphere(count: 80)
                buildStaticNodes(positions: positions)
            }

            nodeCount = nodes.count
            displacedPositions = nodes.map { $0.position }
            depthFades = [Float](repeating: 1, count: nodeCount)

            let nodeSphere = SCNSphere(radius: 1)
            nodeSphere.segmentCount = 16
            let nodeMat = SCNMaterial()
            nodeMat.lightingModel = .constant
            nodeMat.diffuse.contents = UIColor.white
            nodeSphere.materials = [nodeMat]

            for i in 0..<nodeCount {
                let node = SCNNode(geometry: nodeSphere.copy() as? SCNGeometry)
                node.name = "\(i)"
                let s = nodes[i].baseSize
                node.simdScale = SIMD3<Float>(s, s, s)
                node.simdPosition = nodes[i].position
                sphereGroup.addChildNode(node)
                nodeGeometries.append(node)
            }

            if useGraph {
                buildGraphEdges(data: pendingGraphData!)
            } else {
                buildNeighborEdges()
            }

            buildLines()

            waves = []
            lastWaveTime = CACurrentMediaTime()
            spawnWave(strength: 0.4, speed: 2.5)

            updateSelectedIndices()
        }

        private func buildGraphNodes(data: GraphData) {
            let realCount = min(data.nodes.count, Coordinator.MAX_NODE_COUNT)
            let totalCount = max(realCount, Coordinator.MIN_NODE_COUNT)
            let positions = fibonacciSphere(count: totalCount)

            var result: [NodeData] = []
            graphNodeIdToIndex = [:]

            for i in 0..<realCount {
                let gn = data.nodes[i]
                graphNodeIdToIndex[gn.id] = i

                result.append(NodeData(
                    position: positions[i],
                    neighbors: [],
                    waveIntensity: 0,
                    displayIntensity: 0,
                    graphNodeId: gn.id,
                    isGhost: false,
                    baseSize: 0.015 + Float(gn.strength) * 0.01,
                    isCore: gn.category == "core"
                ))
            }

            for i in realCount..<totalCount {
                result.append(NodeData(
                    position: positions[i],
                    neighbors: [],
                    waveIntensity: 0,
                    displayIntensity: 0,
                    graphNodeId: nil,
                    isGhost: true,
                    baseSize: 0.012,
                    isCore: false
                ))
            }

            computeNeighbors(&result)
            nodes = result
        }

        private func buildGraphEdges(data: GraphData) {
            var idMap: [Int: Int] = [:]
            for i in 0..<nodes.count {
                if let gid = nodes[i].graphNodeId {
                    idMap[gid] = i
                }
            }

            var edgeSet: Set<String> = []
            edges = []

            for e in data.edges {
                if let si = idMap[e.source], let ti = idMap[e.target] {
                    let key = "\(min(si, ti))-\(max(si, ti))"
                    if !edgeSet.contains(key) {
                        edgeSet.insert(key)
                        edges.append((si, ti))
                    }
                }
            }

            for i in 0..<nodes.count {
                if !nodes[i].isGhost { continue }
                for j in nodes[i].neighbors {
                    let key = "\(min(i, j))-\(max(i, j))"
                    if !edgeSet.contains(key) {
                        edgeSet.insert(key)
                        edges.append((i, j))
                    }
                }
            }
        }

        private func buildStaticNodes(positions: [SIMD3<Float>]) {
            nodes = positions.map {
                NodeData(
                    position: $0,
                    neighbors: [],
                    waveIntensity: 0,
                    displayIntensity: 0,
                    graphNodeId: nil,
                    isGhost: false,
                    baseSize: 0.02,
                    isCore: false
                )
            }
            computeNeighbors(&nodes)
            graphNodeIdToIndex = [:]
        }

        private func buildNeighborEdges() {
            var edgeSet: Set<String> = []
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

        private func computeNeighbors(_ nodeList: inout [NodeData]) {
            let n = nodeList.count
            let k = 4
            let cellSize = max(Float(0.3), 4.0 / sqrtf(Float(n)))
            var grid: [String: [Int]] = [:]

            for i in 0..<n {
                let p = nodeList[i].position
                let cx = Int(floorf(p.x / cellSize))
                let cy = Int(floorf(p.y / cellSize))
                let cz = Int(floorf(p.z / cellSize))
                let key = "\(cx),\(cy),\(cz)"
                grid[key, default: []].append(i)
            }

            for i in 0..<n {
                let p = nodeList[i].position
                let cx = Int(floorf(p.x / cellSize))
                let cy = Int(floorf(p.y / cellSize))
                let cz = Int(floorf(p.z / cellSize))

                var candidates: [(idx: Int, dist: Float)] = []

                for dx in -1...1 {
                    for dy in -1...1 {
                        for dz in -1...1 {
                            let key = "\(cx + dx),\(cy + dy),\(cz + dz)"
                            guard let bucket = grid[key] else { continue }
                            for j in bucket {
                                if j == i { continue }
                                candidates.append((idx: j, dist: simd_distance(p, nodeList[j].position)))
                            }
                        }
                    }
                }

                if candidates.count < k {
                    let existingSet = Set(candidates.map { $0.idx })
                    for j in 0..<n {
                        if j == i || existingSet.contains(j) { continue }
                        candidates.append((idx: j, dist: simd_distance(p, nodeList[j].position)))
                    }
                }

                candidates.sort { $0.dist < $1.dist }
                nodeList[i].neighbors = Array(candidates.prefix(k).map { $0.idx })
            }
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

        private func spawnWave(strength: Float = 1, speed: Float = 4, sourceNode: Int? = nil) {
            guard nodeCount > 0 else { return }
            let origin = sourceNode ?? Int.random(in: 0..<nodeCount)
            let wave = Wave(
                startTime: CACurrentMediaTime(),
                speed: speed,
                strength: strength,
                distances: bfsDistances(source: origin)
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
            guard !edges.isEmpty else {
                linesNode?.removeFromParentNode()
                linesNode = nil
                return
            }

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
            lineMat.transparency = 0.6
            geometry.materials = [lineMat]

            if linesNode == nil {
                linesNode = SCNNode(geometry: geometry)
                sphereGroup.addChildNode(linesNode)
            } else {
                linesNode.geometry = geometry
            }
        }

        private func smoothstep(_ t: Float) -> Float {
            t * t * (3 - 2 * t)
        }

        private func lerpF(_ current: Float, _ target: Float, _ rate: Float) -> Float {
            current + (target - current) * rate
        }

        private func lerpColor(_ a: SIMD3<Float>, _ b: SIMD3<Float>, _ t: Float) -> SIMD3<Float> {
            a + (b - a) * t
        }

        private func lerpVec(_ a: SIMD3<Float>, _ b: SIMD3<Float>, _ t: Float) -> SIMD3<Float> {
            a + (b - a) * t
        }

        private func checkGraphUpdate() {
            let nc = pendingGraphData?.nodes.count ?? -1
            let ec = pendingGraphData?.edges.count ?? -1
            if nc != lastGraphNodeCount || ec != lastGraphEdgeCount {
                lastGraphNodeCount = nc
                lastGraphEdgeCount = ec
                buildScene()
            }
        }

        func renderer(_ renderer: SCNSceneRenderer, updateAtTime time: TimeInterval) {
            let t = Float(time - startTime) * 1000

            checkGraphUpdate()

            if focusAnimating {
                focusProgress = min(1, focusProgress + 0.02)
                let st = smoothstep(focusProgress)
                let camPos = lerpVec(focusCameraStart, focusCameraEnd, st)
                cameraNode.simdPosition = camPos

                if focusProgress >= 1 {
                    focusAnimating = false
                }
            }

            if resetAnimating {
                resetProgress = min(1, resetProgress + 0.03)
                let st = smoothstep(resetProgress)

                let camDist = simd_length(resetCameraStart)
                let camDir = camDist > 0.001 ? simd_normalize(resetCameraStart) : SIMD3<Float>(0, 0, 1)
                let resetCamEnd = camDir * camDist
                let camPos = lerpVec(resetCameraStart, resetCamEnd, st)
                cameraNode.simdPosition = camPos

                if resetProgress >= 1 {
                    resetAnimating = false
                    autoRotateSpeed = 0.001
                }
            }

            waves.removeAll { (time - $0.startTime) > 6.0 }

            if (time - lastWaveTime) > 4.0 {
                spawnWave(strength: 0.35, speed: 2)
                lastWaveTime = time
            }

            let nodeSmooth: Float = 0.08
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
            avgDisplay /= max(Float(nodes.count), 1)

            if !focusAnimating && !resetAnimating {
                let baseSpeed: Float = autoRotateSpeed + sinf(t * 0.00017) * 0.0003
                accRotY += baseSpeed
            }

            let breathe: Float = 1 + sinf(t * 0.0008) * 0.015 + avgDisplay * 0.05
            sphereGroup.simdScale = SIMD3<Float>(breathe, breathe, breathe)

            let hasSelection = selectedNodeId != nil
            let selectedIdx = selectedNodeId.flatMap { graphNodeIdToIndex[$0] }
            let brightness: Float = 1.3

            let camPos = cameraNode.simdPosition
            let camDir = simd_length(camPos) > 0.001 ? simd_normalize(camPos) : SIMD3<Float>(0, 0, 1)

            for i in 0..<nodes.count {
                let fire = nodes[i].displayIntensity
                let ghostDim: Float = nodes[i].isGhost ? 0.3 : 1
                let isSelected = i == selectedIdx
                let isConnected = selectedIndices.contains(i)

                var selectBoost: Float = 0
                if isSelected { selectBoost = 1 }
                else if isConnected { selectBoost = 0.4 }

                var dimFactor: Float = 1
                if hasSelection && !isSelected && !isConnected { dimFactor = 0.4 }

                let displacement: Float = 1 + fire * 0.07 + selectBoost * 0.06
                let px = nodes[i].position.x * displacement
                let py = nodes[i].position.y * displacement
                let pz = nodes[i].position.z * displacement
                displacedPositions[i] = SIMD3<Float>(px, py, pz)

                let scale = nodes[i].baseSize * (1 + fire * 0.6 + selectBoost * 1.2)
                let nodeObj = nodeGeometries[i]
                nodeObj.simdPosition = SIMD3<Float>(px, py, pz)
                nodeObj.simdScale = SIMD3<Float>(scale, scale, scale)

                let dotProduct = simd_dot(SIMD3<Float>(px, py, pz), camDir)
                let df = max(Float(0.5), min(Float(1.0), 0.75 + dotProduct * 0.25))
                depthFades[i] = df

                let base = nodes[i].isCore ? coreColor : baseColor
                var nodeColor: SIMD3<Float>
                if isSelected {
                    nodeColor = selectColor * 2.0
                } else if isConnected {
                    nodeColor = lerpColor(base, selectColor, 0.5) * 1.6
                } else {
                    nodeColor = lerpColor(base, firingColor, min(fire, 1))
                    nodeColor = nodeColor * df * brightness * ghostDim * dimFactor
                }

                if let mat = nodeObj.geometry?.firstMaterial {
                    mat.diffuse.contents = UIColor(
                        red: CGFloat(nodeColor.x),
                        green: CGFloat(nodeColor.y),
                        blue: CGFloat(nodeColor.z),
                        alpha: 1
                    )
                }
            }

            let lineTransparency = CGFloat(0.5 + avgDisplay * 0.3)

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
                let eGhostDim: Float = (nodes[ni].isGhost && nodes[nj].isGhost) ? 0.2
                    : (nodes[ni].isGhost || nodes[nj].isGhost) ? 0.4 : 1

                let sId = nodes[ni].graphNodeId
                let tId = nodes[nj].graphNodeId
                let isSelectedEdge = hasSelection && (sId == selectedNodeId || tId == selectedNodeId)

                if isSelectedEdge {
                    let edgeBrightness = 2.5 + edgeFire * 1.5
                    var edgeColor = selectColor
                    edgeColor = lerpColor(edgeColor, firingColor, min(edgeFire, 1))
                    lineColors[e * 8] = edgeColor.x * edgeBrightness
                    lineColors[e * 8 + 1] = edgeColor.y * edgeBrightness
                    lineColors[e * 8 + 2] = edgeColor.z * edgeBrightness
                    lineColors[e * 8 + 3] = 1.0
                    lineColors[e * 8 + 4] = edgeColor.x * edgeBrightness
                    lineColors[e * 8 + 5] = edgeColor.y * edgeBrightness
                    lineColors[e * 8 + 6] = edgeColor.z * edgeBrightness
                    lineColors[e * 8 + 7] = 1.0
                } else {
                    var edgeDim: Float = 1
                    if hasSelection { edgeDim = 0.35 }

                    let fadei = depthFades[ni] * brightness * eGhostDim * edgeDim
                    let fadej = depthFades[nj] * brightness * eGhostDim * edgeDim
                    let edgeColor = lerpColor(baseColor, firingColor, min(edgeFire, 1))

                    lineColors[e * 8] = edgeColor.x * fadei
                    lineColors[e * 8 + 1] = edgeColor.y * fadei
                    lineColors[e * 8 + 2] = edgeColor.z * fadei
                    lineColors[e * 8 + 3] = 1.0
                    lineColors[e * 8 + 4] = edgeColor.x * fadej
                    lineColors[e * 8 + 5] = edgeColor.y * fadej
                    lineColors[e * 8 + 6] = edgeColor.z * fadej
                    lineColors[e * 8 + 7] = 1.0
                }
            }

            updateLinesGeometry()

            if let lineMat = linesNode?.geometry?.firstMaterial {
                lineMat.transparency = lineTransparency
            }

            let glowOpacity = CGFloat(0.03 + avgDisplay * 0.15)
            if let glowMat = innerGlow.geometry?.firstMaterial {
                glowMat.diffuse.contents = UIColor(
                    red: CGFloat(baseColor.x),
                    green: CGFloat(baseColor.y),
                    blue: CGFloat(baseColor.z),
                    alpha: glowOpacity
                )
            }

            pointLight.color = UIColor(
                red: CGFloat(baseColor.x),
                green: CGFloat(baseColor.y),
                blue: CGFloat(baseColor.z),
                alpha: 1
            )
            pointLight.intensity = CGFloat(100 + avgDisplay * 400)
        }
    }
}
