import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clipboard, List, Plus, Send, ShieldCheck, Trophy, XCircle } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
import type { IssuedVoucher, User, VoucherDiscountType, VoucherRule } from "../api/types";
import {
  DashboardPanelHeader,
  DashboardPanelTabs,
  EmptyState,
  StatusBadge
} from "../components/dashboard/DashboardPrimitives";
import { GameCampaignAdmin, RewardModeButton } from "./GameCampaignAdmin";

type VouchersPanelProps = {
  users: User[];
};

type VoucherFilters = {
  search: string;
  status: string;
  source: string;
  recipient: string;
};

const statusLabels: Record<IssuedVoucher["status"], string> = {
  pending: "În aprobare",
  active: "Activ",
  redeemed: "Folosit",
  revoked: "Revocat",
  expired: "Expirat"
};

const sourceLabels: Record<IssuedVoucher["sourceType"], string> = {
  manual: "Manual",
  game_record: "Record joc",
  game_campaign: "Campanie joc"
};

function formatMoney(value: number) {
  return `${value.toFixed(2)} lei`;
}

function formatDate(value?: string | null) {
  if (!value) return "Fără limită";
  return new Date(value).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function discountLabel(voucher: Pick<IssuedVoucher, "discountType" | "discountValue" | "maximumDiscount">) {
  const base = voucher.discountType === "percentage" ? `${voucher.discountValue}%` : formatMoney(voucher.discountValue);
  return voucher.discountType === "percentage" && voucher.maximumDiscount ? `${base}, max. ${formatMoney(voucher.maximumDiscount)}` : base;
}

function recipientLabel(voucher: IssuedVoucher) {
  if ("phone" in voucher.recipient) return voucher.recipient.name || voucher.recipient.phone;
  return voucher.recipient.label;
}

function statusTone(status: IssuedVoucher["status"]) {
  if (status === "active") return "success";
  if (status === "pending") return "warning";
  if (status === "redeemed") return "brand";
  return "danger";
}

function dateTimeValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function dateTimePayload(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  return raw ? new Date(raw).toISOString() : null;
}

function defaultRule(rule: VoucherRule | null | undefined) {
  return {
    enabled: rule?.isActive ?? false,
    name: rule?.name ?? "Recompensă record joc",
    discountType: rule?.discountType ?? "percentage",
    discountValue: rule?.discountValue ?? 15,
    maximumDiscount: rule?.maximumDiscount ?? "",
    minimumSubtotal: rule?.minimumSubtotal ?? 0,
    validityDays: rule?.validityDays ?? 14,
    codePrefix: rule?.codePrefix ?? "RECORD"
  };
}

export function VouchersPanel({ users }: VouchersPanelProps) {
  const [filters, setFilters] = useState<VoucherFilters>({ search: "", status: "all", source: "all", recipient: "" });
  const [section, setSection] = useState<"list" | "create" | "rewards">("list");
  const [rewardTab, setRewardTab] = useState<"campaigns" | "instant-record">("campaigns");
  const queryClient = useQueryClient();
  const gameRule = useQuery({
    queryKey: ["voucher-rule-game-record"],
    queryFn: () => api.gameRecordVoucherRule(),
    enabled: section === "rewards" && rewardTab === "instant-record"
  });
  const vouchers = useQuery({
    queryKey: ["admin-vouchers", filters],
    queryFn: () => api.adminVouchers(filters),
    enabled: section === "list"
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["voucher-rule-game-record"] });
    queryClient.invalidateQueries({ queryKey: ["admin-game-campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["game-leaderboard"] });
    queryClient.invalidateQueries({ queryKey: ["admin-vouchers"] });
  }

  const panelTitle = section === "list"
    ? "Vouchere emise"
    : section === "create"
      ? "Emite voucher nou"
      : "Campanii și premii";
  const panelDescription = section === "list"
    ? "Caută, aprobă și urmărește toate voucherele emise."
    : section === "create"
      ? "Creează un voucher separat de joc pentru un client sau pentru public."
      : "Configurează premiile campaniilor și metoda alternativă pentru recordul general.";

  return (
    <div className="vouchers-panel management-panel">
      <DashboardPanelHeader
        eyebrow="Administrare"
        title={panelTitle}
        description={panelDescription}
        actions={
          <DashboardPanelTabs
            label="Secțiuni vouchere"
            value={section}
            options={[
              { value: "list", label: "Vouchere emise", icon: <List aria-hidden="true" size={19} /> },
              { value: "create", label: "Emite voucher", icon: <Plus aria-hidden="true" size={19} /> },
              { value: "rewards", label: "Premii joc", icon: <Trophy aria-hidden="true" size={19} /> }
            ]}
            onChange={setSection}
          />
        }
      />

      {section === "rewards" ? (
        <section className="voucher-reward-methods" aria-labelledby="voucher-reward-methods-title">
          <div className="voucher-reward-methods-heading">
            <div>
              <span className="dashboard-eyebrow">Joc</span>
              <h3 id="voucher-reward-methods-title">Metoda de premiere</h3>
            </div>
            <div className="voucher-method-tabs" role="tablist" aria-label="Metoda de premiere a jocului">
              <button
                id="campaigns-tab"
                type="button"
                role="tab"
                aria-selected={rewardTab === "campaigns"}
                aria-controls="campaigns-panel"
                onClick={() => setRewardTab("campaigns")}
              >
                Campanii cu timer
              </button>
              <button
                id="instant-record-tab"
                type="button"
                role="tab"
                aria-selected={rewardTab === "instant-record"}
                aria-controls="instant-record-panel"
                onClick={() => setRewardTab("instant-record")}
              >
                Record instant
              </button>
            </div>
          </div>

          {rewardTab === "campaigns" ? (
            <div id="campaigns-panel" role="tabpanel" aria-labelledby="campaigns-tab">
              <GameCampaignAdmin />
            </div>
          ) : (
            <div id="instant-record-panel" role="tabpanel" aria-labelledby="instant-record-tab" className="instant-record-panel">
              <div className="voucher-mode-activation">
                <div>
                  <strong>Metoda veche este păstrată integral</strong>
                  <p>Activeaz-o doar când vrei ca un nou record general să primească voucher.</p>
                </div>
                <RewardModeButton mode="instant_record" onDone={invalidate} />
              </div>
              <GameRecordRuleForm
                key={gameRule.data?.rule?.id ?? "new-record-rule"}
                rule={gameRule.data?.rule ?? null}
                currentRecord={gameRule.data?.currentRecord ?? null}
                loading={gameRule.isLoading}
                onDone={invalidate}
              />
            </div>
          )}
        </section>
      ) : section === "create" ? (
        <section className="management-create-section voucher-manual-section" aria-labelledby="manual-voucher-title">
          <ManualVoucherForm
            users={users.filter((user) => user.role === "customer")}
            onDone={() => {
              invalidate();
              setSection("list");
            }}
          />
        </section>
      ) : (
        <section className="management-list-section">
          <div className="voucher-filters">
            <label className="dashboard-field">
              <span>Caută</span>
              <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Cod, nume, destinatar" />
            </label>
            <label className="dashboard-field">
              <span>Status</span>
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                <option value="all">Toate</option>
                {Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label className="dashboard-field">
              <span>Sursă</span>
              <select value={filters.source} onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value }))}>
                <option value="all">Toate</option>
                <option value="manual">Manual</option>
                <option value="game_record">Record joc</option>
                <option value="game_campaign">Campanie joc</option>
              </select>
            </label>
          </div>

          <IssuedVouchersTable vouchers={vouchers.data?.vouchers ?? []} loading={vouchers.isLoading} onDone={invalidate} />
          <p className="products-count" aria-live="polite">{vouchers.data?.vouchers.length ?? 0} vouchere afișate</p>
        </section>
      )}
    </div>
  );
}

