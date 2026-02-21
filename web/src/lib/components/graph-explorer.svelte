<script lang="ts">
    import { onMount } from 'svelte';
    import * as THREE from 'three';
    import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
    import type { GraphData, GraphNode } from '$lib/actions/graph';

    interface Props {
        graphData: GraphData | null;
        selectedNodeId: number | null;
        onSelectNode: (id: number | null) => void;
        focusNodeId?: number | null;
    }

    let { graphData, selectedNodeId, onSelectNode, focusNodeId = null }: Props = $props();

    let container: HTMLDivElement;
    let animationId: number;
    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let controls: OrbitControls;
    let sphereGroup: THREE.Group;
    let innerGlow: THREE.Mesh;
    let pointLight: THREE.PointLight;
    let instancedMesh: THREE.InstancedMesh;
    let linesMesh: THREE.LineSegments;
    let raycaster: THREE.Raycaster;
    let pointer = new THREE.Vector2(-999, -999);
    let initialized = false;

    const MIN_NODE_COUNT = 40;
    const MAX_NODE_COUNT = 500;
    const BASE_COLOR = new THREE.Color(0x4d94ff);
    const FIRING_COLOR = new THREE.Color(0x33ccff);
    const CORE_COLOR = new THREE.Color(0x6699ff);
    const SELECT_COLOR = new THREE.Color(0x66ddff);

    interface NodeData {
        position: THREE.Vector3;
        neighbors: number[];
        waveIntensity: number;
        displayIntensity: number;
        graphNodeId: number | null;
        isGhost: boolean;
        baseSize: number;
        isCore: boolean;
    }

    interface Wave {
        startTime: number;
        speed: number;
        strength: number;
        distances: number[];
    }

    const MAX_WAVES = 20;

    let nodeCount = 0;
    let nodes: NodeData[] = [];
    let edges: [number, number][] = [];
    let displacedPositions: THREE.Vector3[] = [];
    let depthFades: Float32Array;
    let waves: Wave[] = [];
    let lastWaveTime = 0;
    let graphNodeIdToIndex: Map<number, number> = new Map();
    let hoveredIdx: number | null = null;
    let clickStartTime = 0;
    let clickStartPos = new THREE.Vector2();

    const tempMatrix = new THREE.Matrix4();
    const tempColor = new THREE.Color();
    const tempVec = new THREE.Vector3();
    const posMat = new THREE.Matrix4();

    function fibonacciSphere(count: number): THREE.Vector3[] {
        const points: THREE.Vector3[] = [];
        const goldenRatio = (1 + Math.sqrt(5)) / 2;
        for (let i = 0; i < count; i++) {
            const theta = (2 * Math.PI * i) / goldenRatio;
            const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
            points.push(
                new THREE.Vector3(
                    Math.sin(phi) * Math.cos(theta),
                    Math.sin(phi) * Math.sin(theta),
                    Math.cos(phi),
                ),
            );
        }
        return points;
    }

    function computeNeighbors(nodeList: NodeData[]) {
        const n = nodeList.length;
        const K = 4;
        const cellSize = Math.max(0.3, 4 / Math.sqrt(n));
        const grid = new Map<string, number[]>();

        for (let i = 0; i < n; i++) {
            const p = nodeList[i].position;
            const cx = Math.floor(p.x / cellSize);
            const cy = Math.floor(p.y / cellSize);
            const cz = Math.floor(p.z / cellSize);
            const key = `${cx},${cy},${cz}`;
            let bucket = grid.get(key);
            if (!bucket) {
                bucket = [];
                grid.set(key, bucket);
            }
            bucket.push(i);
        }

        for (let i = 0; i < n; i++) {
            const p = nodeList[i].position;
            const cx = Math.floor(p.x / cellSize);
            const cy = Math.floor(p.y / cellSize);
            const cz = Math.floor(p.z / cellSize);

            const candidates: { idx: number; dist: number }[] = [];
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
                        if (!bucket) continue;
                        for (const j of bucket) {
                            if (j === i) continue;
                            candidates.push({ idx: j, dist: p.distanceTo(nodeList[j].position) });
                        }
                    }
                }
            }

            if (candidates.length < K) {
                for (let j = 0; j < n; j++) {
                    if (j === i) continue;
                    if (candidates.some((c) => c.idx === j)) continue;
                    candidates.push({ idx: j, dist: p.distanceTo(nodeList[j].position) });
                }
            }

            candidates.sort((a, b) => a.dist - b.dist);
            nodeList[i].neighbors = candidates.slice(0, K).map((d) => d.idx);
        }
    }

    function buildGraphNodes(data: GraphData): { nodes: NodeData[]; edges: [number, number][] } {
        const realCount = Math.min(data.nodes.length, MAX_NODE_COUNT);
        const totalCount = Math.max(realCount, MIN_NODE_COUNT);
        const positions = fibonacciSphere(totalCount);

        const result: NodeData[] = [];
        const idMap = new Map<number, number>();

        for (let i = 0; i < realCount; i++) {
            const gn = data.nodes[i];
            idMap.set(gn.id, i);
            result.push({
                position: positions[i].clone(),
                neighbors: [],
                waveIntensity: 0,
                displayIntensity: 0,
                graphNodeId: gn.id,
                isGhost: false,
                baseSize: 0.015 + gn.strength * 0.01,
                isCore: gn.category === 'core',
            });
        }

        for (let i = realCount; i < totalCount; i++) {
            result.push({
                position: positions[i].clone(),
                neighbors: [],
                waveIntensity: 0,
                displayIntensity: 0,
                graphNodeId: null,
                isGhost: true,
                baseSize: 0.012,
                isCore: false,
            });
        }

        computeNeighbors(result);

        const graphEdges: [number, number][] = [];
        const edgeSet = new Set<string>();

        for (const e of data.edges) {
            const si = idMap.get(e.source);
            const ti = idMap.get(e.target);
            if (si !== undefined && ti !== undefined) {
                const key = `${Math.min(si, ti)}-${Math.max(si, ti)}`;
                if (!edgeSet.has(key)) {
                    edgeSet.add(key);
                    graphEdges.push([si, ti]);
                }
            }
        }

        for (let i = 0; i < result.length; i++) {
            if (!result[i].isGhost) continue;
            for (const j of result[i].neighbors) {
                const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
                if (!edgeSet.has(key)) {
                    edgeSet.add(key);
                    graphEdges.push([i, j]);
                }
            }
        }

        return { nodes: result, edges: graphEdges };
    }

    function buildStaticNodes(positions: THREE.Vector3[]): NodeData[] {
        const result: NodeData[] = positions.map((p) => ({
            position: p.clone(),
            neighbors: [],
            waveIntensity: 0,
            displayIntensity: 0,
            graphNodeId: null,
            isGhost: false,
            baseSize: 0.02,
            isCore: false,
        }));
        computeNeighbors(result);
        return result;
    }

    function bfsDistances(source: number): number[] {
        const dist = new Array(nodeCount).fill(-1);
        dist[source] = 0;
        const queue = [source];
        let head = 0;
        while (head < queue.length) {
            const curr = queue[head++];
            for (const neighbor of nodes[curr].neighbors) {
                if (dist[neighbor] === -1) {
                    dist[neighbor] = dist[curr] + 1;
                    queue.push(neighbor);
                }
            }
        }
        for (let i = 0; i < dist.length; i++) {
            if (dist[i] === -1) dist[i] = 999;
        }
        return dist;
    }

    function spawnWave(strength = 1, speed = 4, sourceNode?: number) {
        const origin = sourceNode ?? Math.floor(Math.random() * nodeCount);
        if (waves.length >= MAX_WAVES) {
            let oldestIdx = 0;
            let oldestTime = waves[0].startTime;
            for (let i = 1; i < waves.length; i++) {
                if (waves[i].startTime < oldestTime) {
                    oldestTime = waves[i].startTime;
                    oldestIdx = i;
                }
            }
            waves[oldestIdx] = {
                startTime: performance.now(),
                speed,
                strength,
                distances: bfsDistances(origin),
            };
            return;
        }
        waves.push({
            startTime: performance.now(),
            speed,
            strength,
            distances: bfsDistances(origin),
        });
    }

    function getSelectedNodeIndices(): Set<number> {
        const indices = new Set<number>();
        if (selectedNodeId === null) return indices;
        const selectedIdx = graphNodeIdToIndex.get(selectedNodeId);
        if (selectedIdx === undefined) return indices;
        indices.add(selectedIdx);

        for (const [si, ti] of edges) {
            const sId = nodes[si]?.graphNodeId;
            const tId = nodes[ti]?.graphNodeId;
            if (sId === selectedNodeId && ti !== undefined) indices.add(ti);
            if (tId === selectedNodeId && si !== undefined) indices.add(si);
        }
        return indices;
    }

    function buildScene() {
        let useGraph = graphData && graphData.nodes.length > 0;
        let built: { nodes: NodeData[]; edges: [number, number][] };

        if (useGraph) {
            built = buildGraphNodes(graphData!);
            graphNodeIdToIndex = new Map();
            for (let i = 0; i < built.nodes.length; i++) {
                const gid = built.nodes[i].graphNodeId;
                if (gid !== null) graphNodeIdToIndex.set(gid, i);
            }
        } else {
            const positions = fibonacciSphere(80);
            built = {
                nodes: buildStaticNodes(positions),
                edges: [],
            };
            graphNodeIdToIndex = new Map();
        }

        nodes = built.nodes;
        nodeCount = nodes.length;
        displacedPositions = nodes.map((n) => n.position.clone());
        depthFades = new Float32Array(nodeCount);

        if (instancedMesh) {
            sphereGroup.remove(instancedMesh);
            instancedMesh.geometry.dispose();
            (instancedMesh.material as THREE.Material).dispose();
        }
        if (linesMesh) {
            sphereGroup.remove(linesMesh);
            linesMesh.geometry.dispose();
            (linesMesh.material as THREE.Material).dispose();
        }

        const nodeGeo = new THREE.SphereGeometry(1, 16, 16);
        const nodeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        instancedMesh = new THREE.InstancedMesh(nodeGeo, nodeMat, nodeCount);
        instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        const colors = new Float32Array(nodeCount * 3);
        instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
        instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

        for (let i = 0; i < nodeCount; i++) {
            const s = nodes[i].baseSize;
            tempMatrix.makeScale(s, s, s);
            posMat.makeTranslation(nodes[i].position.x, nodes[i].position.y, nodes[i].position.z);
            tempMatrix.premultiply(posMat);
            instancedMesh.setMatrixAt(i, tempMatrix);
            instancedMesh.setColorAt(i, BASE_COLOR);
        }
        instancedMesh.instanceMatrix.needsUpdate = true;
        if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

        instancedMesh.computeBoundingSphere();
        sphereGroup.add(instancedMesh);

        if (useGraph) {
            edges = built.edges;
        } else {
            const edgeSet = new Set<string>();
            edges = [];
            for (let i = 0; i < nodes.length; i++) {
                for (const j of nodes[i].neighbors) {
                    const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
                    if (edgeSet.has(key)) continue;
                    edgeSet.add(key);
                    edges.push([i, j]);
                }
            }
        }

        const linePositions: number[] = [];
        const lineColors: number[] = [];

        for (const [i, j] of edges) {
            linePositions.push(
                nodes[i].position.x, nodes[i].position.y, nodes[i].position.z,
                nodes[j].position.x, nodes[j].position.y, nodes[j].position.z,
            );
            lineColors.push(
                BASE_COLOR.r, BASE_COLOR.g, BASE_COLOR.b,
                BASE_COLOR.r, BASE_COLOR.g, BASE_COLOR.b,
            );
        }

        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions.length > 0 ? linePositions : [0, 0, 0, 0, 0, 0], 3));
        (lineGeo.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
        lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors.length > 0 ? lineColors : [0, 0, 0, 0, 0, 0], 3));
        const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5 });
        linesMesh = new THREE.LineSegments(lineGeo, lineMat);
        sphereGroup.add(linesMesh);

        waves = [];
        lastWaveTime = performance.now();
        spawnWave(0.4, 2.5);
    }

    let lastGraphJson = '';

    function checkGraphUpdate() {
        const json = graphData ? JSON.stringify({ n: graphData.nodes.length, e: graphData.edges.length }) : '';
        if (json !== lastGraphJson) {
            lastGraphJson = json;
            buildScene();
        }
    }

    function initScene() {
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
        camera.position.z = 3;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);

        raycaster = new THREE.Raycaster();

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 0.3;
        controls.maxDistance = 8;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.5;
        controls.enablePan = true;
        controls.zoomSpeed = 1.2;
        controls.rotateSpeed = 0.8;

        controls.addEventListener('start', () => {
            controls.autoRotate = false;
        });

        sphereGroup = new THREE.Group();
        scene.add(sphereGroup);

        const glowGeo = new THREE.SphereGeometry(0.35, 24, 24);
        const glowMat = new THREE.MeshBasicMaterial({
            color: BASE_COLOR,
            transparent: true,
            opacity: 0.04,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        innerGlow = new THREE.Mesh(glowGeo, glowMat);
        sphereGroup.add(innerGlow);

        scene.add(new THREE.AmbientLight(0xffffff, 0.1));
        pointLight = new THREE.PointLight(0x4d94ff, 0.5, 5);
        sphereGroup.add(pointLight);

        buildScene();
        initialized = true;
        handleResize();

        renderer.domElement.addEventListener('pointerdown', onPointerDown);
        renderer.domElement.addEventListener('pointermove', onPointerMove);
        renderer.domElement.addEventListener('pointerup', onPointerUp);
    }

    function handleResize() {
        if (!container || !renderer) return;
        const rect = container.getBoundingClientRect();
        renderer.setSize(rect.width, rect.height);
        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();
    }

    function updatePointer(e: PointerEvent) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function raycastNode(): number | null {
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObject(instancedMesh, false);
        if (hits.length > 0 && hits[0].instanceId !== undefined) {
            const idx = hits[0].instanceId;
            if (nodes[idx] && nodes[idx].graphNodeId !== null) {
                return idx;
            }
        }
        return null;
    }

    function onPointerDown(e: PointerEvent) {
        clickStartTime = performance.now();
        clickStartPos.set(e.clientX, e.clientY);
    }

    function onPointerMove(e: PointerEvent) {
        updatePointer(e);
        const hit = raycastNode();
        hoveredIdx = hit;
        renderer.domElement.style.cursor = hit !== null ? 'pointer' : 'grab';
    }

    function onPointerUp(e: PointerEvent) {
        const elapsed = performance.now() - clickStartTime;
        const dist = Math.hypot(e.clientX - clickStartPos.x, e.clientY - clickStartPos.y);

        if (elapsed < 300 && dist < 8) {
            updatePointer(e);
            const hit = raycastNode();
            if (hit !== null) {
                const node = nodes[hit];
                onSelectNode(node.graphNodeId);
                spawnWave(1.2, 5, hit);
            } else {
                onSelectNode(null);
            }
        }
    }

    const NODE_SMOOTH = 0.08;

    function lerp(current: number, target: number, rate: number): number {
        return current + (target - current) * rate;
    }

    let accRotY = 0;
    const currentColor = new THREE.Color(0x4d94ff);

    function animate(time: number) {
        animationId = requestAnimationFrame(animate);

        if (initialized) checkGraphUpdate();

        updateFocusAnimation();
        controls.update();

        let writeIdx = 0;
        for (let i = 0; i < waves.length; i++) {
            if (time - waves[i].startTime < 6000) {
                waves[writeIdx++] = waves[i];
            }
        }
        waves.length = writeIdx;

        if (time - lastWaveTime > 4000) {
            spawnWave(0.35, 2);
            lastWaveTime = time;
        }

        for (let i = 0; i < nodes.length; i++) {
            let activation = 0;
            for (const wave of waves) {
                const elapsed = (time - wave.startTime) / 1000;
                const nodeDelay = wave.distances[i] / wave.speed;
                const age = elapsed - nodeDelay;
                if (age > 0) {
                    activation += wave.strength * Math.exp(-age * 2.5);
                }
            }
            nodes[i].waveIntensity = Math.min(activation, 1.5);
            nodes[i].displayIntensity = lerp(nodes[i].displayIntensity, nodes[i].waveIntensity, NODE_SMOOTH);
        }

        let avgDisplay = 0;
        for (let i = 0; i < nodes.length; i++) avgDisplay += nodes[i].displayIntensity;
        avgDisplay /= nodes.length || 1;

        const breathe = 1 + Math.sin(time * 0.0008) * 0.015 + avgDisplay * 0.05;
        sphereGroup.scale.setScalar(breathe);

        const glowMat = innerGlow.material as THREE.MeshBasicMaterial;
        glowMat.opacity = 0.03 + avgDisplay * 0.15;
        glowMat.color.copy(currentColor);

        sphereGroup.updateMatrixWorld();

        const selectedIndices = getSelectedNodeIndices();
        const selectedIdx = selectedNodeId !== null ? graphNodeIdToIndex.get(selectedNodeId) : undefined;
        const hasSelection = selectedNodeId !== null;

        const linePosAttr = linesMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        const lineColorAttr = linesMesh.geometry.getAttribute('color') as THREE.BufferAttribute;

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const fire = node.displayIntensity;
            const ghostDim = node.isGhost ? 0.3 : 1;
            const isSelected = i === selectedIdx;
            const isConnected = selectedIndices.has(i);
            const isHovered = i === hoveredIdx;

            let selectBoost = 0;
            if (isSelected) selectBoost = 1;
            else if (isHovered && !hasSelection) selectBoost = 0.5;
            else if (isConnected) selectBoost = 0.4;

            let dimFactor = 1;
            if (hasSelection && !isSelected && !isConnected) dimFactor = 0.25;

            const displacement = 1 + fire * 0.07 + selectBoost * 0.06;
            const px = node.position.x * displacement;
            const py = node.position.y * displacement;
            const pz = node.position.z * displacement;
            displacedPositions[i].set(px, py, pz);

            const scale = node.baseSize * (1 + fire * 0.6 + selectBoost * 1.2);
            tempMatrix.makeScale(scale, scale, scale);
            posMat.makeTranslation(px, py, pz);
            tempMatrix.premultiply(posMat);
            instancedMesh.setMatrixAt(i, tempMatrix);

            tempVec.set(px, py, pz).applyMatrix4(sphereGroup.matrixWorld);
            const df = 1 - ((tempVec.project(camera).z + 1) / 2) * 0.7;
            depthFades[i] = df;

            const nodeColor = node.isCore ? CORE_COLOR : currentColor;
            tempColor.lerpColors(nodeColor, FIRING_COLOR, Math.min(fire, 1));
            if (selectBoost > 0) tempColor.lerp(SELECT_COLOR, selectBoost * 0.6);
            tempColor.multiplyScalar(df * 0.7 * ghostDim * dimFactor);
            instancedMesh.setColorAt(i, tempColor);
        }

        instancedMesh.instanceMatrix.needsUpdate = true;
        if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

        for (let e = 0; e < edges.length; e++) {
            const edge = edges[e];
            const ni = edge[0];
            const nj = edge[1];
            const pi = displacedPositions[ni];
            const pj = displacedPositions[nj];

            linePosAttr.setXYZ(e * 2, pi.x, pi.y, pi.z);
            linePosAttr.setXYZ(e * 2 + 1, pj.x, pj.y, pj.z);

            const edgeFire = (nodes[ni].displayIntensity + nodes[nj].displayIntensity) * 0.5;
            const ghostDim = (nodes[ni].isGhost && nodes[nj].isGhost) ? 0.2 : (nodes[ni].isGhost || nodes[nj].isGhost) ? 0.4 : 1;

            const sId = nodes[ni].graphNodeId;
            const tId = nodes[nj].graphNodeId;
            const isSelectedEdge = hasSelection && (sId === selectedNodeId || tId === selectedNodeId);
            let edgeDim = 1;
            if (hasSelection && !isSelectedEdge) edgeDim = 0.1;

            if (isSelectedEdge) {
                const brightness = 2.5 + edgeFire * 1.5;
                tempColor.copy(SELECT_COLOR);
                tempColor.lerp(FIRING_COLOR, Math.min(edgeFire, 1));
                lineColorAttr.setXYZ(e * 2, tempColor.r * brightness, tempColor.g * brightness, tempColor.b * brightness);
                lineColorAttr.setXYZ(e * 2 + 1, tempColor.r * brightness, tempColor.g * brightness, tempColor.b * brightness);
            } else {
                const fadei = depthFades[ni] * 0.7 * ghostDim * edgeDim;
                const fadej = depthFades[nj] * 0.7 * ghostDim * edgeDim;
                tempColor.lerpColors(currentColor, FIRING_COLOR, Math.min(edgeFire, 1));
                lineColorAttr.setXYZ(e * 2, tempColor.r * fadei, tempColor.g * fadei, tempColor.b * fadei);
                lineColorAttr.setXYZ(e * 2 + 1, tempColor.r * fadej, tempColor.g * fadej, tempColor.b * fadej);
            }
        }

        linePosAttr.needsUpdate = true;
        lineColorAttr.needsUpdate = true;

        const lineMat = linesMesh.material as THREE.LineBasicMaterial;
        lineMat.opacity = hasSelection ? 0.8 : 0.2 + avgDisplay * 0.3;

        pointLight.color.copy(currentColor);
        pointLight.intensity = 0.3 + avgDisplay * 3;

        renderer.render(scene, camera);
    }

    let focusTarget: THREE.Vector3 | null = null;
    let focusProgress = 0;
    let focusCameraStart = new THREE.Vector3();
    let focusTargetStart = new THREE.Vector3();
    let focusLookTarget = new THREE.Vector3();
    let resetTarget: boolean = false;
    let resetProgress = 0;
    let resetCameraStart = new THREE.Vector3();
    let resetTargetStart = new THREE.Vector3();

    $effect(() => {
        if (focusNodeId === null || !initialized) return;
        const idx = graphNodeIdToIndex.get(focusNodeId);
        if (idx === undefined) return;

        const node = nodes[idx];
        const worldPos = new THREE.Vector3(
            node.position.x,
            node.position.y,
            node.position.z,
        ).applyMatrix4(sphereGroup.matrixWorld);

        controls.autoRotate = false;
        resetTarget = false;

        focusCameraStart.copy(camera.position);
        focusTargetStart.copy(controls.target);
        focusLookTarget.copy(worldPos);

        const dir = worldPos.clone().normalize();
        focusTarget = worldPos.clone().add(dir.multiplyScalar(0.8));
        focusProgress = 0;
    });

    $effect(() => {
        if (selectedNodeId !== null || !initialized) return;
        const dist = controls.target.length();
        if (dist < 0.01) return;

        resetCameraStart.copy(camera.position);
        resetTargetStart.copy(controls.target);
        resetTarget = true;
        resetProgress = 0;
    });

    function updateFocusAnimation() {
        if (focusTarget) {
            focusProgress = Math.min(1, focusProgress + 0.02);
            const t = focusProgress * focusProgress * (3 - 2 * focusProgress);

            camera.position.lerpVectors(focusCameraStart, focusTarget, t);
            const targetLook = new THREE.Vector3().lerpVectors(focusTargetStart, focusLookTarget, t);
            controls.target.copy(targetLook);

            if (focusProgress >= 1) focusTarget = null;
        }

        if (resetTarget) {
            resetProgress = Math.min(1, resetProgress + 0.03);
            const t = resetProgress * resetProgress * (3 - 2 * resetProgress);

            const origin = new THREE.Vector3(0, 0, 0);
            const targetLook = new THREE.Vector3().lerpVectors(resetTargetStart, origin, t);
            controls.target.copy(targetLook);

            const camDir = resetCameraStart.clone().sub(resetTargetStart).normalize();
            const camDist = resetCameraStart.distanceTo(resetTargetStart);
            const resetCamEnd = camDir.multiplyScalar(camDist);
            camera.position.lerpVectors(resetCameraStart, resetCamEnd, t);

            if (resetProgress >= 1) resetTarget = false;
        }
    }

    onMount(() => {
        initScene();
        animationId = requestAnimationFrame(animate);

        const resizeObserver = new ResizeObserver(() => handleResize());
        resizeObserver.observe(container);

        return () => {
            cancelAnimationFrame(animationId);
            resizeObserver.disconnect();
            controls.dispose();
            renderer.domElement.removeEventListener('pointerdown', onPointerDown);
            renderer.domElement.removeEventListener('pointermove', onPointerMove);
            renderer.domElement.removeEventListener('pointerup', onPointerUp);
            instancedMesh.geometry.dispose();
            (instancedMesh.material as THREE.Material).dispose();
            linesMesh.geometry.dispose();
            (linesMesh.material as THREE.Material).dispose();
            innerGlow.geometry.dispose();
            (innerGlow.material as THREE.Material).dispose();
            renderer.dispose();
            renderer.domElement.remove();
        };
    });
</script>

<div class="explorer-container" bind:this={container}>
</div>

<style>
    .explorer-container {
        width: 100%;
        height: 100%;
        position: relative;
    }

    .explorer-container :global(canvas) {
        display: block;
        width: 100%;
        height: 100%;
        cursor: grab;
    }

    .explorer-container :global(canvas:active) {
        cursor: grabbing;
    }
</style>
