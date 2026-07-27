import type { Component } from 'svelte';

import House from '@lucide/svelte/icons/house';
import Lightbulb from '@lucide/svelte/icons/lightbulb';
import Lamp from '@lucide/svelte/icons/lamp';
import Tv from '@lucide/svelte/icons/tv';
import Speaker from '@lucide/svelte/icons/speaker';
import Thermometer from '@lucide/svelte/icons/thermometer';
import Fan from '@lucide/svelte/icons/fan';
import Plug from '@lucide/svelte/icons/plug';
import DoorOpen from '@lucide/svelte/icons/door-open';
import Blinds from '@lucide/svelte/icons/blinds';
import Lock from '@lucide/svelte/icons/lock';
import LockOpen from '@lucide/svelte/icons/lock-open';
import Power from '@lucide/svelte/icons/power';
import Battery from '@lucide/svelte/icons/battery';
import Wifi from '@lucide/svelte/icons/wifi';

import Play from '@lucide/svelte/icons/play';
import Pause from '@lucide/svelte/icons/pause';
import SkipForward from '@lucide/svelte/icons/skip-forward';
import SkipBack from '@lucide/svelte/icons/skip-back';
import Music from '@lucide/svelte/icons/music';
import Volume2 from '@lucide/svelte/icons/volume-2';
import VolumeX from '@lucide/svelte/icons/volume-x';
import Headphones from '@lucide/svelte/icons/headphones';
import Video from '@lucide/svelte/icons/video';
import Film from '@lucide/svelte/icons/film';
import Mic from '@lucide/svelte/icons/mic';
import Radio from '@lucide/svelte/icons/radio';

import MessageSquare from '@lucide/svelte/icons/message-square';
import Mail from '@lucide/svelte/icons/mail';
import Phone from '@lucide/svelte/icons/phone';
import Send from '@lucide/svelte/icons/send';
import Bell from '@lucide/svelte/icons/bell';
import Users from '@lucide/svelte/icons/users';
import User from '@lucide/svelte/icons/user';

import Calendar from '@lucide/svelte/icons/calendar';
import Clock from '@lucide/svelte/icons/clock';
import Timer from '@lucide/svelte/icons/timer';
import AlarmClock from '@lucide/svelte/icons/alarm-clock';
import CircleCheck from '@lucide/svelte/icons/circle-check';
import List from '@lucide/svelte/icons/list';
import Flag from '@lucide/svelte/icons/flag';
import Bookmark from '@lucide/svelte/icons/bookmark';
import Star from '@lucide/svelte/icons/star';
import MapPin from '@lucide/svelte/icons/map-pin';

import Terminal from '@lucide/svelte/icons/terminal';
import Code from '@lucide/svelte/icons/code';
import GitBranch from '@lucide/svelte/icons/git-branch';
import Database from '@lucide/svelte/icons/database';
import Server from '@lucide/svelte/icons/server';
import Cloud from '@lucide/svelte/icons/cloud';
import Folder from '@lucide/svelte/icons/folder';
import File from '@lucide/svelte/icons/file';
import Download from '@lucide/svelte/icons/download';
import Upload from '@lucide/svelte/icons/upload';
import Link from '@lucide/svelte/icons/link';
import Search from '@lucide/svelte/icons/search';
import ChartColumn from '@lucide/svelte/icons/chart-column';
import TrendingUp from '@lucide/svelte/icons/trending-up';
import DollarSign from '@lucide/svelte/icons/dollar-sign';
import Briefcase from '@lucide/svelte/icons/briefcase';
import Book from '@lucide/svelte/icons/book';
import Pencil from '@lucide/svelte/icons/pencil';
import Clipboard from '@lucide/svelte/icons/clipboard';

import Globe from '@lucide/svelte/icons/globe';
import Map from '@lucide/svelte/icons/map';
import Navigation from '@lucide/svelte/icons/navigation';
import Car from '@lucide/svelte/icons/car';
import Plane from '@lucide/svelte/icons/plane';
import TrainFront from '@lucide/svelte/icons/train-front';
import Bike from '@lucide/svelte/icons/bike';

import Sun from '@lucide/svelte/icons/sun';
import Moon from '@lucide/svelte/icons/moon';
import CloudRain from '@lucide/svelte/icons/cloud-rain';
import Snowflake from '@lucide/svelte/icons/snowflake';
import Wind from '@lucide/svelte/icons/wind';

