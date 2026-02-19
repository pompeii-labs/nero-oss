<script lang="ts">
    import { onMount } from 'svelte';
    import * as THREE from 'three';

    interface Props {
        status: 'idle' | 'connecting' | 'connected' | 'error';
        rmsLevel: number;
        isTalking: boolean;
        isProcessing: boolean;
        isMuted: boolean;
        outputRms: number;
        onclick: () => void;
    }

    let { status, rmsLevel, isTalking, isProcessing, isMuted, outputRms, onclick }: Props = $props();

    let container: HTMLDivElement;
    let animationId: number;
    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let sphereGroup: THREE.Group;
    let innerGlow: THREE.Mesh;
    let pointLight: THREE.PointLight;
    let instancedMesh: THREE.InstancedMesh;
    let linesMesh: THREE.LineSegments;

    const NODE_COUNT = 80;
    const BASE_COLOR = new THREE.Color(0x4d94ff);
    const FIRING_COLOR = new THREE.Color(0x33ccff);
    const ERROR_COLOR = new THREE.Color(0xff4444);

    interface NodeData {
        position: THREE.Vector3;
        neighbors: number[];
        waveIntensity: number;
        displayIntensity: number;
    }

    interface Wave {
        startTime: number;
        speed: number;
        strength: number;
        distances: number[];
    }

    const MAX_WAVES = 20;

    let nodes: NodeData[] = [];
    let edges: [number, number][] = [];
    let displacedPositions: THREE.Vector3[] = [];
    let depthFades: Float32Array;
    let waves: Wave[] = [];
    let lastWaveTime = 0;

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

    function buildNodes(positions: THREE.Vector3[]): NodeData[] {
        const result: NodeData[] = positions.map((p) => ({
            position: p.clone(),
            neighbors: [],
            waveIntensity: 0,
            displayIntensity: 0,
        }));
        for (let i = 0; i < result.length; i++) {
            const distances: { idx: number; dist: number }[] = [];
            for (let j = 0; j < result.length; j++) {
                if (i === j) continue;
                distances.push({ idx: j, dist: result[i].position.distanceTo(result[j].position) });
            }
            distances.sort((a, b) => a.dist - b.dist);
            result[i].neighbors = distances.slice(0, 4).map((d) => d.idx);
        }
        return result;
    }

    function bfsDistances(source: number): number[] {
        const dist = new Array(NODE_COUNT).fill(-1);
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

    function spawnWave(strength = 1, speed = 4) {
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
                distances: bfsDistances(Math.floor(Math.random() * NODE_COUNT)),
            };
            return;
        }
        waves.push({
            startTime: performance.now(),
            speed,
            strength,
            distances: bfsDistances(Math.floor(Math.random() * NODE_COUNT)),
        });
    }

    function initScene() {
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        camera.position.z = 3;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);

        sphereGroup = new THREE.Group();
        scene.add(sphereGroup);

        const positions = fibonacciSphere(NODE_COUNT);
        nodes = buildNodes(positions);
        displacedPositions = nodes.map((n) => n.position.clone());
        depthFades = new Float32Array(NODE_COUNT);

        const nodeGeo = new THREE.SphereGeometry(0.02, 6, 6);
        const nodeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        instancedMesh = new THREE.InstancedMesh(nodeGeo, nodeMat, NODE_COUNT);
        instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        const colors = new Float32Array(NODE_COUNT * 3);
        instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
        instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

        for (let i = 0; i < NODE_COUNT; i++) {
            tempMatrix.makeTranslation(nodes[i].position.x, nodes[i].position.y, nodes[i].position.z);
            instancedMesh.setMatrixAt(i, tempMatrix);
            instancedMesh.setColorAt(i, BASE_COLOR);
        }
        instancedMesh.instanceMatrix.needsUpdate = true;
        if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
        sphereGroup.add(instancedMesh);

        const edgeSet = new Set<string>();
        const linePositions: number[] = [];
        const lineColors: number[] = [];
        edges = [];

        for (let i = 0; i < nodes.length; i++) {
            for (const j of nodes[i].neighbors) {
                const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
                if (edgeSet.has(key)) continue;
                edgeSet.add(key);
                edges.push([i, j]);
                linePositions.push(
                    nodes[i].position.x, nodes[i].position.y, nodes[i].position.z,
                    nodes[j].position.x, nodes[j].position.y, nodes[j].position.z,
                );
                lineColors.push(
                    BASE_COLOR.r, BASE_COLOR.g, BASE_COLOR.b,
                    BASE_COLOR.r, BASE_COLOR.g, BASE_COLOR.b,
                );
            }
        }

        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        (lineGeo.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
        lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
        const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35 });
        linesMesh = new THREE.LineSegments(lineGeo, lineMat);
        sphereGroup.add(linesMesh);

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

        lastWaveTime = performance.now();
        spawnWave(0.4, 2.5);

        handleResize();
    }

    function handleResize() {
        if (!container || !renderer) return;
        const rect = container.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height);
        renderer.setSize(size, size);
        camera.aspect = 1;
        camera.updateProjectionMatrix();
    }

    let smoothedOutputRms = 0;
    let smoothedRms = 0;

    let ambientBrightness = 0.7;
    let ambientRotSpeed = 1;
    let ambientGlowBase = 0.03;
    let ambientScaleBase = 1;
    let accRotY = 0;
    const currentColor = new THREE.Color(0x4d94ff);
    const targetColor = new THREE.Color();
    let currentMuteDim = 1;

    const LERP_SLOW = 0.03;
    const LERP_MED = 0.06;
    const LERP_FAST = 0.1;
    const NODE_SMOOTH = 0.08;

    function lerp(current: number, target: number, rate: number): number {
        return current + (target - current) * rate;
    }

    function animate(time: number) {
        animationId = requestAnimationFrame(animate);

        smoothedOutputRms = lerp(smoothedOutputRms, outputRms, LERP_FAST);
        smoothedRms = lerp(smoothedRms, rmsLevel, LERP_FAST);

        let writeIdx = 0;
        for (let i = 0; i < waves.length; i++) {
            if (time - waves[i].startTime < 6000) {
                waves[writeIdx++] = waves[i];
            }
        }
        waves.length = writeIdx;

        let targetBrightness = 0.7;
        let targetRotSpeed = 1;
        let targetGlowBase = 0.03;
        let targetScaleBase = 1;
        let targetMuteDim = isMuted ? 0.5 : 1;

        if (status === 'error') {
            targetColor.copy(ERROR_COLOR);
            targetBrightness = 0.5;
            targetRotSpeed = 0.5;
        } else {
            targetColor.copy(BASE_COLOR);
        }

        if (status === 'connected') {
            if (isTalking) {
                const orm = Math.min(smoothedOutputRms * 7.5, 1);
                targetBrightness = 1.2 + orm * 0.5;
                targetRotSpeed = 1.3 + orm * 0.6;
                targetGlowBase = 0.1 + orm * 0.15;
                targetScaleBase = 1.04 + orm * 0.1;
                const interval = 250 + (1 - orm) * 300;
                if (time - lastWaveTime > interval) {
                    spawnWave(0.6 + orm * 2.5, 4 + orm * 5);
                    lastWaveTime = time;
                }
            } else if (isProcessing) {
                const pulse = Math.sin(time * 0.002) * 0.5 + 0.5;
                targetBrightness = 0.95 + pulse * 0.2;
                targetRotSpeed = 1.0;
                targetGlowBase = 0.05 + pulse * 0.06;
                targetScaleBase = 1.01 + pulse * 0.02;
                if (time - lastWaveTime > 800 + pulse * 500) {
                    spawnWave(0.5 + pulse * 0.4, 3 + pulse * 2);
                    lastWaveTime = time;
                }
            } else if (smoothedRms > 0.01) {
                const rm = Math.min(smoothedRms * 4, 1);
                targetBrightness = 0.85 + rm * 0.2;
                targetRotSpeed = 0.5 + rm * 0.2;
                targetGlowBase = 0.03 + rm * 0.04;
                targetScaleBase = 1 + rm * 0.02;
                const interval = 500 - rm * 200;
                if (time - lastWaveTime > interval) {
                    spawnWave(0.4 + rm * 0.7, 3);
                    lastWaveTime = time;
                }
            } else {
                targetBrightness = 0.85;
                targetRotSpeed = 1;
                targetGlowBase = 0.03;
                if (time - lastWaveTime > 3500) {
                    spawnWave(0.4, 2.5);
                    lastWaveTime = time;
                }
            }
        } else if (status === 'connecting') {
            targetBrightness = 0.8;
            targetRotSpeed = 1.4;
            targetGlowBase = 0.05;
            if (time - lastWaveTime > 500) {
                spawnWave(0.7, 5);
                lastWaveTime = time;
            }
        } else {
            if (time - lastWaveTime > 4000) {
                spawnWave(0.35, 2);
                lastWaveTime = time;
            }
        }

        ambientBrightness = lerp(ambientBrightness, targetBrightness, LERP_MED);
        ambientRotSpeed = lerp(ambientRotSpeed, targetRotSpeed, LERP_MED);
        ambientGlowBase = lerp(ambientGlowBase, targetGlowBase, LERP_MED);
        ambientScaleBase = lerp(ambientScaleBase, targetScaleBase, LERP_SLOW);
        currentColor.lerp(targetColor, LERP_MED);
        currentMuteDim = lerp(currentMuteDim, targetMuteDim, LERP_MED);

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
        avgDisplay /= nodes.length;

        const baseSpeed = 0.003 + Math.sin(time * 0.00017) * 0.0008;
        accRotY += baseSpeed * ambientRotSpeed;
        sphereGroup.rotation.y = accRotY;
        sphereGroup.rotation.x = Math.sin(time * 0.00023) * 0.12 + Math.sin(time * 0.00041) * 0.08;

        const breathe = ambientScaleBase + Math.sin(time * 0.0008) * 0.015 + avgDisplay * 0.05;
        sphereGroup.scale.setScalar(breathe);

        const glowMat = innerGlow.material as THREE.MeshBasicMaterial;
        glowMat.opacity = (ambientGlowBase + avgDisplay * 0.15) * currentMuteDim;
        glowMat.color.copy(currentColor);

        sphereGroup.updateMatrixWorld();

        const linePosAttr = linesMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        const lineColorAttr = linesMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
        const brightDim = ambientBrightness * currentMuteDim;

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const fire = node.displayIntensity;

            const displacement = 1 + fire * 0.07;
            const px = node.position.x * displacement;
            const py = node.position.y * displacement;
            const pz = node.position.z * displacement;
            displacedPositions[i].set(px, py, pz);

            const scale = 1 + fire * 0.6;
            tempMatrix.makeScale(scale, scale, scale);
            posMat.makeTranslation(px, py, pz);
            tempMatrix.premultiply(posMat);
            instancedMesh.setMatrixAt(i, tempMatrix);

            tempVec.set(px, py, pz).applyMatrix4(sphereGroup.matrixWorld);
            const df = 1 - ((tempVec.project(camera).z + 1) / 2) * 0.7;
            depthFades[i] = df;

            tempColor.lerpColors(currentColor, FIRING_COLOR, Math.min(fire, 1));
            tempColor.multiplyScalar(df * brightDim);
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
            const fadei = depthFades[ni] * brightDim;
            const fadej = depthFades[nj] * brightDim;

            tempColor.lerpColors(currentColor, FIRING_COLOR, Math.min(edgeFire, 1));
            lineColorAttr.setXYZ(e * 2, tempColor.r * fadei, tempColor.g * fadei, tempColor.b * fadei);
            lineColorAttr.setXYZ(e * 2 + 1, tempColor.r * fadej, tempColor.g * fadej, tempColor.b * fadej);
        }

        linePosAttr.needsUpdate = true;
        lineColorAttr.needsUpdate = true;

        const lineMat = linesMesh.material as THREE.LineBasicMaterial;
        lineMat.opacity = (0.2 + avgDisplay * 0.3) * currentMuteDim;

        pointLight.color.copy(currentColor);
        pointLight.intensity = 0.3 + avgDisplay * 3;

        renderer.render(scene, camera);
    }

    onMount(() => {
        initScene();
        animationId = requestAnimationFrame(animate);

        const resizeObserver = new ResizeObserver(() => handleResize());
        resizeObserver.observe(container);

        return () => {
            cancelAnimationFrame(animationId);
            resizeObserver.disconnect();
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

<div class="sphere-container" bind:this={container}>
    <button type="button" class="sphere-click-target" onclick={onclick}>
        <span class="sr-only">
            {#if status === 'idle'}
                Start voice connection
            {:else if status === 'connecting'}
                Connecting...
            {:else if status === 'connected'}
                Disconnect
            {:else}
                Retry connection
            {/if}
        </span>
    </button>
</div>

<style>
    .sphere-container {
        position: relative;
        width: 300px;
        height: 300px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .sphere-container :global(canvas) {
        display: block;
        cursor: pointer;
    }

    .sphere-click-target {
        position: absolute;
        inset: 0;
        cursor: pointer;
        background: transparent;
        border: none;
        z-index: 10;
    }
</style>
