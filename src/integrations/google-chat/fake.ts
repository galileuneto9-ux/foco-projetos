export class FakeGoogleChat {
  readonly sent: { spaceId: string; text: string }[] = [];

  async sendMessage(input: { spaceId: string; text: string }) {
    this.sent.push(input);
    return { ok: true, messageId: `fake-chat-${this.sent.length}` };
  }
}

export class RecordingWhatsapp {
  readonly sent: { to: string; text: string }[] = [];

  async sendText(input: { to: string; text: string }) {
    this.sent.push(input);
    return { ok: true, messageId: `fake-wa-${this.sent.length}` };
  }
}
