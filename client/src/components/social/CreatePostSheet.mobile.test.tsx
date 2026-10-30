import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreatePostSheet } from "./CreatePostSheet";

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  toastSuccess: vi.fn(),
  invalidateFeed: vi.fn(),
  imageKitMutateAsync: vi.fn(),
  postImageUploadMutateAsync: vi.fn(),
  cloudinaryMutateAsync: vi.fn(),
  createTextPostMutateAsync: vi.fn(),
  trackCelebrationMutate: vi.fn(),
  people: [] as any[],
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    warning: mocks.toastWarning,
    success: mocks.toastSuccess,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      community: {
        feed: {
          invalidate: mocks.invalidateFeed,
        },
      },
    }),
    community: {
      postImageKitAuth: {
        useMutation: () => ({
          mutateAsync: mocks.imageKitMutateAsync,
          isPending: false,
        }),
      },
      postUploadImage: {
        useMutation: () => ({
          mutateAsync: mocks.postImageUploadMutateAsync,
          isPending: false,
        }),
      },
      cloudinaryVideoAuth: {
        useMutation: () => ({
          mutateAsync: mocks.cloudinaryMutateAsync,
          isPending: false,
        }),
      },
      users: {
        search: {
          useQuery: (_input: unknown, options?: { enabled?: boolean }) => ({
            data: options?.enabled === false ? undefined : mocks.people,
          }),
        },
      },
      createTextPost: {
        useMutation: () => ({
          mutateAsync: mocks.createTextPostMutateAsync,
          isPending: false,
        }),
      },
    },
    records: {
      trackCelebrationAction: {
        useMutation: () => ({
          mutate: mocks.trackCelebrationMutate,
        }),
      },
    },
  },
}));

vi.mock("./ShareActivityPicker", () => ({
  ShareActivityPicker: () => <div data-testid="share-activity-picker">share-picker</div>,
}));

describe("CreatePostSheet mobile media interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.people = [];
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:preview-media"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("adds and removes a valid image media preview", async () => {
    render(<CreatePostSheet open onOpenChange={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /nuovo post/i }));

    const input = document.querySelector("input[type='file'][multiple]") as HTMLInputElement | null;
    expect(input).not.toBeNull();

    const file = new File(["img"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input!, { target: { files: [file] } });

    expect(await screen.findByAltText("Anteprima media")).toBeInTheDocument();
    expect(screen.getByText("1/4 media")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /rimuovi media/i }));
    expect(screen.queryByAltText("Anteprima media")).not.toBeInTheDocument();
  });

  it("shows toast error for unsupported file format", async () => {
    render(<CreatePostSheet open onOpenChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /nuovo post/i }));

    const input = document.querySelector("input[type='file'][multiple]") as HTMLInputElement | null;
    const badFile = new File(["doc"], "notes.pdf", { type: "application/pdf" });
    fireEvent.change(input!, { target: { files: [badFile] } });

    expect(mocks.toastError).toHaveBeenCalledWith(
      "Formato non supportato. Usa JPG, PNG, WEBP, MP4, WEBM o MOV."
    );
  });

  it("mentions with «@» in the text: no separate tag field, no hashtags; the picked ids are sent", async () => {
    mocks.people = [{ userId: 5, name: "Ada Rossi", username: "ada", avatarUrl: null }];
    mocks.createTextPostMutateAsync.mockResolvedValue({ success: true, postId: 1 });
    render(<CreatePostSheet open onOpenChange={() => {}} />);
    expect(screen.getByText("Testo, foto, video e menzioni con @")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /nuovo post/i }));
    expect(screen.queryByText("Tagga amici")).toBeNull();
    expect(screen.queryByPlaceholderText("Cerca per nome o username")).toBeNull();

    const field = screen.getByRole("textbox", { name: "Testo del post" });
    await userEvent.type(field, "Bella vasca con @ad");
    await userEvent.click(await screen.findByRole("option", { name: /Ada Rossi/ }));
    await userEvent.type(field, "#soglia");
    expect(screen.queryByText("Hashtag rilevati")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Pubblica" }));
    expect(mocks.createTextPostMutateAsync).toHaveBeenCalledWith({
      content: "Bella vasca con @ada #soglia",
      mediaUrls: [],
      mediaUrl: null,
      taggedUserIds: [5],
    });
  });
});
