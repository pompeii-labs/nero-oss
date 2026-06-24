<script lang="ts">
    import '$lib/design/themes.css';
    import { fieldTheme } from '$lib/stores/field-theme.svelte';
    import Atmosphere from '$lib/components/field/Atmosphere.svelte';
    import Orb from '$lib/components/field/Orb.svelte';
    import Panel from '$lib/components/field/Panel.svelte';
    import Dock from '$lib/components/field/Dock.svelte';
    import ThemeSwitch from '$lib/components/field/ThemeSwitch.svelte';

    const spark = [18, 22, 19, 28, 41, 37, 52, 48, 63, 71, 66, 80];
    const sparkPath = spark
        .map((v, i) => `${(i / (spark.length - 1)) * 100},${40 - (v / 80) * 34}`)
        .join(' ');
</script>

<div class="field" data-theme={fieldTheme.dataTheme}>
    <Atmosphere />

    <svg class="links" viewBox="0 0 1280 800" preserveAspectRatio="none" aria-hidden="true">
        <defs>
            <linearGradient id="linkg" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="rgb(var(--holo))" stop-opacity="0" />
                <stop offset="0.5" stop-color="rgb(var(--holo))" stop-opacity="0.32" />
                <stop offset="1" stop-color="rgb(var(--holo))" stop-opacity="0" />
            </linearGradient>
        </defs>
        <path d="M 640 320 C 470 360, 380 360, 300 380" class="link" />
        <path d="M 640 320 C 820 360, 920 360, 1000 384" class="link" />
    </svg>

    <header class="bar">
        <div class="mark">
            <span class="wordmark">NERO</span>
            <span class="stat"><i class="dot"></i> field · present</span>
        </div>
        <ThemeSwitch />
        <div class="meta">10:42 · clear · 71°</div>
    </header>

    <div class="orb-wrap"><Orb state="speaking" /></div>

    <div class="left">
        <Panel label="Today" meta="mon · jun 23" width={232} rotate={-0.6}>
            <ul class="rows">
                <li><b>09:00</b> Standup <i class="tag">call</i></li>
                <li class="now"><b>10:30</b> Design review <i class="tag live">now</i></li>
                <li><b>13:00</b> Lunch — Vesta</li>
                <li><b>16:00</b> Lux deploy window</li>
            </ul>
        </Panel>
    </div>

    <div class="right">
        <Panel label="Systems" meta="nominal" width={224} rotate={0.5}>
            <div class="gauge">
                <svg viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="48" class="g-track" />
                    <circle cx="60" cy="60" r="48" class="g-fill" />
                    <circle cx="60" cy="60" r="34" class="g-track" />
                    <circle cx="60" cy="60" r="34" class="g-fill2" />
                </svg>
                <div class="gauge-read"><b>3</b><span>mediums</span></div>
            </div>
            <div class="sparkrow">
                <span class="sparklab">load · 6h</span>
                <svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none">
                    <polyline points={sparkPath} />
                    <circle cx="100" cy={40 - (spark[spark.length - 1] / 80) * 34} r="2" class="spark-dot" />
                </svg>
            </div>
        </Panel>
    </div>

    <div class="convo">
        <div class="user">where are we on the Lux deploy?</div>
        <p class="nero">
            Window opens at four. I pulled today up and flagged the design review starting now — want me
            to hold the deploy until after it?
        </p>
    </div>

    <div class="dock-wrap"><Dock /></div>
</div>