import Zap from '@lucide/svelte/icons/zap';
import RefreshCw from '@lucide/svelte/icons/refresh-cw';
import Settings from '@lucide/svelte/icons/settings';
import Wrench from '@lucide/svelte/icons/wrench';
import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
import Palette from '@lucide/svelte/icons/palette';
import Camera from '@lucide/svelte/icons/camera';
import Image from '@lucide/svelte/icons/image';
import Eye from '@lucide/svelte/icons/eye';
import Shield from '@lucide/svelte/icons/shield';
import Key from '@lucide/svelte/icons/key';
import Trash from '@lucide/svelte/icons/trash-2';
import Archive from '@lucide/svelte/icons/archive';
import Package from '@lucide/svelte/icons/package';
import Gift from '@lucide/svelte/icons/gift';
import Heart from '@lucide/svelte/icons/heart';
import Coffee from '@lucide/svelte/icons/coffee';
import Dumbbell from '@lucide/svelte/icons/dumbbell';
import Pill from '@lucide/svelte/icons/pill';
import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
import AudioLines from '@lucide/svelte/icons/audio-lines';
import Sparkles from '@lucide/svelte/icons/sparkles';
import Brain from '@lucide/svelte/icons/brain';
import Flame from '@lucide/svelte/icons/flame';
import Droplet from '@lucide/svelte/icons/droplet';
import Leaf from '@lucide/svelte/icons/leaf';
import PawPrint from '@lucide/svelte/icons/paw-print';

import Plus from '@lucide/svelte/icons/plus';
import Square from '@lucide/svelte/icons/square';

/** Keys mirror `api/src/services/actions/icons.ts`, which is the canonical list and
 *  the one Nero picks from. `plus` and `square` back built-in wedges and aren't in it. */
export const DIAL_ICONS: Record<string, Component> = {
    home: House,
    lightbulb: Lightbulb,
    lamp: Lamp,
    tv: Tv,
    speaker: Speaker,
    thermostat: Thermometer,
    fan: Fan,
    plug: Plug,
    door: DoorOpen,
    blinds: Blinds,
    lock: Lock,
    unlock: LockOpen,
    power: Power,
    battery: Battery,
    wifi: Wifi,

    play: Play,
    pause: Pause,
    next: SkipForward,
    prev: SkipBack,
    music: Music,
    volume: Volume2,
    mute: VolumeX,
    headphones: Headphones,
    video: Video,
    film: Film,
    mic: Mic,
    radio: Radio,

    chat: MessageSquare,
    mail: Mail,
    phone: Phone,
    send: Send,
    bell: Bell,
    users: Users,
    user: User,

    calendar: Calendar,
    clock: Clock,
    timer: Timer,
    alarm: AlarmClock,
    check: CircleCheck,
    list: List,
    flag: Flag,
    bookmark: Bookmark,
    star: Star,
    pin: MapPin,

    terminal: Terminal,
    code: Code,
    git: GitBranch,
    database: Database,
    server: Server,
    cloud: Cloud,
    folder: Folder,
    file: File,
    download: Download,
    upload: Upload,
    link: Link,
    search: Search,
    chart: ChartColumn,
    trending: TrendingUp,
    dollar: DollarSign,
    briefcase: Briefcase,
    book: Book,
    pencil: Pencil,
    clipboard: Clipboard,

    globe: Globe,
    map: Map,
    navigation: Navigation,
    car: Car,
    plane: Plane,
    train: TrainFront,
    bike: Bike,

    sun: Sun,
    moon: Moon,
    rain: CloudRain,
    snow: Snowflake,
    wind: Wind,

    zap: Zap,
    refresh: RefreshCw,
    settings: Settings,
    wrench: Wrench,
    sliders: SlidersHorizontal,
    palette: Palette,
    camera: Camera,
    image: Image,
    eye: Eye,
    shield: Shield,
    key: Key,
    trash: Trash,
    archive: Archive,
    package: Package,
    gift: Gift,
    heart: Heart,
    coffee: Coffee,
    dumbbell: Dumbbell,
    pill: Pill,
    cart: ShoppingCart,
    wave: AudioLines,
    sparkles: Sparkles,
    brain: Brain,
    flame: Flame,
    droplet: Droplet,
    leaf: Leaf,
    paw: PawPrint,

    plus: Plus,
    square: Square,
};

export function dialIcon(key: string): Component {
    return DIAL_ICONS[key] ?? Zap;
}
