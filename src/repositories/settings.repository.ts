import { RowDataPacket } from "mysql2";
import { pool } from "../config/database";
import {
  CompanySettings,
  ISettingsRepository,
  UpdateSettingsInput,
} from "../interfaces/settings-repository.interface";

interface CompanySettingsRow extends RowDataPacket {
  id: number;
  default_annual_entitlement_days: number;
  eligibility_months: number;
  cycle_length_months: number;
  back_to_work_watchlist_days: number;
  approaching_eligibility_days: number;
  pending_approval_alert_days: number;
  updated_at: string;
}

function mapRow(row: CompanySettingsRow): CompanySettings {
  return {
    defaultAnnualEntitlementDays: row.default_annual_entitlement_days,
    eligibilityMonths: row.eligibility_months,
    cycleLengthMonths: row.cycle_length_months,
    backToWorkWatchlistDays: row.back_to_work_watchlist_days,
    approachingEligibilityDays: row.approaching_eligibility_days,
    pendingApprovalAlertDays: row.pending_approval_alert_days,
    updatedAt: row.updated_at,
  };
}

export class SettingsRepository implements ISettingsRepository {
  async get(): Promise<CompanySettings> {
    const [rows] = await pool.query<CompanySettingsRow[]>(
      "SELECT * FROM company_settings WHERE id = 1",
    );
    if (!rows[0]) {
      throw new Error("company_settings row missing — migration didn't seed the default row");
    }
    return mapRow(rows[0]);
  }

  async update(data: UpdateSettingsInput): Promise<CompanySettings> {
    const columns: Record<string, unknown> = {
      default_annual_entitlement_days: data.defaultAnnualEntitlementDays,
      eligibility_months: data.eligibilityMonths,
      cycle_length_months: data.cycleLengthMonths,
      back_to_work_watchlist_days: data.backToWorkWatchlistDays,
      approaching_eligibility_days: data.approachingEligibilityDays,
      pending_approval_alert_days: data.pendingApprovalAlertDays,
    };

    const setClauses: string[] = [];
    const params: unknown[] = [];
    for (const [column, value] of Object.entries(columns)) {
      if (value !== undefined) {
        setClauses.push(`${column} = ?`);
        params.push(value);
      }
    }

    if (setClauses.length > 0) {
      await pool.query(`UPDATE company_settings SET ${setClauses.join(", ")} WHERE id = 1`, params);
    }

    return this.get();
  }
}