function GameRecordRuleForm({
  rule,
  currentRecord,
  loading,
  onDone
}: {
  rule: VoucherRule | null;
  currentRecord: Awaited<ReturnType<typeof api.gameRecordVoucherRule>>["currentRecord"] | null;
  loading: boolean;
  onDone: () => void;
}) {
  const initial = defaultRule(rule);
  const [discountType, setDiscountType] = useState<VoucherDiscountType>(initial.discountType as VoucherDiscountType);
  const mutation = useMutation({
    mutationFn: (payload: unknown) => api.updateGameRecordVoucherRule(payload),
    onSuccess: onDone
  });
  const issueMutation = useMutation({
    mutationFn: () => api.issueCurrentRecordVoucher(),
    onSuccess: onDone
  });

  return (
    <form
      className="admin-form voucher-form"
      key={rule?.id ?? "new-record-rule"}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        mutation.mutate({
          enabled: form.get("enabled") === "on",
          name: form.get("name"),
          discountType: form.get("discountType"),
          discountValue: Number(form.get("discountValue")),
          maximumDiscount: form.get("maximumDiscount") ? Number(form.get("maximumDiscount")) : null,
          minimumSubtotal: Number(form.get("minimumSubtotal") || 0),
          validityDays: form.get("validityDays") ? Number(form.get("validityDays")) : null,
          codePrefix: form.get("codePrefix")
        });
      }}
    >
      <div className="voucher-form-head">
        <div>
          <span className="dashboard-eyebrow">Record joc</span>
          <h3>Recompensă pentru record</h3>
        </div>
        <StatusBadge tone={initial.enabled ? "success" : "neutral"}>{initial.enabled ? "Activă" : "Oprită"}</StatusBadge>
      </div>
      <label className="checkbox-row"><input name="enabled" type="checkbox" defaultChecked={initial.enabled} /> Recompensa este activă</label>
      <label className="dashboard-field"><span>Nume recompensă</span><input name="name" defaultValue={initial.name} required /></label>
      <div className="voucher-two-cols">
        <label className="dashboard-field"><span>Tip discount</span>
          <select name="discountType" defaultValue={initial.discountType} onChange={(event) => setDiscountType(event.target.value as VoucherDiscountType)}>
            <option value="percentage">Procent</option>
            <option value="fixed_amount">Sumă fixă</option>
          </select>
        </label>
        <label className="dashboard-field"><span>Valoare</span><input name="discountValue" type="number" step="0.01" min="0.01" defaultValue={initial.discountValue} required /></label>
      </div>
      {discountType === "percentage" && (
        <label className="dashboard-field"><span>Discount maxim opțional</span><input name="maximumDiscount" type="number" step="0.01" min="0" defaultValue={initial.maximumDiscount} /></label>
      )}
      <div className="voucher-two-cols">
        <label className="dashboard-field"><span>Subtotal minim</span><input name="minimumSubtotal" type="number" step="0.01" min="0" defaultValue={initial.minimumSubtotal} /></label>
        <label className="dashboard-field"><span>Zile valabilitate</span><input name="validityDays" type="number" min="1" defaultValue={initial.validityDays} /></label>
      </div>
      <label className="dashboard-field"><span>Prefix cod</span><input name="codePrefix" defaultValue={initial.codePrefix} required /></label>
      <p className="voucher-security-notice" role="status">
        <ShieldCheck aria-hidden="true" size={18} />
        Protecție activă: orice voucher câștigat prin joc rămâne în aprobare până când un administrator verifică scorul și îl activează manual.
      </p>
      <section className="voucher-current-record" aria-label="Record curent">
        <h4>Record curent</h4>
        {loading ? (
          <p>Se încarcă recordul...</p>
        ) : currentRecord ? (
          <>
            <dl>
              <div><dt>Jucător</dt><dd>{currentRecord.playerName ?? "MIC"}</dd></div>
              <div><dt>Scor</dt><dd>{currentRecord.bestScore}</dd></div>
              <div><dt>Utilizator</dt><dd>{currentRecord.user ? currentRecord.user.name || currentRecord.user.phone : "Sesiune anonimă"}</dd></div>
              <div><dt>Actualizat</dt><dd>{formatDate(currentRecord.updatedAt)}</dd></div>
            </dl>
            <button className="secondary-button" type="button" disabled={issueMutation.isPending} onClick={() => issueMutation.mutate()}>
              <Send size={17} /> {issueMutation.isPending ? "Se emite..." : "Emite voucher pentru recordul actual"}
            </button>
          </>
        ) : (
          <p>Nu există încă un record eligibil.</p>
        )}
      </section>
      <button className="primary-button" disabled={mutation.isPending}>{mutation.isPending ? "Se salvează..." : "Salvează regula"}</button>
      {(mutation.error || issueMutation.error) && <p className="form-error">{(mutation.error || issueMutation.error)?.message}</p>}
    </form>
  );
}

