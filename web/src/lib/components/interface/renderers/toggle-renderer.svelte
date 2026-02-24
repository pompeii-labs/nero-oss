<script lang="ts">
    import { Switch } from '$lib/components/ui/switch';
    import { Label } from '$lib/components/ui/label';

    let { component, checked = false, disabled = false, onAction }: {
        component: any;
        checked?: boolean;
        disabled?: boolean;
        onAction: (action: any) => Promise<any>;
    } = $props();

    function handleToggle(newValue: boolean) {
        onAction({ type: 'update', stateKey: component.stateKey, value: newValue });
        if (component.action) {
            onAction(component.action);
        }
    }
</script>

<div class="flex items-center justify-between gap-3 py-1">
    <Label class="text-sm text-foreground/80 font-normal">{component.label}</Label>
    <Switch
        {checked}
        {disabled}
        onCheckedChange={handleToggle}
        aria-label={component.label}
    />
</div>
