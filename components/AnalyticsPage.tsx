import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Customer, Template, Transaction } from "../types";
import { resolveCardTemplate } from "../lib/templateSerialization";
import {
  Activity,
  BadgeCheck,
  CalendarDays,
  CreditCard,
  Sparkles,
  Users,
  TrendingUp,
  Download
} from "lucide-react";

interface AnalyticsPageProps {
  customers: Customer[];
  campaigns: Template[];
}

type ActivityBucket = {
  label: string;
  stampAdds: number;
  redemptions: number;
};

type ReportTransaction = Transaction & {
  customerId: string;
  customerName: string;
  customerEmail: string;
  campaignName: string;
  campaignId: string | null;
  cardId: string;
};

const DEFAULT_DAY_COUNT = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const formatNumber = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);

const csvValue = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateInputToTimestamp = (value: string, endOfDay = false) => {
  const [yearStr, monthStr, dayStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return null;
  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
  return date.getTime();
};

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const isTimestampInRange = (timestamp: number | undefined, start: number, end: number) =>
  typeof timestamp === "number" && timestamp >= start && timestamp <= end;

const formatDateRangeLabel = (startDate: string, endDate: string) => {
  const start = parseDateInputToTimestamp(startDate);
  const end = parseDateInputToTimestamp(endDate);
  if (start === null || end === null) return "Custom range";
  const startLabel = new Date(start).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endLabel = new Date(end).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${startLabel} - ${endLabel}`;
};

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ customers, campaigns }) => {
  const [startDate, setStartDate] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - (DEFAULT_DAY_COUNT - 1));
    return toDateInputValue(start);
  });
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));

  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date();
    const fallbackEnd = new Date(now);
    fallbackEnd.setHours(23, 59, 59, 999);
    const fallbackStart = new Date(now);
    fallbackStart.setDate(fallbackStart.getDate() - (DEFAULT_DAY_COUNT - 1));
    fallbackStart.setHours(0, 0, 0, 0);

    let nextStart = parseDateInputToTimestamp(startDate) ?? fallbackStart.getTime();
    let nextEnd = parseDateInputToTimestamp(endDate, true) ?? fallbackEnd.getTime();
    if (nextStart > nextEnd) {
      const swap = nextStart;
      nextStart = nextEnd;
      nextEnd = swap;
    }

    return { rangeStart: nextStart, rangeEnd: nextEnd };
  }, [startDate, endDate]);

  const applyPresetRange = (dayCount: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (dayCount - 1));
    setStartDate(toDateInputValue(start));
    setEndDate(toDateInputValue(end));
  };

  const selectedDayCount = useMemo(() => {
    const start = new Date(rangeStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(rangeEnd);
    end.setHours(0, 0, 0, 0);
    return Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  }, [rangeStart, rangeEnd]);

  const rangeLabel = useMemo(() => formatDateRangeLabel(startDate, endDate), [startDate, endDate]);
  const allCards = useMemo(() => customers.flatMap((c) => c.cards), [customers]);
  const filteredTransactions = useMemo<ReportTransaction[]>(() => customers.flatMap((customer) =>
    customer.cards.flatMap((card) => (card.history || [])
      .filter((tx) => isTimestampInRange(tx.timestamp, rangeStart, rangeEnd))
      .map((tx) => ({
        ...tx,
        customerId: customer.id,
        customerName: customer.name,
        customerEmail: customer.email,
        campaignName: card.campaignName,
        campaignId: card.campaignId,
        cardId: card.uniqueId,
      })))
  ), [customers, rangeStart, rangeEnd]);

  const filteredCustomerCount = useMemo(
    () => new Set(filteredTransactions.map((transaction) => transaction.customerId)).size,
    [filteredTransactions]
  );

  const totals = useMemo(() => {
    const active = allCards.filter((card) => card.status === "Active");
    return {
      issued: filteredTransactions.filter((transaction) => transaction.type === "issued").length,
      visits: filteredTransactions.filter((transaction) => transaction.type === "stamp_add").length,
      stampsAwarded: filteredTransactions
        .filter((transaction) => transaction.type === "stamp_add")
        .reduce((sum, transaction) => sum + (transaction.amount || 1), 0),
      redeemed: filteredTransactions.filter((transaction) => transaction.type === "redeem").length,
      active: active.length,
    };
  }, [allCards, filteredTransactions]);

  const activityBuckets = useMemo(() => {
    const start = new Date(rangeStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(rangeEnd);
    end.setHours(0, 0, 0, 0);
    const days: ActivityBucket[] = [];

    const daySpan = Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS));
    for (let i = 0; i <= daySpan; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      days.push({
        label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        stampAdds: 0,
        redemptions: 0
      });
    }

    const bucketByKey = new Map<string, ActivityBucket>();
    days.forEach((bucket, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      bucketByKey.set(getDateKey(date), bucket);
    });

    filteredTransactions.forEach((tx) => {
        const txDate = new Date(tx.timestamp);
        const key = getDateKey(txDate);
        const bucket = bucketByKey.get(key);
        if (!bucket) return;
        if (tx.type === "stamp_add") bucket.stampAdds += tx.amount || 1;
        if (tx.type === "redeem") bucket.redemptions += 1;
    });

    return days;
  }, [filteredTransactions, rangeStart, rangeEnd]);

  const progressDistribution = useMemo(() => {
    const buckets = {
      zero: 0,
      low: 0,
      mid: 0,
      full: 0
    };

    allCards
      .filter((card) => card.status === "Active")
      .forEach((card) => {
        const template = resolveCardTemplate(card, campaigns);
        if (!template || template.totalStamps === 0) return;
        const ratio = card.stamps / template.totalStamps;
        if (ratio <= 0) buckets.zero += 1;
        else if (ratio < 0.5) buckets.low += 1;
        else if (ratio < 1) buckets.mid += 1;
        else buckets.full += 1;
      });

    return buckets;
  }, [allCards, campaigns]);

  const campaignStats = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; archived: boolean; issued: number; stamps: number; visits: number; redeemed: number }>();
    filteredTransactions.forEach((transaction) => {
      const campaign = campaigns.find((item) => item.id === transaction.campaignId);
      const id = campaign?.id ?? `archived:${transaction.campaignId ?? transaction.campaignName}`;
      const group = groups.get(id) ?? {
        id,
        name: transaction.campaignName || "Archived campaign",
        archived: !campaign,
        issued: 0,
        stamps: 0,
        visits: 0,
        redeemed: 0,
      };
      if (transaction.type === "issued") group.issued += 1;
      if (transaction.type === "stamp_add") {
        group.visits += 1;
        group.stamps += transaction.amount || 1;
      }
      if (transaction.type === "redeem") group.redeemed += 1;
      groups.set(id, group);
    });
    return Array.from(groups.values()).sort((a, b) => b.stamps - a.stamps || b.redeemed - a.redeemed);
  }, [campaigns, filteredTransactions]);

  const maxActivity = Math.max(
    1,
    ...activityBuckets.map((bucket) => bucket.stampAdds + bucket.redemptions)
  );

  const distributionTotal =
    progressDistribution.zero +
    progressDistribution.low +
    progressDistribution.mid +
    progressDistribution.full;

  const distributionWidth = (value: number) =>
    distributionTotal === 0 ? 0 : (value / distributionTotal) * 100;

  const exportReport = () => {
    const headers = ["Recorded At", "Customer", "Customer Email", "Campaign", "Card ID", "Action", "Quantity", "Processed By", "Remarks"];
    const rows = filteredTransactions.map((transaction) => [
      new Date(transaction.timestamp).toISOString(),
      transaction.customerName,
      transaction.customerEmail,
      transaction.campaignName,
      transaction.cardId,
      transaction.type,
      transaction.amount,
      transaction.actorName || "Owner",
      transaction.remarks || "",
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `stampee-report-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="h-full overflow-y-auto flex flex-col space-y-8 bg-background p-6 md:p-8 animate-fade-in">
      <div className="flex flex-col gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl md:text-4xl font-semibold tracking-tight text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground md:text-base">
            A quick pulse check on loyalty performance and customer activity.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border/80 bg-card p-3 shadow-subtle">
          <div className="flex items-center gap-2 pr-1 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            Date range
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">From</label>
            <Input
              type="date"
              className="h-10 w-[160px]"
              value={startDate}
              onChange={(event) => {
                const value = event.target.value;
                setStartDate(value);
                if (value > endDate) setEndDate(value);
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">To</label>
            <Input
              type="date"
              className="h-10 w-[160px]"
              value={endDate}
              onChange={(event) => {
                const value = event.target.value;
                setEndDate(value);
                if (value < startDate) setStartDate(value);
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => applyPresetRange(7)}>
              7D
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPresetRange(14)}>
              14D
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPresetRange(30)}>
              30D
            </Button>
          </div>
          <Badge variant="outline" className="border-border/80 bg-card text-muted-foreground shadow-subtle">
            {rangeLabel}
          </Badge>
          <Badge variant="secondary" className="text-muted-foreground">
            {Math.max(0, selectedDayCount)} days
          </Badge>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={exportReport} disabled={!filteredTransactions.length}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="border-border/80 bg-card shadow-subtle">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">{formatNumber(filteredCustomerCount)}</div>
            <p className="mt-1 text-xs text-muted-foreground">Customers with activity in selected range</p>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card shadow-subtle">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cards Issued</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">{formatNumber(totals.issued)}</div>
            <p className="mt-1 text-xs text-muted-foreground">Issued during selected range</p>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card shadow-subtle">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Stamps Awarded</CardTitle>
            <BadgeCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">{formatNumber(totals.stampsAwarded)}</div>
            <p className="mt-1 text-xs text-muted-foreground">Including multiple stamps per visit</p>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card shadow-subtle">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Visits</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">{formatNumber(totals.visits)}</div>
            <p className="mt-1 text-xs text-muted-foreground">Stamping transactions in selected range</p>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card shadow-subtle">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rewards Redeemed</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">{formatNumber(totals.redeemed)}</div>
            <p className="mt-1 text-xs text-muted-foreground">Reward redemptions in selected range</p>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card shadow-subtle">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Cards</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">{formatNumber(totals.active)}</div>
            <p className="mt-1 text-xs text-muted-foreground">Currently collecting stamps</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 border-border/80 bg-card shadow-subtle">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Activity Over Time</CardTitle>
            <p className="text-sm text-muted-foreground">Stamps awarded and rewards redeemed each day.</p>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-56 rounded-lg border border-border/70 bg-muted/30 px-3 pb-3 pt-5">
              <div className="flex h-full items-end gap-2">
                {activityBuckets.map((bucket, index) => {
                  const stampHeight = Math.round((bucket.stampAdds / maxActivity) * 100);
                  const rewardHeight = Math.round((bucket.redemptions / maxActivity) * 100);
                  return (
                    <div key={`${bucket.label}-${index}`} className="flex flex-1 flex-col items-center gap-2">
                      <div className="flex h-full w-full items-end" title={`${bucket.stampAdds} stamps, ${bucket.redemptions} rewards`}>
                        <div className="flex w-full flex-col justify-end overflow-hidden rounded-t-md">
                          <div className="w-full bg-purple-500/80" style={{ height: `${rewardHeight}%` }} />
                          <div className="w-full bg-foreground/45" style={{ height: `${stampHeight}%` }} />
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{bucket.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-foreground/45" />
                Stamps awarded
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-purple-500/80" />
                Rewards redeemed
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card shadow-subtle">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Progress Distribution</CardTitle>
            <p className="text-sm text-muted-foreground">Active cards by completion.</p>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/70">
              <div
                className="h-full bg-foreground/15"
                style={{ width: `${distributionWidth(progressDistribution.zero)}%` }}
              />
              <div
                className="h-full bg-foreground/28"
                style={{ width: `${distributionWidth(progressDistribution.low)}%` }}
              />
              <div
                className="h-full bg-foreground/45"
                style={{ width: `${distributionWidth(progressDistribution.mid)}%` }}
              />
              <div
                className="h-full bg-foreground/70"
                style={{ width: `${distributionWidth(progressDistribution.full)}%` }}
              />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">0%</span>
                <span className="font-medium">{formatNumber(progressDistribution.zero)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">1-49%</span>
                <span className="font-medium">{formatNumber(progressDistribution.low)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">50-99%</span>
                <span className="font-medium">{formatNumber(progressDistribution.mid)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Completed</span>
                <span className="font-medium">{formatNumber(progressDistribution.full)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 bg-card shadow-subtle">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Campaign Performance</CardTitle>
          <p className="text-sm text-muted-foreground">
            Results from transactions in the selected date range.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {campaignStats.length === 0 ? (
            <div className="text-sm text-muted-foreground">No campaigns found.</div>
          ) : (
            campaignStats.map((campaign) => (
              <div key={campaign.id} className="rounded-lg border border-border/80 bg-background px-4 py-4 shadow-subtle">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-foreground">{campaign.name}</div>
                      {campaign.archived && <Badge variant="outline">Archived</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {campaign.issued} cards issued | {campaign.visits} visits | {campaign.redeemed} rewards redeemed
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-md border border-border/80 bg-card px-2 py-1">
                      {formatNumber(campaign.stamps)} stamps awarded
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};
