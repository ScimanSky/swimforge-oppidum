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
          useQuery: () => ({
            data: [],
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
  },
}));

vi.mock("./ShareActivityPicker", () => ({
  ShareActivityPicker: () => <div data-testid="share-activity-picker">share-picker</div>,
}));

vi.mock("./StoryCreator", () => ({
  StoryCreator: () => <div data-testid="story-creator">story-creator</div>,
}));

describe("CreatePostSheet mobile media interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