<style>
    .field {
        position: fixed;
        inset: 0;
        overflow: hidden;
        font-family: var(--font-ui);
        color: var(--text);
    }

    .links {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1;
    }
    .link {
        fill: none;
        stroke: url(#linkg);
        stroke-width: 1;
        stroke-dasharray: 3 7;
        animation: flow 3s linear infinite;
    }
    @keyframes flow { to { stroke-dashoffset: -40; } }

    .bar {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 22px 30px;
        z-index: 30;
    }
    .mark { display: flex; align-items: baseline; gap: 14px; }
    .wordmark {
        font-family: var(--font-display);
        font-size: 26px;
        letter-spacing: 0.16em;
        color: var(--text);
    }
    .stat {
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--text-dim);
        display: inline-flex;
        align-items: center;
        gap: 7px;
    }
    .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: rgb(var(--holo));
        box-shadow: 0 0 8px 1px rgb(var(--holo));
    }
    .meta {
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.08em;
        color: var(--text-dim);
    }

    .orb-wrap {
        position: absolute;
        top: 15%;
        left: 50%;
        transform: translateX(-50%);
        z-index: 20;
    }
    .left {
        position: absolute;
        left: 5.5%;
        top: 30%;
        z-index: 20;
    }
    .right {
        position: absolute;
        right: 5.5%;
        top: 28%;
        z-index: 20;
    }

    .rows {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 9px;
    }
    .rows li {
        display: flex;
        align-items: center;
        gap: 9px;
        font-size: 13px;
        color: color-mix(in oklch, var(--text) 82%, transparent);
    }
    .rows b {
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 500;
        color: var(--text-dim);
        min-width: 38px;
    }
    .rows .tag {
        margin-left: auto;
        font-family: var(--font-mono);
        font-size: 9px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-dim);
        border: 1px solid rgb(var(--holo) / 0.22);
        border-radius: 4px;
        padding: 2px 6px;
        font-style: normal;
    }
    .rows .tag.live {
        color: var(--void);
        background: rgb(var(--holo));
        border-color: transparent;
        box-shadow: 0 0 12px -1px rgb(var(--holo) / 0.6);
    }
    .rows li.now b { color: rgb(var(--holo-soft)); }

    .gauge {
        position: relative;
        width: 120px;
        height: 120px;
        margin: 2px auto 6px;
    }
    .gauge svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .g-track { fill: none; stroke: rgb(var(--holo) / 0.12); stroke-width: 3; }
    .g-fill {
        fill: none;
        stroke: rgb(var(--holo));
        stroke-width: 3;
        stroke-linecap: round;
        stroke-dasharray: 226 302;
        filter: drop-shadow(0 0 4px rgb(var(--holo) / 0.7));
    }
    .g-fill2 {
        fill: none;
        stroke: rgb(var(--holo2));
        stroke-width: 3;
        stroke-linecap: round;
        stroke-dasharray: 120 214;
        opacity: 0.82;
        filter: drop-shadow(0 0 4px rgb(var(--holo2) / 0.5));
    }
    .gauge-read {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }
    .gauge-read b {
        font-family: var(--font-display);
        font-size: 30px;
        color: var(--text);
        line-height: 1;
    }
    .gauge-read span {
        font-family: var(--font-mono);
        font-size: 9px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--text-dim);
        margin-top: 4px;
    }
    .sparkrow { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
    .sparklab {
        font-family: var(--font-mono);
        font-size: 9px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--text-dim);
        white-space: nowrap;
    }
    .spark { flex: 1; height: 30px; }
    .spark polyline {
        fill: none;
        stroke: rgb(var(--holo-soft));
        stroke-width: 1.4;
        filter: drop-shadow(0 0 3px rgb(var(--holo-soft) / 0.7));
    }
    .spark-dot { fill: rgb(var(--holo-hot)); }

    .convo {
        position: absolute;
        left: 50%;
        bottom: 132px;
        transform: translateX(-50%);
        width: min(560px, 64vw);
        text-align: center;
        z-index: 20;
    }
    .user {
        display: inline-block;
        font-family: var(--font-mono);
        font-size: 11.5px;
        letter-spacing: 0.04em;
        color: var(--text-dim);
        background: rgb(var(--holo) / 0.06);
        border: 1px solid rgb(var(--holo) / 0.14);
        padding: 7px 14px;
        border-radius: 999px;
        margin-bottom: 18px;
    }
    .nero {
        font-family: var(--font-display);
        font-size: 23px;
        line-height: 1.42;
        color: var(--text);
        margin: 0;
        text-shadow: 0 0 26px rgb(var(--holo) / 0.18);
    }

    .dock-wrap {
        position: absolute;
        left: 50%;
        bottom: 34px;
        transform: translateX(-50%);
        z-index: 30;
    }
</style>
