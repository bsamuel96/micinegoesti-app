// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { User } from "../api/types";
import { VouchersPanel } from "./VouchersPanel";

vi.mock("../api/client", () => ({
  api: {
    gameRecordVoucherRule: vi.fn(),
    updateGameRecordVoucherRule: vi.fn(() => Promise.resolve({ rule: {} })),
    issueCurrentRecordVoucher: vi.fn(() => Promise.resolve({ voucher: {} })),
    adminGameCampaigns: vi.fn(),
    createGameCampaign: vi.fn(() => Promise.resolve({ campaign: {} })),
    updateGameCampaign: vi.fn(() => Promise.resolve({ campaign: {} })),
    finalizeGameCampaign: vi.fn(() => Promise.resolve({ result: {} })),
    cancelGameCampaign: vi.fn(() => Promise.resolve({ campaign: {} })),
    updateGameRewardMode: vi.fn(() => Promise.resolve({ mode: "instant_record" })),
    adminVouchers: vi.fn(),
    createVoucher: vi.fn(() => Promise.resolve({ voucher: {} })),
    approveVoucher: vi.fn(() => Promise.resolve({ voucher: {} })),
    revokeVoucher: vi.fn(() => Promise.resolve({ voucher: {} }))
  }
}));

const customer: User = {
  id: "customer-1",
  phone: "+40740000000",
  name: "Client Test",
  role: "customer",
  isActive: true
};

