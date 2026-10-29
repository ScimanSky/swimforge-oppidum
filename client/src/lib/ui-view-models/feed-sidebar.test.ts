import { describe, expect, it } from "vitest";
import { buildFeedSidebarVm } from "./feed-sidebar";

describe("buildFeedSidebarVm", () => {
  it("sottotitolo in italiano: livello o nuotatore", () => {
    const vm = buildFeedSidebarVm({
      suggestedUsers: [
        { userId: 1, name: "Ada", username: null, avatarUrl: null, level: 12 },
        { userId: 2, name: null, username: "bob", avatarUrl: null, level: null },
      ],
    });
    expect(vm.whoToFollow.map(user => user.subtitle)).toEqual(["Livello 12", "Nuotatore"]);
  });

  it("link del piè di pagina in italiano", () => {
    const vm = buildFeedSidebarVm({ suggestedUsers: [] });
    expect(vm.footerLinks.map(link => link.label)).toEqual(["Info", "Aiuto", "Privacy", "Termini"]);
  });
});
