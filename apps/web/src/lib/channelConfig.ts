/**
 * Builds the Gateway config patch for a channel connection.
 * Shared between ChannelSetupModal (initial setup) and
 * DashboardPage (resume after billing redirect).
 */
export function buildChannelPatch(
    channel: string,
    token: string,
    appToken: string | undefined,
    ownerUserId: string,
): Record<string, unknown> {
    const ch = channel.toLowerCase();
    const ownerAllowFrom = [ownerUserId.trim()];
    let channelConfig: Record<string, unknown>;

    switch (ch) {
        case 'telegram':
            channelConfig = { enabled: true, botToken: token, dmPolicy: 'allowlist', allowFrom: ownerAllowFrom };
            break;
        case 'discord':
            channelConfig = { enabled: true, token, dmPolicy: 'allowlist', allowFrom: ownerAllowFrom, dm: { enabled: true } };
            break;
        case 'slack':
            channelConfig = { enabled: true, botToken: token, appToken: appToken!, dmPolicy: 'allowlist', allowFrom: ownerAllowFrom, dm: { enabled: true } };
            break;
        default:
            channelConfig = {};
    }

    return {
        channels: { [ch]: channelConfig },
        agents: {
            defaults: {
                model: {
                    primary: 'closeclaw-google/gemini-3-flash-preview',
                    fallbacks: ['closeclaw-anthropic/claude-sonnet-4-6', 'closeclaw-openai/gpt-5.2-codex'],
                },
                models: {
                    'closeclaw-google/gemini-3-flash-preview': { alias: 'Gemini' },
                    'closeclaw-anthropic/claude-sonnet-4-6': { alias: 'Sonnet' },
                    'closeclaw-openai/gpt-5.2-codex': { alias: 'Codex' },
                },
            },
        },
        browser: {
            enabled: true,
            noSandbox: true,
            headless: true,
        },
        session: { dmScope: 'main' },
    };
}