beforeEach(() => {
  vi.mocked(api.adminGameCampaigns).mockResolvedValue({
    mode: "campaign",
    campaigns: []
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <VouchersPanel users={[customer]} />
    </QueryClientProvider>
  );
}

describe("VouchersPanel", () => {
  it("renders and submits the game reward configuration", async () => {
    vi.mocked(api.gameRecordVoucherRule).mockResolvedValue({
      rule: {
        id: "rule-1",
        name: "Record reward",
        triggerType: "game_record",
        discountType: "percentage",
        discountValue: 15,
        maximumDiscount: null,
        minimumSubtotal: 50,
        validityDays: 14,
        codePrefix: "RECORD",
        requiresApproval: true,
        isActive: true,
        createdAt: "2026-07-24T10:00:00.000Z",
        updatedAt: "2026-07-24T10:00:00.000Z"
      },
      currentRecord: {
        id: "score-1",
        playerName: "SAM",
        bestScore: 200,
        user: null,
        isAnonymousSession: true,
        sessionKey: "session-123456",
        updatedAt: "2026-07-24T10:00:00.000Z"
      }
    });
    vi.mocked(api.adminVouchers).mockResolvedValue({ vouchers: [] });

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Premii joc" }));
    fireEvent.click(screen.getByRole("tab", { name: "Record instant" }));
    expect(await screen.findByDisplayValue("Record reward")).toBeVisible();
    expect(screen.getByText("SAM")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Salvează regula" }));

    await waitFor(() => expect(api.updateGameRecordVoucherRule).toHaveBeenCalled());
    const payload = vi.mocked(api.updateGameRecordVoucherRule).mock.calls[0]?.[0];
    expect(payload).toEqual(expect.objectContaining({ name: "Record reward" }));
    expect(payload).not.toHaveProperty("requiresApproval");
    expect(screen.queryByRole("option", { name: "Activează automat" })).not.toBeInTheDocument();
    expect(screen.getByText(/orice voucher câștigat prin joc rămâne în aprobare/i)).toBeVisible();
  });

  it("renders pending and active voucher actions", async () => {
    vi.mocked(api.gameRecordVoucherRule).mockResolvedValue({ rule: null, currentRecord: null });
    vi.mocked(api.adminVouchers).mockResolvedValue({
      vouchers: [
        {
          id: "voucher-pending",
          ruleId: null,
          code: "MICI-PENDING",
          name: "Voucher în aprobare",
          status: "pending",
          sourceType: "manual",
          recipient: { type: "public", label: "Public" },
          discountType: "fixed_amount",
          discountValue: 10,
          maximumDiscount: null,
          minimumSubtotal: 0,
          validFrom: "2026-07-24T10:00:00.000Z",
          expiresAt: null,
          maxRedemptions: 1,
          redemptionCount: 0,
          redemptions: [],
          createdAt: "2026-07-24T10:00:00.000Z",
          updatedAt: "2026-07-24T10:00:00.000Z"
        },
        {
          id: "voucher-active",
          ruleId: null,
          code: "MICI-ACTIVE",
          name: "Voucher activ",
          status: "active",
          sourceType: "manual",
          recipient: { id: "customer-1", phone: "+40740000000", name: "Client Test" },
          discountType: "percentage",
          discountValue: 15,
          maximumDiscount: null,
          minimumSubtotal: 0,
          validFrom: "2026-07-24T10:00:00.000Z",
          expiresAt: null,
          maxRedemptions: 1,
          redemptionCount: 0,
          redemptions: [],
          createdAt: "2026-07-24T10:00:00.000Z",
          updatedAt: "2026-07-24T10:00:00.000Z"
        }
      ]
    });

    renderPanel();
    const pendingName = await screen.findByText("Voucher în aprobare");
    expect(pendingName).toBeVisible();
    const table = screen.getByRole("table");
    expect(table.parentElement).toHaveClass("vouchers-table-wrap");
    const pendingRow = pendingName.closest("tr");
    expect(pendingRow).not.toBeNull();
    const approveButton = within(pendingRow as HTMLTableRowElement).getByRole("button", { name: /Aprobă/ });
    expect(approveButton).toBeVisible();
    expect(approveButton.closest("td")).toHaveAttribute("data-label", "Acțiuni");
    expect(screen.getAllByRole("button", { name: /Revocă/ })).toHaveLength(2);
  });

  it("creates a timed top-three campaign from the default tab", async () => {
    vi.mocked(api.adminVouchers).mockResolvedValue({ vouchers: [] });

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Premii joc" }));
    expect(await screen.findByRole("heading", { name: "Campanie cu clasament" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Creează și activează campania" }));

    await waitFor(() => expect(api.createGameCampaign).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.createGameCampaign).mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      firstPrizePercent: 15,
      secondPrizePercent: 10,
      thirdPrizePercent: 5,
      durationMinutes: 10_080
    }));
  });

  it("edits every setting and the end time of a live campaign", async () => {
    vi.mocked(api.adminVouchers).mockResolvedValue({ vouchers: [] });
    vi.mocked(api.adminGameCampaigns).mockResolvedValue({
      mode: "campaign",
      campaigns: [{
        id: "11111111-1111-4111-8111-111111111111",
        name: "Campanie reglabilă",
        status: "active",
        startsAt: "2026-07-28T08:00:00.000Z",
        endsAt: "2026-07-30T08:00:00.000Z",
        prizes: [15, 10, 5],
        maximumDiscount: 100,
        minimumSubtotal: 25,
        validityDays: 14,
        codePrefix: "VARA",
        participantCount: 12,
        createdAt: "2026-07-28T08:00:00.000Z",
        updatedAt: "2026-07-28T08:00:00.000Z"
      }]
    });

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Premii joc" }));
    const campaignName = await screen.findByText("Campanie reglabilă");
    const campaignRow = campaignName.closest("article");
    expect(campaignRow).not.toBeNull();
    const row = within(campaignRow as HTMLElement);

    fireEvent.click(row.getByRole("button", { name: "Editează toate setările" }));
    fireEvent.change(row.getByLabelText("Se încheie la"), {
      target: { value: "2026-08-02T18:30" }
    });
    fireEvent.change(row.getByLabelText("Locul 1"), {
      target: { value: "20" }
    });
    fireEvent.click(row.getByRole("button", { name: "Salvează toate modificările" }));

    await waitFor(() => expect(api.updateGameCampaign).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.updateGameCampaign).mock.calls[0]?.[0]).toBe(
      "11111111-1111-4111-8111-111111111111"
    );
    expect(vi.mocked(api.updateGameCampaign).mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      name: "Campanie reglabilă",
      firstPrizePercent: 20,
      secondPrizePercent: 10,
      thirdPrizePercent: 5,
      maximumDiscount: 100,
      minimumSubtotal: 25,
      validityDays: 14,
      codePrefix: "VARA"
    }));
  });

  it("keeps voucher listing, creation, and game rewards in separate workflows", async () => {
    vi.mocked(api.adminVouchers).mockResolvedValue({ vouchers: [] });

    renderPanel();
    expect(await screen.findByRole("heading", { name: "Vouchere emise" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Voucher nou" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Campanie cu clasament" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Emite voucher" }));
    expect(screen.getByRole("heading", { name: "Emite voucher nou" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Voucher nou" })).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Premii joc" }));
    expect(await screen.findByRole("heading", { name: "Campanie cu clasament" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Voucher nou" })).not.toBeInTheDocument();
  });
});
