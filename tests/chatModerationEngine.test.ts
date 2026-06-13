import {
  COMMUNITY_GUIDELINES_MESSAGE,
  moderateChatText,
} from '../lib/chatModerationEngine';

describe('chatModerationEngine', () => {
  it('blocks profanity', () => {
    const v = moderateChatText({ text: 'what the fuck', maxLength: 500 });
    expect(v.allowed).toBe(false);
    if (!v.allowed) {
      expect(v.userMessage).toBe(COMMUNITY_GUIDELINES_MESSAGE);
      expect(v.category).toBe('profanity');
    }
  });

  it('blocks hate speech', () => {
    const v = moderateChatText({ text: 'kys loser', maxLength: 500 });
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.category).toBe('hate_speech');
  });

  it('blocks threats', () => {
    const v = moderateChatText({ text: "i'll kill you", maxLength: 500 });
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.category).toBe('threats');
  });

  it('blocks credit card numbers', () => {
    const v = moderateChatText({
      text: 'my card is 4111 1111 1111 1111',
      maxLength: 500,
    });
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.category).toBe('pii');
  });

  it('allows normal food coordination', () => {
    const v = moderateChatText({ text: 'Meet at the lobby at 6?', maxLength: 500 });
    expect(v.allowed).toBe(true);
  });
});
