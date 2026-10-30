import { describe, expect, it } from "vitest";
import { findMentions, mentionToken, mentionedIds } from "./mentions";

const ada = { id: 5, name: "Ada Rossi", username: "ada" };
const bea = { id: 6, name: "Bea", username: null };
const anon = { id: 7, name: null, username: null };

describe("mentionToken", () => {
  it("is @username, else @name, else nothing", () => {
    expect(mentionToken(ada)).toBe("@ada");
    expect(mentionToken(bea)).toBe("@Bea");
    expect(mentionToken(anon)).toBeNull();
    expect(mentionToken({ id: 8, name: "  ", username: "  " })).toBeNull();
  });
});

describe("findMentions", () => {
  it("finds @username and @name, case-insensitive, with their positions", () => {
    const text = "Grazie @ADA e @bea!";
    expect(findMentions(text, [ada, bea])).toEqual([
      { start: 7, end: 11, id: 5 },
      { start: 14, end: 18, id: 6 },
    ]);
  });

  it("matches a full name with spaces, the longest token first", () => {
    const other = { id: 9, name: "Ada", username: null };
    expect(findMentions("con @Ada Rossi oggi", [other, ada])).toEqual([{ start: 4, end: 14, id: 5 }]);
  });

  it("needs a word boundary: not inside an email, not a longer word", () => {
    expect(findMentions("scrivi a mario@ada.it", [ada])).toEqual([]);
    expect(findMentions("@adamo è un altro", [ada])).toEqual([]);
    expect(findMentions("(@ada), @ada.", [ada]).map((m) => m.start)).toEqual([1, 8]);
  });

  it("finds accented names", () => {
    const nico = { id: 10, name: "Nicolò", username: null };
    expect(findMentions("bravo @nicolò", [nico])).toEqual([{ start: 6, end: 13, id: 10 }]);
  });

  it("ignores users without a token", () => {
    expect(findMentions("@ ciao", [anon])).toEqual([]);
  });
});

describe("mentionedIds", () => {
  it("keeps the ids still written in the text, once each, in the given order", () => {
    expect(mentionedIds("@bea e @ada e ancora @ada", [ada, bea, anon])).toEqual([5, 6]);
    expect(mentionedIds("nessuna menzione", [ada])).toEqual([]);
    expect(mentionedIds(null, [ada])).toEqual([]);
  });
});
