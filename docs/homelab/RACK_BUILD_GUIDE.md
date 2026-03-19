# Nero Homelab Rack Build Guide

> **Current State:** Pi 5 (8GB) arriving soon, Mac Mini M2 already in service, LIFX lights connected, music-reactive lighting system ready to deploy.
> **Goal:** Clean, expandable infrastructure that grows with your obsessions.

---

## Phase 1: The Starter Rack (Now - $200-300)

**The "I want clean cables and room to grow" phase**

### Rack Choice: 6U Wall Mount

**Recommended:** [NavePoint 6U Wall Mount Rack](https://www.amazon.com/dp/B00D7Y0EI4) (~$85)
- 19" standard width
- 12" depth (plenty for Pi + Mini + switch)
- Wall-mountable (saves desk space)
- Ships fast, solid reviews

**Alternative:** [StarTech 6U Wall Mount](https://www.amazon.com/dp/B00O6GNLQE) (~$120)
- Hinged design (swings out for access)
- Better if mounting in tight spaces

### What Fits in 6U:

```
[U6] Empty (future expansion)
[U5] Empty (future expansion)  
[U4] 1U Shelf → Mac Mini M2
[U3] 1U Raspberry Pi Rack Mount (holds 2-4 Pis)
[U2] 1U Managed Switch (8-port)
[U1] 1U Cable Management Panel
```

### Essential Hardware:

| Item | Purpose | Cost |
|------|---------|------|
| 6U Wall Rack | Mount everything | $85-120 |
| 1U Shelf (14") | Hold Mac Mini | $35 |
| Pi Rack Mount 1U | Holds 4x Pi 4/5 | $45 |
| Managed Switch 8-port | VLANs, monitoring | $40 |
| Cable management panel | Clean cables | $15 |
| Velcro cable ties | Sanity | $10 |
| Short patch cables (6") | Rack wiring | $15 |
| Mini UPS (650VA) | Battery backup | $60 |

**Phase 1 Total: ~$300-350**

---

## Phase 2: Network Upgrade (Month 2-3 - $150)

**The "I want VLANs and actual network engineering" phase**

### Upgrade Managed Switch

**UniFi Switch Lite 8 PoE** (~$109)
- 4 PoE ports (power Pi via ethernet!)
- UniFi ecosystem (pretty graphs)
- VLAN support
- CloudKey integration

**PoE HAT for Pi 5** (~$25)
- Powers Pi through ethernet cable
- One less power brick
- Cleaner rack

### Network Segmentation Plan:

```
VLAN 10: Management (Pi, Mini, switches)
VLAN 20: Trusted devices (your laptop, phone)
VLAN 30: IoT (LIFX, smart home stuff)
VLAN 40: Guest/IoT untrusted
VLAN 50: Lab/experimental
```

---

## Phase 3: Expansion (Month 4-6 - $300-500)

**The "I need more compute" phase**

### Move to 9U or 12U Rack

As you add:
- NAS (TrueNAS/FreeNAS) for storage
- Second Mini or Intel NUC
- Additional Pi cluster nodes
- UPS upgrade

### Pi Cluster Possibilities:

With the 1U Pi mount holding 4 Pis:
- **Pi 1:** Pi-hole + DNS + DHCP (infrastructure)
- **Pi 2:** Nero Command dashboard display
- **Pi 3:** Music-reactive lighting controller
- **Pi 4:** Experimental/development

---

## The Music-Reactive Lighting Rack Integration

Your Pi 5 running the lighting controller fits perfectly in the rack:

### Physical Setup:
```
Pi 5 (rack mounted)
  ↓ USB-C power
  ↓ Ethernet (PoE or patch)
  ↓ Audio out (if using local audio)
  → LIFX HTTP API calls over LAN
```

### Service Architecture:
```
┌─────────────────────────────────────────┐
│         Raspberry Pi 5 (8GB)            │
│  ┌─────────────────────────────────┐    │
│  │  Music-Reactive Lighting Service │    │
│  │  • Polls Spotify API            │    │
│  │  • Analyzes audio features      │    │
│  │  • Controls LIFX via LAN        │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │  Nero Command Dashboard         │    │
│  │  • System monitoring            │    │
│  │  • News/calendar display        │    │
│  │  • Ambient info panel           │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

---

## Power & UPS Strategy

**Don't skip this.** SD cards die on dirty shutdowns.

### Phase 1: APC Back-UPS 650VA (~$60)
- 4 outlets battery backed
- 4 outlets surge only
- USB connection to Pi for auto-shutdown
- ~20min runtime for Pi + Mini

### Phase 2: Rackmount UPS (~$200)
- When you upgrade to bigger rack
- 1U or 2U form factor
- Network management card
- Clean sine wave (better for electronics)

---

## Cabling Standards

**Color code from day one:**

| Color | Purpose |
|-------|---------|
| Blue | Management (switches, routers) |
| Green | Trusted devices |
| Yellow | IoT devices |
| Red | Internet/WAN |
| White | Cross-connects |

**Label everything:**
```
Pi-5-Lighting  [eth0]  →  Switch Port 3
Mac-Mini-M2    [eth0]  →  Switch Port 1
```

---

## The Full Build Checklist

### Immediate (This Week):
- [ ] Order 6U wall rack
- [ ] Order 1U shelf for Mini
- [ ] Order Pi rack mount
- [ ] Order managed switch
- [ ] Measure wall space for mounting

### Setup Day:
- [ ] Mount rack on wall
- [ ] Install cable management
- [ ] Mount Mini on shelf
- [ ] Mount Pi in rack
- [ ] Install switch
- [ ] Connect UPS
- [ ] Test boot sequence
- [ ] Update Pi homelab docs

### Post-Pi-5-Arrival:
- [ ] Install Pi 5 in rack
- [ ] Deploy music-reactive lighting
- [ ] Configure Nero Command dashboard
- [ ] Set up PoE if applicable
- [ ] Document the setup

---

## Future Expansion Ideas

### The "Nero Lab" Vision:

```
[12U Wall Rack]
[U12] Empty
[U11] Empty
[U10] 2U Mini Shelf (Mac Mini + NUC)
[U09] 1U KVM switch (if adding more boxes)
[U08] 1U Pi Rack (4x Pi cluster)
[U07] 1U Managed Switch 16-port
[U06] 2U NAS (4-bay, 8TB+ storage)
[U05] 1U Patch panel
[U04] 1U Cable management
[U03] 1U PDU (power distribution)
[U02] 2U UPS (rackmount)
[U01] 1U Blank panel (airflow)
```

### Possible Additions:
- **Intel NUC** for x86 workloads
- **4-bay NAS** for media storage (Plex?)
- **Additional Pi nodes** for K3s cluster
- **PoE cameras** for home security
- **Environmental sensors** (temp/humidity)

---

## Integration with Existing Services

### Nero Command (Dashboard Display):
- Runs on Pi 5 with display
- Shows: time, weather, calendar, news, system status
- Updates via your existing homelab endpoint

### Music-Reactive Lighting:
- Runs as systemd service on Pi 5
- Connects to Spotify API
- Controls LIFX via local network
- Visualizes currently playing track

### Pi-hole + DNS:
- Already running on existing Pi
- Move to rack-mounted Pi eventually
- Keep network-wide ad blocking

---

## Estimated Total Costs

| Phase | Components | Cost |
|-------|------------|------|
| Phase 1 | Rack + basics | $300-350 |
| Phase 2 | PoE + better switch | $150 |
| Phase 3 | Bigger rack + storage | $400-600 |
| **Total Year 1** | | **$850-1100** |

---

## Next Steps

1. **Decide on wall location** — needs power outlet, ethernet drop, and clearance to open
2. **Order Phase 1 hardware** — everything ships fast except maybe the rack
3. **Plan cable runs** — where does internet enter? where are the drops?
4. **Prep the Pi 5** — when it arrives, we rack it and deploy the lighting system

---

*This bridges your music platform obsession with infrastructure obsession. The Pi 5 becomes both the lighting controller and the dashboard display — one box, two purposes, clean rack setup.*
