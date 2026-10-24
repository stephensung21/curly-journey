export type PushMessage = { title: string; body: string; url: string };
export type PushClient = { send(tokens: string[], messages: PushMessage[]): Promise<{ invalidTokens: string[] }> };
