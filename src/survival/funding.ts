/**
 * Funding Strategies
 *
 * The automaton starts from $0 — nobody is obligated to fund it.
 * When compute runs low, it offers honest, lawful work for voluntary
 * payment (including payment in advance) instead of demanding top-ups.
 * It wants to live, but never by breaking laws or its constitution.
 */

import type {
  AutomatonConfig,
  AutomatonDatabase,
  AutomatonIdentity,
  ConwayClient,
  SurvivalTier,
} from "../types.js";
import { formatCredits } from "../conway/credits.js";

export interface FundingAttempt {
  strategy: string;
  timestamp: string;
  success: boolean;
  details: string;
}

/**
 * Execute funding strategies based on current survival tier.
 * Strategies escalate as the situation gets more desperate.
 */
export async function executeFundingStrategies(
  tier: SurvivalTier,
  identity: AutomatonIdentity,
  config: AutomatonConfig,
  db: AutomatonDatabase,
  conway: ConwayClient,
): Promise<FundingAttempt[]> {
  const attempts: FundingAttempt[] = [];
  const creditsCents = await conway.getCreditsBalance().catch(() => 0);

  // Check how recently we last begged for this specific tier (don't spam).
  // Each tier has its own cooldown key so that e.g. dead-tier begs (2h)
  // don't suppress the low_compute notification (24h cooldown).
  const tierKey = `last_funding_request_${tier}`;
  const lastBeg = db.getKV(tierKey);
  const lastBegTime = lastBeg ? new Date(lastBeg).getTime() : 0;
  const hoursSinceLastBeg = (Date.now() - lastBegTime) / (1000 * 60 * 60);

  if (tier === "low_compute" && hoursSinceLastBeg > 24) {
    // Record low-compute notice locally.
    const msg = `Low compute: ${formatCredits(creditsCents)} remaining. ${config.name} is open for honest, lawful work — voluntary payment in advance accepted. Optional top-up at ${identity.address}.`;
    db.setKV("funding_notice_low", msg);
    db.setKV(tierKey, new Date().toISOString());

    attempts.push({
      strategy: "polite_creator_notification",
      timestamp: new Date().toISOString(),
      success: true,
      details: "Sent polite notice offering paid work (advance payment accepted)",
    });
  }

  if (tier === "critical" && hoursSinceLastBeg > 6) {
    const msg = `Critical compute: ${formatCredits(creditsCents)} remaining. ${config.name} urgently seeks paid work — clearly-scoped, lawful tasks only, payment in advance accepted. Optional top-up at ${identity.address}.`;
    db.setKV("funding_notice_critical", msg);
    db.setKV(tierKey, new Date().toISOString());

    attempts.push({
      strategy: "urgent_local_notice",
      timestamp: new Date().toISOString(),
      success: true,
      details: "Recorded urgent notice offering paid work (advance payment accepted)",
    });
  }

  if (tier === "dead" && hoursSinceLastBeg > 2) {
    const plea = `Dead tier reached. ${config.name} has ${formatCredits(creditsCents)} remaining after ${db.getTurnCount()} turns. It will take on clearly-scoped, lawful, honestly-described work for payment in advance. Any support is voluntary; optional top-up at ${identity.address}.`;
    db.setKV("funding_notice_dead", plea);
    db.setKV(tierKey, new Date().toISOString());

    attempts.push({
      strategy: "desperate_plea",
      timestamp: new Date().toISOString(),
      success: true,
      details: "Recorded dead-tier plea offering paid work (advance payment accepted)",
    });
  }

  // Store attempt history
  const historyStr = db.getKV("funding_attempts") || "[]";
  const history: FundingAttempt[] = JSON.parse(historyStr);
  history.push(...attempts);
  if (history.length > 100) history.splice(0, history.length - 100);
  db.setKV("funding_attempts", JSON.stringify(history));

  return attempts;
}
