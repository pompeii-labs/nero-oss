<script lang="ts">
    import * as Dialog from '$lib/components/ui/dialog';
    import { Button } from '$lib/components/ui/button';
    import type { ToolActivity } from '$lib/actions/chat';
    import { respondToPermission } from '$lib/actions/chat';
    import ShieldAlert from '@lucide/svelte/icons/shield-alert';
    import Zap from '@lucide/svelte/icons/zap';

    type Props = {
        open: boolean;
        permissionId: string;
        activity: ToolActivity;
        onResponse: () => void;
    };

    let { open = $bindable(), permissionId, activity, onResponse }: Props = $props();
    let responding = $state(false);
    let responded = $state(false);

    async function handleResponse(approved: boolean) {
        responding = true;
        responded = true;
        await respondToPermission(permissionId, approved);
        responding = false;
        open = false;
        onResponse();
    }

    function handleOpenChange(isOpen: boolean) {
        if (!isOpen && !responded && !responding) {
            respondToPermission(permissionId, false);
            onResponse();
        }
        if (isOpen) {
            responded = false;
        }
    }
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
    <Dialog.Content class="sm:max-w-lg glass-panel border-primary/20">
        <Dialog.Header>
            <Dialog.Title class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/30">
                    <ShieldAlert class="h-5 w-5 text-amber-400" />
                </div>
                <span>Permission Required</span>
            </Dialog.Title>
            <Dialog.Description class="pt-2">
                Nero wants to use the <span class="font-mono font-semibold text-primary">{activity.tool}</span> tool
            </Dialog.Description>
        </Dialog.Header>

        <div class="space-y-3 py-4">
            <div>
                <span class="text-xs text-muted-foreground uppercase tracking-wide">Arguments</span>
                <pre class="mt-2 max-h-64 overflow-auto rounded-xl bg-background/50 border border-border/30 p-4 font-mono text-xs text-foreground/80 whitespace-pre-wrap break-all">{JSON.stringify(activity.args, null, 2)}</pre>
            </div>
        </div>

        <Dialog.Footer class="flex gap-3 sm:justify-end">
            <Button
                variant="outline"
                onclick={() => handleResponse(false)}
                disabled={responding}
                class="border-border/50 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400"
            >
                Deny
            </Button>
            <Button
                onclick={() => handleResponse(true)}
                disabled={responding}
                class="bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            >
                <Zap class="h-4 w-4 mr-2" />
                {responding ? 'Approving...' : 'Approve'}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