function ManualVoucherForm({ users, onDone }: { users: User[]; onDone: () => void }) {
  const [recipientType, setRecipientType] = useState("public");
  const [discountType, setDiscountType] = useState<VoucherDiscountType>("percentage");
  const mutation = useMutation({
    mutationFn: (payload: unknown) => api.createVoucher(payload),
    onSuccess: (_data, _variables, _context) => onDone()
  });

  return (
    <form
      className="admin-form voucher-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        mutation.mutate({
          code: form.get("code") || null,
          name: form.get("name"),
          description: form.get("description") || null,
          recipientType: form.get("recipientType"),
          userId: form.get("userId") || null,
          discountType: form.get("discountType"),
          discountValue: Number(form.get("discountValue")),
          maximumDiscount: form.get("maximumDiscount") ? Number(form.get("maximumDiscount")) : null,
          minimumSubtotal: Number(form.get("minimumSubtotal") || 0),
          validFrom: dateTimePayload(form.get("validFrom")),
          expiresAt: dateTimePayload(form.get("expiresAt")),
          maxRedemptions: Number(form.get("maxRedemptions") || 1),
          activeImmediately: form.get("activeImmediately") === "on"
        });
      }}
    >
      <div className="voucher-form-head">
        <div>
          <span className="dashboard-eyebrow">Manual</span>
          <h3 id="manual-voucher-title">Voucher nou</h3>
        </div>
      </div>
      <label className="dashboard-field"><span>Cod opțional</span><input name="code" placeholder="MICI-AB12CD34" /></label>
      <label className="dashboard-field"><span>Nume / descriere internă</span><input name="name" placeholder="Voucher client fidel" required /></label>
      <label className="dashboard-field"><span>Note interne</span><textarea name="description" rows={2} /></label>
      <label className="dashboard-field"><span>Destinatar</span>
        <select name="recipientType" value={recipientType} onChange={(event) => setRecipientType(event.target.value)}>
          <option value="public">Public / purtător</option>
          <option value="customer">Client existent</option>
          <option value="current_record_holder">Record curent joc</option>
        </select>
      </label>
      {recipientType === "customer" && (
        <label className="dashboard-field"><span>Client</span>
          <select name="userId" required>
            <option value="">Alege clientul</option>
            {users.map((user) => <option value={user.id} key={user.id}>{user.name || user.phone}</option>)}
          </select>
        </label>
      )}
      <div className="voucher-two-cols">
        <label className="dashboard-field"><span>Tip discount</span>
          <select name="discountType" value={discountType} onChange={(event) => setDiscountType(event.target.value as VoucherDiscountType)}>
            <option value="percentage">Procent</option>
            <option value="fixed_amount">Sumă fixă</option>
          </select>
        </label>
        <label className="dashboard-field"><span>Valoare</span><input name="discountValue" type="number" step="0.01" min="0.01" required /></label>
      </div>
      {discountType === "percentage" && (
        <label className="dashboard-field"><span>Discount maxim opțional</span><input name="maximumDiscount" type="number" step="0.01" min="0" /></label>
      )}
      <div className="voucher-two-cols">
        <label className="dashboard-field"><span>Subtotal minim</span><input name="minimumSubtotal" type="number" step="0.01" min="0" defaultValue="0" /></label>
        <label className="dashboard-field"><span>Redempțiuni maxime</span><input name="maxRedemptions" type="number" min="1" defaultValue="1" /></label>
      </div>
      <div className="voucher-two-cols">
        <label className="dashboard-field"><span>Valabil de la</span><input name="validFrom" type="datetime-local" defaultValue={dateTimeValue(new Date().toISOString())} /></label>
        <label className="dashboard-field"><span>Expiră la</span><input name="expiresAt" type="datetime-local" /></label>
      </div>
      <label className="checkbox-row"><input name="activeImmediately" type="checkbox" /> Activ imediat</label>
      <button className="primary-button" disabled={mutation.isPending}>{mutation.isPending ? "Se creează..." : "Creează voucher"}</button>
      {mutation.error && <p className="form-error">{mutation.error.message}</p>}
    </form>
  );
}

