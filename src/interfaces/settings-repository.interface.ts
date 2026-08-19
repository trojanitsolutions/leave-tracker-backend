export interface CompanySettings {
  defaultAnnualEntitlementDays: number;
  eligibilityMonths: number;
  cycleLengthMonths: number;
  backToWorkWatchlistDays: number;
  approachingEligibilityDays: number;
  pendingApprovalAlertDays: number;
  updatedAt: string;
}

export interface UpdateSettingsInput {
  defaultAnnualEntitlementDays?: number;
  eligibilityMonths?: number;
  cycleLengthMonths?: number;
  backToWorkWatchlistDays?: number;
  approachingEligibilityDays?: number;
  pendingApprovalAlertDays?: number;
}

export interface ISettingsRepository {
  get(): Promise<CompanySettings>;
  update(data: UpdateSettingsInput): Promise<CompanySettings>;
}
