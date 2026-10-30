import { describe, expect, it } from "vitest";
import { activeMentionQuery, addMention, insertMention, pickedMentionIds, taggedUsersNotInText } from "./mentions";

describe("activeMentionQuery", () => {
  it("is the word typed after «@» right before the caret", () => {
    expect(activeMentionQuery("Ciao @ad", 8)).toEqual({ start: 5, query: "ad" });
    expect(activeMentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(activeMentionQuery("Ciao @adà e", 9)).toEqual({ start: 5, query: "adà" });
  });

  it("nothing after a space, inside an email or with the caret elsewhere", () => {
    expect(activeMentionQuery("Ciao @ada ", 10)).toBeNull();
    expect(activeMentionQuery("mario@ada", 9)).toBeNull();
    expect(activeMentionQuery("Ciao @ada e poi", 15)).toBeNull();
    expect(activeMentionQuery("nessuna", 7)).toBeNull();
  });
});

describe("insertMention", () => {
  it("replaces the typed «@query» with the token and one space, caret after it", () => {
    expect(insertMention("Vasca con @ad oggi", { start: 10, end: 13 }, "@ada")).toEqual({
      text: "Vasca con @ada oggi",
      caret: 15,
    });
    expect(insertMention("@B", { start: 0, end: 2 }, "@Bea")).toEqual({ text: "@Bea ", caret: 5 });
  });
});

describe("addMention / pickedMentionIds", () => {
  const ada = { userId: 5, name: "Ada Rossi", username: "ada" };
  const bea = { userId: 6, name: "Bea", username: null };

  it("adds once, at most ten", () => {
    expect(addMention([ada], ada)).toEqual([ada]);
    const many = Array.from({ length: 10 }, (_, index) => ({ userId: index + 10, name: null, username: `u${index}` }));
    expect(addMention(many, ada)).toHaveLength(10);
  });

  it("sends only the picked users still written in the text", () => {
    expect(pickedMentionIds("Grazie @ada", [ada, bea])).toEqual([5]);
    expect(pickedMentionIds("Grazie @Ada Rossi e @bea", [ada, bea])).toEqual([5, 6]);
    expect(pickedMentionIds("", [ada])).toEqual([]);
  });
});

describe("taggedUsersNotInText", () => {
  it("only the tagged users not written in the text (old posts tagged people apart)", () => {
    const tagged = [
      { user_id: 5, name: "Ada Rossi", username: "ada" },
      { user_id: 6, name: "Bea", username: null },
    ];
    expect(taggedUsersNotInText("Con @ada", tagged)).toEqual([tagged[1]]);
    expect(taggedUsersNotInText(null, tagged)).toEqual(tagged);
  });
});
