/** Shape returned by the worker's GET /banks endpoint. */
export interface BankSpec {
  id: string;
  name: string;
  layout: "two_dates" | "amount_balance" | "ruled_table" | string;
  country: string;
  kind: "bank" | "credit_card" | "brokerage" | "fintech" | string;
}
