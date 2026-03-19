export interface DisplayDevice {
    id: string;
    name: string;
    connectedAt: number;
}

export interface NeroInterface {
    id: string;
    title: string;
    width: number;
    height: number;
    accentColor?: string;
    components: NeroComponent[];
    state?: Record<string, any>;
    triggers?: InterfaceTrigger[];
    targetDevice?: string;
    ambient?: boolean;
}

export type NeroComponent =
    | ButtonComponent
    | ToggleComponent
    | SliderComponent
    | TextComponent
    | TextInputComponent
    | SelectComponent
    | ImageComponent
    | ProgressComponent
    | ListComponent
    | SeparatorComponent
    | GridComponent
    | FlexComponent
    | IconComponent;

export interface BaseComponent {
    id: string;
    type: string;
    label?: string;
    visible?: boolean | string;
    disabled?: boolean | string;
}

export interface ButtonComponent extends BaseComponent {
    type: 'button';
    label: string;
    variant?: 'default' | 'primary' | 'destructive' | 'ghost';
    icon?: string;
    size?: 'sm' | 'md' | 'lg';
    action: InterfaceAction;
}

export interface ToggleComponent extends BaseComponent {
    type: 'toggle';
    label: string;
    stateKey: string;
    action?: InterfaceAction;
}

export interface SliderComponent extends BaseComponent {
    type: 'slider';
    label: string;
    min: number;
    max: number;
    step?: number;
    stateKey: string;
    action?: InterfaceAction;
}

export interface TextComponent extends BaseComponent {
    type: 'text';
    content: string;
    variant?: 'heading' | 'body' | 'caption' | 'mono';
}

export interface SeparatorComponent extends BaseComponent {
    type: 'separator';
}

export interface GridComponent extends BaseComponent {
    type: 'grid';
    columns: number;
    gap?: number;
    children: NeroComponent[];
}

export interface FlexComponent extends BaseComponent {
    type: 'flex';
    direction?: 'row' | 'column';
    gap?: number;
    align?: 'start' | 'center' | 'end' | 'stretch';
    justify?: 'start' | 'center' | 'end' | 'between';
    children: NeroComponent[];
}

export interface TextInputComponent extends BaseComponent {
    type: 'text-input';
    label?: string;
    placeholder?: string;
    stateKey: string;
    action?: InterfaceAction;
}

export interface SelectComponent extends BaseComponent {
    type: 'select';
    label?: string;
    options: { label: string; value: string }[];
    stateKey: string;
    action?: InterfaceAction;
}

export interface ImageComponent extends BaseComponent {
    type: 'image';
    src: string;
    alt?: string;
    fit?: 'cover' | 'contain' | 'fill';
    height?: number;
    borderRadius?: number;
}

export interface ProgressComponent extends BaseComponent {
    type: 'progress';
    label?: string;
    value: number | string;
    max?: number;
    color?: string;
}

export interface ListComponent extends BaseComponent {
    type: 'list';
    variant?: 'ordered' | 'unordered' | 'none';
    items: (string | NeroComponent)[];
}

export interface IconComponent extends BaseComponent {
    type: 'icon';
    name: string;
    size?: number;
    color?: string;
}

export type InterfaceAction =
    | { type: 'tool'; toolName: string; args?: Record<string, any>; resultKey?: string }
    | { type: 'command'; command: string; resultKey?: string }
    | { type: 'update'; stateKey: string; value: any }
    | { type: 'stream'; command: string; stateKey: string }
    | { type: 'kill'; stateKey: string };

export interface InterfaceUpdatePatch {
    title?: string;
    width?: number;
    height?: number;
    accentColor?: string;
    components?: NeroComponent[];
    addComponents?: NeroComponent[];
    removeComponentIds?: string[];
    state?: Record<string, any>;
}

export type InterfaceEvent =
    | { type: 'update'; patch: InterfaceUpdatePatch }
    | { type: 'close' }
    | { type: 'state_change'; key: string; value: any };

export type InterfaceTrigger =
    | { type: 'onOpen'; action: InterfaceAction }
    | { type: 'interval'; action: InterfaceAction; intervalMs: number };

export type GlobalInterfaceEvent =
    | { type: 'opened'; iface: NeroInterface }
    | { type: 'closed'; id: string }
    | { type: 'moved'; id: string; fromDevice?: string; toDevice: string }
    | { type: 'voice_migrate'; targetDevice: string }
    | { type: 'presence'; display: string }
    | { type: 'device_connected'; deviceName: string }
    | { type: 'device_disconnected'; deviceName: string }
    | { type: 'ambient_suppress'; displayName: string }
    | { type: 'ambient_restore'; displayName: string; iface: NeroInterface };