function IssuedVouchersTable({ vouchers, loading, onDone }: { vouchers: IssuedVoucher[]; loading: boolean; onDone: () => void }) {
  const [copiedId, setCopiedId] = useState("");
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: ({ id, type }: { id: string; type: "approve" | "revoke" }) => type === "approve" ? api.approveVoucher(id) : api.revokeVoucher(id),
    onSuccess: () => {
      onDone();
      queryClient.invalidateQueries({ queryKey: ["admin-vouchers"] });
    }
  });

  if (loading) return <p>Se încarcă voucherele...</p>;
  if (!vouchers.length) return <EmptyState title="Nu există vouchere" description="Creează primul voucher sau activează recompensa de record." />;

  return (
    <div className="admin-data-table-wrap vouchers-table-wrap">
      <table className="admin-data-table vouchers-table">
        <thead>
          <tr>
            <th scope="col">Cod</th>
            <th scope="col">Nume</th>
            <th scope="col">Sursă</th>
            <th scope="col">Destinatar</th>
            <th scope="col">Discount</th>
            <th scope="col">Valabilitate</th>
            <th scope="col">Folosiri</th>
            <th scope="col">Status</th>
            <th scope="col"><span className="visually-hidden">Acțiuni</span></th>
          </tr>
        </thead>
        <tbody>
          {vouchers.map((voucher) => (
            <tr key={voucher.id}>
              <td data-label="Cod">
                <div className="table-identity">
                  <strong>{voucher.code ?? "Cod după aprobare"}</strong>
                  <small>{formatDate(voucher.createdAt)}</small>
                </div>
              </td>
              <td data-label="Nume"><span className="table-muted-text">{voucher.name}</span></td>
              <td data-label="Sursă"><StatusBadge tone={voucher.sourceType === "manual" ? "neutral" : "brand"}>{sourceLabels[voucher.sourceType]}</StatusBadge></td>
              <td data-label="Destinatar"><span className="table-muted-text">{recipientLabel(voucher)}</span></td>
              <td data-label="Discount">
                <div className="table-identity">
                  <strong>{discountLabel(voucher)}</strong>
                  <small>Min. {formatMoney(voucher.minimumSubtotal)}</small>
                </div>
              </td>
              <td data-label="Valabilitate">
                <span className="table-muted-text">{formatDate(voucher.validFrom)} - {formatDate(voucher.expiresAt)}</span>
              </td>
              <td data-label="Folosiri">
                <div className="table-identity">
                  <strong>{voucher.redemptionCount}/{voucher.maxRedemptions}</strong>
                  <small>{voucher.redemptions.map((redemption) => `#${redemption.orderId}`).join(", ") || "Fără comandă"}</small>
                  {voucher.sourceScore != null && <small>{voucher.campaignRank ? `Locul ${voucher.campaignRank}` : "Record"}: {voucher.sourceScore}</small>}
                </div>
              </td>
              <td data-label="Status"><StatusBadge tone={statusTone(voucher.status)}>{statusLabels[voucher.status]}</StatusBadge></td>
              <td className="admin-data-table-actions" data-label="Acțiuni">
                <div className="table-action-group">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!voucher.code}
                    onClick={async () => {
                      if (!voucher.code) return;
                      await navigator.clipboard?.writeText(voucher.code);
                      setCopiedId(voucher.id);
                    }}
                  >
                    <Clipboard size={16} /> {copiedId === voucher.id ? "Copiat" : "Copiază"}
                  </button>
                  {voucher.status === "pending" && (
                    <button className="secondary-button" type="button" disabled={action.isPending} onClick={() => action.mutate({ id: voucher.id, type: "approve" })}>
                      <CheckCircle2 size={16} /> Aprobă
                    </button>
                  )}
                  {(voucher.status === "pending" || voucher.status === "active") && (
                    <button className="secondary-button" type="button" disabled={action.isPending} onClick={() => action.mutate({ id: voucher.id, type: "revoke" })}>
                      <XCircle size={16} /> Revocă
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {action.error && <p className="form-error">{action.error.message}</p>}
    </div>
  );
}
